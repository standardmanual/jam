-- 231_locked_item_badges.sql
-- JAM 2.0 잠긴 아이템 배지의 저장 (티켓 20261018_0051, 운영 로직 7.2·7.4·7.5절)
--
-- 전부 덧붙이기다. 옛 칸의 뜻을 바꾸지 않고 옛 함수를 지우지 않는다. 새 칸은 모두 기본값이 «열림»이라 옛 프로덕션 코드와
-- 이미 있는 개체는 그대로 동작한다. 옛 프로덕션 코드는 새 칸·새 함수를 읽지 않는다.
--
-- (1) inventory_items: 개체가 잠겼는지(locked), 여는 데 필요한 양(unlock_required, 배정 때 고정), 채운 양(unlock_filled),
--     잠긴 까닭(lock_reason: badge_locked=잠김으로 만듦 / rolled=잠긴 채 배정됨 / designated=운영자가 지정함), 연 시각(unlocked_at).
--     한 번 연 개체는 다시 잠기지 않는다(locked=false, unlocked_at 채움). 연 뒤에도 unlock_required·lock_reason은 이력으로 남는다.
-- (2) badges: 잠김으로 만든 아이템 배지(always_locked)와 여는 데 필요한 양(unlock_required, NULL이면 등급 최소값을 쓴다).
--     등급 최소값보다 적은 값은 어드민이 저장하지 않는다(앱 코드가 막는다). 여기서는 양수만 확인한다.
-- (3) jam_policy: 등급별 최소값(30/60/120/240)과 동기화·캡슐에서 잠길 확률(0.25). 기본값은 src/lib/jam/policy.ts의
--     DEFAULT_JAM_POLICY와 반드시 같은 값을 유지한다.
-- (4) sync_pending_items: 보류에 잠김 정보(unlock_required, lock_reason)를 더해 고르기로 받을 때 개체에 옮긴다.
-- (5) grant_inventory_item_locked: 옛 grant_inventory_item을 그대로 부른 뒤 같은 트랜잭션에서 잠김 칸을 채운다.
--     지급과 잠김이 따로 저장되어 «열린 채 지급됐는데 잠겨야 하는» 틈이 생기지 않게 한다. service_role만 실행한다.
-- (6) resolve_sync_pending_items(229 새 함수, 옛 프로덕션 코드는 쓰지 않음): 고른 보류를 지급할 때 잠김을 개체에 옮기도록 바꾼다.
-- (7) 잠긴 개체 보호 트리거 둘: 잠긴 개체를 컬렉션에 꽂거나(slotted_in) 드랍(dropped_at)하는 갱신을 거부한다. 옛 장착·드랍 경로도
--     같은 칸을 갱신하므로 함께 막힌다. 잠긴 개체가 없으면(옛 경로는 만들지 않는다) 발동하지 않는다. 묶음 4가 잠긴 채 드랍을 열 때 고친다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'inventory_items'
--      AND column_name IN ('locked','unlock_required','unlock_filled','lock_reason','unlocked_at');   -- 5행
--   SELECT count(*) FROM public.inventory_items WHERE locked;                                          -- 0
--   SELECT locked_min_common, locked_min_rare, locked_min_epic, locked_min_mystic, locked_roll_probability
--     FROM public.jam_policy;                                                                          -- 30, 60, 120, 240, 0.250
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('grant_inventory_item_locked','resolve_sync_pending_items');  -- 2행, true
--   SELECT has_function_privilege('authenticated', 'public.grant_inventory_item_locked(uuid, uuid, text, timestamptz, boolean, text, integer)', 'EXECUTE');  -- false

