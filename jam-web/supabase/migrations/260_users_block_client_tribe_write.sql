-- 260_users_block_client_tribe_write.sql
-- JAM 2.0 입장: users.tribe_id를 클라이언트 역할(authenticated·anon)이 직접 쓰지 못하게 막는다 (티켓 20261021_1247 2회, 사용자 결정 10, 선례 219 users_block_client_is_admin_write)
--
-- 배경
--   - public.users의 「본인만 수정」 정책은 USING (auth.uid() = id)뿐이고 WITH CHECK와 열 제한이 없다. authenticated 역할은 users 테이블 UPDATE 권한과
--     tribe_id 열 UPDATE 권한을 갖는다(2026-10-21 카리나가 정책·권한·트리거를 SELECT로 확인함). 그래서 로그인한 유저가 본인 JWT와 anon 키로 PostgREST에
--     본인 행의 tribe_id를 보내면 «한 번 고르면 바꿀 수 없어요»를 어기고 트라이브를 직접 바꿀 수 있다. 바꾸면 아이템 배지가 나오는 트라이브와
--     참가할 수 있는 미션이 달라지는데도, 참가 취소와 변경 기록(259)은 거치지 않는다.
--   - 앱 코드가 users.tribe_id를 쓰는 곳은 온보딩 완료 API(api/onboarding/complete)와 개발 로그인(lib/tribe/dev-login-tribe.ts) 둘뿐이고 모두 service 클라이언트다.
--     어드민 변경은 259의 SECURITY DEFINER 함수다. 클라이언트 화면이 users를 직접 쓰지 않는 것도 코드로 확인했다(읽기만 함). 그래서 막아도 영향이 없다.
--
-- 설계 (219와 같은 방식)
--   - 권한을 회수하지 않고 트리거로 막는다. 다른 열(username, display_name, onboarding_completed_at 등)의 쓰기를 깨뜨리지 않으려고 tribe_id만 막는다.
--     (username·onboarding_completed_at도 본인이 직접 바꿀 수 있는 틈은 이 티켓 밖이다. 별도 티켓 후보)
--   - 막는 대상은 current_user가 authenticated·anon인 호출뿐이다. PostgREST는 요청 역할로 SET ROLE을 하므로 클라이언트 요청이 여기에 걸린다.
--     service_role(서버 라우트)과 postgres(대시보드·MCP)는 그대로 쓸 수 있다. SECURITY DEFINER 함수(259)는 함수 소유자 역할로 도므로 걸리지 않는다.
--   - 함수는 SECURITY DEFINER가 아니다. current_user가 호출 역할로 남아야 한다.
--   - INSERT도 막는다. 본인 행 INSERT 정책이 있어 tribe_id를 채운 새 행을 만드는 경로가 있다(tribe_id가 비어 있는 INSERT는 막지 않는다).
--   - UPDATE는 tribe_id 값이 «바뀔 때»만 막는다. 같은 값을 다시 보내는 전체 행 저장은 통과한다.
--   - 거절은 SQLSTATE 42501(insufficient_privilege)이다. PostgREST가 403으로 돌려준다.
--
-- 성격: 확장(Expand) — 트리거와 함수만 더한다. 기존 컬럼·데이터·권한은 바꾸지 않는다. 옛 프로덕션 코드도 위 두 경로가 service 클라이언트라 그대로 동작한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙 6에 따라 사용자 승인 후 카리나가 실행한다. Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 재실행 가능(idempotent): CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS로 작성했다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal ORDER BY tgname;           -- trg_users_block_client_tribe_write는 아직 없다
--   SELECT has_column_privilege('authenticated','public.users','tribe_id','UPDATE');                                       -- true (막히기 전의 틈)
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--    WHERE tgrelid = 'public.users'::regclass AND tgname = 'trg_users_block_client_tribe_write';
--     -- 1행, BEFORE INSERT OR UPDATE OF tribe_id ON public.users FOR EACH ROW EXECUTE FUNCTION users_block_client_tribe_write()
--   SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'users_block_client_tribe_write';
--     -- 1행, prosecdef = false (SECURITY DEFINER가 아니어야 한다), proconfig = {search_path=public}
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND tgname = 'trg_users_block_client_is_admin_write';   -- 1행 (219의 트리거는 그대로)
--
-- 롤백 실측(카리나가 적용 직후 한 번 돌린다 — 맨 끝의 RAISE EXCEPTION이 전체를 되돌리므로 데이터가 남지 않는다. 'ROLLBACK_OK: ...'가 오류로 돌아오면 통과다.
--   다른 오류가 오면 메시지에 어느 단계인지가 있다. 이 블록은 SET LOCAL ROLE로 클라이언트 역할을 흉내 내므로, Supabase MCP의 execute_sql처럼 한 요청이 한 트랜잭션이어야 한다):
--   DO $$
--   DECLARE
--     v_user UUID;  v_from UUID;  v_other UUID;  v_nobody UUID;  v_log TEXT := '';
--   BEGIN
--     SELECT u.id, u.tribe_id INTO v_user, v_from FROM public.users u WHERE u.tribe_id IS NOT NULL LIMIT 1;
--     SELECT t.id INTO v_other FROM public.tribes t WHERE t.id <> v_from LIMIT 1;
--     SELECT u.id INTO v_nobody FROM public.users u WHERE u.tribe_id IS NULL LIMIT 1;
--     IF v_user IS NULL OR v_other IS NULL THEN RAISE EXCEPTION 'NO_FIXTURE: 트라이브가 있는 유저 또는 다른 트라이브가 없다'; END IF;
--
--     -- ① 서버 역할(postgres)은 바꿀 수 있다 → 통과해야 한다
--     UPDATE public.users SET tribe_id = v_other WHERE id = v_user;
--     UPDATE public.users SET tribe_id = v_from WHERE id = v_user;
--     v_log := v_log || '①서버 역할 변경 통과; ';
--
--     -- ② 클라이언트 역할(authenticated)로 본인 행의 tribe_id를 바꾸면 42501로 막혀야 한다
--     SET LOCAL ROLE authenticated;
--     PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
--     BEGIN
--       UPDATE public.users SET tribe_id = v_other WHERE id = v_user;
--       RAISE EXCEPTION 'GUARD_FAILED: 클라이언트 역할의 tribe_id 변경이 허용됨';
--     EXCEPTION WHEN insufficient_privilege THEN
--       v_log := v_log || '②authenticated 변경 차단 통과; ';
--     END;
--     -- ③ 같은 값을 다시 보내는 저장은 통과해야 한다(tribe_id가 바뀌지 않는다)
--     UPDATE public.users SET tribe_id = v_from WHERE id = v_user;
--     v_log := v_log || '③같은 값 저장 통과; ';
--     -- ④ 트라이브가 없는 유저의 tribe_id 지정도 클라이언트 역할로는 막혀야 한다(고르기는 서버 API만)
--     IF v_nobody IS NOT NULL THEN
--       PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nobody, 'role', 'authenticated')::text, true);
--       BEGIN
--         UPDATE public.users SET tribe_id = v_other WHERE id = v_nobody;
--         RAISE EXCEPTION 'GUARD_FAILED: 클라이언트 역할의 최초 tribe_id 지정이 허용됨';
--       EXCEPTION WHEN insufficient_privilege THEN
--         v_log := v_log || '④최초 지정 차단 통과; ';
--       END;
--     END IF;
--     -- ⑤ anon도 막혀야 한다
--     RESET ROLE;
--     SET LOCAL ROLE anon;
--     BEGIN
--       UPDATE public.users SET tribe_id = v_other WHERE id = v_user;
--       RAISE EXCEPTION 'GUARD_FAILED: anon 역할의 tribe_id 변경이 허용됨';
--     EXCEPTION WHEN insufficient_privilege THEN
--       v_log := v_log || '⑤anon 변경 차단 통과; ';
--     END;
--     RESET ROLE;
--
--     RAISE EXCEPTION 'ROLLBACK_OK: %', v_log;   -- 이 예외가 위의 모든 쓰기를 되돌린다
--   END $$;
--   (anon 역할이 users에 UPDATE 권한이 없으면 ⑤는 트리거 이전에 같은 42501로 막힌다. 통과 조건은 같지만 트리거 덕인지 권한 덕인지는 구분되지 않는다.
--    ②가 트리거의 직접 증거다 — authenticated는 UPDATE 권한과 tribe_id 열 권한이 있다.)
--   259의 admin_change_user_tribe가 이 트리거와 함께 동작하는지(SECURITY DEFINER 함수는 걸리지 않는다)는 259의 롤백 실측이 이 트리거가 켜진 상태에서도 통과하는지로 확인한다.
--   온보딩 완료 API는 service 클라이언트라 걸리지 않는다 — 적용 뒤 [TEST] 접두 더미 계정으로 호출해 확인하거나, 응답 형태만 직접 호출로 본다(DEV_PROCESS_GUARDRAILS 패턴 13).

