-- ============================================================
-- Migration 109: SECURITY DEFINER 함수 anon/authenticated EXECUTE 권한 회수
--
-- 배경:
--   get_advisors(security) 점검 결과, SECURITY DEFINER로 선언된 아래 9개 함수가
--   anon/authenticated 롤에 기본 EXECUTE 권한이 열려있어 PostgREST를 통해
--   /rest/v1/rpc/<함수명>으로 직접 호출 가능했다. 이 함수들은 파라미터로 받은
--   유저 id(p_dropper_id, p_picker_id 등)가 실제 호출자 본인인지 함수 내부에서
--   검증하지 않는다 — 정상 경로에서는 jam-web/src/app/api/**의 Next.js API
--   라우트가 supabase.auth.getUser()로 인증을 확인한 뒤 service_role 클라이언트로
--   호출하지만, anon 키만 있으면 API 라우트를 완전히 건너뛰고 PostgREST를 직접
--   호출해 임의의 유저 id로 드랍/픽업 등을 조작할 수 있었다.
--
--   jam-web/src 전수 검색 결과 9개 함수 모두 애플리케이션에서는 service_role
--   클라이언트(createServiceClient())로만 호출되며, anon/authenticated 클라이언트로
--   호출하는 코드는 없다. 따라서 EXECUTE 권한을 service_role에만 남기고
--   anon/authenticated에서 회수해도 애플리케이션 동작에는 영향이 없다.
--
-- 대상 분류:
--   - create_user_drop, pickup_drop
--       유저 드랍/픽업 — API 라우트가 인증 확인 후 service_role로 호출
--   - mint_and_place_ambient_drop, expire_stale_poi_drops
--       크론(CRON_SECRET 검증)·어드민 전용 배치
--   - log_orphan_custody_events, handle_new_user
--       DB 트리거 전용 함수 — 애플리케이션 코드에서 RPC로 호출되지 않음.
--       PostgreSQL 트리거 실행은 함수 소유자 권한으로 동작하며 EXECUTE 권한
--       체크와 무관하므로, REVOKE해도 트리거 자체는 정상 동작한다.
--   - activate_theme_preset, apply_faction_background_cascade,
--     count_faction_background_cascade
--       어드민 전용 기능(getAdminUser() 게이트) — service_role로만 호출
-- ============================================================

-- 주의: PostgreSQL은 함수 생성 시 기본적으로 PUBLIC(모든 롤의 암묵적 상위 그룹)에
-- EXECUTE 권한을 부여한다. anon/authenticated 롤은 PUBLIC 멤버이므로, anon/authenticated에
-- 대한 개별 REVOKE만으로는 부족하고 PUBLIC 자체에서 회수해야 실제로 막힌다.
-- service_role은 아래처럼 이미 명시적 GRANT가 걸려 있으므로 PUBLIC 회수 후에도 영향 없다.
REVOKE EXECUTE ON FUNCTION public.create_user_drop(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pickup_drop(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mint_and_place_ambient_drop(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_stale_poi_drops() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_orphan_custody_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_theme_preset(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_faction_background_cascade(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_faction_background_cascade(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_user_drop(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pickup_drop(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mint_and_place_ambient_drop(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_poi_drops() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_orphan_custody_events() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_theme_preset(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_faction_background_cascade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_faction_background_cascade(uuid) TO service_role;