-- (1) 개체의 잠김
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_required INTEGER CHECK (unlock_required IS NULL OR unlock_required > 0),
  ADD COLUMN IF NOT EXISTS unlock_filled INTEGER NOT NULL DEFAULT 0 CHECK (unlock_filled >= 0),
  ADD COLUMN IF NOT EXISTS lock_reason TEXT CHECK (lock_reason IS NULL OR lock_reason IN ('badge_locked', 'rolled', 'designated')),
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ;

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_lock_consistent;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_lock_consistent
  CHECK (
    NOT locked
    OR (unlock_required IS NOT NULL AND lock_reason IS NOT NULL AND unlock_filled <= unlock_required AND unlocked_at IS NULL)
  );

COMMENT ON COLUMN public.inventory_items.locked IS '잠긴 개체인가. 한 번 열면 false가 되고 다시 잠기지 않는다. 기본 false(열림).';
COMMENT ON COLUMN public.inventory_items.unlock_required IS '여는 데 필요한 잼의 양. 개체가 유저에게 배정될 때 고정하고 이후 바뀌지 않는다. 열린 채 받은 개체는 NULL.';
COMMENT ON COLUMN public.inventory_items.unlock_filled IS '지금까지 채운 잼의 양. 잠긴 채 드랍하면 0이 된다.';
COMMENT ON COLUMN public.inventory_items.lock_reason IS '잠긴 까닭: badge_locked(잠김으로 만든 아이템 배지), rolled(잠긴 채 배정됨), designated(운영자가 지정함). 연 뒤에도 이력으로 남는다.';
COMMENT ON COLUMN public.inventory_items.unlocked_at IS '연 시각. NULL이면 열린 적 없다(열린 채 받은 개체 포함).';

-- (2) 배지 양식
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS always_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_required INTEGER CHECK (unlock_required IS NULL OR unlock_required > 0);

COMMENT ON COLUMN public.badges.always_locked IS '잠김으로 만든 아이템 배지. true면 어느 경로로 얻어도 늘 잠긴 채 나온다. 기본 false.';
COMMENT ON COLUMN public.badges.unlock_required IS '여는 데 필요한 잼의 양. NULL이면 그 등급의 최소값(jam_policy.locked_min_*)을 쓴다. 최소값보다 적게 저장하지 않는다(앱 코드).';

-- (3) 설정 행
ALTER TABLE public.jam_policy
  ADD COLUMN IF NOT EXISTS locked_min_common INTEGER NOT NULL DEFAULT 30 CHECK (locked_min_common >= 1),
  ADD COLUMN IF NOT EXISTS locked_min_rare INTEGER NOT NULL DEFAULT 60 CHECK (locked_min_rare >= 1),
  ADD COLUMN IF NOT EXISTS locked_min_epic INTEGER NOT NULL DEFAULT 120 CHECK (locked_min_epic >= 1),
  ADD COLUMN IF NOT EXISTS locked_min_mystic INTEGER NOT NULL DEFAULT 240 CHECK (locked_min_mystic >= 1),
  ADD COLUMN IF NOT EXISTS locked_roll_probability NUMERIC(4, 3) NOT NULL DEFAULT 0.25 CHECK (locked_roll_probability >= 0 AND locked_roll_probability <= 1);

COMMENT ON COLUMN public.jam_policy.locked_min_common IS '잠긴 아이템 배지를 여는 데 필요한 양의 최소값(Common). 기본 30.';
COMMENT ON COLUMN public.jam_policy.locked_min_rare IS '같은 최소값(Rare). 기본 60.';
COMMENT ON COLUMN public.jam_policy.locked_min_epic IS '같은 최소값(Epic). 기본 120.';
COMMENT ON COLUMN public.jam_policy.locked_min_mystic IS '같은 최소값(Mystic). 기본 240.';
COMMENT ON COLUMN public.jam_policy.locked_roll_probability IS '동기화와 캡슐에서 나온 아이템 배지가 잠긴 채 배정될 확률(0~1). 기본 0.25.';

-- (4) 보류에 잠김 정보
ALTER TABLE public.sync_pending_items
  ADD COLUMN IF NOT EXISTS unlock_required INTEGER CHECK (unlock_required IS NULL OR unlock_required > 0),
  ADD COLUMN IF NOT EXISTS lock_reason TEXT CHECK (lock_reason IS NULL OR lock_reason IN ('badge_locked', 'rolled', 'designated'));

