-- 티켓 20260813_002: abusing_policy DB 값이 코드 설계 기본값(gps_max_speed_kmh=300,
-- poi_block_hours=72)과 10배 괴리(gps_max_speed_kmh=30, poi_block_hours=3)되어 있어
-- 2026-07-25 오탐 수정(007/008 티켓)의 안전 마진이 실제 운영에서 무력화되고 있었다.
-- 010_abusing_policy.sql의 원래 DEFAULT 값으로 되돌린다.
--
-- 실행은 오케스트레이터가 사용자 승인 하에 별도로 진행한다 (직접 실행 금지).

UPDATE abusing_policy
SET
  gps_max_speed_kmh = 300,
  poi_block_hours = 72,
  updated_at = now()
WHERE id = 1
  AND gps_max_speed_kmh = 30
  AND poi_block_hours = 3;
