-- 314_abusing_policy_transit_ratio_walk_avg_down.sql
-- 314의 되돌림: abusing_policy의 transit_ratio_filter_pct·walk_avg_max_speed_kmh 칸을 지운다 (티켓 20261103_1115)
--
-- 주의: 칸에 저장된 값도 함께 사라진다. 로더는 select('*') 뒤 자기 키만 읽고 칸이 없으면 기본값(50·16)으로 폴백하므로 읽기는 깨지지 않는다.
-- 다만 밸런스 화면(admin balance)이 두 칸을 select하므로, 지우기 전에 코드를 먼저 되돌린다.

BEGIN;

ALTER TABLE public.abusing_policy
  DROP COLUMN IF EXISTS transit_ratio_filter_pct,
  DROP COLUMN IF EXISTS walk_avg_max_speed_kmh;

COMMIT;
