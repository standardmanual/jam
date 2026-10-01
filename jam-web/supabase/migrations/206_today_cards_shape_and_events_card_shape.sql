-- 206: 투데이 카드 모양·제목 표시 칸(today_cards) + 노출 기록의 그려진 모양 칸(today_card_events)
-- 티켓 20261001_1203(상위 20260930_1453 확정 설계 9절·결정 4·6·16·18) — 확장 단계
-- (파일 작성만, 실행은 사용자 승인 후 오케스트레이터. 조각 a의 205와 같은 날 실행한다)
--
-- 설계:
--   - 새 칸 3개는 전부 NULL 허용이고 기존 행은 NULL로 남는다(백필 없음). 옛 코드는 select('*')로
--     카드를 읽고 새 칸을 무시하므로 칸 추가만으로는 동작이 바뀌지 않는다.
--   - today_card_events.card_shape에는 CHECK를 두지 않는다(설계 9절). 기록 시점 값 복사본이라
--     모양 목록이 바뀌어도 쌓인 기록이 제약에 막히지 않게 한다.
--   - 새 인덱스는 더하지 않는다. 모양별 집계 방식은 c2에서 정하고 필요하면 그때 더한다.
--   - 이 칸을 읽고 쓰는 코드는 b1·c2에서 만든다. DB 실행이 그 코드보다 먼저다(결정 16).
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS → ADD CONSTRAINT.

BEGIN;

-- ── today_cards.shape ───────────────────────────────────────────────────
ALTER TABLE public.today_cards ADD COLUMN IF NOT EXISTS shape TEXT NULL;

ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_shape_check;
ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_shape_check
  CHECK (shape IS NULL OR shape IN ('hero', 'poster', 'square', 'brief', 'list'));

COMMENT ON COLUMN public.today_cards.shape IS
  '카드 모양(hero·poster·square·brief·list, 티켓 20261001_1203). NULL이면 옛 카드라 템플릿·레이아웃 규칙으로 모양을 판정한다. 새 카드부터 값을 저장한다.';

-- ── today_cards.title_in_image ──────────────────────────────────────────
ALTER TABLE public.today_cards ADD COLUMN IF NOT EXISTS title_in_image BOOLEAN NULL;

COMMENT ON COLUMN public.today_cards.title_in_image IS
  '이미지 안에 제목이 들어 있는지(티켓 20261001_1203). true면 화면 글자에서 제목·요약을 빼고 필수 정보를 놓는다. NULL이면 옛 카드라 규칙으로 판정한다. 새 카드부터 값을 저장한다.';

-- ── today_card_events.card_shape ────────────────────────────────────────
ALTER TABLE public.today_card_events ADD COLUMN IF NOT EXISTS card_shape TEXT NULL;

COMMENT ON COLUMN public.today_card_events.card_shape IS
  '기록 시점에 그려진 카드 모양의 복사본(티켓 20261001_1203). NULL이면 모양 도입 전 기록이다. 모양 목록이 바뀌어도 쌓인 기록이 막히지 않도록 CHECK를 두지 않는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 칸 3개가 생겼고 모두 NULL 허용인지(3행, is_nullable = YES)
-- SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND ((table_name = 'today_cards' AND column_name IN ('shape', 'title_in_image'))
--       OR (table_name = 'today_card_events' AND column_name = 'card_shape'));
--
-- -- ② 기존 행이 전부 NULL인지(세 값 모두 0이어야 정상)
-- SELECT count(*) FILTER (WHERE shape IS NOT NULL) AS shape_filled,
--        count(*) FILTER (WHERE title_in_image IS NOT NULL) AS title_in_image_filled
--   FROM public.today_cards;
-- SELECT count(*) FILTER (WHERE card_shape IS NOT NULL) AS card_shape_filled
--   FROM public.today_card_events;
--
-- -- ③ shape CHECK 정의(5값 + NULL), card_shape에는 CHECK가 없어야 한다(0행)
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'today_cards_shape_check';
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.today_card_events'::regclass AND conname ILIKE '%shape%';

-- 되돌림 SQL
-- ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_shape_check;
-- ALTER TABLE public.today_cards DROP COLUMN IF EXISTS shape;
-- ALTER TABLE public.today_cards DROP COLUMN IF EXISTS title_in_image;
-- ALTER TABLE public.today_card_events DROP COLUMN IF EXISTS card_shape;
