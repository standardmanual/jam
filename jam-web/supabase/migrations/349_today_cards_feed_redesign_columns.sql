-- 349: 홈피드 카드 개편의 구성 값 칸을 today_cards에 더한다 (확장 단계)
-- 티켓 20261120_2149 (상위 20261120_2026, 규격 정본 docs/service/prd/home-feed/PRD.md §6 「개편 규격」)
--
-- 새 칸은 전부 NULL 허용이고 기본값이 없다. NULL은 «자동 규칙이 정한다»(제목 칩 낱말·도장 자리는
-- «없음»)는 뜻이어서, 기존 행과 지금 코드의 select('*')·insert에는 영향이 없다.
-- 기존 shape·title_in_image 칸은 옛 7모양 카드를 위해 그대로 둔다(옛 이름 ticket·hero·list와
-- 새 유형·박스 모양 «티켓»이 겹치지 않도록 새 유형 키는 feed_type이라는 별도 칸이다).
-- 허용 값 목록은 CHECK로 둔다. JSONB 칸은 검증 함수(today_cards_*_valid)로 구조를 지킨다.
-- 자동 배정 코드는 이 마이그레이션에 없다(5회차). 칸과 값의 자리만 마련한다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.
-- 되돌림: 349_today_cards_feed_redesign_columns_down.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. JSONB 구조 검증 함수 (CHECK는 서브쿼리를 못 쓰므로 함수로 뺀다)
--    알 수 없는 키는 허용한다(뒤 회차에서 키를 더해도 이 함수를 고치지 않게).
--    위치·기울기 같은 «자리 이름»은 유형마다 달라 코드 상수가 정본이므로 모양(소문자·숫자·하이픈)만 본다.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.today_cards_chips_valid(c jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  e jsonb;
  k text;
BEGIN
  IF c IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) > 2 THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(c) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN false; END IF;
    k := e->>'kind';
    IF k IS NULL OR k NOT IN ('value', 'phrase', 'label') THEN RETURN false; END IF;
    -- 값 칩은 값의 출처 키, 문구 칩은 문구가 있어야 한다. 구분 칩은 둘 다 없어도 된다(자원에서 정해진다).
    IF k = 'value' AND (jsonb_typeof(e->'source') IS DISTINCT FROM 'string' OR btrim(e->>'source') = '') THEN RETURN false; END IF;
    IF k = 'phrase' AND (jsonb_typeof(e->'text') IS DISTINCT FROM 'string' OR btrim(e->>'text') = '') THEN RETURN false; END IF;
    IF e ? 'slot' AND (jsonb_typeof(e->'slot') IS DISTINCT FROM 'string' OR (e->>'slot') !~ '^[a-z][a-z0-9-]{0,23}$') THEN RETURN false; END IF;
    IF e ? 'tilt' THEN
      IF jsonb_typeof(e->'tilt') IS DISTINCT FROM 'number' OR (e->>'tilt')::numeric NOT IN (-8, -6, -4, 4, 6, 8) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
END
$fn$;

CREATE OR REPLACE FUNCTION public.today_cards_list_items_valid(c jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  e jsonb;
BEGIN
  IF c IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) > 3 THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(c) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN false; END IF;
    IF jsonb_typeof(e->'name') IS DISTINCT FROM 'string' OR btrim(e->>'name') = '' THEN RETURN false; END IF;
    IF jsonb_typeof(e->'href') IS DISTINCT FROM 'string' OR btrim(e->>'href') = '' THEN RETURN false; END IF;
    IF e ? 'image_url' AND jsonb_typeof(e->'image_url') NOT IN ('string', 'null') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;

CREATE OR REPLACE FUNCTION public.today_cards_burst_valid(c jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  e jsonb;
BEGIN
  IF c IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) > 4 THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(c) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN false; END IF;
    -- x·y: 가운데에서 카드 가장자리까지를 1로 본 도착 위치(-1~1). 크기 68~84px, 시작 지연 70~210ms는 규격의 범위다.
    IF jsonb_typeof(e->'x') IS DISTINCT FROM 'number' OR (e->>'x')::numeric NOT BETWEEN -1 AND 1 THEN RETURN false; END IF;
    IF jsonb_typeof(e->'y') IS DISTINCT FROM 'number' OR (e->>'y')::numeric NOT BETWEEN -1 AND 1 THEN RETURN false; END IF;
    IF e ? 'tilt' AND (jsonb_typeof(e->'tilt') IS DISTINCT FROM 'number' OR (e->>'tilt')::numeric NOT BETWEEN -45 AND 45) THEN RETURN false; END IF;
    IF e ? 'size' AND (jsonb_typeof(e->'size') IS DISTINCT FROM 'number' OR (e->>'size')::numeric NOT BETWEEN 68 AND 84) THEN RETURN false; END IF;
    IF e ? 'delay_ms' AND (jsonb_typeof(e->'delay_ms') IS DISTINCT FROM 'number' OR (e->>'delay_ms')::numeric NOT BETWEEN 70 AND 210) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;

