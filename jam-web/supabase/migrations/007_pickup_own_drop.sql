-- 본인 드랍 픽업 허용 정책 변경
-- pickup_drop RPC에서 cannot_pickup_own_drop 체크 제거

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
  v_drop      public.poi_drops%ROWTYPE;
  v_item_id   UUID;
BEGIN
  -- 1. 드랍 레코드 락
  SELECT * INTO v_drop
  FROM public.poi_drops
  WHERE id = p_drop_id AND is_available = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_picked_up');
  END IF;

  -- 2. 인벤토리 슬롯 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE id = p_inventory_id AND used_slots < max_slots
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_full');
  END IF;

  -- 3. inventory_items INSERT
  INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by)
  VALUES (p_inventory_id, v_drop.badge_id, 'pickup')
  RETURNING id INTO v_item_id;

  -- 4. poi_drops 픽업 처리
  UPDATE public.poi_drops
  SET picked_up_by = p_picker_id,
      picked_up_at = NOW(),
      is_available = FALSE
  WHERE id = p_drop_id;

  -- 5. inventory.used_slots 증가
  UPDATE public.inventory
  SET used_slots = used_slots + 1
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object('ok', TRUE, 'inventory_item_id', v_item_id);
END;
$$;

-- RLS: 본인 드랍도 픽업 가능하도록 정책 갱신
DROP POLICY IF EXISTS "poi_drops: 픽업 업데이트" ON public.poi_drops;
CREATE POLICY "poi_drops: 픽업 업데이트"
  ON public.poi_drops FOR UPDATE TO authenticated
  USING (is_available = TRUE);
