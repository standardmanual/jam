-- 295: ops_routine_starts 신규 — 주간 루틴의 「시작」 기록 (티켓 20261026_2032, 어드민 상황판 PRD §5.3 D2)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 오케스트레이터(카리나)가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB다.
--
-- 동기:
--   루틴은 시작할 때 「시작」 기록 1번, 끝날 때 묶음 제출 1번만 쓴다(쓰기 2번). 시작 기록이 있는데
--   3시간 안에 묶음이 이어지지 않으면 「루틴이 멈췄어요」로 판정한다(판정은 앱 코드의 순수 함수).
--
-- 변경 (확장만 한다. 기존 테이블·컬럼은 건드리지 않는다):
--   - `ops_routine_starts`: `run_key`가 유일하다(같은 키 재전송은 덮어쓰지 않는다).
--     `bundle_id`는 제출 때 묶음의 `routine_run.run_key`가 같으면 채워진다. 묶음이 지워지면 NULL로 돌아간다.
--   - RLS는 켜고 정책은 만들지 않는다(198과 같은 패턴): service_role만 접근한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_routine_starts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key     TEXT        NOT NULL UNIQUE,
  week        TEXT        NULL,
  author      TEXT        NOT NULL,
  agents      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  bundle_id   UUID        NULL REFERENCES public.ops_bundles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_routine_starts_started_at ON public.ops_routine_starts (started_at DESC);

ALTER TABLE public.ops_routine_starts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ops_routine_starts IS
  '주간 루틴의 시작 기록(티켓 20261026_2032). POST /api/admin/ops-inbox/routine-start가 쓴다. 제출된 묶음의 routine_run.run_key가 같으면 bundle_id가 채워진다. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_routine_starts.run_key IS '루틴 실행 식별자(유일, 64자 이내). 같은 키를 다시 보내면 덮어쓰지 않고 받은 것으로 친다.';
COMMENT ON COLUMN public.ops_routine_starts.agents IS '이번 실행에서 맡은 에이전트 이름 목록(문자열 배열, 최대 8개).';
COMMENT ON COLUMN public.ops_routine_starts.started_at IS '시작 기록을 받은 서버 시각. 멈춤 판정(3시간)의 기준이다.';
COMMENT ON COLUMN public.ops_routine_starts.bundle_id IS '이어진 묶음(ops_bundles.id). NULL이면 아직 제출이 없다. 묶음이 지워지면 NULL로 돌아간다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relnamespace = 'public'::regnamespace AND relname = 'ops_routine_starts'; -- 1행, true
-- SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_routine_starts'; -- 0이어야 정상

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.ops_routine_starts;
