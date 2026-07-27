-- ============================================================
-- Migration 056: 조합 레시피에 "필수 액티비티 배지" 조건 추가
--
-- 배경: 세계관 융합 레시피 33종 중 다수가 "달리기 R5 달성" 같은 액티비티
--  성취를 재료로 요구한다. 하지만 액티비티 배지는 영구 귀속·양도 불가
--  원칙상 inventory_items(소모 가능한 아이템)에 들어가지 않으므로 소모형
--  재료로는 쓸 수 없다. item_books.required_activity_badge_id와 동일한
--  패턴으로 "소모되지 않는 보유 조건"을 combination_recipes에 추가한다.
-- ============================================================

ALTER TABLE public.combination_recipes
  ADD COLUMN IF NOT EXISTS required_activity_badge_id UUID REFERENCES public.badges(id);

COMMENT ON COLUMN public.combination_recipes.required_activity_badge_id IS
  '설정 시 이 액티비티 배지를 보유(user_activity_badges)해야 레시피가 매칭됨. 소모되지 않음(item_books.required_activity_badge_id와 동일 패턴).';
