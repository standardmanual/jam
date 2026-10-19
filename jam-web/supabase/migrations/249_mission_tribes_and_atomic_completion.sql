-- 249_mission_tribes_and_atomic_completion.sql
-- JAM 2.0 미션 서버 ①: 참가할 수 있는 트라이브, 참가 취소 기록과 함수, 선착순 동시 완료 막기 (티켓 20261019_1311, 상위 20261019_1310, 운영 로직 13.2절)
--
-- 새 테이블 2개와 새 함수 2개만 덧붙인다. 옛 테이블·옛 칸·옛 함수는 바꾸지 않는다(missions, user_mission_participations,
-- user_mission_completions의 구조와 제약은 그대로다). 옛 프로덕션 코드는 이 객체를 모르고 계속 동작한다.
--
-- 배경
--   - 미션에는 트라이브 칸이 없다. 운영자가 «참가할 수 있는 트라이브»를 하나 이상 고르고, 고르지 않은 미션은 모든 유저가 하는 공통 미션이다(13.2절).
--   - 선착순 완료 제한은 완료 수를 센 뒤 INSERT하는 사이에 잠금이 없어, 동시에 완료하면 상한을 넘을 수 있다(비교표 4.1절 문제 ②).
--   - 트라이브가 바뀌면 참가한 트라이브 제한 미션의 참가를 취소하고 순위에서 빼야 한다(13.2절). 이미 받은 보상은 그대로 둔다.
--
-- 규칙
--   - mission_allowed_tribes: 미션 하나에 참가할 수 있는 트라이브마다 한 행. 행이 하나도 없으면 공통 미션이다.
--     트라이브를 지우면 연결이 조용히 사라져 트라이브 미션이 공통 미션으로 넓어지므로 ON DELETE RESTRICT로 막는다(미션을 지우면 연결도 함께 지워진다).
--   - mission_participation_cancellations: 취소한 참가의 기록(참가 시각, 진행값, 취소 당시 완료 여부, 새 트라이브). 유저를 지우면 함께 지워진다(탈퇴).
--   - mission_complete(p_user_id, p_mission_id) → JSONB: 완료 기록을 한 트랜잭션에서 남긴다. 반환 모양은 다른 함수와 같다.
--       {ok:true,  status:'completed', completion_id}   새로 완료했다
--       {ok:true,  status:'already_completed'}           이미 완료한 미션이다(자리를 세지 않는다)
--       {ok:false, error:'mission_not_found' | 'user_suspended' | 'not_participating' | 'tribe_not_allowed' | 'mission_full'}
--     선착순(max_completions가 있음)이면 미션마다 어드바이저리 잠금(pg_advisory_xact_lock)을 잡은 뒤 완료 수를 세고 기록한다.
--     잠금은 트랜잭션이 끝나면 풀리므로, 동시에 완료해도 한 명씩 차례로 처리된다. 상한이 없는 미션은 잠금을 잡지 않는다.
--     같은 유저의 중복 완료는 UNIQUE(user_id, mission_id)와 ON CONFLICT DO NOTHING이 막는다.
--     이용 정지 중·참가하지 않음·트라이브가 대상이 아님은 앱 코드가 먼저 막고 여기서 한 번 더 막는 방어선이다.
--   - mission_cancel_for_tribe_change(p_user_id) → (out_mission_id, out_mission_title)*: 유저의 현재 트라이브가 대상이 아닌 트라이브 제한 미션의 참가를
--     취소한다(참가 행을 지우고 기록을 남긴다). 트라이브가 없는 유저(NULL)는 트라이브 제한 미션을 모두 취소한다. 공통 미션과 새 트라이브가 대상인 미션은 그대로다.
--     이미 완료한 미션의 참가도 취소하지만 완료 기록(user_mission_completions)과 받은 보상은 지우지 않는다. 취소한 미션마다 한 행을 돌려주어
--     호출한 쪽이 소식(5-3)을 보내게 한다. 이 함수를 부르는 곳은 앱에 아직 없다(유저의 트라이브를 바꾸는 코드가 생기는 묶음 6에서 연결한다).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('mission_complete','mission_cancel_for_tribe_change');                                         -- 2행, 둘 다 true
--   SELECT has_function_privilege('authenticated','public.mission_complete(uuid,uuid)','EXECUTE'),
--          has_function_privilege('service_role','public.mission_complete(uuid,uuid)','EXECUTE');                      -- false, true
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('mission_allowed_tribes','mission_participation_cancellations');  -- 2행, true
--   SELECT has_table_privilege('authenticated','public.mission_allowed_tribes','SELECT');                              -- false

-- ── 1. 참가할 수 있는 트라이브 ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mission_allowed_tribes (
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  tribe_id   UUID NOT NULL REFERENCES public.tribes(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, tribe_id)
);

COMMENT ON TABLE public.mission_allowed_tribes IS
  '미션에 참가할 수 있는 트라이브. 미션 하나에 행이 없으면 공통 미션이다(운영 로직 13.2절). 서버(service_role)만 읽고 쓴다.';

CREATE INDEX IF NOT EXISTS idx_mission_allowed_tribes_tribe
  ON public.mission_allowed_tribes (tribe_id);

ALTER TABLE public.mission_allowed_tribes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mission_allowed_tribes FROM anon, authenticated;

