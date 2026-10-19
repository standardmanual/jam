-- 250_mission_item_rewards.sql
-- JAM 2.0 미션 보상 서버: 아이템 배지 보상의 지급·보류·받기 (티켓 20261019_1313, 상위 20261019_1310, 운영 로직 13.2절·6.4절)
--
-- 새 표 1개와 새 함수 2개만 덧붙인다. 옛 테이블·옛 칸·옛 함수는 바꾸지 않는다. 옛 프로덕션 코드는 이 객체를 모르고 계속 동작한다.
-- 본보기는 믹스의 combine_pending_results·combine_grant_results·combine_claim_pending(마이그레이션 236)이다.
--
-- 배경
--   - 지금 미션 보상 지급(lib/missions/rewards.ts)은 이미 가진 아이템 배지와 가득 찬 인벤토리를 흔적 없이 건너뛴다. 규칙은 다르다(13.2절·6.4절):
--     이미 가진 아이템 배지도 새 개체로 주고, 빈칸이 모자라면 받지 않은 상태로 두며, 미션 기간이 끝난 뒤에도 기한 없이 미션 상세에서 받는다.
--   - 동기화 보상용 sync_pending_items는 «고르고 나머지는 폐기» 규칙이라 미션 보상이 섞이면 영구 폐기된다. 그래서 미션 전용 표를 따로 둔다(사용자 결정 2026-10-19).
--   - 잠김은 배지 자체의 설정(badges.always_locked)을 따른다. 미션에 잠김 칸을 더하지 않는다(사용자 결정 2026-10-19).
--
-- 규칙
--   - mission_item_rewards: 미션 하나가 유저에게 준(또는 아직 못 준) 아이템 배지마다 한 행. (user_id, mission_id, badge_id)가 유일하므로 같은 미션의
--     같은 배지를 두 번 주지 않는다(재시도해도 중복 지급이 없다). status는 'claimed'(개체를 줌, inventory_item_id) 또는 'pending'(받지 않음).
--     잠김 정보(locked, lock_reason, unlock_required)는 지급할 때가 아니라 기록할 때 고정한다(받기 전에 배지 설정이 바뀌어도 그대로).
--     기록 요건(13.2절 «받은 보상, 받지 않은 보상»)의 원천이다. 서버(service_role)만 읽고 쓴다.
--   - mission_grant_item_rewards(p_user_id, p_mission_id, p_badge_ids) → JSONB: 아이템 배지(badges.type = 'item', 삭제되지 않음)만 처리한다.
--     이 미션에서 이미 기록된 배지는 건너뛴다(멱등). 남은 배지가 모두 들어갈 빈칸이 있으면 전부 새 개체로 주고(이미 가진 배지도 새 개체, 일련번호는 새로 매겨짐)
--     'claimed'로 기록하며 개체 이력(inventory_item_events 'received')을 남긴다. 모자라면 아무것도 주지 않고 전부 'pending'으로 기록한다(일부만 주지 않는다, 믹스와 같다).
--       {ok:true, status:'none'|'granted'|'pending', itemIds, pendingCount[, free, needed]} / {ok:false, error:'mission_not_found'|'inventory_not_found'}
--   - mission_claim_item_rewards(p_user_id, p_mission_id) → JSONB: 그 미션의 받지 않은 보상을 모두 받는다. 모두 들어갈 빈칸이 있어야 한다. 이용 정지 중 거부.
--       {ok:true, granted, itemIds} / {ok:false, error:'user_suspended'|'inventory_not_found'|'no_pending'|'insufficient_slots'[, free, needed]}
--   - 아이템 배지의 포인트(열린 개체는 받을 때, 잠긴 개체는 열 때)와 소식은 앱 코드가 이 함수의 결과를 보고 처리한다. 이 함수는 포인트를 주지 않는다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('mission_grant_item_rewards','mission_claim_item_rewards');                                      -- 2행, 둘 다 true
--   SELECT has_function_privilege('authenticated','public.mission_grant_item_rewards(uuid,uuid,uuid[])','EXECUTE'),
--          has_function_privilege('service_role','public.mission_grant_item_rewards(uuid,uuid,uuid[])','EXECUTE');      -- false, true
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'mission_item_rewards';                                         -- true
--   SELECT has_table_privilege('authenticated','public.mission_item_rewards','SELECT');                                 -- false
--   SELECT count(*) FROM public.mission_item_rewards;                                                                   -- 0

