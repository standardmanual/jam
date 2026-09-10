-- ============================================================
-- Migration 153: 믹스 v3 — 재료 타입 확장 · 보상 구조 재설계 · 경로 B/피티 폐기
-- 티켓: 20260910_1408
--
-- 배경:
--  1) 경로 B(트라이브 다양성 확률 보상)는 카탈로그 현실과 어긋난 채 방치돼 있었다.
--     아이템 배지를 보유한 트라이브가 2종뿐이라 "소재 트라이브를 제외한" 후보가
--     0종이 되는 인센티브 역전이 실제로 발생했고, tier2/tier3 다양성 임계값
--     (3종/5종)은 도달 자체가 불가능했다.
--  2) 피티(연속 실패 보정)는 지급 이력이 0건이다.
--  3) 재료는 아이템 배지만 지정할 수 있었고 보유 조건은 액티비티 배지 1개가 상한이었다.
--
-- 결정(2026-09-10): 믹스를 「레시피 정확 매칭 → 지정 보상 확정 지급」과
--  「미매칭 → 고정 포인트」 두 갈래로 단순화한다. 배지 지급은 어드민이 등록한
--  레시피를 통해서만 일어난다.
--
-- 안전성: 프로덕션 combination_recipes 0건 · 피티 포인트 지급 이력 0건 ·
--  user_combine_state 1행 — 컬럼 교체로 손실되는 운영 데이터가 없다.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. combination_recipes — 재료 타입 확장 + 보상 구조 재설계
-- ----------------------------------------------------------------

-- 보유 조건: 액티비티 배지 1개(단일 컬럼) → 액티비티·체크인 배지 다중(배열)
ALTER TABLE public.combination_recipes
  ADD COLUMN IF NOT EXISTS required_badge_ids UUID[] NOT NULL DEFAULT '{}';

-- 보상: 결과 배지 1종 + 성공률 → 고정 포인트 + 배지 다중(전부 확정 지급)
ALTER TABLE public.combination_recipes
  ADD COLUMN IF NOT EXISTS reward_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_badge_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE public.combination_recipes
  DROP COLUMN IF EXISTS required_activity_badge_id,
  DROP COLUMN IF EXISTS result_badge_id,
  DROP COLUMN IF EXISTS success_rate;

-- 재료(소각 대상 아이템 배지)는 여전히 2~10개여야 한다.
ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_ingredient_count_check;
ALTER TABLE public.combination_recipes ADD CONSTRAINT combination_recipes_ingredient_count_check
  CHECK (array_length(ingredient_badge_ids, 1) BETWEEN 2 AND 10);

-- 보상이 하나도 없는 레시피는 매칭돼도 줄 것이 없다 — 저장 단계에서 막는다.
ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_reward_present_check;
ALTER TABLE public.combination_recipes ADD CONSTRAINT combination_recipes_reward_present_check
  -- 빈 배열의 array_length는 NULL이라 그냥 비교하면 CHECK이 NULL(=통과)로 새어나간다.
  CHECK (reward_points > 0 OR COALESCE(array_length(reward_badge_ids, 1), 0) >= 1);

ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_reward_points_check;
ALTER TABLE public.combination_recipes ADD CONSTRAINT combination_recipes_reward_points_check
  CHECK (reward_points >= 0);

COMMENT ON COLUMN public.combination_recipes.ingredient_badge_ids IS
  '소각되는 재료 — 아이템 배지만. 유저가 투입한 아이템 배지 집합과 순서 무관 완전 일치해야 매칭된다.';
COMMENT ON COLUMN public.combination_recipes.required_badge_ids IS
  '소각되지 않는 보유 조건 — 액티비티·체크인 배지. 전부 보유해야 매칭된다.';
COMMENT ON COLUMN public.combination_recipes.reward_points IS
  '매칭 성공 시 확정 지급하는 잼 포인트. 0이면 미지급.';
COMMENT ON COLUMN public.combination_recipes.reward_badge_ids IS
  '매칭 성공 시 확정 지급하는 배지 — 무작위 추첨 없이 전부 지급한다.';

-- ----------------------------------------------------------------
-- 2. combine_policy — 티어 12개 · 피티 7개 컬럼 제거, fail_reward_points만 남김
--    싱글톤(id=1) 구조는 그대로 유지한다.
-- ----------------------------------------------------------------
-- 기본값 10 — 마이그레이션 직후 미매칭 실패가 완전 빈손이 되지 않게 한다.
-- (피티가 폐기되면서 실패 시 유일한 보상 경로가 이 컬럼 하나다)
ALTER TABLE public.combine_policy
  ADD COLUMN IF NOT EXISTS fail_reward_points INTEGER NOT NULL DEFAULT 10;
