-- ============================================================
-- Migration 054: 아이템 조합 v2 — 확률형 세계관 융합 + 피티 시스템
--
-- 배경(대화 세션 기준 확정 정책):
-- 1. 재료 2~10개, 재료가 속한 세계관을 "제외한" 세계관에서 결과가 나온다.
-- 2. 결과는 두 갈래로 나뉜다.
--    a) 정석 레시피(combination_recipes 정확 매칭) → 레전드/미스틱 확정 (기존 로직 유지)
--    b) 비매칭 임의 조합 → 세계관 다양성 티어에 따른 확률로 "다른 세계관 최하위 등급 n개"
--       또는 실패(재료만 소각)
-- 3. 실패는 완전 빈손이 아니라 "연속 실패 피티"로 완충한다.
--    - 성공 확률 보정: 실패 1회차부터 즉시 미세 상승 (상한 있음)
--    - 포인트 보상: 일정 연속 실패 임계치 이후에만 지급 시작, 계단식 소폭 증가 (별도 상한)
--    - 두 상한은 서로 독립적으로 관리한다.
--
-- 절대 하지 마: 정석 레시피 매칭 경로에는 피티 확률 보정을 적용하지 않는다
--   (레시피 발견의 가치가 확률형 트랙보다 항상 우월해야 하므로).
-- ============================================================

-- ----------------------------------------------------------------
-- 1. combine_policy — 싱글톤 정책 (drop_policy/abusing_policy와 동일 패턴)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.combine_policy (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- 세계관 다양성 티어 — 재료 개수 상한 + 최소 서로 다른 세계관 수 요건
  -- (요건 미충족 시 하위 티어로 강등)
  tier1_max_items     INTEGER NOT NULL DEFAULT 3,
  tier1_min_factions  INTEGER NOT NULL DEFAULT 1,
  tier1_b_rate        NUMERIC(4,3) NOT NULL DEFAULT 0.35,
  tier1_b_count       INTEGER NOT NULL DEFAULT 1,

  tier2_max_items     INTEGER NOT NULL DEFAULT 6,
  tier2_min_factions  INTEGER NOT NULL DEFAULT 3,
  tier2_b_rate        NUMERIC(4,3) NOT NULL DEFAULT 0.45,
  tier2_b_count       INTEGER NOT NULL DEFAULT 2,

  tier3_max_items     INTEGER NOT NULL DEFAULT 10,
  tier3_min_factions  INTEGER NOT NULL DEFAULT 5,
  tier3_b_rate        NUMERIC(4,3) NOT NULL DEFAULT 0.55,
  tier3_b_count       INTEGER NOT NULL DEFAULT 3,

  -- 피티 — 성공 확률 보정 (실패 1회차부터 즉시 적용, 정석 레시피 경로 제외)
  pity_prob_increment NUMERIC(4,3) NOT NULL DEFAULT 0.03,
  pity_prob_cap        NUMERIC(4,3) NOT NULL DEFAULT 0.50,

  -- 피티 — 포인트 보상 (임계 연속실패 이후부터, 계단식, 보수적으로 소액)
  pity_points_start_streak INTEGER NOT NULL DEFAULT 3,
  pity_points_base         INTEGER NOT NULL DEFAULT 5,
  pity_points_step         INTEGER NOT NULL DEFAULT 3,
  pity_points_increment    INTEGER NOT NULL DEFAULT 3,
  pity_points_cap          INTEGER NOT NULL DEFAULT 30,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.combine_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. user_combine_state — 유저별 연속 실패 스트릭 (전역 1개 카운터)
--    패턴: user_drop_state와 동일 — lazy upsert
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_combine_state (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  consecutive_fail_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_combine_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_combine_state_select_own ON public.user_combine_state;
CREATE POLICY user_combine_state_select_own ON public.user_combine_state
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 3. point_transactions.reason — 'combine_pity_reward' 사유 추가
-- ----------------------------------------------------------------
ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_reason_check;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_reason_check CHECK (reason IN (
  'badge_point_reward',
  'mission_point_reward',
  'admin_grant',
  'admin_deduct',
  'combine_pity_reward'
));

-- ----------------------------------------------------------------
-- 4. combination_recipes — 재료 개수 범위를 2~3 → 2~10으로 확장
-- ----------------------------------------------------------------
ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_ingredient_count_check;
ALTER TABLE public.combination_recipes ADD CONSTRAINT combination_recipes_ingredient_count_check
  CHECK (array_length(ingredient_badge_ids, 1) BETWEEN 2 AND 10);
