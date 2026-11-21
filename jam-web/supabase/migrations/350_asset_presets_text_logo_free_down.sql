-- 350 되돌림: 백업 표의 layers로 프리셋 4개를 되돌린다 (티켓 20261121_1723)
-- 백업 행이 있는 id만 되돌린다. 백업 표는 지우지 않는다(되돌림을 확인한 뒤 사용자 허락을 받아 별도로 정리).
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.

BEGIN;

UPDATE public.asset_presets p
   SET layers = b.layers, updated_at = now()
  FROM public.asset_presets_layers_backup_20261121 b
 WHERE p.id = b.id;

COMMIT;