-- 이미 컬럼이 있던 환경(DEFAULT 0으로 만들어진 경우)에도 기본값·현재값을 10으로 맞춘다.
ALTER TABLE public.combine_policy ALTER COLUMN fail_reward_points SET DEFAULT 10;

ALTER TABLE public.combine_policy
  DROP COLUMN IF EXISTS tier1_max_items,
  DROP COLUMN IF EXISTS tier1_min_tribes,
  DROP COLUMN IF EXISTS tier1_b_rate,
  DROP COLUMN IF EXISTS tier1_b_count,
  DROP COLUMN IF EXISTS tier2_max_items,
  DROP COLUMN IF EXISTS tier2_min_tribes,
  DROP COLUMN IF EXISTS tier2_b_rate,
  DROP COLUMN IF EXISTS tier2_b_count,
  DROP COLUMN IF EXISTS tier3_max_items,
  DROP COLUMN IF EXISTS tier3_min_tribes,
  DROP COLUMN IF EXISTS tier3_b_rate,
  DROP COLUMN IF EXISTS tier3_b_count,
  DROP COLUMN IF EXISTS pity_prob_increment,
  DROP COLUMN IF EXISTS pity_prob_cap,
  DROP COLUMN IF EXISTS pity_points_start_streak,
  DROP COLUMN IF EXISTS pity_points_base,
  DROP COLUMN IF EXISTS pity_points_step,
  DROP COLUMN IF EXISTS pity_points_increment,
  DROP COLUMN IF EXISTS pity_points_cap;

ALTER TABLE public.combine_policy DROP CONSTRAINT IF EXISTS combine_policy_fail_reward_points_check;
ALTER TABLE public.combine_policy ADD CONSTRAINT combine_policy_fail_reward_points_check
  CHECK (fail_reward_points >= 0);

INSERT INTO public.combine_policy (id, fail_reward_points) VALUES (1, 10)
  ON CONFLICT (id) DO UPDATE SET fail_reward_points = 10;

COMMENT ON COLUMN public.combine_policy.fail_reward_points IS
  '레시피에 매칭되지 않았을 때 지급하는 고정 포인트(기본 10). 0이면 미지급.';

-- ----------------------------------------------------------------
-- 3. user_combine_fail_logs — 믹스 실패 이력 (어드민 조회 전용)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_combine_fail_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingredient_badge_ids UUID[] NOT NULL DEFAULT '{}',
  fail_reason TEXT NOT NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.user_combine_fail_logs DROP CONSTRAINT IF EXISTS user_combine_fail_logs_reason_check;
ALTER TABLE public.user_combine_fail_logs ADD CONSTRAINT user_combine_fail_logs_reason_check
  CHECK (fail_reason IN ('no_recipe_match', 'items_not_found', 'invalid_count'));

CREATE INDEX IF NOT EXISTS user_combine_fail_logs_user_attempted_idx
  ON public.user_combine_fail_logs (user_id, attempted_at DESC);

-- RLS: 어드민(service_role) 조회 전용. service_role은 RLS를 우회하므로 정책을 만들지
-- 않는다 = anon/authenticated에는 전부 거부된다(유저 화면 비노출).
ALTER TABLE public.user_combine_fail_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_combine_fail_logs IS
  '믹스 실패 이력(티켓 20260910_1408). 어드민 유저 상세에서만 조회한다. 피티가 폐기되면서 user_combine_state를 대체한다.';

-- ----------------------------------------------------------------
-- 4. user_combine_state 제거 — 피티 폐기로 참조하는 코드가 사라졌다
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS public.user_combine_state;

-- ----------------------------------------------------------------
-- 5. 포인트 사유 코드 — 폐기된 pity 개념 정리
--    피티가 사라졌으므로 'combine_pity_reward'를 'combine_fail_reward'로 rename한다
--    (「레시피 미매칭 시 고정 포인트」라는 실제 의미와 코드값을 일치시킨다).
--    지급 이력이 0건이므로 기존 행 마이그레이션은 필요 없다.
--
--    레시피 매칭 성공 보상 포인트는 'combine_recipe_reward'로 분리한다 — 성공 지급을
--    실패 보상 사유로 원장에 남기면 유저 포인트 내역·어드민 요약이 사실과 달라진다.
-- ----------------------------------------------------------------
ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_reason_check;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_reason_check CHECK (reason IN (
  'badge_point_reward',
  'mission_point_reward',
  'admin_grant',
  'admin_deduct',
  'combine_fail_reward',
  'combine_recipe_reward'
));