CREATE OR REPLACE FUNCTION public.today_cards_title_words_valid(w text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  x text;
BEGIN
  IF w IS NULL THEN RETURN true; END IF;
  IF cardinality(w) > 2 THEN RETURN false; END IF;
  FOREACH x IN ARRAY w LOOP
    IF x IS NULL OR btrim(x) = '' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 2. 칸 추가 (전부 NULL 허용, 기본값 없음)
-- ---------------------------------------------------------------------------

ALTER TABLE public.today_cards
  ADD COLUMN IF NOT EXISTS feed_type         text    NULL,
  ADD COLUMN IF NOT EXISTS box_shape         text    NULL,
  ADD COLUMN IF NOT EXISTS box_kind          text    NULL,
  ADD COLUMN IF NOT EXISTS bg_color_key      text    NULL,
  ADD COLUMN IF NOT EXISTS chip_color_key    text    NULL,
  ADD COLUMN IF NOT EXISTS box_color_key     text    NULL,
  ADD COLUMN IF NOT EXISTS chips             jsonb   NULL,
  ADD COLUMN IF NOT EXISTS title_chip_words  text[]  NULL,
  ADD COLUMN IF NOT EXISTS show_description  boolean NULL,
  ADD COLUMN IF NOT EXISTS stamp_enabled     boolean NULL,
  ADD COLUMN IF NOT EXISTS stamp_slot        text    NULL,
  ADD COLUMN IF NOT EXISTS list_items        jsonb   NULL,
  ADD COLUMN IF NOT EXISTS list_more_href    text    NULL,
  ADD COLUMN IF NOT EXISTS collection_burst  jsonb   NULL,
  ADD COLUMN IF NOT EXISTS feed_seed         bigint  NULL;

-- ---------------------------------------------------------------------------
-- 3. 제약 (다시 실행해도 되도록 먼저 지우고 더한다)
-- ---------------------------------------------------------------------------

ALTER TABLE public.today_cards
  DROP CONSTRAINT IF EXISTS today_cards_feed_type_check,
  DROP CONSTRAINT IF EXISTS today_cards_box_shape_check,
  DROP CONSTRAINT IF EXISTS today_cards_box_kind_check,
  DROP CONSTRAINT IF EXISTS today_cards_bg_color_key_check,
  DROP CONSTRAINT IF EXISTS today_cards_chip_color_key_check,
  DROP CONSTRAINT IF EXISTS today_cards_box_color_key_check,
  DROP CONSTRAINT IF EXISTS today_cards_chips_check,
  DROP CONSTRAINT IF EXISTS today_cards_title_chip_words_check,
  DROP CONSTRAINT IF EXISTS today_cards_stamp_slot_check,
  DROP CONSTRAINT IF EXISTS today_cards_list_items_check,
  DROP CONSTRAINT IF EXISTS today_cards_list_more_href_check,
  DROP CONSTRAINT IF EXISTS today_cards_collection_burst_check,
  DROP CONSTRAINT IF EXISTS today_cards_feed_seed_check;

ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_feed_type_check CHECK (
    feed_type IS NULL OR feed_type IN
      ('hero_box', 'full_image', 'badge_intro', 'badge_only', 'collection_intro', 'drop_pickup', 'text_box', 'gallery_list')),
  ADD CONSTRAINT today_cards_box_shape_check CHECK (
    box_shape IS NULL OR box_shape IN ('round', 'ticket', 'stamp', 'wave', 'bump')),
  ADD CONSTRAINT today_cards_box_kind_check CHECK (
    box_kind IS NULL OR box_kind IN ('text', 'image_mask')),
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
       'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow')),
  ADD CONSTRAINT today_cards_chips_check CHECK (public.today_cards_chips_valid(chips)),
  ADD CONSTRAINT today_cards_title_chip_words_check CHECK (public.today_cards_title_words_valid(title_chip_words)),
  ADD CONSTRAINT today_cards_stamp_slot_check CHECK (
    stamp_slot IS NULL OR stamp_slot ~ '^[a-z][a-z0-9-]{0,23}$'),
  ADD CONSTRAINT today_cards_list_items_check CHECK (public.today_cards_list_items_valid(list_items)),
  ADD CONSTRAINT today_cards_list_more_href_check CHECK (
    list_more_href IS NULL OR btrim(list_more_href) <> ''),
  ADD CONSTRAINT today_cards_collection_burst_check CHECK (public.today_cards_burst_valid(collection_burst)),
  ADD CONSTRAINT today_cards_feed_seed_check CHECK (
    feed_seed IS NULL OR (feed_seed >= 0 AND feed_seed < 4294967296));

