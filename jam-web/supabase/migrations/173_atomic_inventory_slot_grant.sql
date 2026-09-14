-- ============================================================
-- Migration 173: 인벤토리 슬롯 카운터 레이스 컨디션 — 원자적 RPC 전환
--
-- 티켓: 20260914_1813
--
-- 배경(요약 — 티켓 문서 참고):
--   "인벤토리 슬롯이 가득 차면 아이템배지 지급을 막는다"는 불변식을 지키는 세 지급 경로 —
--   drop-engine/index.ts(활동 드랍) · missions/rewards.ts(미션 보상) · combine/index.ts(아이템
--   조합 보상·소각 반환) — 가 각자 inventory.used_slots를 읽고 → 메모리에서 계산 →
--   절대값으로 덮어쓰기(.update({ used_slots: N }))했다. 원자적 증감도 락도 없어, 같은
--   유저에게 두 지급 경로가 겹치면 슬롯 상한이 조용히 뚫리거나 카운터가 실제 상태와
--   어긋날 수 있는 타이밍 윈도우가 있었다.
--
--   111_item_slot_atomic_rpc.sql이 같은 클래스의 결함(아이템배지 슬롯 장착/해제)을
--   SELECT ... FOR UPDATE 배타 락 트랜잭션으로 고친 정답 패턴을 그대로 확장 적용한다.
--
-- 이 마이그레이션이 하는 일:
--   1. grant_inventory_item() RPC — inventory 행 락(FOR UPDATE) → used_slots < max_slots
--      재확인 → inventory_items INSERT(트리거 assign_random_serial()이 일련번호 부여) →
--      used_slots 증가까지 한 트랜잭션. "지급 + 카운터 갱신"을 원자 단위로 묶어, 세 지급
--      경로(드랍·미션 보상·조합 보상)가 각자 read-then-write하던 것을 대체한다.
--   2. release_inventory_slots() RPC — 조합(combine) 소각 직후 칸을 반환하는 반대 방향.
--      inventory 행 락 → used_slots 감소(GREATEST(0, ...) 클램프, 111과 동일 패턴)까지
--      한 트랜잭션.
--   3. 락 순서는 111/108의 관례(inventory 락을 먼저 잡는다)를 그대로 따른다 — 이 두 RPC는
--      inventory 단일 행만 잠그므로 다른 테이블과의 락 순서 충돌 여지가 없다.
--   4. anon/authenticated의 EXECUTE 권한을 회수하고 service_role에만 남긴다(109/110/111과
--      동일한 방어 — 두 RPC 모두 호출자 검증 없이 파라미터로 받은 p_inventory_id를 그대로
--      신뢰하므로, anon 키로 PostgREST를 직접 호출하면 임의 인벤토리의 슬롯을 조작할 수
--      있다).
--
--   기존 isInventoryFull()(src/lib/inventory/slots.ts)은 그대로 유지한다 — 화면 단(인벤토리
--   포화 안내) 사전 판정과 루프 중 조기 종료 최적화용으로는 여전히 유효하고, 이 RPC들이
--   실제 지급/소각 시점의 최종·원자적 확인을 맡는다(역할 분리, 중복 아님).
-- ============================================================

-- ----------------------------------------------------------------
-- 1. grant_inventory_item() — 인벤토리 아이템 지급 (원자적)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_inventory_item(
  p_inventory_id UUID,
  p_badge_id     UUID,
  p_obtained_by  TEXT,
  p_expires_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv  RECORD;
  v_item RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'inventory_not_found');
  END IF;

  IF v_inv.used_slots >= v_inv.max_slots THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'slot_full');
  END IF;

  INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by, expires_at)
  VALUES (p_inventory_id, p_badge_id, p_obtained_by, p_expires_at)
  RETURNING * INTO v_item;

  UPDATE public.inventory SET used_slots = v_inv.used_slots + 1 WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'itemId', v_item.id,
    'usedSlots', v_inv.used_slots + 1
  );
END;
$$;

-- ----------------------------------------------------------------
-- 2. release_inventory_slots() — 인벤토리 슬롯 반환 (원자적)
--
-- combine/index.ts의 재료 소각 직후, 소각한 개수만큼 칸을 돌려줄 때 쓴다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_inventory_slots(
  p_inventory_id UUID,
  p_count        INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv RECORD;
  v_new INTEGER;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'inventory_not_found');
  END IF;

  v_new := GREATEST(0, v_inv.used_slots - p_count);
  UPDATE public.inventory SET used_slots = v_new WHERE id = p_inventory_id;

  RETURN jsonb_build_object('ok', TRUE, 'usedSlots', v_new);
END;
$$;

-- ----------------------------------------------------------------
-- 3. anon/authenticated EXECUTE 권한 회수 (109/110/111과 동일한 방어)
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.grant_inventory_item(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_inventory_slots(uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.grant_inventory_item(uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inventory_slots(uuid, integer) TO service_role;
