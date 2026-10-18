-- 236_combine_pending_results_and_recipe_fields.sql
-- JAM 2.0 믹스 고치기의 DB 부분: 받지 않은 결과, 결과 지급(기한 없음, 잠김), 레시피의 설명·잠김·보상 없음 (티켓 20261018_0055, 운영 로직 8.4·6.4절)
--
-- 덧붙이기가 원칙이다. 새 테이블 하나(combine_pending_results), combination_recipes의 새 칸 셋(description, reward_locked, allow_no_reward),
-- 새 함수 둘(combine_grant_results, combine_claim_pending)이다. 옛 칸의 뜻을 바꾸지 않고 옛 함수를 지우지 않는다. 옛 프로덕션 코드는 새 객체를 쓰지 않는다.
-- 예외 하나: combination_recipes_reward_present_check(포인트 또는 보상 배지 하나 이상)를 «allow_no_reward가 켜진 레시피는 제외»로 바꾼다.
--   allow_no_reward의 기본값이 false라 이미 있는 레시피와 옛 어드민의 저장은 지금과 똑같이 «보상 하나 이상»을 요구한다. 새 어드민만 이 칸을 켠다.
--
-- 규칙(운영 로직 8.4·6.4절)
--   - 결과 지급은 combine_grant_results 한 곳이다. 결과 개수만큼 인벤토리 빈칸이 있으면 모두 지급하고, 모자라면 지급하지 않고 모두 받지 않은 결과로 남긴다(일부만 주지 않는다).
--     결과에는 기한이 없다(expires_at NULL). 재료 소각은 앱이 먼저 하고(지금과 같음) 이 함수는 소각 뒤에 부른다.
--   - 결과의 잠김: p_locked(레시피가 정함)이 true거나 배지가 always_locked면 잠긴 채 나온다. 믹스는 무작위로 잠기지 않는다.
--     잠긴 까닭은 배지가 잠김으로 만들어졌으면 badge_locked, 레시피가 정했으면 designated다. 필요한 양은 배지의 값, 없으면 등급 최소값(jam_policy)이고 지급 때 고정한다.
--   - 삭제된 배지는 지급하지 않고 건너뛴다(지금 앱의 동작과 같다).
--   - 받지 않은 결과는 유저가 믹스 화면에서 받는다(combine_claim_pending). 가진 결과가 모두 들어갈 빈칸이 있어야 받을 수 있다. 같은 결과를 두 번 주지 않는다(행 잠금과 status).
--     받지 않은 결과가 있는 동안 새 믹스를 막는 것은 앱 코드의 몫이다(이 표를 읽는다).
--   - 이용 정지 중에는 받을 수 없다(user_suspended). 믹스를 시작하는 쪽은 앱이 소각 전에 막는다.
--   - 생긴 때(created_at)와 받은 때(resolved_at)를 기록한다(8.5절). 받은 개체는 개체 이력(inventory_item_events)에 received로 남긴다.
--   - 클라이언트 정책 없음(RLS만 켠다). 서버(service_role)만 읽고 쓴다. 함수도 service_role만 실행한다.
--
-- 오류 코드(함수가 돌려주는 error): 받기: user_suspended / no_pending / insufficient_slots(free, needed)
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FROM public.combine_pending_results;                                                       -- 0
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.combine_pending_results'::regclass;               -- true
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='combination_recipes'
--      AND column_name IN ('description','reward_locked','allow_no_reward');                                   -- 3행
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('combine_grant_results','combine_claim_pending'); -- 2행, true
--   SELECT has_function_privilege('authenticated', 'public.combine_claim_pending(uuid)', 'EXECUTE');           -- false
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'combination_recipes_reward_present_check';

-- (1) 레시피의 새 칸
ALTER TABLE public.combination_recipes
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS reward_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_no_reward BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.combination_recipes.description IS '레시피 설명(유저에게 보인다). NULL이면 설명 없음.';
COMMENT ON COLUMN public.combination_recipes.reward_locked IS '결과 아이템 배지를 잠긴 채 지급할지. 기본 false(열림). 잠김으로 만든 배지(badges.always_locked)는 이 값과 상관없이 늘 잠긴다.';
COMMENT ON COLUMN public.combination_recipes.allow_no_reward IS '보상 없음(포인트 0, 보상 배지 없음)을 허용한 레시피. 새 어드민만 켠다. 기본 false라 옛 레시피와 옛 어드민은 보상 하나 이상을 요구한다.';

ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_reward_present_check;
ALTER TABLE public.combination_recipes ADD CONSTRAINT combination_recipes_reward_present_check
  CHECK (allow_no_reward OR reward_points > 0 OR COALESCE(array_length(reward_badge_ids, 1), 0) >= 1);

