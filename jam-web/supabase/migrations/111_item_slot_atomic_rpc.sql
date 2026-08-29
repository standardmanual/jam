-- ============================================================
-- Migration 111: 아이템배지 슬롯 장착·해제 원자적 RPC 전환
--
-- 티켓: 20260830_0057
--
-- 배경(요약 — 티켓 문서 참고):
--   jam-web/src/app/api/itembooks/[id]/slot/route.ts의 POST(장착)·DELETE(해제)가
--   원자적 락 없이 순차적인 여러 REST 호출(조회 → INSERT/UPDATE → UPDATE)로 구성돼
--   있었다. 108_item_identity_custody_model.sql이 도입한 "표준 불변식 1: 원자적
--   소유권 이전"(SELECT ... FOR UPDATE 기반 단일 RPC — create_user_drop(), pickup_drop(),
--   admin_reassign_orphaned_item() 등)을 이 슬롯 경로에도 동일 적용한다.
--
--   레이스 시나리오: 슬롯 POST가 inventory_items.slotted_in이 NULL임을 확인한 직후,
--   create_user_drop()이 락을 잡고 inventory_id를 NULL로 전이·커밋하면, 슬롯 POST가
--   재확인 없이 slotted_in을 새 슬롯 id로 UPDATE해 inventory_id=NULL(드랍됨)이면서
--   slotted_in이 non-null(다른 유저 슬롯 참조)인 모순 상태가 발생한다.
--
-- 이 마이그레이션이 하는 일:
--   1. slot_item_into_book() RPC — 인벤토리 락(FOR UPDATE) → inventory_items 락 →
--      소유권/드랍/슬롯 상태 재확인 → user_item_book_slots INSERT →
--      inventory_items.slotted_in UPDATE → inventory.used_slots 차감 →
--      custody_events Slot 기록 → 완성 판정(upsert)까지 한 트랜잭션.
--   2. unslot_item_from_book() RPC — user_item_book_slots 락 → inventory 락 →
--      inventory_items 락 → slotted_in = NULL → slot row 삭제 → used_slots 증가 →
--      custody_events Unslot 기록까지 한 트랜잭션.
--
--      락 순서 참고: 티켓 본문은 해제 RPC의 순서를
--      "user_item_book_slots → inventory_items → inventory"로 제시했으나, 이 순서를
--      그대로 쓰면 create_user_drop()(순서: inventory → inventory_items)과 반대
--      순서로 같은 두 테이블을 잠그게 되어, 같은 아이템을 대상으로 한 "슬롯 해제"와
--      "드랍"이 동시에 들어오면 AB-BA 데드락이 발생할 수 있다(락 자체가 없던 기존
--      코드보다는 안전하지만 — 데드락은 PostgreSQL이 자동 감지해 한쪽만 에러로
--      실패시키므로 무결성은 깨지지 않는다 — 불필요한 재시도를 유발한다). 두 신규
--      RPC 모두 create_user_drop()과 동일하게 "inventory → inventory_items" 순서를
--      지키도록 조정했다(장착 RPC도 동일 순서로 설계 — 정확히 이 티켓이 다루는
--      레이스 당사자이므로 이 둘 사이의 락 순서 일치가 가장 중요하다).
--   3. anon/authenticated의 EXECUTE 권한을 회수하고 service_role에만 남긴다
--      (109/110과 동일한 방어 — 두 RPC 모두 호출자 검증 없이 파라미터로 받은
--      p_user_id를 그대로 신뢰하므로, anon 키로 PostgREST를 직접 호출하면 API
--      라우트의 auth.getUser() 인증을 건너뛰고 임의 유저로 슬롯을 조작할 수 있다).
--
--   부수 발견(알파레이트 alerts 참고): 기존 route.ts는 "이미 드랍된 아이템"을
--   inventory_items.dropped_at으로 판별했는데, 108이 create_user_drop()을 도입한
--   이후로 유저 드랍은 dropped_at을 더 이상 설정하지 않고 inventory_id를 NULL로
--   비우는 방식으로 바뀌었다(108의 주석 참고) — 즉 기존 dropped_at 체크는 108 배포
--   이후 사실상 도달 불가능한 죽은 코드였다(소유자 조회가 그보다 먼저 inventory_id
--   기준으로 실패해 403으로 새버림). 이 RPC는 inventory_id 기준으로 재구현해 원래
--   의도한 404/409 분기를 정확히 복원한다.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. slot_item_into_book() — 아이템배지 슬롯 장착 (원자적)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slot_item_into_book(
  p_user_id           UUID,
  p_item_book_id      UUID,
  p_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv           RECORD;
  v_item          RECORD;
  v_badge         RECORD;
  v_slot          RECORD;
  v_username      TEXT;
  v_total_badges  INTEGER;
  v_slotted_count INTEGER;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  -- 개체 정체성 모델(108)에서 "드랍됨"은 inventory_id가 NULL로 비는 것으로 표현된다.
  -- NULL이면 현재 아무도 소유하지 않은(드랍된) 개체 — "본인 소유 아님"과는 구분해
  -- 기존 409 "이미 드랍된 아이템입니다." 응답을 정확히 복원한다.
  IF v_item.inventory_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
  END IF;

  IF v_item.inventory_id IS DISTINCT FROM v_inv.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_owner');
  END IF;

  IF v_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_slotted');
  END IF;

  SELECT id, item_book_id INTO v_badge FROM public.badges WHERE id = v_item.badge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'badge_not_found');
  END IF;

  IF v_badge.item_book_id IS DISTINCT FROM p_item_book_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_item_book');
  END IF;

  BEGIN
    INSERT INTO public.user_item_book_slots (user_id, item_book_id, badge_id, inventory_item_id)
    VALUES (p_user_id, p_item_book_id, v_item.badge_id, p_inventory_item_id)
    RETURNING * INTO v_slot;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'slot_insert_failed');
  END;

  UPDATE public.inventory_items SET slotted_in = v_slot.id WHERE id = p_inventory_item_id;

  -- 아이템북에 들어간 아이템은 인벤토리 칸을 더 이상 차지하지 않음 — 칸 반환
  UPDATE public.inventory SET used_slots = GREATEST(0, v_inv.used_slots - 1) WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (p_inventory_item_id, 'Slot', p_user_id, v_username);

  -- 완성 체크: 이 아이템북에 필요한 배지 수 vs 현재 슬롯 수 (기존 route.ts와 동일 기준 —
  -- item_books.is_active 여부와 무관하게 badges.item_book_id + deleted_at IS NULL만 본다)
  SELECT COUNT(*) INTO v_total_badges
  FROM public.badges WHERE item_book_id = p_item_book_id AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_slotted_count
  FROM public.user_item_book_slots WHERE user_id = p_user_id AND item_book_id = p_item_book_id;

  IF v_total_badges > 0 AND v_slotted_count >= v_total_badges THEN
    INSERT INTO public.user_item_book_completions (user_id, item_book_id)
    VALUES (p_user_id, p_item_book_id)
    ON CONFLICT (user_id, item_book_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'slot', to_jsonb(v_slot));
