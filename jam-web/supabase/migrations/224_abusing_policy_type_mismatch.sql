-- 224_abusing_policy_type_mismatch.sql
-- 종목과 움직임이 맞지 않는 활동의 판정 기준값 (티켓 20261017_1421 2회, 운영 로직 16.2절)
--
-- abusing_policy(싱글톤 id=1)에 칸 2개를 더한다. 둘 다 NOT NULL DEFAULT라 기존 행에는 기본값이 채워지고, 칸 이름을
-- 모르는 옛 프로덕션 코드는 영향을 받지 않는다. 기존 칸의 뜻과 값은 바꾸지 않는다.
--
-- 규칙(운영 로직 16.2절)
--   - 러닝으로 기록했는데 평균 속도가 mismatch_run_min_speed_kmh(6km/h)보다 느리면 걷기(가벼움)로 계산한다.
--   - 자전거로 기록했는데 평균 속도가 mismatch_cycling_min_speed_kmh(10km/h)보다 느리면 걷기(가벼움)로 계산한다.
--   - 트레일러닝과 등산은 판정하지 않는다.
--   - 기본값 6, 10은 src/lib/abusing/policy.ts의 DEFAULT_POLICY와 반드시 같은 값을 유지한다.
--   - 기준값은 어뷰징 정책 화면에서 바꾼다(코드는 이 값을 읽어 판정한다).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT mismatch_run_min_speed_kmh, mismatch_cycling_min_speed_kmh FROM public.abusing_policy WHERE id = 1;   -- 6, 10

ALTER TABLE public.abusing_policy
  ADD COLUMN IF NOT EXISTS mismatch_run_min_speed_kmh     INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS mismatch_cycling_min_speed_kmh INTEGER NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.abusing_policy.mismatch_run_min_speed_kmh IS
  '러닝으로 기록했는데 평균 속도(km/h)가 이 값보다 느리면 걷기(가벼움)로 계산한다. 트레일러닝과 등산은 판정하지 않는다. 기본 6.';
COMMENT ON COLUMN public.abusing_policy.mismatch_cycling_min_speed_kmh IS
  '자전거로 기록했는데 평균 속도(km/h)가 이 값보다 느리면 걷기(가벼움)로 계산한다. 기본 10.';

-- 되돌림 SQL
-- 새로 만든 칸만 지운다. 이 칸을 읽는 새 코드(policy.ts의 불일치 기준값, 어뷰징 정책 화면)는 같은 시점에 되돌려야 한다.
-- ALTER TABLE public.abusing_policy DROP COLUMN IF EXISTS mismatch_cycling_min_speed_kmh;
-- ALTER TABLE public.abusing_policy DROP COLUMN IF EXISTS mismatch_run_min_speed_kmh;
