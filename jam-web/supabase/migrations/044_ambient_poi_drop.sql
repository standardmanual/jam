-- ============================================================
-- Migration 044: 앰비언트 POI 아이템배지 드랍 (상시 자동 배치)
--
-- 기존 poi_drops는 "유저가 자기 인벤토리에서 드랍"만 지원했음.
-- 이번 마이그레이션은 "시스템이 직접 POI에 배치"하는 두 번째 출처를 추가한다.
--
-- 1. poi_drops.source 추가 (user/system) — dropper_user_id nullable화
-- 2. poi_drops.expires_at nullable화 — 시스템 드랍은 만료 없음 (CHECK로 강제)
-- 3. ambient_drop_policy 싱글톤 — 레어리티(common/rare/legendary, mythic 제외)·
--    POI당 최대 활성 개수·커버리지 비율·배치당 보충 개수
-- 4. assign_random_serial() 트리거 분기 — 앰비언트 드랍 픽업 시 일련번호를
--    50,001~999,999 범위로 제한 (drop_id → poi_drops.source 조회로 판별)
--
-- 로직 문서: PRD/badge/BADGE_ENGINE_UNIFIED.md §3 (§3.12 앰비언트 드랍 추가 예정)
-- ============================================================

-- ----------------------------------------------------------------
-- 1~2. poi_drops: source 추가 + dropper_user_id/expires_at nullable화
-- ----------------------------------------------------------------
ALTER TABLE public.poi_drops
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system'));

ALTER TABLE public.poi_drops
  ALTER COLUMN dropper_user_id DROP NOT NULL;

ALTER TABLE public.poi_drops
  ALTER COLUMN expires_at DROP NOT NULL;

-- 기존 행(전부 유저 드랍)은 이미 dropper_user_id·expires_at이 채워져 있어 아래 CHECK를 그대로 통과한다.
ALTER TABLE public.poi_drops
  ADD CONSTRAINT poi_drops_source_consistency CHECK (
    (source = 'user'   AND dropper_user_id IS NOT NULL AND expires_at IS NOT NULL) OR
    (source = 'system' AND dropper_user_id IS NULL     AND expires_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_poi_drops_system_available
  ON public.poi_drops (poi_id)
  WHERE source = 'system' AND is_available = TRUE;

-- ----------------------------------------------------------------
-- 3. ambient_drop_policy (싱글톤 — id=1 고정, drop_policy와 동일 패턴)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ambient_drop_policy (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- 레어리티 분포 (mythic 없음 — 신화 등급은 액티비티 성취·떠돌이 아이템 전용 유지)
  rarity_common NUMERIC(4,3) NOT NULL DEFAULT 0.86,
  rarity_rare NUMERIC(4,3) NOT NULL DEFAULT 0.12,
  rarity_legendary NUMERIC(4,3) NOT NULL DEFAULT 0.02,
  -- 목표 수량: target_total = clamp(활성 POI 수 × coverage_ratio, min, max)
  target_coverage_ratio NUMERIC(4,3) NOT NULL DEFAULT 0.15,
  min_target_total INTEGER NOT NULL DEFAULT 20,
  max_target_total INTEGER NOT NULL DEFAULT 2000,
  -- POI 1곳이 동시에 보유 가능한 최대 활성 앰비언트 드랍 수 (독점 방지 → 발견 경험 분산)
  max_active_per_poi INTEGER NOT NULL DEFAULT 1,
  -- 크론 1회 실행당 최대 보충 개수 (한 번에 대량 스폰되는 티 방지)
  replenish_batch_size INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ambient_drop_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 4. 일련번호 범위 분기 — 앰비언트 드랍 픽업만 50,001~999,999
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_random_serial()
RETURNS TRIGGER AS $$
DECLARE
  candidate INTEGER;
  tries INTEGER := 0;
  range_min INTEGER := 1;
  is_ambient BOOLEAN := FALSE;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.drop_id IS NOT NULL THEN
    SELECT (source = 'system') INTO is_ambient
    FROM public.poi_drops
    WHERE id = NEW.drop_id;
  END IF;

  IF is_ambient THEN
    range_min := 50001;
  END IF;

  LOOP
    candidate := range_min + floor(random() * (999999 - range_min + 1))::INTEGER;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.inventory_items WHERE serial_number = candidate
    );
    tries := tries + 1;
    IF tries > 50 THEN
      RAISE EXCEPTION 'assign_random_serial: 50회 시도 내 빈 일련번호를 찾지 못함 (범위 확장 필요)';
    END IF;
  END LOOP;
  NEW.serial_number := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- 5. pickup_drop RPC 수정 — inventory_items INSERT 시 drop_id 누락 수정
--    (기존 버그: drop_id를 채우지 않아 위 트리거가 source를 조회할 방법이 없었음)
-- ----------------------------------------------------------------
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

  IF v_drop.dropper_user_id = p_picker_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_pickup_own_drop');
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
