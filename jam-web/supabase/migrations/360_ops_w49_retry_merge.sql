-- 360: 49주차 다시 올린 기획의 예약 7건을 원래 기획의 같은 항목으로 합치고, 다시 올린 기획을 지운다 (일회성 데이터 정리, 티켓 20261124_1523)
--
-- 원래 기획 weekly-2026-W48-0901(행 269d2f28-…)의 실패 7건은 티켓 20261124_1050에서 새 기획 weekly-2026-W49-retry-01(행 dd493ed6-…)로
-- 다시 올려 예약했다. 어드민에는 원래 기획이 「일부 실패」로 남아 보여서, 사용자 결정(2026-11-24 「원래 기획으로 합치기」)에 따라 합친다.
--
-- 바꾸는 것:
--   (가) 백업 표 ops_w49_retry_merge_backup_20261124에 원래 실패 항목 7행, 다시 올린 기획 1행·항목 7행·결정 기록 15행을 행 전체(jsonb)로 담는다.
--   (나) 원래 실패 항목 7개: status='scheduled', created_resource·이미지 색(original.image_spec)·edited.resource를 다시 올린 항목 값으로,
--        edited.copy는 사용자가 고친 문안에 다시 올릴 때 바뀐 문안(c-lock-open 제목)을 더한 값으로, updated_at=now().
--   (다) 다시 올린 항목의 결정 기록 14건(승인 7·실행 7)의 bundle_id·item_id를 원래 기획·항목으로 옮긴다.
--   (라) 다시 올린 기획을 지운다. 항목 7행과 남은 결정 기록(제출 1건)은 외래 키 CASCADE로 함께 지워진다.
-- 바꾸지 않는 것: 만든 미션 3개·카드 4장(missions·today_cards), 원래 항목의 실패 결정 기록 7건(이력), 이미지 파일(다시 올린 항목 ID 경로 그대로).
--
-- 안전장치: 시작 전에 두 기획의 상태(원래 실패 7, 다시 올림 예약 7, 항목 키 7쌍)를 확인하고, 단계마다 바뀐 행 수가 기대와 다르면 예외로 전체를 되돌린다.
-- 다시 실행하면 원래 기획에 실패 항목이 없어서 시작 확인에서 멈춘다.
-- 되돌림: 360_ops_w49_retry_merge_down.sql (백업 표에서 다시 올린 기획·항목·결정 기록을 되살리고 원래 항목을 실패 상태로 되돌린다).
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다.

BEGIN;

DO $$
DECLARE
  o_bundle CONSTANT uuid := '269d2f28-ca24-4d10-8477-b298472a6589';
  r_bundle CONSTANT uuid := 'dd493ed6-fa84-45fd-a628-257c81531350';
  n integer;
