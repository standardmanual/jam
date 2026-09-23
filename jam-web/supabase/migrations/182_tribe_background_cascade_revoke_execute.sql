-- 182: 트라이브 배경 캐스케이드 RPC 익명 실행 차단 (Supabase 보안 어드바이저
-- anon_security_definer_function_executable / authenticated_security_definer_function_executable)
--
-- 배경:
--   apply_tribe_background_cascade·count_tribe_background_cascade(마이그레이션 092)는
--   SECURITY DEFINER 함수라 PostgREST 기본 grant로 anon·authenticated 롤도
--   /rest/v1/rpc/apply_tribe_background_cascade 등으로 직접 호출할 수 있었다.
--   실제로는 어드민 API(src/app/api/admin/tribes/[id]/apply-background/route.ts)가
--   getAdminUser() 인증 후 service_role 클라이언트로만 호출한다 — anon/authenticated가
--   직접 부를 이유가 없고, 그대로 두면 로그인 여부와 무관하게 누구나 임의 트라이브의
--   배지·컬렉션 배경을 덮어쓸 수 있었다.
--
-- 설계:
--   - anon·authenticated에서 EXECUTE만 회수한다. service_role은 EXECUTE 권한이 살아 있고,
--     함수 소유자(postgres)도 영향받지 않으므로 어드민 API 동작은 그대로다.
--
-- 재실행 가능(idempotent): REVOKE는 이미 권한이 없어도 에러 없이 통과한다.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.apply_tribe_background_cascade(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_tribe_background_cascade(uuid) FROM anon, authenticated;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
-- FROM pg_proc p, pg_roles r
-- WHERE p.pronamespace = 'public'::regnamespace
--   AND p.proname IN ('apply_tribe_background_cascade', 'count_tribe_background_cascade')
--   AND r.rolname IN ('anon', 'authenticated', 'service_role');
-- -- anon/authenticated 행은 false, service_role 행은 true여야 정상

-- ↩️ 롤백 DDL
--    GRANT EXECUTE ON FUNCTION public.apply_tribe_background_cascade(uuid) TO anon, authenticated;
--    GRANT EXECUTE ON FUNCTION public.count_tribe_background_cascade(uuid) TO anon, authenticated;
