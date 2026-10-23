-- 287_combine_policy_tier_up_probability.sql
-- JAM 2.0 등급 올리기 «컬렉션 고르기 + 윗등급 70%» (티켓 20261023_1648 = 7-7b, 1회 / 상위 20261022_1131, 모의 실험 20261023_1308)
--
-- 믹스 정책 싱글톤(combine_policy)에 칸 하나만 덧붙인다(확장 단계). 옛 칸·옛 표·옛 함수는 바꾸지 않는다.
-- 이 칸을 읽는 코드(서버 규칙·확률 안내·어드민 칸)는 2·4회에서 나간다. 옛 프로덕션 코드는 이 칸을 모르고 계속 동작한다.
-- 번호 287: 2026-10-23 origin/staging의 마이그레이션 최대 번호는 286이고, 원격 브랜치 어디에도 287 이상은 없다(283은 7-7a 1회에서 폐기).
--
-- 배경
--   - 등급 올리기(같은 등급 5개 → 윗등급 1개)는 «유저가 고른 컬렉션 안에서 균등하게 아이템을 뽑되, 결과 등급은 재료 등급의 바로 위가
--     윗등급 확률, 같은 등급이 나머지»로 바뀐다(사용자 결정 2026-10-23). 이 윗등급 확률을 밸런스 설정에서 바꿀 수 있는 한 칸으로 둔다.
--   - 윗등급 확률은 한 칸이다. 재료 등급마다 따로 두지 않는다(Epic 5개가 Mystic이 될 확률도 같은 값).
--
-- 규칙
--   - combine_policy.tier_up_probability
--       NUMERIC NOT NULL DEFAULT 0.7, 0 이상 1 이하(CHECK). 0.7 = 윗등급 70%, 같은 등급 30%. 어드민에는 «%»로 보인다.
--       기본값이 있는 NOT NULL 칸이라 싱글톤 id=1 행이 즉시 0.7로 채워지고, 기존 INSERT/UPSERT(이 칸을 모르는 옛 코드)도 그대로 성공한다.
--   - RLS·권한은 바꾸지 않는다(칸 추가만이라 표 단위 설정을 그대로 따른다).
--   - 코드(lib/combine/policy.ts)의 DEFAULT_COMBINE_POLICY.tier_up_probability = 0.7이 이 DEFAULT와 같고, 칸이 DB에 없어도(이 SQL 적용 전)
--     getCombinePolicy는 기본값 0.7로 움직인다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'combine_policy' AND column_name = 'tier_up_probability';            -- 0행 (아직 없음)
--   SELECT id, fail_reward_points, updated_at FROM public.combine_policy;                                                 -- 싱글톤 id=1 한 행
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'combine_policy' AND column_name = 'tier_up_probability';            -- tier_up_probability, numeric, NO, 0.7
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.combine_policy'::regclass AND contype = 'c' AND conname LIKE '%tier_up_probability%';       -- CHECK ((tier_up_probability >= 0) AND (tier_up_probability <= 1))
--   SELECT id, fail_reward_points, tier_up_probability FROM public.combine_policy;                                        -- 싱글톤 한 행의 tier_up_probability = 0.7

ALTER TABLE public.combine_policy
  ADD COLUMN IF NOT EXISTS tier_up_probability NUMERIC NOT NULL DEFAULT 0.7
    CHECK (tier_up_probability >= 0 AND tier_up_probability <= 1);

COMMENT ON COLUMN public.combine_policy.tier_up_probability IS
  '등급 올리기(같은 등급 5개)에서 결과 등급이 재료 등급의 바로 위일 확률(0~1). 나머지는 같은 등급이다. 재료 등급마다 따로 두지 않는 한 칸. 기본 0.7. 티켓 20261023_1648.';

-- 되돌림 SQL
-- ALTER TABLE public.combine_policy DROP COLUMN IF EXISTS tier_up_probability;
