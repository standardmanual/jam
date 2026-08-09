-- =============================================
-- GPS 어뷰징 방어 보강 — 일일 누적 이동거리 상한
-- =============================================
-- 기존 gps_max_speed_kmh 체크는 "직전 요청 대비 순간 속도"만 본다. 요청 사이에
-- 충분한 시간 간격을 두고 좌표를 옮기면(느린 텔레포트) 매 구간 속도는 임계값
-- 밑으로 유지되면서도 하루 동안 비현실적인 총 이동거리를 누적할 수 있다.
-- 하루 누적 이동거리에 별도 상한을 둬서 이 패턴을 함께 잡아낸다.

ALTER TABLE public.abusing_policy
  ADD COLUMN IF NOT EXISTS gps_daily_distance_cap_km INTEGER NOT NULL DEFAULT 3000;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gps_daily_distance_km    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gps_daily_distance_date  DATE;
