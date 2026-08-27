-- 프로필 피드 활동 참조 컬럼 — `user_activity_feed.strava_activity_id` 추가 (티켓 20260827_018)
--
-- ℹ️ 티켓은 파일명을 106으로 지정했으나, 병렬 세션이 먼저 staging에 올린
--    106_users_is_admin.sql(이미 실행 완료)과 번호가 겹쳐 **107로 조정**했다.
--    같은 번호의 마이그레이션이 두 개 생기면 실행 이력 추적이 무너진다.
-- 스펙: Service Plan/History/Migration/Ticket/20260827_018_Service_프로필피드-활동참조컬럼-동일활동이벤트-묶음렌더.md
--       Service Plan/Specs/PRD/Notification/RECAP_CASEBOOK.md (R6 착지 규칙)
--
-- ⚠️ 이 파일은 /jam-work 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 🚨 실행 순서 제약 — **DDL 먼저 → 코드 배포.**
--    코드를 먼저 배포하면 recordFeedEvent()의 insert 페이로드에 존재하지 않는 컬럼이
--    실려 42703(column does not exist)으로 실패한다. recordFeedEvent는 실패를 삼키고
--    console.error만 남기므로 **화면은 멀쩡한데 피드 기록만 통째로 사라지는 무증상**이 된다.
--
-- ♻️ 재실행 안전(멱등) — ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- ↩️ 롤백
--    DROP INDEX IF EXISTS public.idx_user_activity_feed_user_strava_activity;
--    ALTER TABLE public.user_activity_feed DROP COLUMN IF EXISTS strava_activity_id;
--    컬럼을 지워도 기존 6개 컬럼은 그대로라 피드 렌더는 계속 동작한다(묶음만 사라진다).

-- ① 활동 참조 컬럼.
--    **UUID FK(strava_activities.id)가 아니라 Strava 숫자 id를 쓴다.**
--    - 기록 지점 3곳이 이미 이 값을 손에 들고 있다(rawActivity.id · triggerActivity.stravaId · act.stravaId).
--      추가 조회가 없다.
--    - user_activity_badges.triggered_by_strava_id가 이미 같은 규약을 쓴다.
--    - 티켓 20260827_014의 결산 payload activity_ids도 Strava 숫자 id다.
--      **알림과 피드가 같은 키로 말한다.**
--    FK 제약을 걸지 않는 것도 같은 이유다 — strava_activities에 아직 적재되지 않은 활동에서도
--    이벤트가 먼저 기록될 수 있고, 참조 무결성보다 기록 유실 방지가 우선이다.
ALTER TABLE public.user_activity_feed
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT;

COMMENT ON COLUMN public.user_activity_feed.strava_activity_id IS
  'Strava 활동 숫자 id(strava_activities.strava_id와 같은 규약). '
  'NULL = 활동 귀속 불명 — 활동과 무관한 이벤트(mission_joined·item_picked_up·mission_completed)와 '
  '이 마이그레이션 이전에 쌓인 과거 행 전부가 여기 해당한다. '
  'NULL 행은 프로필 피드에서 서로 묶지 않고 단건으로 렌더한다(graceful degradation).';

-- ② 프로필 피드가 유저 단위로 조회한 뒤 활동별로 묶으므로 (user_id, strava_activity_id) 복합.
--    과거 행 대부분이 NULL이라 부분 인덱스로 크기를 줄인다.
CREATE INDEX IF NOT EXISTS idx_user_activity_feed_user_strava_activity
  ON public.user_activity_feed (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- ③ **백필하지 않는다.**
--    과거 이벤트가 어느 활동에서 나왔는지 복원할 방법이 없다. event_at이 부정확하다는 것은
--    마이그레이션 093·094에서 이미 실측됐다(로컬 벽시계 오해석으로 최대 +7.84h 미래).
--    추정 매칭으로 잘못 묶는 것보다 단건으로 남기는 쪽이 안전하다 — graceful degradation.
