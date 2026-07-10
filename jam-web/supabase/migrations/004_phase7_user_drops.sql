-- Phase 7: 유저 주도 드랍/픽업 시스템

-- poi_drops: 유저가 POI에 드랍한 아이템 레코드
CREATE TABLE IF NOT EXISTS public.poi_drops (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dropper_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  poi_id            UUID NOT NULL REFERENCES public.poi(id) ON DELETE CASCADE,
  badge_id          UUID NOT NULL REFERENCES public.badges(id),
  dropped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  picked_up_at      TIMESTAMPTZ,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_poi_drops_available ON public.poi_drops(poi_id, is_available)
  WHERE is_available = TRUE;

-- inventory_items에 드랍 추적 컬럼 추가
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS dropped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drop_id    UUID REFERENCES public.poi_drops(id);

-- RLS
ALTER TABLE public.poi_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poi_drops: 인증 유저 읽기"
  ON public.poi_drops FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "poi_drops: 드랍 생성"
  ON public.poi_drops FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = dropper_user_id);

CREATE POLICY "poi_drops: 픽업 업데이트"
  ON public.poi_drops FOR UPDATE TO authenticated
  USING (is_available = TRUE AND auth.uid() != dropper_user_id);

-- 픽업 원자 트랜잭션 RPC
-- 호출: SELECT pickup_drop(drop_id, picker_user_id, inventory_id)
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
  -- 1. 드랍 레코드 잠금 (FOR UPDATE)
  SELECT * INTO v_drop
  FROM public.poi_drops
  WHERE id = p_drop_id AND is_available = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_picked_up');
  END IF;

  -- 2. 본인 드랍 방지
  IF v_drop.dropper_user_id = p_picker_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_pickup_own_drop');
  END IF;

  -- 3. 인벤토리 슬롯 확인
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

  -- 4. poi_drops 픽업 처리
  UPDATE public.poi_drops
  SET picked_up_by  = p_picker_id,
      picked_up_at  = NOW(),
      is_available  = FALSE
  WHERE id = p_drop_id;

  -- 5. inventory_items INSERT
  INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by)
  VALUES (p_inventory_id, v_drop.badge_id, 'pickup')
  RETURNING id INTO v_new_item_id;

  -- 6. used_slots +1
  UPDATE public.inventory
  SET used_slots = used_slots + 1
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object('ok', TRUE, 'inventory_item_id', v_new_item_id);
END;
$$;
