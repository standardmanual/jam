-- 265_scrub_user_location.sql
-- JAM 2.0 퇴장: Strava 동기화를 끊을 때(위치정보 수집 동의 철회) 개인위치정보(좌표)를 지우는 함수 (티켓 20261021_1249 4회, 운영 로직 3.2·18.5절)
--
-- 새 함수 1개만 덧붙인다. 옛 테이블·옛 함수·옛 제약은 바꾸지 않는다.
--
-- 지우는 범위는 «좌표»뿐이다. 좌표가 저장되는 곳 가운데 이 유저의 것만 비운다.
--   (가) users.last_location_lat / last_location_lng / last_location_at  — 직전 픽업 좌표(부정 이용 방지, 마이그레이션 010)
--   (나) strava_activities.normalized 의 startLatLng · endLatLng 키        — 활동 시작·끝 좌표(마이그레이션 070, 앱은 쓰기만 하고 읽지 않는다)
-- 지우지 않는 것: 좌표 없는 확인자료(방문·드랍·픽업·체크인 기록)와 부정 이용 탐지 기록(abusing_logs.detail의 좌표는 방침 3개월이 지나면 크론이 지운다).
--   약관 제11조 ①(철회 시 지체 없이 파기)과 제5조 ③④(확인자료 6개월 이상 보관, 다른 법령상 보관)가 맞서는 부분은 이 티켓에서 약관을 고치지 않고
--   법무 확인 티켓 20260929_1303에 기록한다.
--
-- scrub_user_location(p_user_id) → jsonb
--   {user_location_cleared: 0 또는 1, activities_cleared: n}
--   - 좌표가 이미 비어 있는 행은 건드리지 않는다. 그래서 다시 불러도 안전하고 두 번째 호출은 모두 0이다.
--   - 유저 행이 없어도 오류 없이 0건을 돌려준다(계정이 먼저 지워진 경우).
--   - strava_activities 의 다른 칸(distance_km, jam_activity_type 등)과 normalized 의 다른 키(거리·시간·고도 등)는 그대로다.
--   - 지운 좌표는 되살릴 수 없다. 되돌림 SQL은 함수만 지운다.
--
-- SECURITY DEFINER, search_path 고정, service_role만 실행한다(anon·authenticated·PUBLIC 권한 회수).
-- 호출하는 곳: 앱의 연결 끊기 라우트(app/api/strava/disconnect/route.ts). 끊김 저장 뒤에 한 번 부르고, 실패하면 한 번 더 부른다.
--   두 번 모두 실패해도 끊기는 성공으로 둔다(서버 로그에 남김). 끊긴 연결을 쓸어 담는 파기는 후속 티켓 20261022_0500.
--
-- 실행 전 확인 쿼리(읽기 전용 SELECT) — 지워질 대상 수. 유저 id는 실제 값으로 바꾼다.
--   SELECT count(*) AS users_with_location
--     FROM public.users
--    WHERE last_location_lat IS NOT NULL OR last_location_lng IS NOT NULL OR last_location_at IS NOT NULL;
--   SELECT count(*) AS activities_with_coords
--     FROM public.strava_activities
--    WHERE normalized ?| ARRAY['startLatLng', 'endLatLng'];
--   SELECT data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'strava_activities' AND column_name = 'normalized';                 -- jsonb
--   SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'scrub_user_location';               -- 0행
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'scrub_user_location';  -- 1행, prosecdef = true
--   SELECT has_function_privilege('authenticated','public.scrub_user_location(uuid)','EXECUTE'),
--          has_function_privilege('anon','public.scrub_user_location(uuid)','EXECUTE'),
--          has_function_privilege('service_role','public.scrub_user_location(uuid)','EXECUTE');                          -- false, false, true
--   (함수를 실제 유저에게 부르는 시험은 트랜잭션 안에서 부르고 ROLLBACK 한다. 적용 단계에서는 부르지 않는다.)

CREATE OR REPLACE FUNCTION public.scrub_user_location(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       INTEGER := 0;
  v_activities INTEGER := 0;
BEGIN
  -- (가) 직전 픽업 좌표 — 세 칸 중 하나라도 값이 있는 행만 비운다
  UPDATE public.users
     SET last_location_lat = NULL,
         last_location_lng = NULL,
         last_location_at  = NULL
   WHERE id = p_user_id
     AND (last_location_lat IS NOT NULL OR last_location_lng IS NOT NULL OR last_location_at IS NOT NULL);
  GET DIAGNOSTICS v_user = ROW_COUNT;

  -- (나) 활동 시작·끝 좌표 — 두 키 중 하나라도 있는 행만 바꾼다(JSONB `-` 연산자는 키가 없어도 오류가 아니다)
  UPDATE public.strava_activities
     SET normalized = normalized - 'startLatLng' - 'endLatLng'
   WHERE user_id = p_user_id
     AND normalized ?| ARRAY['startLatLng', 'endLatLng'];
  GET DIAGNOSTICS v_activities = ROW_COUNT;

  RETURN jsonb_build_object(
    'user_location_cleared', v_user,
    'activities_cleared', v_activities
  );
END;
$$;

COMMENT ON FUNCTION public.scrub_user_location(UUID) IS
  'Strava 동기화를 끊을 때(위치정보 수집 동의 철회) 이 유저의 개인위치정보(users 마지막 위치, 활동 normalized의 시작·끝 좌표)를 지우고 건수를 돌려준다. 다시 불러도 안전하다. service_role 전용. 티켓 20261021_1249.';

REVOKE ALL ON FUNCTION public.scrub_user_location(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scrub_user_location(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrub_user_location(UUID) TO service_role;

-- 되돌림 SQL
-- 이 함수를 부르는 앱 코드(app/api/strava/disconnect/route.ts)를 먼저 되돌린다. 앱이 남아 있어도 연결 끊기는 성공한다(실패는 서버 로그에만 남는다).
-- 이미 이 함수로 지운 좌표는 함수를 지워도 되돌아오지 않는다.
-- DROP FUNCTION IF EXISTS public.scrub_user_location(UUID);
