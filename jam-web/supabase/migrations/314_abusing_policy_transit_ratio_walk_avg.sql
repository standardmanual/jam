-- 314: abusing_policy에 교통수단 비율 상한과 걷기·등산 평균 속도 상한을 더한다 (티켓 20261103_1115, 사용자 지시 2026-11-03)
--
-- 배경: 지하철을 탄 걷기 활동이 어뷰징 필터를 통과했다. 평균 속도 필터(vehicle_speed_filter_kmh 60)는 걷기에 너무 높고,
--       교통수단 구간 감지는 구간을 빼기만 할 뿐 «구간이 활동의 절반 이상이면 활동 전체를 거른다»는 규칙이 없었다.
--
-- 설계:
--   - 추가만 하는 확장 마이그레이션이다(`db-migration-rules.md` §1). 기존 행은 기본값으로 채워지고 기존 코드는 두 칸을 읽지 않는다.
--   - transit_ratio_filter_pct: 구간 감지가 뺀 거리가 원래 거리의 이 비율(%) 이상이면 활동 전체를 vehicle_speed로 거른다. 기본 50.
--   - walk_avg_max_speed_kmh: 구간을 뺀 뒤 평균 속도가 이 값(km/h)을 넘는 걷기·등산 활동을 vehicle_speed로 거른다. 기본 16
--     (20km 경보 세계기록 평균 약 15.75km/h보다 높은 값 — 걸어서는 낼 수 없는 속도).
--   - 지난 활동은 다시 판정하지 않는다(소급 없음).
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS.
-- 되돌림: 314_abusing_policy_transit_ratio_walk_avg_down.sql (두 칸을 지운다).

BEGIN;

ALTER TABLE public.abusing_policy
  ADD COLUMN IF NOT EXISTS transit_ratio_filter_pct INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS walk_avg_max_speed_kmh   INTEGER NOT NULL DEFAULT 16;

COMMENT ON COLUMN public.abusing_policy.transit_ratio_filter_pct IS '교통수단 구간으로 뺀 거리가 원래 거리의 이 비율(%) 이상이면 활동 전체를 vehicle_speed로 거른다. 기본 50. 티켓 20261103_1115';
COMMENT ON COLUMN public.abusing_policy.walk_avg_max_speed_kmh IS '구간을 뺀 뒤 평균 속도(km/h)가 이 값을 넘는 걷기·등산 활동을 vehicle_speed로 거른다. 기본 16. 티켓 20261103_1115';

COMMIT;
