-- 313: poi에 지역 칸(sido·gu)을 더한다 (티켓 20261102_2254, 사용자 지시 2026-11-02 «재료의 한계를 해결할 수 있는 방법을 기획하고 개발해»)
--
-- 배경: 윤진이 읽는 장소 재료(`GET /api/admin/ops-places`)에 지역 칸이 없어 «이 동네의 산», «이 구의 역» 같은 지역 카드를 기획할 수 없다.
--
-- 설계:
--   - 추가만 하는 확장 마이그레이션이다(`db-migration-rules.md` §1). 기존 행과 코드는 바뀌지 않는다.
--   - `sido`: 시·도(예: 서울특별시), `gu`: 시·군·구(예: 강남구). 둘 다 NULL 허용이다. 채움은 이 파일이 아니라
--     `scripts/backfill-poi-region.mjs`(NCP 역지오코딩, 드라이런이 기본)가 한다. 채우기 전 행은 NULL로 남고 읽기 API는 null로 싣는다.
--   - 읽기 전용 칸이라 RLS·권한은 바꾸지 않는다(poi의 기존 정책을 그대로 따른다).
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS.
-- 되돌림: 313_poi_region_columns_down.sql (두 칸을 지운다).

BEGIN;

ALTER TABLE public.poi
  ADD COLUMN IF NOT EXISTS sido TEXT NULL,
  ADD COLUMN IF NOT EXISTS gu   TEXT NULL;

COMMENT ON COLUMN public.poi.sido IS '시·도(역지오코딩 area1). 채움 스크립트 scripts/backfill-poi-region.mjs가 쓴다. NULL이면 아직 채우지 않았거나 실패한 행.';
COMMENT ON COLUMN public.poi.gu   IS '시·군·구(역지오코딩 area2). 채움 스크립트 scripts/backfill-poi-region.mjs가 쓴다. NULL이면 아직 채우지 않았거나 실패한 행.';

COMMIT;