COMMENT ON COLUMN public.sync_pending_items.unlock_required IS '보류 때 고정한 여는 데 필요한 양. locked가 true일 때만 값이 있다.';
COMMENT ON COLUMN public.sync_pending_items.lock_reason IS '보류 때 정한 잠긴 까닭. locked가 true일 때만 값이 있다.';

-- (5) 잠김을 함께 저장하는 지급
CREATE OR REPLACE FUNCTION public.grant_inventory_item_locked(
  p_inventory_id UUID,
  p_badge_id UUID,
  p_obtained_by TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_locked BOOLEAN DEFAULT FALSE,
  p_lock_reason TEXT DEFAULT NULL,
  p_unlock_required INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant JSONB;
  v_item_id UUID;
BEGIN
  IF COALESCE(p_locked, FALSE) AND (p_lock_reason IS NULL OR p_unlock_required IS NULL OR p_unlock_required <= 0) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_lock_args');
  END IF;

  v_grant := public.grant_inventory_item(p_inventory_id, p_badge_id, p_obtained_by, p_expires_at);
  IF NOT COALESCE((v_grant->>'ok')::BOOLEAN, FALSE) THEN
    RETURN v_grant;
  END IF;

  IF COALESCE(p_locked, FALSE) THEN
    v_item_id := (v_grant->>'itemId')::UUID;
    UPDATE public.inventory_items
       SET locked = TRUE, lock_reason = p_lock_reason, unlock_required = p_unlock_required, unlock_filled = 0
     WHERE id = v_item_id;
  END IF;

  RETURN v_grant;
END;
$$;

COMMENT ON FUNCTION public.grant_inventory_item_locked(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, INTEGER) IS
  '옛 grant_inventory_item을 부른 뒤 같은 트랜잭션에서 잠김 칸을 채운다. p_locked가 false면 옛 함수와 같다. service_role 전용.';

REVOKE ALL ON FUNCTION public.grant_inventory_item_locked(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_inventory_item_locked(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_inventory_item_locked(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, INTEGER) TO service_role;

-- (6) 보류 고르기: 지급할 때 잠김을 개체에 옮긴다 (229의 새 함수를 바꾼다. 옛 프로덕션 코드는 쓰지 않는다)
CREATE OR REPLACE FUNCTION public.resolve_sync_pending_items(
  p_user_id UUID,
  p_chosen_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_chosen UUID[];
  v_free INTEGER;
  v_pending INTEGER;
  v_expected INTEGER;
  v_valid INTEGER;
  v_row RECORD;
  v_grant JSONB;
  v_item_id UUID;
  v_serial INTEGER;
  v_granted INTEGER := 0;
  v_discarded INTEGER := 0;
  v_item_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.sync_pending_items WHERE user_id = p_user_id AND status = 'pending';
  IF v_pending = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_pending');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::UUID[]) INTO v_chosen
    FROM unnest(COALESCE(p_chosen_ids, ARRAY[]::UUID[])) AS c;

  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  v_expected := LEAST(v_free, v_pending);

  SELECT count(*) INTO v_valid
    FROM public.sync_pending_items
   WHERE user_id = p_user_id AND status = 'pending' AND id = ANY(v_chosen);
  IF v_valid <> cardinality(v_chosen) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_selection');
  END IF;

  IF cardinality(v_chosen) <> v_expected THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_count', 'expected', v_expected);
  END IF;

  FOR v_row IN
    SELECT * FROM public.sync_pending_items
     WHERE user_id = p_user_id AND status = 'pending' AND id = ANY(v_chosen)
     ORDER BY created_at, id
  LOOP
    v_grant := public.grant_inventory_item_locked(
      v_inv.id, v_row.badge_id, 'drop', NULL, v_row.locked, v_row.lock_reason, v_row.unlock_required
    );
    IF NOT COALESCE((v_grant->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'sync_pending_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
    END IF;

    v_item_id := (v_grant->>'itemId')::UUID;
    SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;

    UPDATE public.sync_pending_items
       SET status = 'claimed', resolved_at = now(), inventory_item_id = v_item_id
     WHERE id = v_row.id;

    INSERT INTO public.item_issue_log
      (user_id, inventory_item_id, route, source_activity_id, badge_id, rarity, rolled_rarity, locked, serial_number)
    VALUES
      (p_user_id, v_item_id, 'sync', v_row.source_activity_id, v_row.badge_id, v_row.rarity, v_row.rolled_rarity, v_row.locked, v_serial);

    v_granted := v_granted + 1;
    v_item_ids := array_append(v_item_ids, v_item_id);
  END LOOP;

  UPDATE public.sync_pending_items
     SET status = 'discarded', resolved_at = now()
   WHERE user_id = p_user_id AND status = 'pending';
  GET DIAGNOSTICS v_discarded = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'granted', v_granted,
    'discarded', v_discarded,
    'itemIds', to_jsonb(v_item_ids)
  );
END;
$$;

-- (7) 잠긴 개체 보호: 컬렉션에 꽂기(slotted_in)와 드랍(dropped_at)을 거부한다
CREATE OR REPLACE FUNCTION public.inventory_items_reject_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.locked THEN
    IF NEW.slotted_in IS DISTINCT FROM OLD.slotted_in AND NEW.slotted_in IS NOT NULL THEN
      RAISE EXCEPTION 'locked_item_cannot_be_slotted' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.dropped_at IS DISTINCT FROM OLD.dropped_at AND NEW.dropped_at IS NOT NULL THEN
      RAISE EXCEPTION 'locked_item_cannot_be_dropped' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_reject_locked ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_reject_locked
  BEFORE UPDATE OF slotted_in, dropped_at ON public.inventory_items
  FOR EACH ROW
  WHEN (NEW.locked)
  EXECUTE FUNCTION public.inventory_items_reject_locked();

-- 되돌림 SQL
-- 새로 만든 객체와 칸만 지운다. 잠긴 개체가 생긴 뒤에는 되돌리면 잠김·채운 양이 사라지고 잠긴 개체가 열린 개체로 보이므로, 먼저 모든 개체의 잠김을 풀거나 백업한다.
-- 이 칸을 읽는 새 코드(잠김 배정, 보류 고르기의 잠김 이동, 어드민 배지 양식)는 같은 시점에 되돌려야 한다.
-- resolve_sync_pending_items는 229의 본문(grant_inventory_item을 직접 부르는 버전)으로 되돌린다.
-- DROP TRIGGER IF EXISTS trg_inventory_items_reject_locked ON public.inventory_items;
-- DROP FUNCTION IF EXISTS public.inventory_items_reject_locked();
-- DROP FUNCTION IF EXISTS public.grant_inventory_item_locked(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, INTEGER);
-- ALTER TABLE public.sync_pending_items DROP COLUMN IF EXISTS lock_reason, DROP COLUMN IF EXISTS unlock_required;
-- ALTER TABLE public.jam_policy
--   DROP COLUMN IF EXISTS locked_roll_probability, DROP COLUMN IF EXISTS locked_min_mystic, DROP COLUMN IF EXISTS locked_min_epic,
--   DROP COLUMN IF EXISTS locked_min_rare, DROP COLUMN IF EXISTS locked_min_common;
-- ALTER TABLE public.badges DROP COLUMN IF EXISTS unlock_required, DROP COLUMN IF EXISTS always_locked;
-- ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_lock_consistent;
-- ALTER TABLE public.inventory_items
--   DROP COLUMN IF EXISTS unlocked_at, DROP COLUMN IF EXISTS lock_reason, DROP COLUMN IF EXISTS unlock_filled,
--   DROP COLUMN IF EXISTS unlock_required, DROP COLUMN IF EXISTS locked;
