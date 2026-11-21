-- 351: 카드 커버 이미지의 대표 색을 저장하는 칸을 today_cards에 더한다 (확장 단계)
-- 티켓 20261121_1724 (상위 20261120_2026 7회차-3, 본보기 347_badge_bg_colors.sql)
--
-- cover_colors: 커버 이미지 대표색 원색(보정 전) 최대 3개, 밝기 높은 순 hex 배열.
--   NULL=아직 안 뽑음, []=색 없음. cover_image_url만 바뀌면 트리거가 NULL로 비워 낡은 색이 남지 않게 한다.
-- 전부 NULL 허용·기본값 없음이라 기존 행과 지금 코드의 select('*')·insert에는 영향이 없다.
-- 이 칸을 읽는 코드는 7-6(자동 색 배정)이다. 이 마이그레이션은 칸과 안전장치만 마련한다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 되돌림: 351_today_cards_cover_colors_down.sql

BEGIN;

ALTER TABLE public.today_cards
  ADD COLUMN IF NOT EXISTS cover_colors jsonb NULL;

COMMENT ON COLUMN public.today_cards.cover_colors IS
  '커버 이미지 대표색 원색(보정 전) 최대 3개, 밝기 높은 순 hex 배열. NULL=아직 안 뽑음, []=색 없음. cover_image_url만 바뀌면 트리거가 NULL로 비운다(351)';

-- 구조 검증: 배열이고 최대 3개이며 각 값이 #rrggbb 문자열. CHECK는 서브쿼리를 못 쓰므로 함수로 뺀다.
CREATE OR REPLACE FUNCTION public.today_cards_cover_colors_valid(c jsonb)
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
    IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ '^#[0-9a-fA-F]{6}$' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;

ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_cover_colors_check;
ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_cover_colors_check CHECK (public.today_cards_cover_colors_valid(cover_colors));

-- 낡은 색 방지: cover_image_url이 바뀌는데 같은 UPDATE에서 cover_colors를 새로 주지 않으면 NULL로 비운다.
CREATE OR REPLACE FUNCTION public.today_cards_cover_colors_stale_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cover_image_url IS DISTINCT FROM OLD.cover_image_url
     AND NEW.cover_colors IS NOT DISTINCT FROM OLD.cover_colors THEN
    NEW.cover_colors := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS today_cards_cover_colors_stale_guard ON public.today_cards;
CREATE TRIGGER today_cards_cover_colors_stale_guard
  BEFORE UPDATE OF cover_image_url ON public.today_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.today_cards_cover_colors_stale_guard();

COMMIT;