-- (2) 받지 않은 믹스 결과
CREATE TABLE IF NOT EXISTS public.combine_pending_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES public.combination_recipes(id) ON DELETE SET NULL,
  badge_id UUID NOT NULL REFERENCES public.badges(id),
  locked BOOLEAN NOT NULL DEFAULT false,
  lock_reason TEXT CHECK (lock_reason IS NULL OR lock_reason IN ('badge_locked', 'rolled', 'designated')),
  unlock_required INTEGER CHECK (unlock_required IS NULL OR unlock_required > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed')),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT combine_pending_results_lock_consistent
    CHECK (NOT locked OR (lock_reason IS NOT NULL AND unlock_required IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_combine_pending_results_user_pending
  ON public.combine_pending_results (user_id, created_at) WHERE status = 'pending';

ALTER TABLE public.combine_pending_results ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.combine_pending_results IS
  '인벤토리 빈칸이 모자라 받지 못한 믹스 결과(운영 로직 8.4·6.4절). 재료는 이미 소모됐다. 받기 전에는 새 믹스를 할 수 없다. 기한 없음. service_role 전용.';
COMMENT ON COLUMN public.combine_pending_results.status IS 'pending(받지 않음) 또는 claimed(받음).';
COMMENT ON COLUMN public.combine_pending_results.resolved_at IS '받은 시각.';

-- (3) 결과 지급(빈칸이 있으면 지급, 모자라면 받지 않은 결과로 남김)
CREATE OR REPLACE FUNCTION public.combine_grant_results(
  p_user_id UUID,
  p_recipe_id UUID,
  p_badge_ids UUID[],
  p_locked BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_policy RECORD;
  v_row RECORD;
  v_valid UUID[] := ARRAY[]::UUID[];
  v_n INTEGER;
  v_free INTEGER;
  v_locked BOOLEAN;
  v_reason TEXT;
  v_required INTEGER;
  v_grant JSONB;
  v_item_id UUID;
  v_serial INTEGER;
  v_item_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;
  SELECT * INTO v_policy FROM public.jam_policy LIMIT 1;

  -- 지급할 수 있는 배지(삭제되지 않은 것)만 남긴다. 순서는 입력 순서를 지킨다.
  SELECT COALESCE(array_agg(u.badge_id ORDER BY u.ord), ARRAY[]::UUID[]) INTO v_valid
    FROM unnest(COALESCE(p_badge_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS u(badge_id, ord)
    JOIN public.badges b ON b.id = u.badge_id AND b.deleted_at IS NULL;
  v_n := cardinality(v_valid);
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'none', 'itemIds', '[]'::jsonb, 'pendingCount', 0);
  END IF;

  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);

  FOR v_row IN
    SELECT u.badge_id, u.ord, b.rarity, b.always_locked, b.unlock_required AS badge_required
      FROM unnest(v_valid) WITH ORDINALITY AS u(badge_id, ord)
      JOIN public.badges b ON b.id = u.badge_id
     ORDER BY u.ord
  LOOP
    v_locked := COALESCE(p_locked, FALSE) OR COALESCE(v_row.always_locked, FALSE);
    v_reason := NULL;
    v_required := NULL;
    IF v_locked THEN
      v_reason := CASE WHEN COALESCE(v_row.always_locked, FALSE) THEN 'badge_locked' ELSE 'designated' END;
      v_required := COALESCE(
        v_row.badge_required,
        CASE v_row.rarity::TEXT
          WHEN 'rare' THEN v_policy.locked_min_rare
          WHEN 'epic' THEN v_policy.locked_min_epic
          WHEN 'mystic' THEN v_policy.locked_min_mystic
          ELSE v_policy.locked_min_common
        END
      );
    END IF;

    IF v_free >= v_n THEN
      v_grant := public.grant_inventory_item_locked(
        v_inv.id, v_row.badge_id, 'system_event', NULL, v_locked, v_reason, v_required
      );
      IF NOT COALESCE((v_grant->>'ok')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'combine_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
      END IF;
      v_item_id := (v_grant->>'itemId')::UUID;
      SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;
      INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type)
        VALUES (v_item_id, v_row.badge_id, v_serial, p_user_id, 'received');
      v_item_ids := array_append(v_item_ids, v_item_id);
    ELSE
      INSERT INTO public.combine_pending_results (user_id, recipe_id, badge_id, locked, lock_reason, unlock_required)
        VALUES (p_user_id, p_recipe_id, v_row.badge_id, v_locked, v_reason, v_required);
    END IF;
  END LOOP;

  IF v_free >= v_n THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'granted', 'itemIds', to_jsonb(v_item_ids), 'pendingCount', 0);
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'status', 'pending', 'itemIds', '[]'::jsonb, 'pendingCount', v_n,
    'free', v_free, 'needed', v_n);
END;
$$;

COMMENT ON FUNCTION public.combine_grant_results(UUID, UUID, UUID[], BOOLEAN) IS
  '믹스 결과 지급. 빈칸이 결과 개수 이상이면 모두 기한 없이 지급하고, 모자라면 모두 받지 않은 결과로 남긴다. 잠김은 레시피(p_locked)와 배지(always_locked)가 정한다. 삭제된 배지는 건너뛴다. service_role 전용.';

-- (4) 받지 않은 결과 받기
CREATE OR REPLACE FUNCTION public.combine_claim_pending(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_row RECORD;
  v_count INTEGER;
  v_free INTEGER;
  v_grant JSONB;
  v_item_id UUID;
  v_serial INTEGER;
  v_item_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT count(*) INTO v_count FROM public.combine_pending_results WHERE user_id = p_user_id AND status = 'pending';
  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_pending');
  END IF;

  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  IF v_free < v_count THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_slots', 'free', v_free, 'needed', v_count);
  END IF;

  FOR v_row IN
    SELECT * FROM public.combine_pending_results
     WHERE user_id = p_user_id AND status = 'pending'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    v_grant := public.grant_inventory_item_locked(
      v_inv.id, v_row.badge_id, 'system_event', NULL, v_row.locked, v_row.lock_reason, v_row.unlock_required
    );
    IF NOT COALESCE((v_grant->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'combine_claim_failed: %', COALESCE(v_grant->>'reason', 'unknown');
    END IF;
    v_item_id := (v_grant->>'itemId')::UUID;
    SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;

    UPDATE public.combine_pending_results
       SET status = 'claimed', resolved_at = now(), inventory_item_id = v_item_id
     WHERE id = v_row.id;

    INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type)
      VALUES (v_item_id, v_row.badge_id, v_serial, p_user_id, 'received');
    v_item_ids := array_append(v_item_ids, v_item_id);
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'granted', cardinality(v_item_ids), 'itemIds', to_jsonb(v_item_ids));
END;
$$;

COMMENT ON FUNCTION public.combine_claim_pending(UUID) IS
  '받지 않은 믹스 결과를 모두 받는다. 모두 들어갈 빈칸이 있어야 한다. 같은 결과를 두 번 주지 않는다. 이용 정지 중 거부. service_role 전용.';

REVOKE ALL ON FUNCTION public.combine_grant_results(UUID, UUID, UUID[], BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.combine_grant_results(UUID, UUID, UUID[], BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.combine_grant_results(UUID, UUID, UUID[], BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.combine_claim_pending(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.combine_claim_pending(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.combine_claim_pending(UUID) TO service_role;

-- 되돌림 SQL
-- 새 객체를 지우고 제약을 옛 모양으로 되돌린다. 받지 않은 결과가 남아 있으면 그 결과는 사라지고 재료는 이미 소모됐으므로, 먼저 모든 유저가 받게 하거나 백업한다.
-- 보상 없음 레시피(allow_no_reward가 켜진 행)가 있으면 옛 제약이 걸리지 않으므로 먼저 보상을 채우거나 그 행을 지운다.
-- 이 객체를 쓰는 새 코드(결과 지급, 받기 API, 새 어드민 레시피 저장)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.combine_claim_pending(UUID);
-- DROP FUNCTION IF EXISTS public.combine_grant_results(UUID, UUID, UUID[], BOOLEAN);
-- DROP TABLE IF EXISTS public.combine_pending_results;
-- ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_reward_present_check;
-- ALTER TABLE public.combination_recipes ADD CONSTRAINT combination_recipes_reward_present_check
--   CHECK ((reward_points > 0) OR (COALESCE(array_length(reward_badge_ids, 1), 0) >= 1));
-- ALTER TABLE public.combination_recipes
--   DROP COLUMN IF EXISTS allow_no_reward, DROP COLUMN IF EXISTS reward_locked, DROP COLUMN IF EXISTS description;
