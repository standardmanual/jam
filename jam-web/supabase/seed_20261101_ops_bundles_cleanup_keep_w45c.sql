-- 운영플랜 정리: 시험 묶음 weekly-sim-2026-W45-c 하나만 남기고 지운다 (사용자 지시 2026-11-01)
-- 지우는 범위: 그 외 기획 묶음과 항목·결정 기록(ON DELETE CASCADE), 루틴 시작 기록.
-- 남기는 것: 패턴 사전, 밸런스 규칙, 트렌드 출처, 예약 자원(today_cards·ambient_drop_schedules).
-- 백업: ops_bundles_backup_20261101, ops_bundle_items_backup_20261101,
--       ops_decisions_backup_20261101, ops_routine_starts_backup_20261101 (RLS 켬, 정책 없음)

CREATE TABLE public.ops_bundles_backup_20261101 AS TABLE public.ops_bundles;
CREATE TABLE public.ops_bundle_items_backup_20261101 AS TABLE public.ops_bundle_items;
CREATE TABLE public.ops_decisions_backup_20261101 AS TABLE public.ops_decisions;
CREATE TABLE public.ops_routine_starts_backup_20261101 AS TABLE public.ops_routine_starts;
ALTER TABLE public.ops_bundles_backup_20261101 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_bundle_items_backup_20261101 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_decisions_backup_20261101 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_routine_starts_backup_20261101 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  keep_id uuid := '65b39e60-d86e-474d-a349-cc9d8fd5781e';
  n_bundles int; n_items int; n_decisions int; n_starts int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ops_bundles WHERE id = keep_id AND bundle_id = 'weekly-sim-2026-W45-c') THEN
    RAISE EXCEPTION '남길 묶음이 없다';
  END IF;
  DELETE FROM public.ops_routine_starts WHERE bundle_id IS DISTINCT FROM keep_id;
  DELETE FROM public.ops_bundles WHERE id <> keep_id;
  SELECT count(*) INTO n_bundles FROM public.ops_bundles;
  SELECT count(*) INTO n_items FROM public.ops_bundle_items;
  SELECT count(*) INTO n_decisions FROM public.ops_decisions;
  SELECT count(*) INTO n_starts FROM public.ops_routine_starts;
  IF n_bundles <> 1 OR n_items <> 59 OR n_decisions <> 1 OR n_starts <> 0 THEN
    RAISE EXCEPTION '삭제 후 개수가 다르다: 묶음 %, 항목 %, 결정 %, 시작 %', n_bundles, n_items, n_decisions, n_starts;
  END IF;
END $$;

-- 되돌림 SQL
-- INSERT INTO public.ops_bundles SELECT * FROM public.ops_bundles_backup_20261101 b WHERE NOT EXISTS (SELECT 1 FROM public.ops_bundles x WHERE x.id = b.id);
-- INSERT INTO public.ops_bundle_items SELECT * FROM public.ops_bundle_items_backup_20261101 b WHERE NOT EXISTS (SELECT 1 FROM public.ops_bundle_items x WHERE x.id = b.id);
-- INSERT INTO public.ops_decisions SELECT * FROM public.ops_decisions_backup_20261101 b WHERE NOT EXISTS (SELECT 1 FROM public.ops_decisions x WHERE x.id = b.id);
-- INSERT INTO public.ops_routine_starts SELECT * FROM public.ops_routine_starts_backup_20261101 b WHERE NOT EXISTS (SELECT 1 FROM public.ops_routine_starts x WHERE x.id = b.id);