-- ── 1. 미션 아이템 배지 보상 기록 ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mission_item_rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mission_id     UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  badge_id       UUID NOT NULL REFERENCES public.badges(id),
  locked         BOOLEAN NOT NULL DEFAULT FALSE,
  lock_reason    TEXT CHECK (lock_reason IS NULL OR lock_reason IN ('badge_locked', 'rolled', 'designated')),
  unlock_required INTEGER CHECK (unlock_required IS NULL OR unlock_required > 0),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed')),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  CONSTRAINT mission_item_rewards_unique UNIQUE (user_id, mission_id, badge_id),
  CONSTRAINT mission_item_rewards_lock_consistent
    CHECK (NOT locked OR (lock_reason IS NOT NULL AND unlock_required IS NOT NULL))
);

COMMENT ON TABLE public.mission_item_rewards IS
  '미션이 유저에게 준(claimed) 또는 인벤토리 빈칸이 모자라 아직 못 준(pending) 아이템 배지 보상의 기록(운영 로직 13.2절·6.4절). 기한 없음. 서버(service_role)만 읽고 쓴다.';
COMMENT ON COLUMN public.mission_item_rewards.status IS 'pending(받지 않음) 또는 claimed(받음).';
COMMENT ON COLUMN public.mission_item_rewards.resolved_at IS '받은 시각(claimed일 때).';

CREATE INDEX IF NOT EXISTS idx_mission_item_rewards_user_pending
  ON public.mission_item_rewards (user_id, mission_id) WHERE status = 'pending';

ALTER TABLE public.mission_item_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mission_item_rewards FROM anon, authenticated;

-- ── 2. 보상 지급 (빈칸이 있으면 지급, 모자라면 받지 않은 보상으로 기록) ────────

CREATE OR REPLACE FUNCTION public.mission_grant_item_rewards(
  p_user_id    UUID,
  p_mission_id UUID,
  p_badge_ids  UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv      RECORD;
  v_policy   RECORD;
  v_row      RECORD;
  v_valid    UUID[] := ARRAY[]::UUID[];
  v_n        INTEGER;
  v_free     INTEGER;
  v_locked   BOOLEAN;
  v_reason   TEXT;
  v_required INTEGER;
  v_grant    JSONB;
  v_item_id  UUID;
  v_serial   INTEGER;
  v_item_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.missions m WHERE m.id = p_mission_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'mission_not_found');
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;
  SELECT * INTO v_policy FROM public.jam_policy LIMIT 1;

  -- 줄 수 있는 아이템 배지(삭제되지 않은 것)만, 이 미션에서 아직 기록되지 않은 것만, 입력 순서대로 남긴다.
  SELECT COALESCE(array_agg(u.badge_id ORDER BY u.ord), ARRAY[]::UUID[]) INTO v_valid
    FROM (
      SELECT d.badge_id, min(d.ord) AS ord
        FROM unnest(COALESCE(p_badge_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS d(badge_id, ord)
       GROUP BY d.badge_id
    ) AS u
    JOIN public.badges b ON b.id = u.badge_id AND b.deleted_at IS NULL AND b.type::TEXT = 'item'
   WHERE NOT EXISTS (
     SELECT 1 FROM public.mission_item_rewards r
      WHERE r.user_id = p_user_id AND r.mission_id = p_mission_id AND r.badge_id = u.badge_id
   );
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
    v_locked := COALESCE(v_row.always_locked, FALSE);
    v_reason := NULL;
    v_required := NULL;
    IF v_locked THEN
      v_reason := 'badge_locked';
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
        RAISE EXCEPTION 'mission_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
      END IF;
      v_item_id := (v_grant->>'itemId')::UUID;
      SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;
      INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type)
        VALUES (v_item_id, v_row.badge_id, v_serial, p_user_id, 'received');
      INSERT INTO public.mission_item_rewards (
        user_id, mission_id, badge_id, locked, lock_reason, unlock_required, status, inventory_item_id, resolved_at
      )
        VALUES (p_user_id, p_mission_id, v_row.badge_id, v_locked, v_reason, v_required, 'claimed', v_item_id, now());
      v_item_ids := array_append(v_item_ids, v_item_id);
    ELSE
      INSERT INTO public.mission_item_rewards (user_id, mission_id, badge_id, locked, lock_reason, unlock_required)
        VALUES (p_user_id, p_mission_id, v_row.badge_id, v_locked, v_reason, v_required);
    END IF;
  END LOOP;

  IF v_free >= v_n THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'granted', 'itemIds', to_jsonb(v_item_ids), 'pendingCount', 0);
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'status', 'pending', 'itemIds', '[]'::jsonb, 'pendingCount', v_n,
    'free', v_free, 'needed', v_n);
