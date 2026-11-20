-- 349 되돌림: 홈피드 카드 개편 칸 15개와 검증 함수 4개를 지운다
-- 티켓 20261120_2149
-- ⚠️ 새 칸에 쌓인 값은 사라진다. 칸을 지우면 제약도 함께 사라지고, 함수는 칸을 지운 뒤에 지운다.

BEGIN;

ALTER TABLE public.today_cards
  DROP COLUMN IF EXISTS feed_type,
  DROP COLUMN IF EXISTS box_shape,
  DROP COLUMN IF EXISTS box_kind,
  DROP COLUMN IF EXISTS bg_color_key,
  DROP COLUMN IF EXISTS chip_color_key,
  DROP COLUMN IF EXISTS box_color_key,
  DROP COLUMN IF EXISTS chips,
  DROP COLUMN IF EXISTS title_chip_words,
  DROP COLUMN IF EXISTS show_description,
  DROP COLUMN IF EXISTS stamp_enabled,
  DROP COLUMN IF EXISTS stamp_slot,
  DROP COLUMN IF EXISTS list_items,
  DROP COLUMN IF EXISTS list_more_href,
  DROP COLUMN IF EXISTS collection_burst,
  DROP COLUMN IF EXISTS feed_seed;

DROP FUNCTION IF EXISTS public.today_cards_chips_valid(jsonb);
DROP FUNCTION IF EXISTS public.today_cards_list_items_valid(jsonb);
DROP FUNCTION IF EXISTS public.today_cards_burst_valid(jsonb);
DROP FUNCTION IF EXISTS public.today_cards_title_words_valid(text[]);

COMMIT;
