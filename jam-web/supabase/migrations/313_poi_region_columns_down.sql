-- 313_poi_region_columns_down.sql
-- 313의 되돌림: poi의 sido·gu 칸을 지운다 (티켓 20261102_2254)
--
-- 주의: 칸에 채워 둔 값도 함께 사라진다. 읽기 API(ops-places)가 이 칸을 읽는 코드가 배포된 상태에서 지우면 조회가 실패하므로,
-- 코드를 먼저 되돌린 뒤 실행한다. 채움은 스크립트로 다시 할 수 있다.

BEGIN;

ALTER TABLE public.poi
  DROP COLUMN IF EXISTS sido,
  DROP COLUMN IF EXISTS gu;

COMMIT;
