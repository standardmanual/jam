-- ============================================================
-- Migration 057: 세계관 융합 정석 레시피 33종 시딩 (PRD/badge/COMBINE_RECIPES.md)
--
-- 방침(사용자 결정):
--  - 새 배지를 만들지 않고 055에서 생성된 기존 legendary/mythic 아이템 배지를 재활용한다.
--    따라서 실제 지급되는 배지 이름은 COMBINE_RECIPES.md의 고유 서사 이름과 다르다
--    (예: "180 BPM 심장 폭발" → 055가 만든 "180 BPM의 심장" 책의 legendary 변형 중 하나).
--  - 재료 중 액티비티 배지(예: "R5 달리기의 연결")는 이번엔 매칭하지 않는다 — 그 이름들은
--    실제 시딩된 활동 배지가 아니라 기획 단계의 예시 라벨이라 자동 매칭 근거가 없음.
--    필요하면 /admin/recipes에서 "필수 액티비티 배지"를 수동으로 지정할 것(056에서 추가한 필드).
--  - 재료·결과 배지는 이름 키워드(ILIKE) 매칭으로 찾는다. 매칭 실패(재료 일부 또는 결과를
--    못 찾음) 시 해당 레시피는 조용히 건너뛴다 — 에러로 전체 마이그레이션을 막지 않음.
--    마이그레이션 끝의 검증 쿼리로 실제 삽입된 개수를 확인할 것.
-- ============================================================

