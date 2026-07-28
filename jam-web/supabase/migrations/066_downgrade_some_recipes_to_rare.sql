-- ============================================================
-- Migration 066: 조합 레시피 난이도 재배정 — legendary 20개 중 10개를 rare로
--
-- 원안에서 mythic 13개 / legendary 20개로 쏠려있던 결과 등급 분포를,
-- 서사적 연결이 상대적으로 약한 legendary 10개를 rare로 낮춰
-- rare 10 / legendary 10 / mythic 13으로 재배정한다. mythic은 변동 없음.
-- 재료(ingredient_badge_ids)는 그대로 두고 result_badge_id만 같은 세력의
-- rare 등급 배지로 교체 — pick_index는 기존 legendary 매칭과 동일하게 사용.
-- ============================================================

WITH ingredient_kw(recipe_no, keyword) AS (
  VALUES
    (2,'이불'), (2,'플레이리스트'),
    (4,'도토리'), (4,'카본 프레임 보호재'),
    (8,'노을빛 필름 조각'), (8,'플레이리스트'),
    (11,'구겨진 캔맥주'), (11,'엉켜버린 유선 이어폰'),
    (14,'중고거래'), (14,'풀려버린 운동화 끈'),
    (18,'빛나는 놋쇠 단추'), (18,'이불'),
    (22,'핫도그'), (22,'중고거래'),
    (24,'에너지 바'), (24,'구겨진 캔맥주'),
    (25,'초시계'), (25,'풀려버린 운동화 끈'),
    (29,'빛나는 놋쇠 단추'), (29,'도토리')
),
ingredient_resolved AS (
  SELECT
    k.recipe_no,
    (
      SELECT b.id FROM public.badges b
      WHERE b.type = 'item' AND b.rarity = 'common' AND b.name ILIKE '%' || k.keyword || '%'
      ORDER BY b.id LIMIT 1
    ) AS badge_id
  FROM ingredient_kw k
),
ingredient_agg AS (
  SELECT recipe_no, array_agg(badge_id ORDER BY badge_id) AS ids
  FROM ingredient_resolved
  GROUP BY recipe_no
),
-- (recipe_no, 결과 세력, rare, 기존 legendary와 동일한 pick_index)
result_spec (recipe_no, faction_id, pick_index) AS (
  VALUES
    (2, 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'::uuid, 1),  -- 낭만미식가
    (4, 'd6969aef-2039-c997-4b55-a7ee861b32c5'::uuid, 0),  -- 아날로그수집가
    (8, 'e9e608d7-812c-4139-88c4-81d129076e3f'::uuid, 0),  -- 작심삼일클럽
    (11, '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'::uuid, 0), -- 장비병환자들
    (14, '73f0f601-2382-900c-8ca2-5cc7c93ed95d'::uuid, 1), -- 숲속갱단
    (18, '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'::uuid, 1), -- 장비병환자들
    (22, 'e9e608d7-812c-4139-88c4-81d129076e3f'::uuid, 1), -- 작심삼일클럽
    (24, '672acbec-74d3-f36c-28e9-42563dda8e13'::uuid, 1), -- 셔터마피아
    (25, '73f0f601-2382-900c-8ca2-5cc7c93ed95d'::uuid, 2), -- 숲속갱단
    (29, 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'::uuid, 2)  -- 낭만미식가
),
result_resolved AS (
  SELECT
    rs.recipe_no,
    (
      SELECT b.id FROM public.badges b
      WHERE b.faction_id = rs.faction_id AND b.rarity = 'rare' AND b.type = 'item'
      ORDER BY b.id OFFSET rs.pick_index LIMIT 1
    ) AS result_badge_id
  FROM result_spec rs
),
target AS (
  SELECT ia.recipe_no, ia.ids, rr.result_badge_id
  FROM ingredient_agg ia
  JOIN result_resolved rr ON rr.recipe_no = ia.recipe_no
  WHERE rr.result_badge_id IS NOT NULL
)
UPDATE public.combination_recipes cr
SET result_badge_id = target.result_badge_id
FROM target
WHERE cr.ingredient_badge_ids = target.ids;

-- 검증: SELECT r.rarity, count(*) FROM combination_recipes cr JOIN badges r ON r.id = cr.result_badge_id GROUP BY r.rarity;
-- → rare 10 / legendary 10 / mythic 13 이어야 정상
