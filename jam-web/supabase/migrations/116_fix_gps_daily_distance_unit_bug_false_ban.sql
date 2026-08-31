-- 티켓 20260831_1504: gps-detector.ts의 checkAndUpdateLocation()이 haversineDistance()의
-- 반환값(미터)을 변환 없이 "distKm"으로 취급해 속도·누적거리가 1000배 부풀려지던 버그를
-- 코드에서 수정했다(distMeters / 1000). 이 마이그레이션은 그 버그로 인해 걸린
-- sihyunrr@gmail.com 계정의 오탐 소프트밴/POI 블록을 해제하고, 버그로 오염된
-- gps_daily_distance_km 누적치를 리셋한다.
--
-- 오탐 근거: abusing_logs에 남은 daily_distance_km 7173/7219가 그날 실제 누적 이동거리
-- 7.173km/7.219km를 "미터를 km로 잘못 읽은" 값과 정확히 일치 — 실제 조작이 아니라
-- 정상적인 하루 이동(도보로 여러 POI 방문)이 단위 버그로 캡을 넘은 것으로 판명됨.
--
-- 실행은 오케스트레이터가 사용자 승인 하에 별도로 진행한다 (직접 실행 금지).

-- 1. 오탐으로 걸린 소프트밴 해제 (system이 gps_spoof_detected 사유로 건 것만 — 다른
--    사유의 밴은 건드리지 않는다)
DELETE FROM public.user_shadow_bans
WHERE user_id = (SELECT id FROM public.users WHERE email = 'sihyunrr@gmail.com')
  AND created_by = 'system'
  AND reason LIKE 'GPS 조작 의심%';

-- 2. 오탐으로 걸린 POI 블록 해제 (2026-08-31 활성 블록, poi_id 204db6bd-...)
DELETE FROM public.poi_blocks
WHERE user_id = (SELECT id FROM public.users WHERE email = 'sihyunrr@gmail.com')
  AND poi_id = '204db6bd-b8e6-40c7-83ad-3698a7a536af'
  AND reason LIKE 'gps_spoof_detected%';

-- 3. 단위 버그로 1000배 부풀려진 채 저장된 누적 이동거리 리셋 — 리셋하지 않으면 코드
--    수정 이후에도 같은 UTC 날짜 안에서는 오염된 값(7000대) 위에 정상 거리가 계속
--    누적되어 즉시 재오탐이 난다.
UPDATE public.users
SET gps_daily_distance_km = 0,
    gps_daily_distance_date = NULL
WHERE email = 'sihyunrr@gmail.com';
