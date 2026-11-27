-- 되돌림: seed_qa_tier_up_materials_20261128.sql로 발급한 개체 가운데 아직 인벤토리에 남은 것을 지우고 used_slots를 그만큼 줄인다 (티켓 20261128_0743)
-- 등급 UP 재료로 이미 소각된 개체(destroyed_at 있음)와 그 결과로 받은 배지는 건드리지 않는다.
DO $$
DECLARE
  v_inv uuid := '51a0680e-cd8f-45d7-a8ed-8c0329370389';
  v_n int;
BEGIN
  WITH del AS (
    DELETE FROM public.inventory_items
    WHERE inventory_id = v_inv
      AND obtained_by = 'qa_tier_up_20261128'
      AND destroyed_at IS NULL
      AND dropped_at IS NULL
      AND slotted_in IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM del;
  UPDATE public.inventory SET used_slots = greatest(used_slots - v_n, 0) WHERE id = v_inv;
END $$;