-- ---------------------------------------------------------------------------
-- 4. 칸 설명
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.today_cards.feed_type IS
  '개편 카드 유형 키(349). hero_box·full_image·badge_intro·badge_only·collection_intro·drop_pickup·text_box·gallery_list. NULL이면 옛 7모양(shape) 카드이거나 자동 규칙이 정한다. 옛 shape와 이름이 겹치지 않도록 별도 칸이다';
COMMENT ON COLUMN public.today_cards.box_shape IS
  '박스 모양(349). round·ticket·stamp(우표)·wave(물결)·bump(반원 돌출). 텍스트 박스와 이미지 마스크에 모두 쓴다. NULL이면 자동';
COMMENT ON COLUMN public.today_cards.box_kind IS
  '박스 용도(349). text(글자를 담는 박스)·image_mask(이미지를 박스 모양으로 잘라 보임). NULL이면 유형 기본값';
COMMENT ON COLUMN public.today_cards.bg_color_key IS
  '카드 배경 색 키(349). 15색 중 하나: red·yellow·green·purple·blue, *-soft 연한 색 5개, ref-red·ref-blue·ref-lime·ref-pink·ref-yellow. hex가 아니라 키를 저장한다. NULL이면 자동 규칙이 정한다';
COMMENT ON COLUMN public.today_cards.chip_color_key IS
  '칩 색 키(349). 허용 값은 bg_color_key와 같다. NULL이면 자동';
COMMENT ON COLUMN public.today_cards.box_color_key IS
  '박스 색 키(349). 허용 값은 bg_color_key와 같다. NULL이면 자동';
COMMENT ON COLUMN public.today_cards.chips IS
  '칩 목록(349), 최대 2개. [{kind:value|phrase|label, source?, text?, slot?, tilt?}]. value는 source(값의 출처 키), phrase는 text(문구) 필수, label은 구분 칩. slot은 자리 이름(유형마다 코드 상수), tilt는 -8·-6·-4·4·6·8. NULL=자동 규칙이 정함, []=칩 없음';
COMMENT ON COLUMN public.today_cards.title_chip_words IS
  '제목 속 칩으로 만들 낱말(349), 최대 2개. 제목에 그대로 들어 있는 낱말이어야 하며 이는 저장하는 쪽 코드가 검사한다(제목 수정과 충돌하지 않게 DB는 개수와 공백만 본다). NULL과 빈 배열은 같은 뜻(칩 없음)';
COMMENT ON COLUMN public.today_cards.show_description IS
  '설명 문장 노출 여부(349). NULL이면 유형 기본값(히어로·배지 소개·컬렉션 소개·드랍·픽업·목록형은 보임)';
COMMENT ON COLUMN public.today_cards.stamp_enabled IS
  '도장(JOIN AND MOVE) 사용 여부(349). NULL이면 자동(쓰지 않음)';
COMMENT ON COLUMN public.today_cards.stamp_slot IS
  '도장 자리 이름(349). 유형마다 허용 자리는 코드 상수. NULL이면 자동';
COMMENT ON COLUMN public.today_cards.list_items IS
  '목록형 카드의 항목(349), 최대 3개. [{name, image_url?, href}]. 항목마다 따로 링크를 건다';
COMMENT ON COLUMN public.today_cards.list_more_href IS
  '목록형 카드의 «→» 칸이 가는 대표 페이지 주소(349). 비어 있으면 화살표 칸을 그리지 않는다';
COMMENT ON COLUMN public.today_cards.collection_burst IS
  '컬렉션 소개 카드의 아이템 배지 4개 도착 위치(349), 최대 4개. [{x, y, tilt?, size?, delay_ms?}]. x·y는 가운데에서 카드 가장자리까지를 1로 본 -1~1, size 68~84px, delay_ms 70~210. NULL이면 시드로 계산';
COMMENT ON COLUMN public.today_cards.feed_seed IS
  '무작위 값을 고정하는 시드(349), 0 이상 2^32 미만 정수. 색·칩 자리·기울기·물결 모양·배지 위치를 정할 때 쓴다. 한 번 정하면 바꾸지 않는다';

COMMIT;

-- 되돌림 SQL
-- 349_today_cards_feed_redesign_columns_down.sql 에 있다(칸 15개와 제약, 검증 함수 4개를 지운다).
-- 새 칸에 값이 쌓인 뒤 되돌리면 그 값은 사라진다. 지금 코드는 새 칸을 읽지 않으므로 화면에는 영향이 없다.
