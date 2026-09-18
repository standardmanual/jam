-- 176: strava_sync_failures 신규 테이블 (티켓 20260918_1307)
--
-- 배경:
--   `/api/strava/sync`는 실패를 console.error로만 남기고 DB에 기록하지 않아, 주간 집계 API
--   (`/api/admin/kpi/weekly`)의 stravaSyncFailures 지표가 항상 null이었다(티켓 20260918_1150
--   범위 밖 발견물). 이 파일이 그 실패 기록을 남길 테이블을 연다.
--
-- 설계:
--   - 어드민 집계 전용 로그 테이블이다. user_combine_fail_logs(153_combine_v3.sql)와 동일한
--     패턴 — service_role만 쓰고 읽는다. RLS는 켜두되 정책은 만들지 않아 anon/authenticated는
--     기본 거부된다(유저 화면에 노출되지 않는다).
--   - user_id는 기록하되(원인 추적용), 집계 API 응답에는 절대 넣지 않는다(상위 티켓 §4-6,
--     kpiWeekly.ts가 COUNT만 반환).
--   - failure_type은 syncStravaActivities()가 실패하는 지점 기준으로 셋 중 하나다:
--     'token_refresh_failed'(토큰 갱신 실패) · 'rate_limited'(Strava 레이트리밋 429) ·
--     'strava_api_error'(그 외 Strava API 오류·네트워크 오류 등).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS + DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.strava_sync_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  failure_type TEXT NOT NULL,
  error_message TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.strava_sync_failures DROP CONSTRAINT IF EXISTS strava_sync_failures_type_check;
ALTER TABLE public.strava_sync_failures ADD CONSTRAINT strava_sync_failures_type_check
  CHECK (failure_type IN ('token_refresh_failed', 'rate_limited', 'strava_api_error'));

CREATE INDEX IF NOT EXISTS strava_sync_failures_occurred_at_idx
  ON public.strava_sync_failures (occurred_at DESC);

-- RLS: 어드민(service_role) 집계 전용. service_role은 RLS를 우회하므로 정책을 만들지
-- 않는다 = anon/authenticated에는 전부 거부된다(유저 화면 비노출).
ALTER TABLE public.strava_sync_failures ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.strava_sync_failures IS
  'Strava 동기화 실패 기록(티켓 20260918_1307). 주간 집계 API(stravaSyncFailures)의 원천 데이터. user_id는 원인 추적용이며 집계 응답에는 절대 포함하지 않는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 테이블·제약이 만들어졌는지
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.strava_sync_failures'::regclass;
--
-- -- ② RLS가 켜졌고 정책이 없는지(= anon/authenticated 접근 불가)
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'strava_sync_failures';
-- SELECT policyname FROM pg_policies WHERE tablename = 'strava_sync_failures'; -- 0행이어야 정상

-- ↩️ 롤백 DDL
--    DROP TABLE IF EXISTS public.strava_sync_failures;