BEGIN;

CREATE OR REPLACE FUNCTION public.users_block_client_tribe_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.tribe_id IS NOT NULL THEN
      RAISE EXCEPTION 'users.tribe_id는 서버에서만 정할 수 있습니다'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.tribe_id IS DISTINCT FROM OLD.tribe_id THEN
      RAISE EXCEPTION 'users.tribe_id는 서버에서만 바꿀 수 있습니다'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.users_block_client_tribe_write IS
  'authenticated·anon 역할이 users.tribe_id를 정하거나 바꾸는 것을 막는 트리거 함수(SQLSTATE 42501). service_role·postgres·SECURITY DEFINER 함수는 걸리지 않는다. 티켓 20261021_1247.';

DROP TRIGGER IF EXISTS trg_users_block_client_tribe_write ON public.users;
CREATE TRIGGER trg_users_block_client_tribe_write
  BEFORE INSERT OR UPDATE OF tribe_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_block_client_tribe_write();

COMMIT;

-- 되돌림 SQL
-- 트리거를 먼저 지우고 함수를 지운다. 되돌리면 로그인한 유저가 브라우저에서 본인 tribe_id를 직접 바꿀 수 있는 틈이 다시 열린다.
-- DROP TRIGGER IF EXISTS trg_users_block_client_tribe_write ON public.users;
-- DROP FUNCTION IF EXISTS public.users_block_client_tribe_write();