-- ── 2. 참가 취소 기록 ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mission_participation_cancellations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mission_id     UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  joined_at      TIMESTAMPTZ NOT NULL,
  progress_value NUMERIC NOT NULL DEFAULT 0,
  was_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  new_tribe_id   UUID REFERENCES public.tribes(id) ON DELETE SET NULL,
  reason         TEXT NOT NULL DEFAULT 'tribe_changed',
  cancelled_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mission_participation_cancellations IS
  '트라이브가 바뀌어 취소된 미션 참가의 기록(운영 로직 13.2절). 완료 기록과 받은 보상은 지우지 않는다. 서버(service_role)만 읽고 쓴다.';

CREATE INDEX IF NOT EXISTS idx_mission_participation_cancellations_user
  ON public.mission_participation_cancellations (user_id, cancelled_at DESC);

ALTER TABLE public.mission_participation_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mission_participation_cancellations FROM anon, authenticated;

-- ── 3. 미션 완료 (선착순 동시 완료 막기) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mission_complete(
  p_user_id    UUID,
  p_mission_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_max        INTEGER;
  v_count      INTEGER;
  v_user_tribe UUID;
  v_id         UUID;
BEGIN
  SELECT m.max_completions INTO v_max FROM public.missions m WHERE m.id = p_mission_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'mission_not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_suspensions s WHERE s.user_id = p_user_id AND s.lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_mission_participations p
    WHERE p.user_id = p_user_id AND p.mission_id = p_mission_id
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_participating');
  END IF;

  IF EXISTS (SELECT 1 FROM public.mission_allowed_tribes t WHERE t.mission_id = p_mission_id) THEN
    SELECT u.tribe_id INTO v_user_tribe FROM public.users u WHERE u.id = p_user_id;
    IF v_user_tribe IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.mission_allowed_tribes t
      WHERE t.mission_id = p_mission_id AND t.tribe_id = v_user_tribe
    ) THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'tribe_not_allowed');
    END IF;
  END IF;

  -- 이미 완료한 미션은 선착순 자리를 세기 전에 돌려준다(두 번 세지 않는다).
  IF EXISTS (
    SELECT 1 FROM public.user_mission_completions c
    WHERE c.user_id = p_user_id AND c.mission_id = p_mission_id
  ) THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'already_completed');
  END IF;

  IF v_max IS NOT NULL THEN
    -- 같은 미션의 완료를 한 명씩 차례로 처리한다. 잠금은 이 트랜잭션이 끝날 때 풀리므로,
    -- 기다린 쪽은 앞 사람의 기록이 확정된 뒤에 완료 수를 센다.
    PERFORM pg_advisory_xact_lock(hashtextextended('mission_complete:' || p_mission_id::text, 0));
    SELECT count(*) INTO v_count FROM public.user_mission_completions c WHERE c.mission_id = p_mission_id;
    IF v_count >= v_max THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'mission_full');
    END IF;
  END IF;

  INSERT INTO public.user_mission_completions (user_id, mission_id)
  VALUES (p_user_id, p_mission_id)
  ON CONFLICT (user_id, mission_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'already_completed');
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', 'completed', 'completion_id', v_id);
END;
$function$;

-- ── 4. 트라이브 변경 때 참가 취소 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mission_cancel_for_tribe_change(
  p_user_id UUID
)
RETURNS TABLE (out_mission_id UUID, out_mission_title TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tribe UUID;
  v_row   RECORD;
BEGIN
  SELECT u.tribe_id INTO v_tribe FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT p.id AS participation_id,
           p.mission_id AS m_id,
           p.joined_at AS m_joined_at,
           p.progress_value AS m_progress,
           m.title AS m_title,
           EXISTS (
             SELECT 1 FROM public.user_mission_completions c
             WHERE c.user_id = p.user_id AND c.mission_id = p.mission_id
           ) AS m_completed
    FROM public.user_mission_participations p
    JOIN public.missions m ON m.id = p.mission_id
    WHERE p.user_id = p_user_id
      AND EXISTS (SELECT 1 FROM public.mission_allowed_tribes t WHERE t.mission_id = p.mission_id)
      AND (
        v_tribe IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.mission_allowed_tribes t
          WHERE t.mission_id = p.mission_id AND t.tribe_id = v_tribe
        )
      )
    ORDER BY p.joined_at
    FOR UPDATE OF p
  LOOP
    INSERT INTO public.mission_participation_cancellations (
      user_id, mission_id, joined_at, progress_value, was_completed, new_tribe_id
    )
    VALUES (
      p_user_id, v_row.m_id, v_row.m_joined_at, v_row.m_progress, v_row.m_completed, v_tribe
    );

    DELETE FROM public.user_mission_participations WHERE id = v_row.participation_id;

    out_mission_id := v_row.m_id;
    out_mission_title := v_row.m_title;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- ── 5. 권한 (service_role만 실행) ─────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.mission_complete(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mission_complete(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mission_complete(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.mission_cancel_for_tribe_change(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mission_cancel_for_tribe_change(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mission_cancel_for_tribe_change(UUID) TO service_role;

-- 되돌림 SQL
-- 새 객체만 지운다. 옛 객체는 바꾸지 않았으므로 다른 되돌림은 없다. 함수를 먼저 지우고 표를 지운다.
-- 앞서 mission_allowed_tribes에 연결을 입력했거나 취소 기록이 쌓였다면 표를 지울 때 함께 사라진다(되돌리기 전에 필요하면 백업한다).
-- 새 앱 코드(mission_complete 호출, 트라이브 거르기)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.mission_cancel_for_tribe_change(UUID);
-- DROP FUNCTION IF EXISTS public.mission_complete(UUID, UUID);
-- DROP TABLE IF EXISTS public.mission_participation_cancellations;
-- DROP TABLE IF EXISTS public.mission_allowed_tribes;
