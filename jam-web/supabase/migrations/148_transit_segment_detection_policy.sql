-- =============================================
-- 걷기·러닝·자전거 교통수단 구간 감지 임계값 (티켓 20260909_1012)
-- =============================================
-- 걷기 활동 중간에 지하철·버스 구간이 섞여도 전체 평균속도(averageSpeedKmh)만으로는
-- 걸러지지 않는 문제를 보완한다. 활동 타입별 최고속도 임계값을 30초 이상 연속으로
-- 초과하는 구간을 velocity_smooth 스트림에서 찾아 거리·시간을 제외하고 재산정한다.
--
-- 기본값 근거: 걷기 20km/h(엘리트 경보 선수 최고 기록보다도 높음), 러닝 27km/h(30초 지속
-- 창 기준 800m~마일 세계기록 페이스), 자전거 55km/h(엘리트 로드 사이클링 평균속도
-- 40~45km/h + 내리막 스퍼트 여유분). src/lib/abusing/policy.ts의 DEFAULT_POLICY와
-- 반드시 같은 값을 유지한다.
ALTER TABLE public.abusing_policy
  ADD COLUMN IF NOT EXISTS transit_walk_max_speed_kmh      INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS transit_run_max_speed_kmh       INTEGER NOT NULL DEFAULT 27,
  ADD COLUMN IF NOT EXISTS transit_cycling_max_speed_kmh   INTEGER NOT NULL DEFAULT 55,
  ADD COLUMN IF NOT EXISTS transit_segment_min_duration_sec INTEGER NOT NULL DEFAULT 30;
