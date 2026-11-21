-- 351 되돌림: 트리거·함수·제약·칸을 지운다 (티켓 20261121_1724)
-- 칸에 담긴 값은 사라진다(대표 색은 이미지에서 다시 뽑을 수 있다). 읽는 코드(7-6)가 이 칸을 쓰기 시작했다면 그 코드를 먼저 되돌린다.
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.

BEGIN;

DROP TRIGGER IF EXISTS today_cards_cover_colors_stale_guard ON public.today_cards;
DROP FUNCTION IF EXISTS public.today_cards_cover_colors_stale_guard();
ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_cover_colors_check;
DROP FUNCTION IF EXISTS public.today_cards_cover_colors_valid(jsonb);
ALTER TABLE public.today_cards DROP COLUMN IF EXISTS cover_colors;

COMMIT;
