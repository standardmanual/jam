-- 217: 투데이 카드에 레시피 공개 카드 종류(recipe_reveal)와 레시피 연결 칸(recipe_id) 추가
--      (티켓 20261006_1218, 운영툴 자원 연결 ⑫-b)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 머지 승인 뒤 사용자 재승인을 받아 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 이유:
--   홈 피드의 레시피 공개 카드(`template_type = 'recipe_reveal'`)가 가리킬 레시피를 카드 행에 저장할 칸이 없고,
--   `template_type` CHECK도 이 값을 허용하지 않는다. 운영툴이 「카드 → 레시피」를 미션·컬렉션·랭킹모드와 같은 방식으로
--   잇고(카드 `links`가 레시피를 가리키면 `recipe_id`를 채움), 어드민 카드 폼이 레시피를 고르려면 둘 다 필요하다.
--
-- 변경 (순수 확장 — 지우는 것이 없어 확장→전환→축소로 나누지 않는다):
--   1) `today_cards.recipe_id UUID NULL` 추가. `combination_recipes(id)` 외래 키, `ON DELETE SET NULL`.
--      `mission_id`·`item_book_id`·`ranking_mode_id`와 같은 방식이다 — 레시피가 지워져도 카드는 남고 레시피 줄만 비는
--      것이 기존 연결 칸의 약속이다. 기존 71장은 모두 NULL이다.
--   2) `today_cards_template_type_check`에 `recipe_reveal`을 더해 9개 값으로 교체한다. 158(ranking_board)과 같은
--      동적 조회 방식으로 기존 제약을 지운다 — 제약 이름이 실제와 달라도 깨지지 않는다.
--
-- 배포 구간의 안전(티켓 「금지」 문단):
--   프로덕션의 옛 코드는 카드를 `select('*')`나 `recipe_id` 없는 칼럼 목록으로만 읽는다(origin/main 2026-10-06 확인).
--   그래서 칼럼이 늘어도 옛 코드의 동작은 같다. 옛 코드를 깨는 것은 `recipe_reveal` 값을 가진 행뿐이다 — 옛 어드민 카드
--   화면의 `todayTemplateFields`가 모르는 값에 칸 정의 없이 `undefined`를 돌려준다. 그래서 이 마이그레이션을 적용한 뒤
--   `/jam-ship`이 끝나기 전에는 `recipe_reveal` 카드를 어디에서도 만들지 않는다(시험 카드 포함).
--
-- 순서: 코드가 카드 저장 때 `recipe_id`를 이름으로 쓰므로 217 적용 → staging push 순서다. 등록 스크립트의 insert도
--   같은 칸을 쓰므로 217 적용 전에는 실패한다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS + 동적 제약 재생성(082/103/158과 같은 패턴).

BEGIN;

-- ── ① 레시피 연결 칸 ────────────────────────────────────────────────────
ALTER TABLE public.today_cards
  ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES public.combination_recipes(id) ON DELETE SET NULL;

-- ── ② template_type CHECK에 'recipe_reveal' 추가 ─────────────────────────
-- 제약 이름을 하드코딩하지 않고 컬럼 언급으로 찾아 지운다(158과 동일).
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.today_cards'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%template_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.today_cards DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_template_type_check CHECK (template_type IN (
    'badge_spotlight', 'progress_nudge', 'mission_spotlight',
    'itembook_milestone', 'location_trend', 'drop_alert', 'editorial_article',
    'ranking_board', 'recipe_reveal'
  ));

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것, 읽기 전용) ─────────────────────────────
--
-- -- ① recipe_id 칼럼과 외래 키(ON DELETE SET NULL, confdeltype = 'n')가 만들어졌는지
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'today_cards' AND column_name = 'recipe_id';
-- SELECT conname, confdeltype FROM pg_constraint
--   WHERE conrelid = 'public.today_cards'::regclass AND contype = 'f' AND conname = 'today_cards_recipe_id_fkey';
--
-- -- ② template_type 제약이 9개 값을 허용하는지(recipe_reveal 포함)
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.today_cards'::regclass AND contype = 'c' AND conname = 'today_cards_template_type_check';
--
-- -- ③ 기존 카드가 그대로이고 recipe_id가 모두 비었는지(2026-10-06 기준 카드 71장, recipe_id 있는 행 0 기대)
-- SELECT count(*) AS cards, count(recipe_id) AS with_recipe, count(*) FILTER (WHERE template_type = 'recipe_reveal') AS recipe_reveal_cards
--   FROM public.today_cards;

-- 되돌림 SQL
-- 되돌리기 전에 recipe_reveal 행이 0개인지 확인한다(0이 아니면 CHECK 복원이 실패한다 — 그 카드를 먼저 지우거나 옮긴다).
-- SELECT count(*) FROM public.today_cards WHERE template_type = 'recipe_reveal'; -- 기대: 0
-- ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_template_type_check;
-- ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_template_type_check
--   CHECK (template_type IN (
--     'badge_spotlight', 'progress_nudge', 'mission_spotlight',
--     'itembook_milestone', 'location_trend', 'drop_alert', 'editorial_article',
--     'ranking_board'
--   ));
-- ALTER TABLE public.today_cards DROP COLUMN IF EXISTS recipe_id;
