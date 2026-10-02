-- 214: today_cards 인증 유저 SELECT 정책에 노출 기간 조건 추가 (티켓 20261002_1257)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 민지 판정과 사용자 재승인 뒤 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 이유:
--   048의 정책 「today_cards: 인증 유저 읽기」는 `is_active = TRUE`만 본다. 그래서 로그인 유저가 공개 키와 자기
--   세션으로 PostgREST를 직접 불러 공개 전(`starts_at`이 미래)·종료된(`ends_at`이 과거) 카드의 제목·문구·이미지
--   주소를 목록째 읽을 수 있었다. 예약 공개할 캠페인 카드가 공개 전에 새어 나갈 수 있는 경로다.
--
-- 변경:
--   정책을 없애지 않고 기간 조건을 더한다: `is_active = TRUE AND starts_at <= now() AND ends_at >= now()`.
--   원래 정책의 뜻(인증 유저는 지금 보이는 카드를 읽을 수 있다)을 유지하고, 앱 목록 조회
--   (`jam-web/src/lib/today/cards.ts`의 `getTodayCards`)와 같은 기간 조건이 된다.
--   노출 태그(`exposure_tags`) 거르기는 정책에 넣지 않는다. 지금 공개된 카드라 노출 위험이 아니다.
--
-- 048 주석과의 관계:
--   048의 정책 주석 「노출조건/기간 필터는 애플리케이션 레벨에서 추가 적용」은 이 마이그레이션 이후 낡은 서술이다.
--   기간 필터는 이제 정책에서도 적용되고 노출 태그 필터만 애플리케이션 레벨이다. 048은 이미 적용된 옛 파일이라
--   고치지 않는다.
--
-- 영향:
--   - 앱 코드(`jam-web/src`)에서 today_cards를 읽는 곳은 모두 service 클라이언트라 RLS를 거치지 않는다.
--     사용자 세션 클라이언트로 읽는 곳이 없어 앱 동작은 바뀌지 않는다.
--   - today_cards를 읽는 뷰·구체화 뷰·함수와 Realtime 발행이 없어(2026-10-02 라이브 DB 읽기 전용 조회) 이 정책에
--     기대는 DB 쪽 경로도 없다.
--   - 컬럼·함수 변경이 없는 정책 교체라 확장→전환→축소로 나누지 않는다. `anon`은 이전에도 정책이 없어 읽을 수 없고,
--     쓰기 정책은 이전에도 없다. 이 파일은 두 가지를 바꾸지 않는다.
--
-- 재실행 가능(idempotent): ALTER POLICY로 같은 정책의 USING 식만 바꾼다. 정책을 지우지 않으므로 정책이 비는 순간이 없다.
-- (2026-10-02: 처음 쓴 DROP POLICY → CREATE POLICY 형태는 Supabase MCP apply_migration이 세 번 모두 60초 시간 초과로 끝나
--  적용되지 않았다. 결과가 같은 ALTER POLICY로 바꿨다. 티켓 20261002_1257 완료 기록 참고.)

BEGIN;

ALTER POLICY "today_cards: 인증 유저 읽기" ON public.today_cards
  USING (is_active = TRUE AND starts_at <= now() AND ends_at >= now());

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 정책이 1개이고 qual에 기간 조건이 들어 있는지(1행, qual에 starts_at·ends_at 포함)
-- SELECT policyname, cmd, roles, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'today_cards';
--
-- -- ② authenticated 역할로 읽었을 때 공개 전·종료된 카드가 안 나오는지(두 값 모두 0이어야 정상)
-- --    (트랜잭션 안에서 역할을 바꾼 확인이라 되돌려진다. 읽기 전용이다.)
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT count(*) FILTER (WHERE starts_at > now()) AS upcoming_visible,
--        count(*) FILTER (WHERE ends_at < now())   AS ended_visible
--   FROM public.today_cards;
-- ROLLBACK;
--
-- -- ③ 같은 방식으로 지금 노출 중인 카드는 나오는지(service 쪽 건수와 같아야 한다)
-- SELECT count(*) AS live_by_service FROM public.today_cards
--   WHERE is_active = TRUE AND starts_at <= now() AND ends_at >= now();
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT count(*) AS live_by_authenticated FROM public.today_cards;
-- ROLLBACK;

-- 되돌림 SQL
-- 정책의 USING 식을 원래 조건(048, `is_active = TRUE`만 봄)으로 되돌린다. 되돌리면 공개 전·종료된 카드가 인증 유저의 직접 조회에 다시 보인다.
-- ALTER POLICY "today_cards: 인증 유저 읽기" ON public.today_cards
--   USING (is_active = TRUE);
