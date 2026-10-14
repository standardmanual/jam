-- 219: users.is_admin을 클라이언트 역할(authenticated·anon)이 쓰지 못하게 막는다 (티켓 20261014_1623)
--
-- 배경:
--   public.users의 「본인만 수정」 정책은 USING (auth.uid() = id)뿐이고 WITH CHECK와 열 제한이
--   없다. authenticated·anon 역할은 테이블 UPDATE·INSERT 권한과 is_admin 열 UPDATE 권한을 갖는다
--   (2026-10-14 라이브 DB에서 has_column_privilege로 확인). 그래서 로그인한 유저가 본인 JWT와
--   anon 키로 PostgREST에 본인 행의 is_admin = true를 보내면 어드민이 될 수 있다. 앱의
--   hasAdminAccess(lib/admin/auth.ts)가 users.is_admin을 신뢰한다.
--
-- 설계:
--   - 권한을 회수하지 않고 트리거로 막는다. 클라이언트 화면이 users를 직접 쓰지 않는지는 코드로
--     확인했지만(읽기만 함), 다른 열의 쓰기를 깨뜨리지 않으려고 is_admin만 막는다.
--   - 막는 대상은 current_user가 authenticated·anon인 호출뿐이다. PostgREST는 요청 역할로
--     SET ROLE을 하므로 클라이언트 요청이 여기에 걸린다. service_role(서버 라우트)과 postgres
--     (대시보드·MCP)는 그대로 쓸 수 있다. 어드민 화면의 권한 부여는
--     api/admin/users/[id]/admin-role가 서비스 롤로 한다.
--   - 함수는 SECURITY DEFINER가 아니다. current_user가 호출 역할로 남아야 한다.
--   - INSERT도 막는다. 본인 행 INSERT 정책이 있어 is_admin = true로 새 행을 만드는 경로가 있다.
--
-- 성격: 확장(Expand) — 트리거와 함수만 더한다. 기존 컬럼·데이터는 바꾸지 않는다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙 6에 따라 사용자 승인 후 카리나가 실행한다. Supabase는
--    staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 재실행 가능(idempotent): CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS로 작성했다.

BEGIN;

CREATE OR REPLACE FUNCTION public.users_block_client_is_admin_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.is_admin IS TRUE THEN
      RAISE EXCEPTION 'users.is_admin은 서버에서만 켤 수 있습니다'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'users.is_admin은 서버에서만 바꿀 수 있습니다'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_block_client_is_admin_write ON public.users;
CREATE TRIGGER trg_users_block_client_is_admin_write
  BEFORE INSERT OR UPDATE OF is_admin ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_block_client_is_admin_write();

COMMIT;

-- ── 검증 쿼리 (실행 후 확인할 것) ───────────────────────────────────────────
--
-- -- ① 트리거가 걸렸는지
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgrelid = 'public.users'::regclass AND tgname = 'trg_users_block_client_is_admin_write';
--
-- -- ② 클라이언트 역할의 변경이 막히는지(변경이 성공해도 예외로 전체가 롤백되므로 데이터는 남지 않는다)
-- DO $$
-- DECLARE uid uuid := '00000000-0000-0000-0000-000000000001';
-- BEGIN
--   SET LOCAL ROLE authenticated;
--   PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
--   BEGIN
--     UPDATE public.users SET is_admin = true WHERE id = uid;
--     RAISE EXCEPTION 'GUARD_FAILED: 클라이언트 역할의 is_admin 변경이 허용됨';
--   EXCEPTION WHEN insufficient_privilege THEN
--     RAISE NOTICE 'OK: 차단됨';
--   END;
-- END $$;

-- 되돌림 SQL
-- DROP TRIGGER IF EXISTS trg_users_block_client_is_admin_write ON public.users;
-- DROP FUNCTION IF EXISTS public.users_block_client_is_admin_write();
