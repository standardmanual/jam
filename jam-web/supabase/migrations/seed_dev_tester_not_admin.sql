-- seed: staging 자동 로그인 계정(dev-tester)의 관리자 권한을 끈다 (티켓 20261006_1527)
--
-- ⚠️ 1회성 데이터 변경이다. 2026-10-06 15:12 KST에 카리나(메인 세션)가 사용자 승인을 받아 Supabase MCP로 실행했다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 이유:
--   stage.j-a-m.app은 STAGING_MODE에서 로그인하지 않은 방문자를 dev-tester로 자동 로그인시키고(`src/proxy.ts`, `src/app/api/dev-login/route.ts`),
--   staging에는 Vercel 접근 보호가 없다. dev-tester가 `users.is_admin = true`여서 인터넷의 누구나 어드민 화면과 어드민 API로
--   공용 DB를 바꿀 수 있었다(2026-10-06 `/jam-ship` 보안 점검, 쿠키 없는 요청으로 확인).
--
-- 영향:
--   - staging 어드민(`/admin`)은 「접근 권한 없음」으로 막힌다. jam-stage에는 ADMIN_EMAILS가 없다(2026-10-06 변수 목록 확인).
--   - 로컬 어드민 실렌더는 셸 환경변수 `ADMIN_EMAILS`로 권한을 주므로(`DEV_PROCESS_GUARDRAILS.md` 패턴 13) 영향이 없다.
--
-- 재실행 가능(idempotent): 이미 false면 0행이다.

UPDATE public.users
SET is_admin = false
WHERE email = 'dev-tester@jam.local'
  AND is_admin = true;

-- 되돌림 SQL (staging 노출을 다시 여는 변경이므로 사용자 승인 없이 실행하지 않는다)
-- UPDATE public.users SET is_admin = true WHERE email = 'dev-tester@jam.local';
