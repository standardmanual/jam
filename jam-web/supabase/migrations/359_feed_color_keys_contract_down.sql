-- 359 되돌림: 홈피드 카드 색 키 제약을 357이 넓힌 19개 목록으로 되돌린다 (티켓 20261122_2224 회차 12)
-- 옛 10키를 쓰는 행이 없어야 하므로 이 되돌림은 항상 성공한다(359 적용 뒤에는 옛 키 행이 만들어질 수 없다).
-- 이 파일을 실행한 뒤 358을 되돌리려면 358_feed_colors_reassign_down.sql을 이어서 실행한다(옛 키 행을 복구하려면 19키 제약이 먼저 필요하다).
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
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow',
       'green-deep', 'pink', 'sky', 'white')),
  ADD CONSTRAINT today_cards_chip_color_key_check CHECK (
    chip_color_key IS NULL OR chip_color_key IN
      ('red', 'yellow', 'green', 'purple', 'blue',
       'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow',
       'green-deep', 'pink', 'sky', 'white')),
  ADD CONSTRAINT today_cards_box_color_key_check CHECK (
    box_color_key IS NULL OR box_color_key IN
      ('red', 'yellow', 'green', 'purple', 'blue',
       'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow',
       'green-deep', 'pink', 'sky', 'white'));

ALTER TABLE public.feed_color_overrides DROP CONSTRAINT IF EXISTS feed_color_overrides_color_key_check;
ALTER TABLE public.feed_color_overrides
  ADD CONSTRAINT feed_color_overrides_color_key_check CHECK (color_key IN
    ('red', 'yellow', 'green', 'purple', 'blue',
       'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow',
       'green-deep', 'pink', 'sky', 'white'));

COMMIT;