WITH ingredient_kw(recipe_no, keyword) AS (
  VALUES
    (1,'떡볶이'), (1,'카페인 젤'),
    (2,'이불'), (2,'플레이리스트'),
    (3,'아스팔트 진흙'), (3,'렌즈 파편'),
    (4,'도토리'), (4,'프레임 조각'),
    (5,'전해질'), (5,'핫도그'),
    (6,'초시계'), (6,'프레임 조각'),
    (7,'중력 파편'), (7,'바람막이'),
    (8,'일몰 프레임'), (8,'플레이리스트'),
    (9,'러너스 하이'), (9,'초시계'),
    (10,'에너지 바'), (10,'티타늄 볼트'),
    (11,'편의점 맥주'), (11,'헤드폰'),
    (12,'타우린'), (12,'러너스 하이'),
    (13,'종이 지도'), (13,'체온'),
    (14,'중고거래'), (14,'내일의 운동화'),
    (15,'솔방울'), (15,'노을빛 필터'),
    (16,'심장 박동'), (16,'카페인 젤'),
    (17,'공간 파편'), (17,'떡볶이'),
    (18,'행운의 단추'), (18,'이불'),
    (19,'바람막이'), (19,'솔방울'),
    (20,'프레임 조각'), (20,'렌즈 파편'),
    (21,'전해질'), (21,'플레이리스트'),
    (22,'핫도그'), (22,'중고거래'),
    (23,'아스팔트 진흙'), (23,'열쇠 조각'),
    (24,'에너지 바'), (24,'편의점 맥주'),
    (25,'초시계'), (25,'내일의 운동화'),
    (26,'노을빛 필터'), (26,'헤드폰'),
    (27,'티타늄 볼트'), (27,'타우린'),
    (28,'러너스 하이'), (28,'중력 파편'),
    (29,'행운의 단추'), (29,'도토리'),
    (30,'떡볶이'), (30,'아스팔트 진흙'), (30,'도토리'), (30,'렌즈 파편'), (30,'프레임 조각'),
    (30,'플레이리스트'), (30,'카페인 젤'), (30,'초시계'), (30,'이불'),
    (31,'열쇠 조각'), (31,'종이 지도'),
    (32,'솔방울'), (32,'체온'),
    (33,'초시계'), (33,'공간 파편')
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
  SELECT
    recipe_no,
    array_agg(badge_id ORDER BY badge_id) AS ids,
    bool_and(badge_id IS NOT NULL) AS all_resolved
  FROM ingredient_resolved
  GROUP BY recipe_no
),
-- (recipe_no, 결과 아이템북, 목표 등급, 같은 (아이템북,등급) 조합 내에서 몇 번째 배지를 쓸지)
result_spec (recipe_no, item_book_id, rarity, pick_index) AS (
  VALUES
    (1, 'e5036bea-62f5-2124-3ce3-00b9a4a56970'::uuid, 'legendary'::badge_rarity, 0),  -- 비트마에스트로
    (2, '7ecbc840-6167-03a3-95b7-acca945951b1'::uuid, 'legendary'::badge_rarity, 0),  -- 낭만미식가
    (3, '2a8f481e-77ba-1876-c15c-5fc9965189f4'::uuid, 'mythic'::badge_rarity, 0),     -- 미스터리헌터
    (4, '8405301c-5dfe-4e35-55f6-1d869d1a1a91'::uuid, 'legendary'::badge_rarity, 0),  -- 아날로그수집가
    (5, '3a7f3fa1-08de-ad46-8c03-ac0ada645054'::uuid, 'legendary'::badge_rarity, 0),  -- 숲속갱단
    (6, 'e9b38bc8-a2fc-9dbf-378d-d22c8f90165b'::uuid, 'legendary'::badge_rarity, 0),  -- 아스팔트레인저
    (7, 'bf20a6e1-d3e3-989c-b2db-795287c711d6'::uuid, 'legendary'::badge_rarity, 0),  -- 포션연금술사
    (8, '2ca772e9-1ef9-938a-f793-b8e0e75c4914'::uuid, 'legendary'::badge_rarity, 0),  -- 작심삼일클럽
    (9, '321e6f64-f01d-d74e-9824-a80843e36d0e'::uuid, 'mythic'::badge_rarity, 0),     -- 셔터마피아
    (10, '2ca772e9-1ef9-938a-f793-b8e0e75c4914'::uuid, 'mythic'::badge_rarity, 0),    -- 작심삼일클럽
    (11, '82537749-38f9-ca1e-40f2-df95bc6ea05b'::uuid, 'legendary'::badge_rarity, 0), -- 장비병환자들
    (12, 'e9b38bc8-a2fc-9dbf-378d-d22c8f90165b'::uuid, 'mythic'::badge_rarity, 0),    -- 아스팔트레인저
    (13, '321e6f64-f01d-d74e-9824-a80843e36d0e'::uuid, 'legendary'::badge_rarity, 0), -- 셔터마피아
    (14, '3a7f3fa1-08de-ad46-8c03-ac0ada645054'::uuid, 'legendary'::badge_rarity, 1), -- 숲속갱단
    (15, '7ecbc840-6167-03a3-95b7-acca945951b1'::uuid, 'legendary'::badge_rarity, 1), -- 낭만미식가
    (16, '2a8f481e-77ba-1876-c15c-5fc9965189f4'::uuid, 'mythic'::badge_rarity, 1),    -- 미스터리헌터
    (17, '8405301c-5dfe-4e35-55f6-1d869d1a1a91'::uuid, 'mythic'::badge_rarity, 0),    -- 아날로그수집가
    (18, '82537749-38f9-ca1e-40f2-df95bc6ea05b'::uuid, 'legendary'::badge_rarity, 1), -- 장비병환자들
    (19, 'bf20a6e1-d3e3-989c-b2db-795287c711d6'::uuid, 'legendary'::badge_rarity, 1), -- 포션연금술사
    (20, 'e5036bea-62f5-2124-3ce3-00b9a4a56970'::uuid, 'legendary'::badge_rarity, 1), -- 비트마에스트로
    (21, 'e9b38bc8-a2fc-9dbf-378d-d22c8f90165b'::uuid, 'legendary'::badge_rarity, 1), -- 아스팔트레인저
    (22, '2ca772e9-1ef9-938a-f793-b8e0e75c4914'::uuid, 'legendary'::badge_rarity, 1), -- 작심삼일클럽
    (23, '8405301c-5dfe-4e35-55f6-1d869d1a1a91'::uuid, 'mythic'::badge_rarity, 1),    -- 아날로그수집가
    (24, '321e6f64-f01d-d74e-9824-a80843e36d0e'::uuid, 'legendary'::badge_rarity, 1), -- 셔터마피아
    (25, '3a7f3fa1-08de-ad46-8c03-ac0ada645054'::uuid, 'legendary'::badge_rarity, 2), -- 숲속갱단
    (26, 'bf20a6e1-d3e3-989c-b2db-795287c711d6'::uuid, 'legendary'::badge_rarity, 2), -- 포션연금술사
    (27, '3a7f3fa1-08de-ad46-8c03-ac0ada645054'::uuid, 'mythic'::badge_rarity, 0),    -- 숲속갱단
    (28, 'e5036bea-62f5-2124-3ce3-00b9a4a56970'::uuid, 'mythic'::badge_rarity, 0),    -- 비트마에스트로
    (29, '7ecbc840-6167-03a3-95b7-acca945951b1'::uuid, 'legendary'::badge_rarity, 2), -- 낭만미식가
    (30, '2a8f481e-77ba-1876-c15c-5fc9965189f4'::uuid, 'mythic'::badge_rarity, 2),    -- 미스터리헌터
    (31, '7ecbc840-6167-03a3-95b7-acca945951b1'::uuid, 'mythic'::badge_rarity, 0),    -- 낭만미식가
    (32, 'bf20a6e1-d3e3-989c-b2db-795287c711d6'::uuid, 'mythic'::badge_rarity, 0),    -- 포션연금술사
    (33, '82537749-38f9-ca1e-40f2-df95bc6ea05b'::uuid, 'mythic'::badge_rarity, 0)     -- 장비병환자들
),
result_resolved AS (
  SELECT
    rs.recipe_no,
    (
      SELECT b.id FROM public.badges b
      WHERE b.item_book_id = rs.item_book_id AND b.rarity = rs.rarity
      ORDER BY b.id OFFSET rs.pick_index LIMIT 1
    ) AS result_badge_id
  FROM result_spec rs
)
INSERT INTO public.combination_recipes (ingredient_badge_ids, result_badge_id, success_rate, is_public, hint_text)
SELECT ia.ids, rr.result_badge_id, 1.0, false, NULL
FROM ingredient_agg ia
JOIN result_resolved rr ON rr.recipe_no = ia.recipe_no
WHERE ia.all_resolved
  AND rr.result_badge_id IS NOT NULL
  AND array_length(ia.ids, 1) BETWEEN 2 AND 10;

-- 검증: 몇 개 레시피가 실제로 삽입됐는지 확인 (33개 미만이면 일부 재료/결과 매칭 실패 —
-- 로그를 보고 /admin/recipes에서 수동 보완)
-- SELECT count(*) FROM public.combination_recipes;
