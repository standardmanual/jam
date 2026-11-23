-- 357: 홈피드 카드 색 키에 통합 팔레트 4개(짙은 초록·분홍·하늘·흰색)를 더한다 (확장 단계)
-- 티켓 20261122_2224 (상위 20261122_2217 «통합 팔레트», 회차 1). 확장→전환→축소의 첫 단계다.
--
-- 옛 15개 키는 그대로 둔다. 전환(358, 저장된 카드 121장 재배정)과 축소(359, 옛 10키 제거)는 이 파일이 아니다.
-- 그래서 이 파일을 적용해도 화면과 저장은 달라지지 않는다. 새 키는 코드(2회차 이후)가 쓰기 전까지 아무 행도 쓰지 않는다.
-- 키 이름: green-deep(#3D851E, --jam-green-deep), pink(#F372C1, --jam-pink), sky(#51CDF5, --jam-sky), white(#FFFFFF, --jam-chip-white).
-- 쓰임 표(어느 키가 바탕·박스·칩에 쓰이는지)는 칸별 CHECK가 아니라 코드가 지킨다(결정 5): 세 칸이 같은 키 목록을 쓴다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 되돌림: 357_feed_color_keys_expand_down.sql

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

-- 어드민 컬러셋(3번 티켓이 메뉴를 지우기 전까지)이 새 키를 저장해도 500이 나지 않게 같은 목록으로 넓힌다
ALTER TABLE public.feed_color_overrides DROP CONSTRAINT IF EXISTS feed_color_overrides_color_key_check;
ALTER TABLE public.feed_color_overrides
  ADD CONSTRAINT feed_color_overrides_color_key_check CHECK (color_key IN (
    'red', 'yellow', 'green', 'purple', 'blue',
    'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
    'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow',
    'green-deep', 'pink', 'sky', 'white'));

COMMIT;
