-- 360 되돌림: 49주차 다시 올린 기획을 백업 표 ops_w49_retry_merge_backup_20261124에서 되살리고, 원래 항목 7개를 합치기 전(실패) 상태로 되돌린다 (티켓 20261124_1523)
--
-- 순서: (가) 다시 올린 기획 1행·항목 7행을 되살린다 → (나) 옮긴 결정 기록 14건의 bundle_id·item_id를 백업 값으로 되돌리고, 지워진 결정 기록(제출 1건)을 되살린다
--       → (다) 원래 항목 7개의 status·original·edited·created_resource·updated_at을 백업 값으로 되돌린다.
-- 만든 미션·카드는 합치기에서 건드리지 않았으므로 여기서도 건드리지 않는다.
-- 백업 표는 지우지 않는다. 복구를 화면과 DB로 확인한 뒤 사용자가 아래 DROP을 직접 실행해 삭제한다.
--   DROP TABLE IF EXISTS public.ops_w49_retry_merge_backup_20261124;
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다.

BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  IF to_regclass('public.ops_w49_retry_merge_backup_20261124') IS NULL THEN
    RAISE EXCEPTION '360 되돌림: 백업 표가 없습니다.';
  END IF;
  SELECT count(*) INTO n FROM public.ops_w49_retry_merge_backup_20261124;
  IF n <> 30 THEN RAISE EXCEPTION '360 되돌림: 백업 행이 30개가 아니라 %개입니다.', n; END IF;

  -- (가) 다시 올린 기획과 항목을 되살린다
  INSERT INTO public.ops_bundles
  SELECT (jsonb_populate_record(NULL::public.ops_bundles, b.row_data)).*
  FROM public.ops_w49_retry_merge_backup_20261124 b WHERE b.kind = 'retry_bundle';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '360 되돌림: 기획 복구가 1행이 아니라 %행입니다.', n; END IF;

  INSERT INTO public.ops_bundle_items
  SELECT (jsonb_populate_record(NULL::public.ops_bundle_items, b.row_data)).*
  FROM public.ops_w49_retry_merge_backup_20261124 b WHERE b.kind = 'retry_item';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION '360 되돌림: 항목 복구가 7행이 아니라 %행입니다.', n; END IF;

  -- (나) 결정 기록: 옮긴 행은 원래 자리로, 지워진 행은 되살린다
  UPDATE public.ops_decisions d
  SET bundle_id = r.bundle_id, item_id = r.item_id
  FROM (
    SELECT (jsonb_populate_record(NULL::public.ops_decisions, b.row_data)).*
    FROM public.ops_w49_retry_merge_backup_20261124 b WHERE b.kind = 'retry_decision'
  ) r
  WHERE d.id = r.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 14 THEN RAISE EXCEPTION '360 되돌림: 되돌린 결정 기록이 14건이 아니라 %건입니다.', n; END IF;

  INSERT INTO public.ops_decisions
  SELECT r.*
  FROM (
    SELECT (jsonb_populate_record(NULL::public.ops_decisions, b.row_data)).*
    FROM public.ops_w49_retry_merge_backup_20261124 b WHERE b.kind = 'retry_decision'
  ) r
  WHERE NOT EXISTS (SELECT 1 FROM public.ops_decisions d WHERE d.id = r.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '360 되돌림: 되살린 결정 기록이 1건이 아니라 %건입니다.', n; END IF;

  -- (다) 원래 항목을 합치기 전 값으로 되돌린다
  UPDATE public.ops_bundle_items o
  SET status = r.status,
      original = r.original,
      edited = r.edited,
      created_resource = r.created_resource,
      updated_at = r.updated_at
  FROM (
    SELECT (jsonb_populate_record(NULL::public.ops_bundle_items, b.row_data)).*
    FROM public.ops_w49_retry_merge_backup_20261124 b WHERE b.kind = 'orig_item'
  ) r
  WHERE o.id = r.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION '360 되돌림: 원래 항목 복구가 7행이 아니라 %행입니다.', n; END IF;

  RAISE NOTICE '360 되돌림: 다시 올린 기획·항목 7개·결정 기록 15건을 되살리고 원래 항목 7개를 되돌렸습니다.';
END
$$;

COMMIT;
