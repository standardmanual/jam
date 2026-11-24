-- 363: 컬렉션·트라이브 영문 이름 칸과 컬렉션 표지 생성 설정 칸을 추가한다 (티켓 20261124_1742)
-- 확장 단계만 한다. 기존 칸은 바꾸거나 지우지 않는다. 모든 칸은 NULL 허용, 기본값 없음.

ALTER TABLE public.item_books ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.item_books ADD COLUMN IF NOT EXISTS cover_params jsonb;
ALTER TABLE public.tribes ADD COLUMN IF NOT EXISTS name_en text;

COMMENT ON COLUMN public.item_books.name_en IS '컬렉션 영문 이름. 표지 생성기가 쓰며 영문 이름의 기준은 이 칸이다. NULL이면 영문 이름 없음';
COMMENT ON COLUMN public.item_books.cover_params IS '표지 생성 설정(jsonb): { version, seed, rerolls, bgHex, bgSource, textColors{title,tribe,join}, badgeId, appliedAt }. DB는 모양을 강제하지 않는다';
COMMENT ON COLUMN public.tribes.name_en IS '트라이브 영문 이름. 표지 생성기가 쓰며 영문 이름의 기준은 이 칸이다. NULL이면 영문 이름 없음';

-- 트라이브 5건
UPDATE public.tribes SET name_en = 'ONE BITE CLUB' WHERE name = '한입만 연구회' AND is_active;
UPDATE public.tribes SET name_en = 'CLICK CREW' WHERE name = '찰칵단' AND is_active;
UPDATE public.tribes SET name_en = 'B-SIDE RECORDS' WHERE name = '비사이드 레코즈' AND is_active;
UPDATE public.tribes SET name_en = 'PINE TREE GENERAL STORE' WHERE name = '소나무 잡화점' AND is_active;
UPDATE public.tribes SET name_en = 'THE LONERS' WHERE name = '혼자들' AND is_active;

-- 컬렉션 5건
UPDATE public.item_books SET name_en = 'ALLEY FILM SNAPS' WHERE name = '골목길 필름 스냅' AND is_active;
UPDATE public.item_books SET name_en = 'MIDNIGHT SNACK CHASERS' WHERE name = '무명을 쫓는 야식가들' AND is_active;
UPDATE public.item_books SET name_en = 'ANALOG MIXTAPE' WHERE name = '아날로그 믹스테이프' AND is_active;
UPDATE public.item_books SET name_en = 'LONELY SOCKS' WHERE name = '짝 잃은 양말' AND is_active;
UPDATE public.item_books SET name_en = 'THE STATIONERY BOX' WHERE name = '창고의 문구 상자' AND is_active;

-- 끝 검사: 채워진 행 수가 맞지 않으면 전체를 되돌린다
DO $$
DECLARE
  v_tribes int;
  v_books int;
BEGIN
  SELECT count(*) INTO v_tribes FROM public.tribes WHERE name_en IS NOT NULL;
  SELECT count(*) INTO v_books FROM public.item_books WHERE name_en IS NOT NULL;
  IF v_tribes <> 5 THEN
    RAISE EXCEPTION '트라이브 영문 이름이 5행이어야 하는데 %행이다', v_tribes;
  END IF;
  IF v_books <> 5 THEN
    RAISE EXCEPTION '컬렉션 영문 이름이 5행이어야 하는데 %행이다', v_books;
  END IF;
END $$;
