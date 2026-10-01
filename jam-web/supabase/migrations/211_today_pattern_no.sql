-- 211: 투데이 카드(today_cards)와 카드 이벤트(today_card_events)의 패턴 번호 칸 (티켓 20261001_2056, 상위 20260930_1503 ①)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 민지 판정과 사용자 승인 뒤 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--    210_ops_patterns.sql과 같은 승인으로 함께 실행한다.
--
-- 설계:
--   - 새 칸 2개는 전부 NULL 허용이고 기존 행은 NULL로 남는다(백필 없음, 206 선례). 옛 코드는 select('*')로
--     카드를 읽고 새 칸을 무시하므로 칸 추가만으로는 동작이 바뀌지 않는다.
--   - `pattern_no`는 운영 항목의 패턴 번호 복사본이다. CHECK·FK·인덱스를 두지 않는다. 패턴이 보관돼도,
--     번호 형식이 바뀌어도 쌓인 카드와 기록이 제약에 막히지 않게 한다.
--   - NULL은 패턴 없음, 옛 카드, 옛 기록이다. 채우는 쪽은 카드를 만드는 티켓 1500이고, 이벤트에 기록하는
--     쪽은 티켓 1503 ⑥이다.
--   - 이 조각에는 새 칸을 읽거나 쓰는 코드가 없다. 반대로 ⑥은 이 칸이 적용된 뒤에 머지한다. 칸이 없을 때
--     `assertCardExposable`이 `pattern_no`를 select하면 모든 카드의 노출·열람 기록이 조용히 사라진다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE public.today_cards ADD COLUMN IF NOT EXISTS pattern_no TEXT NULL;

COMMENT ON COLUMN public.today_cards.pattern_no IS
  '운영 항목의 패턴 번호 복사본(티켓 20261001_2056). NULL이면 패턴 없음이거나 옛 카드다. CHECK·FK를 두지 않는다.';

ALTER TABLE public.today_card_events ADD COLUMN IF NOT EXISTS pattern_no TEXT NULL;

COMMENT ON COLUMN public.today_card_events.pattern_no IS
  '기록 시점 카드의 패턴 번호 복사본(티켓 20261001_2056). NULL이면 패턴 없음이거나 옛 기록이다. 패턴이 보관돼도 쌓인 기록이 막히지 않도록 CHECK·FK를 두지 않는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 칸 2개가 생겼고 모두 NULL 허용인지(2행, is_nullable = YES)
-- SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('today_cards', 'today_card_events')
--     AND column_name = 'pattern_no';
--
-- -- ② 기존 행이 전부 NULL인지(두 값 모두 0이어야 정상)
-- SELECT count(*) FILTER (WHERE pattern_no IS NOT NULL) AS cards_filled FROM public.today_cards;
-- SELECT count(*) FILTER (WHERE pattern_no IS NOT NULL) AS events_filled FROM public.today_card_events;
--
-- -- ③ pattern_no 관련 CHECK·FK가 없어야 한다(0행)
-- SELECT conname FROM pg_constraint
--   WHERE conrelid IN ('public.today_cards'::regclass, 'public.today_card_events'::regclass)
--     AND pg_get_constraintdef(oid) ILIKE '%pattern_no%';

-- 되돌림 SQL
-- 되돌리기 전에 SELECT count(*) FROM public.today_card_events WHERE pattern_no IS NOT NULL; 를 확인한다.
-- 티켓 1503 ⑥ 이후에는 0이 아니고, 되돌리는 순간 이벤트에 쌓인 패턴 값이 사라진다.
-- ALTER TABLE public.today_card_events DROP COLUMN IF EXISTS pattern_no;
-- ALTER TABLE public.today_cards DROP COLUMN IF EXISTS pattern_no;
