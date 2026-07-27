-- ============================================================
-- Migration 057: 세계관 융합 정석 레시피 33종 시딩 (PRD/badge/COMBINE_RECIPES.md)
--
-- 방침(사용자 결정):
--  - 새 배지를 만들지 않고 055에서 생성된 기존 legendary/mythic 아이템 배지를 재활용한다.
--    따라서 실제 지급되는 배지 이름은 COMBINE_RECIPES.md의 고유 서사 이름과 다르다
--    (예: "180 BPM 심장 폭발" → 055가 만든 "180 BPM의 심장" 책의 legendary 변형 중 하나).
--  - 재료 중 액티비티 배지(예: "R5 달리기의 연결")는 매칭하지 않는다 — 그 이름들은
--    실제 시딩된 활동 배지가 아니라 기획 단계의 예시 라벨이라 자동 매칭 근거가 없음.
--    필요하면 /admin/recipes에서 "필수 액티비티 배지"를 수동으로 지정할 것(056에서 추가).
--  - 재료 키워드는 실제 DB에 시딩된 아이템 이름을 세션 중 직접 조회해 확정한 값이다
--    (최초 시도는 추측 키워드라 28/33개가 매칭 실패했고, 진단 쿼리로 실제 이름을 찾아
--    이 버전으로 교정 — 2026-07-27 실행 결과 33/33 전량 삽입 확인).
-- ============================================================

WITH ingredient_kw(recipe_no, keyword) AS (
  VALUES
    (1,'고카페인 알약'), (1,'고카페인 알약'),
    (2,'이불'), (2,'플레이리스트'),
    (3,'진흙 묻은 고어텍스'), (3,'다차원 카메라 렌즈'),
    (4,'도토리'), (4,'카본 프레임 보호재'),
    (5,'전해질'), (5,'핫도그'),
    (6,'초시계'), (6,'카본 프레임 보호재'),
    (7,'무중력의 파편'), (7,'물먹은 방수 자켓'),
    (8,'노을빛 필름 조각'), (8,'플레이리스트'),
    (9,'데자뷔의 뇌파 조각'), (9,'초시계'),
    (10,'에너지 바'), (10,'티타늄 볼트'),
    (11,'구겨진 캔맥주'), (11,'엉켜버린 유선 이어폰'),
    (12,'아드레날린 앰플'), (12,'데자뷔의 뇌파 조각'),
    (13,'종이 지도'), (13,'물먹은 방수 양말'),
    (14,'중고거래'), (14,'풀려버린 운동화 끈'),
    (15,'바스라진 단풍잎'), (15,'노을빛 필름 조각'),
    (16,'심장 박동'), (16,'고카페인 알약'),
    (17,'일그러진 공간의 파편'), (17,'떡볶이'),
    (18,'빛나는 놋쇠 단추'), (18,'이불'),
    (19,'물먹은 방수 자켓'), (19,'바스라진 단풍잎'),
    (20,'카본 프레임 보호재'), (20,'다차원 카메라 렌즈'),
    (21,'전해질'), (21,'플레이리스트'),
    (22,'핫도그'), (22,'중고거래'),
    (23,'진흙 묻은 고어텍스'), (23,'화이트 룸의 입장 열쇠'),
    (24,'에너지 바'), (24,'구겨진 캔맥주'),
    (25,'초시계'), (25,'풀려버린 운동화 끈'),
    (26,'노을빛 필름 조각'), (26,'엉켜버린 유선 이어폰'),
    (27,'티타늄 볼트'), (27,'아드레날린 앰플'),
    (28,'데자뷔의 뇌파 조각'), (28,'무중력의 파편'),
    (29,'빛나는 놋쇠 단추'), (29,'도토리'),
    (30,'떡볶이'), (30,'진흙 묻은 고어텍스'), (30,'도토리'), (30,'다차원 카메라 렌즈'), (30,'카본 프레임 보호재'),
    (30,'플레이리스트'), (30,'고카페인 알약'), (30,'초시계'), (30,'이불'),
    (31,'화이트 룸의 입장 열쇠'), (31,'종이 지도'),
    (32,'바스라진 단풍잎'), (32,'물먹은 방수 양말'),
    (33,'초시계'), (33,'일그러진 공간의 파편')
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

-- 검증: SELECT count(*) FROM public.combination_recipes; → 33이어야 정상
