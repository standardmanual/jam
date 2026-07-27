-- ============================================================
-- Migration 055: 아이템북 등급 정책 + 기존 아이템 배지의 rare/legendary/mythic 티어 생성
--
-- 배경: 019_seed_worldview.sql로 시딩된 900개 아이템 배지가 전부 rarity='common'뿐이었음
--  (레전드/미스틱 아이템 배지는 012_item_badges_100.sql에 있었으나 item_book_id가 없는
--   고아 배지라 027에서 이미 삭제됨 — 세력에 귀속된 상위 등급 아이템은 이번이 최초).
--
-- 1. item_books.rarity_mode — 책 내 아이템 등급 정책. 'mixed'(등급무관, 기본값) 또는
--    'uniform'(동일한 등급 — uniform_rarity 하나로 고정). 기존 책은 전부 기본값(mixed)으로
--    유지(요청사항: "현재 생성된 모든 아이템북의 기본값은 등급무관").
-- 2. 기존 common 아이템 배지 전부에 대해 세력별 접두어 템플릿으로 rare/legendary/mythic
--    짝을 생성. 같은 item_book_id/faction_id/activity_types/drop_weight를 물려받는다.
-- ============================================================

ALTER TABLE public.item_books
  ADD COLUMN IF NOT EXISTS rarity_mode TEXT NOT NULL DEFAULT 'mixed'
    CHECK (rarity_mode IN ('mixed', 'uniform')),
  ADD COLUMN IF NOT EXISTS uniform_rarity TEXT
    CHECK (uniform_rarity IN ('common', 'rare', 'legendary', 'mythic'));

COMMENT ON COLUMN public.item_books.rarity_mode IS
  '''mixed''(등급무관, 기본값): 책 내 아이템이 자유롭게 여러 등급을 가짐. ''uniform''(동일한 등급): uniform_rarity 하나로 고정.';
COMMENT ON COLUMN public.item_books.uniform_rarity IS
  'rarity_mode=''uniform''일 때만 사용 — 이 책의 모든 아이템에 적용할 고정 등급.';

-- ----------------------------------------------------------------
-- 세력별 등급 접두어 + 등급별 설명 접미어로 common → rare/legendary/mythic 생성
-- ----------------------------------------------------------------
WITH tier_prefix (faction_id, rare_prefix, legendary_prefix, mythic_prefix) AS (
  VALUES
    ('defa02b9-c4b6-af0d-dc99-c43c278a78d8'::uuid, '곱빼기 ', '명물 ', '전설의 맛집 '),        -- 낭만 미식가
    ('7a91727e-e2e1-b7f7-45f0-899ce04716bd'::uuid, '혹한기 ', '생존왕의 ', '블랙 트랙 전설의 '), -- 아스팔트 레인저
    ('73f0f601-2382-900c-8ca2-5cc7c93ed95d'::uuid, '고급장물 ', '보스의 ', '전설의 그루터기 '),  -- 숲속의 갱단
    ('672acbec-74d3-f36c-28e9-42563dda8e13'::uuid, '선명한 ', '매직아워 ', '영원의 프레임 '),    -- 셔터 마피아
    ('1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'::uuid, '리미티드 ', '풀커스텀 ', '카본 앨리 전설의 '), -- 장비병 환자들
    ('e33307bb-5191-5ad5-58e0-053b40cb09f0'::uuid, '고음질 ', '명반 ', '180 BPM 전설의 '),      -- 비트 마에스트로
    ('68f3673f-7d73-996b-b4b9-49600d0f2615'::uuid, '농축 ', '비약 ', '태초의 '),               -- 포션 연금술사
    ('d6969aef-2039-c997-4b55-a7ee861b32c5'::uuid, '빈티지 ', '골동품 ', '분실물센터 전설의 '),  -- 아날로그 수집가
    ('e9e608d7-812c-4139-88c4-81d129076e3f'::uuid, '3일차 극복 ', '결국 해낸 ', '섬데이 돌파의 '), -- 작심삼일 클럽
    ('24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'::uuid, '일그러진 ', '차원 너머의 ', '화이트 룸 전설의 ') -- 미스터리 헌터
),
source AS (
  SELECT b.id, b.name, b.description, b.item_book_id, b.faction_id, b.activity_types, b.drop_weight
  FROM public.badges b
  WHERE b.type = 'item' AND b.rarity = 'common'
)
INSERT INTO public.badges (name, description, type, rarity, item_book_id, faction_id, activity_types, drop_weight)
SELECT
  COALESCE(tp.rare_prefix, '레어 ') || s.name,
  s.description || ' 흔치 않은 개체 — 남들과는 조금 다른 존재감을 지닙니다.',
  'item', 'rare', s.item_book_id, s.faction_id, s.activity_types, s.drop_weight
FROM source s LEFT JOIN tier_prefix tp ON tp.faction_id = s.faction_id

UNION ALL

SELECT
  COALESCE(tp.legendary_prefix, '레전드 ') || s.name,
  s.description || ' 손에 넣는 순간 주변의 시선이 집중되는, 좀처럼 보기 힘든 물건입니다.',
  'item', 'legendary', s.item_book_id, s.faction_id, s.activity_types, s.drop_weight
FROM source s LEFT JOIN tier_prefix tp ON tp.faction_id = s.faction_id

UNION ALL

SELECT
  COALESCE(tp.mythic_prefix, '미스틱 ') || s.name,
  s.description || ' 존재 자체가 소문으로만 떠돌던, 극소수만이 손에 넣어본 전설의 물건입니다.',
  'item', 'mythic', s.item_book_id, s.faction_id, s.activity_types, s.drop_weight
FROM source s LEFT JOIN tier_prefix tp ON tp.faction_id = s.faction_id;
