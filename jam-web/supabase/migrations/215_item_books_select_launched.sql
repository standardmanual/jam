-- 215: item_books 인증 유저 SELECT 정책에 공개 조건 추가 (티켓 20261004_2041)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 민지 판정과 사용자 재승인 뒤 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 이유:
--   001의 정책 「item_books: 전체 읽기 허용」은 `FOR SELECT TO authenticated USING (TRUE)`다. 그래서 로그인 유저가
--   공개 키와 자기 세션으로 PostgREST를 직접 불러 공개 전(`valid_from`이 미래)·비활성 컬렉션의 이름·설명·
--   `story_text`·이미지 주소·보상 포인트·보상 배지 ID를 읽을 수 있었다. 예약 공개할 컬렉션의 이야기와 보상이
--   공개 전에 새어 나갈 수 있는 경로다.
--
-- 변경:
--   정책을 없애지 않고 공개 조건을 더한다: `is_active = TRUE AND (valid_from IS NULL OR valid_from <= now())`.
--   앱의 공개 판정(`jam-web/src/lib/itembook/visibility.ts`의 `isItemBookLaunched`)과 같은 조건이다.
--   종료 시각(`valid_until`)은 넣지 않는다 — 기간이 끝난 컬렉션은 이미 가진 유저에게 계속 보이고,
--   `isItemBookLaunched`도 종료를 보지 않는다(드랍·완성용 「노출 중」 판정만 종료를 본다).
--
-- 정책 이름:
--   이름의 「전체」는 이 마이그레이션 이후 낡은 서술이다. 이름을 바꾸면 `ALTER POLICY ... RENAME TO`가 한 문장 더
--   들어가 되돌림도 두 문장이 되므로 이름은 그대로 둔다.
--
-- 001 주석과의 관계:
--   001의 정책 정의(`USING (TRUE)`)는 이 마이그레이션 이후 낡은 서술이다. 001은 이미 적용된 옛 파일이라 고치지 않는다.
--
-- 영향 (2026-10-05 코드 조사와 라이브 DB 읽기 전용 조회):
--   - 사용자 세션 클라이언트로 item_books를 읽는 곳은 `app/(main)/collections/[id]/page.tsx`, `app/(main)/badges/page.tsx`,
--     `app/(main)/badges/[id]/page.tsx`, `app/api/itembooks/route.ts` 네 곳이고, 모두 앱에서 공개 판정
--     (`isItemBookLaunched`·`pickLaunchedItemBook`·`applyLaunchedItemBookFilter`)을 다시 한다. 정책 뒤에도 화면·응답
--     결과는 바뀌지 않는다. 관리자 화면·관리자 API·유저 프로필·슬롯 API·`lib/` 아래 조회는 모두 service 클라이언트라
--     RLS를 거치지 않는다.
--   - 사용자 세션 클라이언트의 임베드 조회(`item_books(...)`를 다른 테이블 select에 함께 가져오는 형태)는 `jam-web/src`에 없다.
--   - item_books를 읽는 뷰·구체화 뷰와 Realtime 발행이 없고, 읽는 함수는 `slot_item_into_book`(SECURITY DEFINER) 하나라
--     정책을 거치지 않는다.
--   - 새로 숨겨지는 행은 컬렉션 100개 중 비활성 70개다(공개 전은 0개). 이 70개에는 유저 슬롯·완성 기록·삭제되지 않은
--     아이템 배지가 하나도 없다.
--   - 컬럼·함수 변경이 없는 정책 교체라 확장→전환→축소로 나누지 않는다. `anon`은 이전에도 정책이 없어 읽을 수 없고,
--     쓰기 정책은 이전에도 없다. 이 파일은 두 가지를 바꾸지 않는다.
--   - 관리자 예외(정책에 관리자 조건)는 두지 않는다. 관리자 조회는 이미 service 클라이언트이고, 관리자 판정에 쓰는
--     `is_admin()` 같은 SQL 함수가 없다.
--
-- 재실행 가능(idempotent): ALTER POLICY로 같은 정책의 USING 식만 바꾼다. 정책을 지우지 않으므로 정책이 비는 순간이 없다.
-- (214에서 DROP POLICY → CREATE POLICY 형태는 Supabase MCP apply_migration이 60초 시간 초과로 끝나 ALTER POLICY로
--  바꿨다. 처음부터 같은 형태를 쓴다.)

BEGIN;

ALTER POLICY "item_books: 전체 읽기 허용" ON public.item_books
  USING (is_active = TRUE AND (valid_from IS NULL OR valid_from <= now()));

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 정책이 1개이고 qual에 공개 조건이 들어 있는지(1행, qual에 is_active·valid_from 포함)
-- SELECT policyname, cmd, roles, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'item_books';
--
-- -- ② authenticated 역할로 읽었을 때 비활성·공개 전 컬렉션이 안 나오는지(두 값 모두 0이어야 정상)
-- --    (트랜잭션 안에서 역할을 바꾼 확인이라 되돌려진다. 읽기 전용이다.)
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT count(*) FILTER (WHERE is_active = FALSE)                             AS inactive_visible,
--        count(*) FILTER (WHERE valid_from IS NOT NULL AND valid_from > now()) AS upcoming_visible
--   FROM public.item_books;
-- ROLLBACK;
--
-- -- ③ 같은 방식으로 공개된 컬렉션은 나오는지(service 쪽 건수와 같아야 한다)
-- SELECT count(*) AS launched_by_service FROM public.item_books
--   WHERE is_active = TRUE AND (valid_from IS NULL OR valid_from <= now());
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT count(*) AS launched_by_authenticated FROM public.item_books;
-- ROLLBACK;

-- 되돌림 SQL
-- 정책의 USING 식을 원래 조건(001, `USING (TRUE)`)으로 되돌린다. 되돌리면 공개 전·비활성 컬렉션이 인증 유저의 직접 조회에 다시 보인다.
-- ALTER POLICY "item_books: 전체 읽기 허용" ON public.item_books
--   USING (TRUE);
