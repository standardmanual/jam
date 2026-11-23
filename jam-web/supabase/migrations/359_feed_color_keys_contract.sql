-- 359: 홈피드 카드 색 키 제약을 통합 팔레트 9개로 줄인다 (축소 단계)
-- 티켓 20261122_2224 (상위 20261122_2217 «통합 팔레트», 회차 12). 확장(357) → 전환(358) → 축소(이 파일) 중 «축소»다.
--
-- 줄이는 대상: today_cards의 bg_color_key·chip_color_key·box_color_key CHECK 3개와 feed_color_overrides.color_key CHECK.
-- 남는 키 9개: yellow, green, green-deep, pink, sky, red, purple, blue, white. 빠지는 옛 10키: red-soft, yellow-soft, green-soft,
-- purple-soft, blue-soft, ref-red, ref-blue, ref-lime, ref-pink, ref-yellow.
--
-- 실행 순서: 357(완료) → 358 → 코드 배포 → 이 파일. 358(저장된 카드 121장 재배정)을 먼저 실행하지 않으면 아래 가드가 예외로 멈춘다.
-- 영향: 적용 뒤에는 옛 10키로 저장하려는 쓰기가 DB에서 거절된다(코드는 같은 9키만 받는다). 읽기·화면 변화는 없다.
--   이 파일을 실행한 뒤에는 355_down을 실행할 수 없다(되돌림 순서: 이 파일의 _down → 358_down → 357_down).
-- 실행 전에 확인: 운영 묶음 대기 항목·클라우드 루틴 프롬프트에 옛 10키가 없는지.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 되돌림: 359_feed_color_keys_contract_down.sql

BEGIN;

-- 가드: 옛 10키를 쓰는 행이 하나라도 있으면 멈춘다(358을 실행하기 전에 359를 실행하는 실수를 막는다)
DO $$
DECLARE
  legacy text[] := ARRAY['red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft', 'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow'];
  n_cards integer;
  n_overrides integer;
BEGIN
  SELECT count(*) INTO n_cards
    FROM public.today_cards
   WHERE bg_color_key = ANY (legacy) OR chip_color_key = ANY (legacy) OR box_color_key = ANY (legacy);
  SELECT count(*) INTO n_overrides
    FROM public.feed_color_overrides
   WHERE color_key = ANY (legacy);
  IF n_cards > 0 OR n_overrides > 0 THEN
    RAISE EXCEPTION '359 중단: 옛 색 키를 쓰는 행이 남아 있습니다(today_cards % 장, feed_color_overrides % 건). 358(재배정)을 먼저 실행하고 feed_color_overrides는 옛 키 행을 정리한 뒤 다시 실행하세요.', n_cards, n_overrides;
  END IF;
END $$;

ALTER TABLE public.today_cards
  DROP CONSTRAINT IF EXISTS today_cards_bg_color_key_check,
  DROP CONSTRAINT IF EXISTS today_cards_chip_color_key_check,
  DROP CONSTRAINT IF EXISTS today_cards_box_color_key_check;

ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_bg_color_key_check CHECK (
    bg_color_key IS NULL OR bg_color_key IN
      ('yellow', 'green', 'green-deep', 'pink', 'sky', 'red', 'purple', 'blue', 'white')),
  ADD CONSTRAINT today_cards_chip_color_key_check CHECK (
    chip_color_key IS NULL OR chip_color_key IN
      ('yellow', 'green', 'green-deep', 'pink', 'sky', 'red', 'purple', 'blue', 'white')),
  ADD CONSTRAINT today_cards_box_color_key_check CHECK (
    box_color_key IS NULL OR box_color_key IN
      ('yellow', 'green', 'green-deep', 'pink', 'sky', 'red', 'purple', 'blue', 'white'));

ALTER TABLE public.feed_color_overrides DROP CONSTRAINT IF EXISTS feed_color_overrides_color_key_check;
ALTER TABLE public.feed_color_overrides
  ADD CONSTRAINT feed_color_overrides_color_key_check CHECK (color_key IN
    ('yellow', 'green', 'green-deep', 'pink', 'sky', 'red', 'purple', 'blue', 'white'));

COMMIT;
