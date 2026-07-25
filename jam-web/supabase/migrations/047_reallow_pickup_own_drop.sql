-- ============================================================
-- Migration 047: 본인 드랍 픽업 재허용 (회귀 수정)
--
-- 배경:
-- - 007_pickup_own_drop.sql에서 "본인이 드랍한 아이템도 본인이 픽업 가능"하도록
--   pickup_drop() RPC의 cannot_pickup_own_drop 체크를 의도적으로 제거했었음.
-- - 044_ambient_poi_drop.sql이 drop_id 누락 버그(일련번호 트리거가 source를
--   조회 못 하던 문제)를 고치면서 pickup_drop()을 CREATE OR REPLACE 했는데,
--   이때 사용한 함수 버전에 cannot_pickup_own_drop 체크가 다시 들어가 있어서
--   007의 정책 변경이 의도치 않게 되돌아감(회귀). 그 결과 유저가 본인이
--   드랍한 아이템을 픽업하면 'cannot_pickup_own_drop' 오류가 발생하고 있었음.
--
-- 이번 마이그레이션: 044의 drop_id 수정은 유지한 채, cannot_pickup_own_drop
-- 체크만 다시 제거.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pickup_drop(
  p_drop_id       UUID,
  p_picker_id     UUID,
  p_inventory_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_drop        RECORD;
  v_inv         RECORD;
  v_new_item_id UUID;
BEGIN
  SELECT * INTO v_drop
  FROM public.poi_drops
  WHERE id = p_drop_id AND is_available = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_picked_up');
  END IF;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id AND user_id = p_picker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  IF v_inv.used_slots >= v_inv.max_slots THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_full');
  END IF;

  UPDATE public.poi_drops
  SET picked_up_by  = p_picker_id,
      picked_up_at  = NOW(),
      is_available  = FALSE
  WHERE id = p_drop_id;

  INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by, drop_id)
  VALUES (p_inventory_id, v_drop.badge_id, 'pickup', p_drop_id)
  RETURNING id INTO v_new_item_id;

  UPDATE public.inventory
  SET used_slots = used_slots + 1
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object('ok', TRUE, 'inventory_item_id', v_new_item_id);
END;
$$;
