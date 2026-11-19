-- 347: 배지 이미지 대표색 칸(bg_colors)과 낡은 색 방지 트리거 (확장 단계)
-- 티켓 20261119_1651 (상위 20261119_1650)
--
-- badges.bg_colors jsonb NULL: 이미지에서 뽑은 원색(보정 전) 최대 3개, 밝기 높은 순 hex 문자열 배열.
--   NULL = 아직 안 뽑음, [] = 뽑았는데 색 없음(흑백 위주).
--   칸은 NULL 허용이고 기본값이 없어 기존 코드·기존 행에는 영향이 없다. 기존 행은 일괄 계산 스크립트
--   (jam-web/scripts/backfill-badge-bg-colors.mjs)가 채운다.
-- 트리거 badges_bg_colors_stale_guard: image_url이 바뀌는데 같은 UPDATE에서 bg_colors를 새로 주지 않으면
--   bg_colors를 NULL로 비운다. 어떤 경로가 이미지를 바꿔도 낡은 색이 남지 않게 하는 안전망이다.
--   같은 UPDATE에서 새 색을 주면(NEW.bg_colors가 OLD와 다르면) 그대로 둔다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.
-- 되돌림: 347_badge_bg_colors_down.sql

BEGIN;

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS bg_colors jsonb NULL;

COMMENT ON COLUMN public.badges.bg_colors IS
  '이미지 대표색 원색(보정 전) 최대 3개, 밝기 높은 순 hex 배열. NULL=아직 안 뽑음, []=색 없음. image_url만 바뀌면 트리거가 NULL로 비운다(347)';

CREATE OR REPLACE FUNCTION public.badges_bg_colors_stale_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.image_url IS DISTINCT FROM OLD.image_url
     AND NEW.bg_colors IS NOT DISTINCT FROM OLD.bg_colors THEN
    NEW.bg_colors := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS badges_bg_colors_stale_guard ON public.badges;
CREATE TRIGGER badges_bg_colors_stale_guard
  BEFORE UPDATE OF image_url ON public.badges
  FOR EACH ROW
  EXECUTE FUNCTION public.badges_bg_colors_stale_guard();

COMMIT;