END;
$$;

COMMENT ON FUNCTION public.mission_grant_item_rewards(UUID, UUID, UUID[]) IS
  '미션 아이템 배지 보상을 준다. 이미 가진 배지도 새 개체로 준다. 모두 들어갈 빈칸이 있으면 전부 주고, 모자라면 아무것도 주지 않고 전부 받지 않은 보상으로 기록한다. 같은 미션의 같은 배지는 한 번만 기록한다. service_role 전용.';

-- ── 3. 받지 않은 보상 받기 ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mission_claim_item_rewards(
  p_user_id    UUID,
  p_mission_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv      RECORD;
  v_row      RECORD;
  v_count    INTEGER;
  v_free     INTEGER;
  v_grant    JSONB;
  v_item_id  UUID;
  v_serial   INTEGER;
  v_item_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions s WHERE s.user_id = p_user_id AND s.lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT count(*) INTO v_count
    FROM public.mission_item_rewards r
   WHERE r.user_id = p_user_id AND r.mission_id = p_mission_id AND r.status = 'pending';
  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_pending');
  END IF;

  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  IF v_free < v_count THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_slots', 'free', v_free, 'needed', v_count);
  END IF;

  FOR v_row IN
    SELECT * FROM public.mission_item_rewards r
     WHERE r.user_id = p_user_id AND r.mission_id = p_mission_id AND r.status = 'pending'
     ORDER BY r.created_at, r.id
     FOR UPDATE
  LOOP
    v_grant := public.grant_inventory_item_locked(
      v_inv.id, v_row.badge_id, 'system_event', NULL, v_row.locked, v_row.lock_reason, v_row.unlock_required
    );
    IF NOT COALESCE((v_grant->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'mission_claim_failed: %', COALESCE(v_grant->>'reason', 'unknown');
    END IF;
    v_item_id := (v_grant->>'itemId')::UUID;
    SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;

    UPDATE public.mission_item_rewards
       SET status = 'claimed', resolved_at = now(), inventory_item_id = v_item_id
     WHERE id = v_row.id;

    INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type)
      VALUES (v_item_id, v_row.badge_id, v_serial, p_user_id, 'received');
    v_item_ids := array_append(v_item_ids, v_item_id);
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'granted', cardinality(v_item_ids), 'itemIds', to_jsonb(v_item_ids));
END;
$$;

COMMENT ON FUNCTION public.mission_claim_item_rewards(UUID, UUID) IS
  '한 미션의 받지 않은 아이템 배지 보상을 모두 받는다. 모두 들어갈 빈칸이 있어야 한다. 같은 보상을 두 번 주지 않는다. 이용 정지 중 거부. service_role 전용.';

-- ── 4. 권한 (service_role만 실행) ─────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.mission_grant_item_rewards(UUID, UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mission_grant_item_rewards(UUID, UUID, UUID[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mission_grant_item_rewards(UUID, UUID, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.mission_claim_item_rewards(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mission_claim_item_rewards(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mission_claim_item_rewards(UUID, UUID) TO service_role;

-- 되돌림 SQL
-- 새 객체만 지운다. 옛 객체는 바꾸지 않았다. 함수를 먼저 지우고 표를 지운다.
-- 표에 'pending' 행(받지 않은 보상)이 남아 있으면 지우는 순간 그 보상은 사라지므로, 되돌리기 전에 모두 받게 하거나 행을 백업한다.
-- 새 앱 코드(mission_grant_item_rewards 호출, 받기 API)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.mission_claim_item_rewards(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.mission_grant_item_rewards(UUID, UUID, UUID[]);
-- DROP TABLE IF EXISTS public.mission_item_rewards;
