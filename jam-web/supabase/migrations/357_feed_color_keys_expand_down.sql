-- 357 되돌림: 홈피드 카드 색 키 제약을 옛 15개로 되돌린다 (티켓 20261122_2224)
-- 새 키(green-deep·pink·sky·white)를 쓰는 행이 한 건이라도 있으면 제약을 다시 걸 때 실패한다.
-- 그 경우 먼저 358 되돌림(재배정 복구)을 실행하거나 그 행의 키를 옛 키로 바꾼 뒤 실행한다.
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.

BEGIN;

ALTER TABLE public.today_cards
  DROP CONSTRAINT IF EXISTS today_cards_bg_color_key_check,
  DROP CONSTRAINT IF EXISTS today_cards_chip_color_key_check,
  DROP CONSTRAINT IF EXISTS today_cards_box_color_key_check;

ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_bg_color_key_check CHECK (
    bg_color_key IS NULL OR bg_color_key IN
      ('red', 'yellow', 'green', 'purple', 'blue',
       'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow')),
  ADD CONSTRAINT today_cards_chip_color_key_check CHECK (
    chip_color_key IS NULL OR chip_color_key IN
      ('red', 'yellow', 'green', 'purple', 'blue',
       'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow')),
  ADD CONSTRAINT today_cards_box_color_key_check CHECK (
    box_color_key IS NULL OR box_color_key IN
      ('red', 'yellow', 'green', 'purple', 'blue',
       'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow'));

ALTER TABLE public.feed_color_overrides DROP CONSTRAINT IF EXISTS feed_color_overrides_color_key_check;
ALTER TABLE public.feed_color_overrides
  ADD CONSTRAINT feed_color_overrides_color_key_check CHECK (color_key IN (
    'red', 'yellow', 'green', 'purple', 'blue',
    'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
    'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow'));

COMMIT;
