-- 225_strava_connection_state.sql
-- Strava 연결의 «첫 동기화 대기»와 «끊김» 상태 (티켓 20261017_1422, 운영 로직 3.2·3.4절)
--
-- strava_connections에 칸 3개를 더한다. 기존 행에는 기본값이 채워지고(first_sync_pending=false, 나머지 NULL), 칸 이름을
-- 모르는 옛 프로덕션 코드는 영향을 받지 않는다. 기존 칸의 뜻과 값은 바꾸지 않고 users.initial_sync_done도 건드리지 않는다.
--
-- 규칙
--   - first_sync_pending: 다른 Strava 계정으로 다시 연결해 새 연결 행이 생길 때 콜백이 true로 둔다. true이면 users.initial_sync_done의
--     값과 상관없이 첫 동기화 규칙(인정 활동 가운데 가장 최근 1건)을 쓴다. 인정 활동을 정산한 동기화가 끝나면 코드가 false로 되돌린다.
--     기본 false라서 이미 동기화한 기존 연결은 그대로고 소급 갱신이 필요 없다.
--   - disconnected_at: NULL이면 연결 중이다. 값이 있으면 연결이 끊긴 상태이며 시각은 끊긴 때다.
--     토큰 갱신 실패, Strava 쪽 철회(401), 유저가 프로필에서 끊은 경우가 모두 같은 «끊김»이다. 같은 Strava 계정을 다시 연결하면
--     코드가 NULL로 되돌리고 마지막 동기화 뒤부터 이어서 가져온다. 다른 계정을 연결하면 이 행을 새 연결로 대체한다.
--   - disconnect_reason: 끊긴 까닭(예: token_refresh_failed, revoked, user_disconnected). 값의 목록은 코드가 정하고 CHECK 제약을
--     두지 않는다. disconnected_at이 NULL이면 NULL이다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FILTER (WHERE first_sync_pending) AS pending,
--          count(*) FILTER (WHERE disconnected_at IS NOT NULL) AS disconnected,
--          count(*) AS total
--     FROM public.strava_connections;                      -- 0, 0, (기존 행 수 그대로)

ALTER TABLE public.strava_connections
  ADD COLUMN IF NOT EXISTS first_sync_pending BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disconnect_reason TEXT;

COMMENT ON COLUMN public.strava_connections.first_sync_pending IS
  '다른 Strava 계정으로 다시 연결해 새 연결이 생겼을 때 true. true이면 users.initial_sync_done과 상관없이 첫 동기화 규칙(인정 활동 가운데 가장 최근 1건)을 쓰고, 정산한 동기화가 끝나면 false로 되돌린다. 기본 false.';
COMMENT ON COLUMN public.strava_connections.disconnected_at IS
  'NULL이면 연결 중. 값이 있으면 연결이 끊긴 상태(토큰 갱신 실패, Strava 쪽 철회, 유저가 끊음). 같은 Strava 계정을 다시 연결하면 NULL로 되돌린다.';
COMMENT ON COLUMN public.strava_connections.disconnect_reason IS
  '끊긴 까닭(token_refresh_failed, revoked, user_disconnected 등, 값의 목록은 코드가 정한다). 연결 중이면 NULL.';

-- 되돌림 SQL
-- 새로 만든 칸만 지운다. 이 칸을 읽는 새 코드(콜백의 연결 교체, 끊김 표시, 동기화의 첫 동기화 판정)는 같은 시점에 되돌려야 한다.
-- ALTER TABLE public.strava_connections DROP COLUMN IF EXISTS disconnect_reason;
-- ALTER TABLE public.strava_connections DROP COLUMN IF EXISTS disconnected_at;
-- ALTER TABLE public.strava_connections DROP COLUMN IF EXISTS first_sync_pending;
