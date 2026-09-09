-- ============================================================
-- Migration 151: 아이템배지 슬롯 "교체" 원자적 RPC 신설
--
-- 티켓: 20260910_0015
--
-- 배경(요약 — 티켓 문서 참고):
--   컬렉션 슬롯 그리드에서 이미 장착된 칸에 같은 배지의 미장착 개체가 더 있으면
--   "교체" 버튼을 노출하고, 선택 시트에서 고른 개체로 즉시 바꿔 끼우는 기능을 추가한다.
--
--   기존 slot_item_into_book() RPC(마이그레이션 111)는 user_item_book_slots에
--   INSERT하는데, 이 테이블은 UNIQUE(user_id, item_book_id, badge_id) 제약을 갖고
--   있다(017_item_book_slots.sql). 같은 배지가 이미 슬롯에 있는 상태에서 다시
--   호출하면 이 제약을 어겨 INSERT가 실패하고, route.ts는 이를 의미 없는
--   slot_insert_failed(500)으로 응답한다 — "해제 → 장착" 두 호출로 흉내내는 방식은
--   두 번째 호출이 실패했을 때 슬롯이 빈 채로 남는 정합성 문제를 만든다.
--
--   108/109/111이 반복해 온 "표준 불변식 1: 원자적 소유권 이전"(SELECT ... FOR UPDATE
--   기반 단일 RPC) 원칙을 그대로 따라, 기존 슬롯 row를 삭제·재삽입하지 않고
--   inventory_item_id 컬럼만 한 트랜잭션 안에서 갈아 끼운다 — UNIQUE 제약을 아예
--   건드리지 않으므로 slot_insert_failed류의 무의미한 실패가 원천적으로 없다.
--
-- 이 마이그레이션이 하는 일:
--   1. swap_item_in_book() RPC — 대상 슬롯 락 → 새 개체 락(소유권/드랍/이미 장착/
--      배지 일치 검증) → 기존 개체 락 → 기존 개체 slotted_in 해제 → 새 개체
--      slotted_in 설정 → 슬롯 row의 inventory_item_id·slotted_at 갱신 → custody_events에
--      Unslot(기존 개체)·Slot(새 개체) 순으로 기록까지 한 트랜잭션.
--      인벤토리 used_slots은 건드리지 않는다 — 교체는 "슬롯에 들어있던 개체 1개"가
--      "슬롯에 들어있는 다른 개체 1개"로 바뀔 뿐이라, 반납되는 칸과 새로 소비되는
--      칸이 서로 상쇄돼 순변화가 0이다(기존 개체는 원래 used_slots에서 이미 빠져
--      있었고, 새 개체는 원래 used_slots를 차지하고 있다가 슬롯행이므로 빠진다).
--   2. 락 순서는 "user_item_book_slots → inventory_items(새 개체) → inventory_items
--      (기존 개체)"로 잡는다. unslot_item_from_book()과 마찬가지로 슬롯 행을 가장
--      먼저 잠근다 — 슬롯 안 개체 이탈(해제 등) 없이 이 RPC 전체가 원자적으로
--      끝나야 하기 때문이다. inventory 테이블은 이 RPC가 아예 쓰지 않으므로 잠그지
--      않는다(락 표면을 최소화 — 다른 두 RPC와의 교차 데드락 가능성도 그만큼 줄어든다).
--      단, 같은 두 inventory_items 행을 반대 순서로 동시에 잠그는 극히 드문 경우
--      (두 유저가 서로의 슬롯을 상대의 개체로 동시에 교체하려 드는 등)에는 여전히
--      AB-BA 데드락이 이론상 가능하다 — 111의 선례와 동일하게, PostgreSQL이 자동
--      감지해 한쪽만 에러로 실패시키므로 무결성은 깨지지 않고 불필요한 재시도만
--      유발한다.
--   3. anon/authenticated의 EXECUTE 권한을 회수하고 service_role에만 남긴다
--      (109/110/111과 동일한 방어 — 호출자 검증 없이 파라미터로 받은 p_user_id를
--      그대로 신뢰하므로, anon 키로 PostgREST를 직접 호출하면 API 라우트의
--      auth.getUser() 인증을 건너뛰고 임의 유저의 슬롯을 조작할 수 있다).
-- ============================================================

CREATE OR REPLACE FUNCTION public.swap_item_in_book(
  p_user_id               UUID,
  p_item_book_id          UUID,
  p_slot_id               UUID,
  p_new_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot      RECORD;
  v_new_item  RECORD;
  v_old_item  RECORD;
  v_username  TEXT;
BEGIN
  SELECT * INTO v_slot
  FROM public.user_item_book_slots
  WHERE id = p_slot_id AND user_id = p_user_id AND item_book_id = p_item_book_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'slot_not_found');
  END IF;

  SELECT * INTO v_new_item FROM public.inventory_items WHERE id = p_new_inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_new_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  -- 개체 정체성 모델(108)에서 "드랍됨"은 inventory_id가 NULL로 비는 것으로 표현된다.
  IF v_new_item.inventory_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE id = v_new_item.inventory_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_owner');
  END IF;

  IF v_new_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_slotted');
  END IF;

  -- 교체는 같은 배지의 다른 개체로만 허용한다 — 슬롯의 badge_id 자체를 바꾸지 않는다.
  IF v_new_item.badge_id IS DISTINCT FROM v_slot.badge_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_badge');
  END IF;

  IF v_new_item.id = v_slot.inventory_item_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'same_item');
  END IF;

  SELECT * INTO v_old_item FROM public.inventory_items WHERE id = v_slot.inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  UPDATE public.inventory_items SET slotted_in = NULL WHERE id = v_old_item.id;
  UPDATE public.inventory_items SET slotted_in = p_slot_id WHERE id = p_new_inventory_item_id;

  UPDATE public.user_item_book_slots
  SET inventory_item_id = p_new_inventory_item_id, slotted_at = NOW()
  WHERE id = p_slot_id
  RETURNING * INTO v_slot;

  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (v_old_item.id, 'Unslot', p_user_id, v_username);
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (p_new_inventory_item_id, 'Slot', p_user_id, v_username);

  RETURN jsonb_build_object('ok', TRUE, 'slot', to_jsonb(v_slot));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.swap_item_in_book(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.swap_item_in_book(uuid, uuid, uuid, uuid) TO service_role;