END;
$$;

-- ----------------------------------------------------------------
-- 2. unslot_item_from_book() — 아이템배지 슬롯 해제 (원자적)
--
-- 락 순서는 위 1번 섹션 설명대로 create_user_drop()과 일치시켜
-- "user_item_book_slots → inventory → inventory_items"로 잡는다
-- (inventory 앞, inventory_items 뒤 — 티켓 본문이 제시한 순서와 뒤 두 테이블의
-- 순서가 다르다. 이유는 파일 상단 주석 참고).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unslot_item_from_book(
  p_user_id UUID,
  p_slot_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot     RECORD;
  v_inv      RECORD;
  v_item     RECORD;
  v_username TEXT;
BEGIN
  SELECT * INTO v_slot
  FROM public.user_item_book_slots
  WHERE id = p_slot_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'slot_not_found');
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  -- 해제하면 아이템이 인벤토리로 돌아와 칸을 다시 소비함 — 꽉 찬 상태면 해제 불가
  -- (기존 route.ts와 동일 정책)
  IF v_inv.used_slots >= v_inv.max_slots THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_full');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = v_slot.inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  UPDATE public.inventory_items SET slotted_in = NULL WHERE id = v_item.id;
  DELETE FROM public.user_item_book_slots WHERE id = p_slot_id;

  -- 인벤토리 칸 다시 소비 (완성 기록 user_item_book_completions는 그대로 유지 —
  -- 물리적 상태만 변경, 기존 route.ts와 동일)
  UPDATE public.inventory SET used_slots = v_inv.used_slots + 1 WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (v_item.id, 'Unslot', p_user_id, v_username);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ----------------------------------------------------------------
-- 3. anon/authenticated EXECUTE 권한 회수 (109/110과 동일한 방어)
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.slot_item_into_book(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unslot_item_from_book(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.slot_item_into_book(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unslot_item_from_book(uuid, uuid) TO service_role;