BEGIN
  -- 시작 확인
  SELECT count(*) INTO n FROM public.ops_bundle_items WHERE bundle_id = o_bundle AND status = 'failed';
  IF n <> 7 THEN RAISE EXCEPTION '360: 원래 기획의 실패 항목이 7개가 아니라 %개입니다.', n; END IF;
  SELECT count(*) INTO n FROM public.ops_bundle_items WHERE bundle_id = r_bundle;
  IF n <> 7 THEN RAISE EXCEPTION '360: 다시 올린 기획의 항목이 7개가 아니라 %개입니다.', n; END IF;
  SELECT count(*) INTO n FROM public.ops_bundle_items WHERE bundle_id = r_bundle AND status = 'scheduled';
  IF n <> 7 THEN RAISE EXCEPTION '360: 다시 올린 기획의 예약됨 항목이 7개가 아니라 %개입니다.', n; END IF;
  SELECT count(*) INTO n
  FROM public.ops_bundle_items r
  JOIN public.ops_bundle_items o ON o.bundle_id = o_bundle AND o.status = 'failed' AND o.item_key = r.item_key
  WHERE r.bundle_id = r_bundle;
  IF n <> 7 THEN RAISE EXCEPTION '360: 항목 키로 짝지은 항목이 7쌍이 아니라 %쌍입니다.', n; END IF;

  -- (가) 백업
  CREATE TABLE IF NOT EXISTS public.ops_w49_retry_merge_backup_20261124 (
    id uuid PRIMARY KEY,
    kind text NOT NULL,
    row_data jsonb NOT NULL
  );
  ALTER TABLE public.ops_w49_retry_merge_backup_20261124 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.ops_w49_retry_merge_backup_20261124 FROM anon, authenticated;
  COMMENT ON TABLE public.ops_w49_retry_merge_backup_20261124 IS
    '360 49주차 다시 올린 기획 합치기 전 값(티켓 20261124_1523). kind: orig_item·retry_bundle·retry_item·retry_decision. 복구가 필요 없음을 확인한 뒤 삭제해도 된다. 접근 정책 없음(service_role 전용).';

  IF EXISTS (SELECT 1 FROM public.ops_w49_retry_merge_backup_20261124) THEN
    RAISE EXCEPTION '360: 백업 표가 비어 있지 않습니다. 이전 실행의 백업을 확인한 뒤 다시 실행하세요.';
  END IF;
  INSERT INTO public.ops_w49_retry_merge_backup_20261124 (id, kind, row_data)
  SELECT o.id, 'orig_item', to_jsonb(o) FROM public.ops_bundle_items o WHERE o.bundle_id = o_bundle AND o.status = 'failed';
  INSERT INTO public.ops_w49_retry_merge_backup_20261124 (id, kind, row_data)
  SELECT b.id, 'retry_bundle', to_jsonb(b) FROM public.ops_bundles b WHERE b.id = r_bundle;
  INSERT INTO public.ops_w49_retry_merge_backup_20261124 (id, kind, row_data)
  SELECT r.id, 'retry_item', to_jsonb(r) FROM public.ops_bundle_items r WHERE r.bundle_id = r_bundle;
  INSERT INTO public.ops_w49_retry_merge_backup_20261124 (id, kind, row_data)
  SELECT d.id, 'retry_decision', to_jsonb(d) FROM public.ops_decisions d WHERE d.bundle_id = r_bundle;
  SELECT count(*) INTO n FROM public.ops_w49_retry_merge_backup_20261124;
  IF n <> 30 THEN RAISE EXCEPTION '360: 백업 행이 30개(항목 7·기획 1·항목 7·결정 15)가 아니라 %개입니다.', n; END IF;

  -- (나) 원래 항목을 다시 올린 항목의 예약 결과로 채운다
  UPDATE public.ops_bundle_items o
  SET status = 'scheduled',
      created_resource = r.created_resource,
      original = CASE WHEN r.original ? 'image_spec' THEN jsonb_set(o.original, '{image_spec}', r.original->'image_spec') ELSE o.original END,
      edited = (coalesce(o.edited, '{}'::jsonb) - 'copy' - CASE WHEN coalesce(r.edited, '{}'::jsonb) ? 'resource' THEN 'resource' ELSE '' END)
        || jsonb_build_object('copy',
             coalesce(o.edited->'copy', '{}'::jsonb)
             || (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                 FROM jsonb_each((r.original->'copy') || coalesce(r.edited->'copy', '{}'::jsonb)) e
                 WHERE (o.original->'copy'->e.key) IS DISTINCT FROM e.value))
        || CASE WHEN coalesce(r.edited, '{}'::jsonb) ? 'resource' THEN jsonb_build_object('resource', r.edited->'resource') ELSE '{}'::jsonb END,
      updated_at = now()
  FROM public.ops_bundle_items r
  WHERE o.bundle_id = o_bundle AND o.status = 'failed'
    AND r.bundle_id = r_bundle AND r.item_key = o.item_key;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION '360: 원래 항목 갱신이 7행이 아니라 %행입니다.', n; END IF;

  -- (다) 다시 올린 항목의 승인·실행 결정 기록을 원래 항목으로 옮긴다
  UPDATE public.ops_decisions d
  SET bundle_id = o_bundle, item_id = o.id
  FROM public.ops_bundle_items r
  JOIN public.ops_bundle_items o ON o.bundle_id = o_bundle AND o.item_key = r.item_key
  WHERE r.bundle_id = r_bundle AND d.bundle_id = r_bundle AND d.item_id = r.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 14 THEN RAISE EXCEPTION '360: 옮긴 결정 기록이 14건이 아니라 %건입니다.', n; END IF;

  -- (라) 다시 올린 기획을 지운다(항목·남은 결정 기록은 CASCADE)
  DELETE FROM public.ops_bundles WHERE id = r_bundle;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '360: 다시 올린 기획 삭제가 1행이 아니라 %행입니다.', n; END IF;

  -- 마무리 확인
  SELECT count(*) INTO n FROM public.ops_bundle_items WHERE bundle_id = o_bundle AND status = 'scheduled';
  IF n <> 12 THEN RAISE EXCEPTION '360: 원래 기획의 예약됨 항목이 12개가 아니라 %개입니다.', n; END IF;
  RAISE NOTICE '360: 원래 기획 12개 예약됨, 결정 기록 14건 이동, 다시 올린 기획 삭제를 마쳤습니다.';
END
$$;

COMMIT;
