-- 315_asset_presets_engine_state_down.sql
-- 315의 되돌림: asset_presets.engine_state 칸을 지운다 (티켓 20261103_1736)
--
-- 주의: 칸에 저장된 3D 설정값도 함께 사라진다(비율·레이어는 그대로). presets API가 engine_state를
-- select·insert하므로, 지우기 전에 코드를 먼저 되돌린다.
-- 올린 SVG 파일(저장소 asset-generator/presets/{id}/engine-3d.svg)은 칸과 별개라 남는다 —
-- 프리셋을 삭제하면 그 폴더째 지워진다.

BEGIN;

ALTER TABLE public.asset_presets DROP COLUMN IF EXISTS engine_state;

COMMIT;
