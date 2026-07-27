-- ============================================================
-- Migration 059: 아이템북 구성 배지에서 rare/legendary/mythic 제외
--
-- 배지 자체는 삭제하지 않는다(조합 레시피 33개가 result_badge_id로 참조 중이며
-- combination_recipes.result_badge_id는 ON DELETE CASCADE라 배지를 지우면 레시피도
-- 연쇄삭제됨). item_book_id만 NULL로 돌려서 "아이템북을 구성하는 배지" 목록에서만
-- 빠지게 한다 — 055 이전과 동일하게 각 아이템북은 다시 common 배지만으로 구성됨.
-- ============================================================

UPDATE public.badges
SET item_book_id = NULL
WHERE type = 'item'
  AND rarity != 'common'
  AND item_book_id IS NOT NULL;
