-- 218: strava_sync_failures.failure_type에 'drop_attempt_failed' 추가 (티켓 20261014_1320)
--
-- 배경:
--   동기화 중 드랍 시도(tryItemDrop)가 던진 오류는 콘솔 로그만 남기고 그 활동을 처리 완료로
--   표시한다. 실패 기록 테이블에도 쌓이지 않아 운영자가 발생 여부를 알 수 없었다. 코드가 이
--   실패를 strava_sync_failures에 failure_type = 'drop_attempt_failed'로 남기도록 바뀌므로,
--   176_strava_sync_failures.sql의 CHECK 제약 허용 값에 새 유형을 더한다.
--
-- 성격: 확장(Expand) — CHECK 제약의 허용 값만 넓힌다. 옛 코드와 호환되고 축소 단계는 없다.
--
-- 적용 순서: 이 SQL 실행 → 코드 배포. 코드가 먼저 나가도 insert가 제약에 걸려 기록만 실패하고
--   recordStravaSyncFailure가 흡수하므로 서비스 장애는 없다(기록이 비는 것뿐).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙 6에 따라 **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후
--    오케스트레이터가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB다.
--
-- 재실행 가능(idempotent): DROP CONSTRAINT IF EXISTS 뒤에 ADD CONSTRAINT로 작성했다.
-- 기존 행은 3개 유형뿐이라 새 제약이 기존 행을 깨지 않는다.

BEGIN;

ALTER TABLE public.strava_sync_failures DROP CONSTRAINT IF EXISTS strava_sync_failures_type_check;
ALTER TABLE public.strava_sync_failures ADD CONSTRAINT strava_sync_failures_type_check
  CHECK (failure_type IN ('token_refresh_failed', 'rate_limited', 'strava_api_error', 'drop_attempt_failed'));

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- 허용 값 4개가 모두 보여야 한다(drop_attempt_failed 포함)
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.strava_sync_failures'::regclass
--    AND conname = 'strava_sync_failures_type_check';

-- 되돌림 SQL
-- 새 유형의 행이 남은 채 제약을 3개 값으로 복원하면 제약 추가가 실패한다. 순서: 새 유형 행 삭제 → 제약 삭제 → 3개 값 복원.
-- 삭제되는 행은 드랍 시도 실패 기록뿐이며 되살릴 수 없다. 되돌리기 전에 건수를 확인한다.
--   SELECT count(*) FROM public.strava_sync_failures WHERE failure_type = 'drop_attempt_failed';
-- BEGIN;
-- DELETE FROM public.strava_sync_failures WHERE failure_type = 'drop_attempt_failed';
-- ALTER TABLE public.strava_sync_failures DROP CONSTRAINT IF EXISTS strava_sync_failures_type_check;
-- ALTER TABLE public.strava_sync_failures ADD CONSTRAINT strava_sync_failures_type_check
--   CHECK (failure_type IN ('token_refresh_failed', 'rate_limited', 'strava_api_error'));
-- COMMIT;
