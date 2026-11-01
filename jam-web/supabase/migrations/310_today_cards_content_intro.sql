-- 310: 투데이 카드에 컨텐츠 소개 카드 종류(content_intro) 추가 (티켓 20261101_2054)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 오케스트레이터(카리나)가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 이유:
--   미션·배지·컬렉션에 연결하지 않고 서비스 컨텐츠를 소개하는 홈 피드 카드(`template_type = 'content_intro'`)를 만든다.
--   `template_type` CHECK가 이 값을 허용하지 않아 카드 행을 저장할 수 없다.
--
-- 변경 (순수 확장 — 지우는 것이 없어 확장→전환→축소로 나누지 않는다):
--   `today_cards_template_type_check`에 `content_intro`를 더해 10개 값으로 교체한다. 217(recipe_reveal)과 같은 동적 조회
--   방식으로 기존 제약을 지운다 — 제약 이름이 실제와 달라도 깨지지 않는다. 칼럼은 늘리지 않는다(연결 칸이 없는 유형이다).
--
-- main(프로덕션 옛 코드)에 영향 없음:
--   제약을 넓히기만 하므로 기존 행과 옛 코드의 읽기·쓰기는 그대로다. 옛 코드를 거치는 것은 `content_intro` 값을 가진 행뿐인데,
--   옛 코드의 `resourceOfTemplate`는 모르는 템플릿 값에 `undefined`를 돌려주는 안전망(티켓 20261006_1217)이 있어 홈은 오류 없이
--   그 카드를 아이콘·자원 줄 없이 그린다(칩 줄 라벨만 비고 제목·이미지·링크는 보인다). 옛 어드민 카드 화면의 `todayTemplateFields`도
--   모르는 값에는 빈 칸 목록을 돌려준다. 그래도 이 마이그레이션 적용 뒤 `/jam-ship`이 끝나기 전에는 `content_intro` 카드를 만들지 않는다.
--
-- 순서: 코드가 이 값을 저장하므로 310 적용 → staging push 순서다. 적용 전에는 등록 스크립트·어드민 저장의 insert가 CHECK 위반으로 실패한다.
--
-- 재실행 가능(idempotent): 동적 제약 재생성(082/103/158/217과 같은 패턴).

BEGIN;

-- ── template_type CHECK에 'content_intro' 추가 ──────────────────────────
-- 제약 이름을 하드코딩하지 않고 컬럼 언급으로 찾아 지운다(217과 동일).
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
    'ranking_board', 'recipe_reveal', 'content_intro'
  ));

COMMIT;

-- ── 확인 SQL (실행 후 눈으로 확인할 것, 읽기 전용) ─────────────────────────────
--
-- -- ① template_type 제약이 10개 값을 허용하는지(content_intro 포함)
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.today_cards'::regclass AND contype = 'c' AND conname = 'today_cards_template_type_check';
--
-- -- ② template_type을 건드리는 CHECK가 이 제약 하나뿐인지(1행 기대)
-- SELECT count(*) FROM pg_constraint
--   WHERE conrelid = 'public.today_cards'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%template_type%';
--
-- -- ③ 기존 카드가 그대로이고 content_intro 행이 아직 없는지(0 기대)
-- SELECT count(*) AS cards, count(*) FILTER (WHERE template_type = 'content_intro') AS content_intro_cards
--   FROM public.today_cards;

-- 되돌림 SQL
-- 되돌리기 전에 content_intro 행이 0개인지 확인한다(0이 아니면 CHECK 복원이 실패한다 — 그 카드를 먼저 지우거나 옮긴다).
-- SELECT count(*) FROM public.today_cards WHERE template_type = 'content_intro'; -- 기대: 0
-- ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_template_type_check;
-- ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_template_type_check
--   CHECK (template_type IN (
--     'badge_spotlight', 'progress_nudge', 'mission_spotlight',
--     'itembook_milestone', 'location_trend', 'drop_alert', 'editorial_article',
--     'ranking_board', 'recipe_reveal'
--   ));
