-- ============================================================
-- Migration 064: 조합 레시피 완전 초기화 후 재생성
--
-- 057(item_book_id 기준 결과 매칭) → 061(결과 배지 삭제로 result_badge_id NULL화)
-- → 063(faction_id 기준 재연결)을 거치며 상태가 꼬였다는 판단 하에, 기존
-- combination_recipes를 전부 지우고 현재 배지 상태(062 재생성분: item_book_id
-- 없이 faction_id만 있는 rare/legendary/mythic) 기준으로 처음부터 다시 만든다.
-- 재료 키워드는 057/063에서 검증된 것과 동일(실제 시딩 이름 확인 완료).
-- ============================================================

DELETE FROM public.combination_recipes;

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
-- (recipe_no, 결과 세력, 목표 등급, 같은 (세력,등급) 조합 내에서 몇 번째 배지를 쓸지)
result_spec (recipe_no, faction_id, rarity, pick_index) AS (
  VALUES
    (1, 'e33307bb-5191-5ad5-58e0-053b40cb09f0'::uuid, 'legendary'::badge_rarity, 0),  -- 비트마에스트로
    (2, 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'::uuid, 'legendary'::badge_rarity, 0),  -- 낭만미식가
    (3, '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'::uuid, 'mythic'::badge_rarity, 0),     -- 미스터리헌터
    (4, 'd6969aef-2039-c997-4b55-a7ee861b32c5'::uuid, 'legendary'::badge_rarity, 0),  -- 아날로그수집가
    (5, '73f0f601-2382-900c-8ca2-5cc7c93ed95d'::uuid, 'legendary'::badge_rarity, 0),  -- 숲속갱단
    (6, '7a91727e-e2e1-b7f7-45f0-899ce04716bd'::uuid, 'legendary'::badge_rarity, 0),  -- 아스팔트레인저
    (7, '68f3673f-7d73-996b-b4b9-49600d0f2615'::uuid, 'legendary'::badge_rarity, 0),  -- 포션연금술사
    (8, 'e9e608d7-812c-4139-88c4-81d129076e3f'::uuid, 'legendary'::badge_rarity, 0),  -- 작심삼일클럽
    (9, '672acbec-74d3-f36c-28e9-42563dda8e13'::uuid, 'mythic'::badge_rarity, 0),     -- 셔터마피아
    (10, 'e9e608d7-812c-4139-88c4-81d129076e3f'::uuid, 'mythic'::badge_rarity, 0),    -- 작심삼일클럽
    (11, '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'::uuid, 'legendary'::badge_rarity, 0), -- 장비병환자들
    (12, '7a91727e-e2e1-b7f7-45f0-899ce04716bd'::uuid, 'mythic'::badge_rarity, 0),    -- 아스팔트레인저
    (13, '672acbec-74d3-f36c-28e9-42563dda8e13'::uuid, 'legendary'::badge_rarity, 0), -- 셔터마피아
    (14, '73f0f601-2382-900c-8ca2-5cc7c93ed95d'::uuid, 'legendary'::badge_rarity, 1), -- 숲속갱단
    (15, 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'::uuid, 'legendary'::badge_rarity, 1), -- 낭만미식가
    (16, '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'::uuid, 'mythic'::badge_rarity, 1),    -- 미스터리헌터
    (17, 'd6969aef-2039-c997-4b55-a7ee861b32c5'::uuid, 'mythic'::badge_rarity, 0),    -- 아날로그수집가
    (18, '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'::uuid, 'legendary'::badge_rarity, 1), -- 장비병환자들
    (19, '68f3673f-7d73-996b-b4b9-49600d0f2615'::uuid, 'legendary'::badge_rarity, 1), -- 포션연금술사
    (20, 'e33307bb-5191-5ad5-58e0-053b40cb09f0'::uuid, 'legendary'::badge_rarity, 1), -- 비트마에스트로
    (21, '7a91727e-e2e1-b7f7-45f0-899ce04716bd'::uuid, 'legendary'::badge_rarity, 1), -- 아스팔트레인저
    (22, 'e9e608d7-812c-4139-88c4-81d129076e3f'::uuid, 'legendary'::badge_rarity, 1), -- 작심삼일클럽
    (23, 'd6969aef-2039-c997-4b55-a7ee861b32c5'::uuid, 'mythic'::badge_rarity, 1),    -- 아날로그수집가
    (24, '672acbec-74d3-f36c-28e9-42563dda8e13'::uuid, 'legendary'::badge_rarity, 1), -- 셔터마피아
    (25, '73f0f601-2382-900c-8ca2-5cc7c93ed95d'::uuid, 'legendary'::badge_rarity, 2), -- 숲속갱단
    (26, '68f3673f-7d73-996b-b4b9-49600d0f2615'::uuid, 'legendary'::badge_rarity, 2), -- 포션연금술사
    (27, '73f0f601-2382-900c-8ca2-5cc7c93ed95d'::uuid, 'mythic'::badge_rarity, 0),    -- 숲속갱단
    (28, 'e33307bb-5191-5ad5-58e0-053b40cb09f0'::uuid, 'mythic'::badge_rarity, 0),    -- 비트마에스트로
    (29, 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'::uuid, 'legendary'::badge_rarity, 2), -- 낭만미식가
    (30, '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'::uuid, 'mythic'::badge_rarity, 2),    -- 미스터리헌터
    (31, 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'::uuid, 'mythic'::badge_rarity, 0),    -- 낭만미식가
    (32, '68f3673f-7d73-996b-b4b9-49600d0f2615'::uuid, 'mythic'::badge_rarity, 0),    -- 포션연금술사
    (33, '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'::uuid, 'mythic'::badge_rarity, 0)     -- 장비병환자들
),
result_resolved AS (
  SELECT
    rs.recipe_no,
    (
      SELECT b.id FROM public.badges b
      WHERE b.faction_id = rs.faction_id AND b.rarity = rs.rarity AND b.type = 'item'
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

-- 검증: SELECT count(*) FROM combination_recipes; → 33이어야 정상
