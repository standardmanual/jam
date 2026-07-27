-- ============================================================
-- Migration 061: rare/legendary/mythic 아이템 배지 하드 삭제 (레시피는 보존)
--
-- 배경: 055가 생성한 rare/legendary/mythic 아이템 배지를 전부 지우되,
--  이를 결과로 참조하는 조합 레시피 33개는 남겨두고 싶다는 요청.
--  기존 combination_recipes.result_badge_id는 NOT NULL + ON DELETE CASCADE라
--  배지를 지우면 레시피도 함께 사라진다. 그래서 먼저 FK를 ON DELETE SET NULL로
--  바꿔 배지가 사라져도 레시피 행(재료·성공률·힌트·공개여부)은 남고,
--  result_badge_id만 NULL이 되도록 한다. 배지를 다시 만든 뒤
--  /admin/recipes에서 각 레시피를 열어 결과 배지를 재지정하면 된다.
-- ============================================================

-- 1. result_badge_id를 nullable로 변경 + FK를 SET NULL로 교체
ALTER TABLE public.combination_recipes ALTER COLUMN result_badge_id DROP NOT NULL;
ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_result_badge_id_fkey;
ALTER TABLE public.combination_recipes
  ADD CONSTRAINT combination_recipes_result_badge_id_fkey
  FOREIGN KEY (result_badge_id) REFERENCES public.badges(id) ON DELETE SET NULL;

-- 2. 삭제 실행
BEGIN;

-- 2-1. 이미 유저 인벤토리에 들어간 개체가 있으면 먼저 제거 (badge_id FK엔 CASCADE 없음)
DELETE FROM public.inventory_items
WHERE badge_id IN (
  SELECT id FROM public.badges WHERE type = 'item' AND rarity != 'common'
);

-- 2-2. 배지 삭제 — 이제 combination_recipes는 SET NULL이라 레시피 행은 보존됨
DELETE FROM public.badges
WHERE type = 'item' AND rarity != 'common';

COMMIT;

-- 검증:
-- SELECT count(*) FROM combination_recipes; → 33 그대로여야 정상
-- SELECT count(*) FROM combination_recipes WHERE result_badge_id IS NULL; → 33 (전부 결과 미지정 상태)
