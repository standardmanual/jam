-- ============================================================
-- Migration 065: 레시피 #1 재료 중복 버그 수정
--
-- 064 재생성 과정에서 실수로 1번 레시피(원안: 떡볶이 + 고농축 카페인 젤)의
-- 재료가 "고카페인 알약" 두 개로 중복 입력됐다. 같은 인벤토리 아이템을
-- 두 번 선택할 수 없어 이 레시피는 영원히 매칭 불가능한 상태였음 — 떡볶이를
-- 되돌려 넣는다.
-- ============================================================

WITH ids AS (
  SELECT
    (SELECT id FROM public.badges WHERE type = 'item' AND rarity = 'common' AND name ILIKE '%떡볶이%' ORDER BY id LIMIT 1) AS a,
    (SELECT id FROM public.badges WHERE type = 'item' AND rarity = 'common' AND name ILIKE '%고카페인 알약%' ORDER BY id LIMIT 1) AS b
)
UPDATE public.combination_recipes cr
SET ingredient_badge_ids = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[ids.a, ids.b]) AS x)
FROM ids
WHERE array_length(cr.ingredient_badge_ids, 1) = 2
  AND cr.ingredient_badge_ids[1] = cr.ingredient_badge_ids[2];

-- 검증: SELECT ingredient_badge_ids FROM combination_recipes WHERE ingredient_badge_ids[1] = ingredient_badge_ids[2];
-- → 0행이어야 정상
