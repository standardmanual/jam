-- ============================================================
-- Migration 174: 믹스 레시피 슬롯 기반 OR 매칭 재설계
-- 티켓: 20260917_1427
--
-- 배경: 기존(마이그레이션 153)은 레시피당 재료 조합이 정확히 하나만 허용됐다
-- (`ingredient_badge_ids`·`required_badge_ids` 배열과 유저 투입 집합의 완전 일치).
-- 슬롯 개념을 도입해 "이 자리에 넣을 수 있는 배지 후보 목록(OR)"을 어드민이 지정하고,
-- 유저는 슬롯 하나당 배지 하나만 채우는 구조로 확장한다.
--
-- 소각 여부는 슬롯 컬럼이 아니라 badge_type 값으로 항상 고정 결정한다
-- (item = 소각, activity|checkin = 비소각) — 별도 토글을 두지 않아 어드민 실수 여지를 없앤다.
--
-- 안전성: 프로덕션 combination_recipes 등록 건수가 어드민 등록 이후 아직 미미하다
-- (선행 티켓 20260910_1408 기준 0건). 실행 전 실측 후 진행할 것.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. combination_recipe_slots — 슬롯 신설
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.combination_recipe_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.combination_recipes(id) ON DELETE CASCADE,
  slot_order INTEGER NOT NULL,
  badge_type TEXT NOT NULL CHECK (badge_type IN ('item', 'activity', 'checkin')),
  allowed_badge_ids UUID[] NOT NULL CHECK (array_length(allowed_badge_ids, 1) >= 1),
  UNIQUE (recipe_id, slot_order)
);

CREATE INDEX IF NOT EXISTS combination_recipe_slots_recipe_id_idx
  ON public.combination_recipe_slots (recipe_id);

COMMENT ON TABLE public.combination_recipe_slots IS
  '믹스 레시피 슬롯 — 슬롯 하나에 배지 후보(OR) 여러 개를 지정한다. 유저는 슬롯당 후보 중
   하나만 채우면 그 슬롯이 충족되고, 전체 슬롯이 충족되면 레시피 매칭 성공이다.';
COMMENT ON COLUMN public.combination_recipe_slots.badge_type IS
  '슬롯 단위로 고정되는 배지 타입 — 같은 슬롯 안 후보는 전부 이 타입이어야 한다(어드민
   UI·API 양쪽에서 검증). item이면 매칭 시 항상 소각, activity|checkin이면 항상 비소각.';
COMMENT ON COLUMN public.combination_recipe_slots.allowed_badge_ids IS
  '이 슬롯에 넣을 수 있는 배지 후보(OR) — 유저는 이 중 하나만 대응/보유하면 슬롯 충족.';

-- ----------------------------------------------------------------
-- 2. combination_recipes — 재료 배열 컬럼 제거(슬롯 구조로 완전 대체)
-- ----------------------------------------------------------------
ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_ingredient_count_check;

ALTER TABLE public.combination_recipes
  DROP COLUMN IF EXISTS ingredient_badge_ids,
  DROP COLUMN IF EXISTS required_badge_ids;
