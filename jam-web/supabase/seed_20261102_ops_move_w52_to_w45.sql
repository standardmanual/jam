-- 시험 등록 묶음 4개를 2027-W52에서 이번 주 2026-W45로 옮기고, 승인 전 W45-c 묶음을 지운다 (사용자 지시 2026-11-02)
-- 날짜: 각 항목을 제목이 같은 W45-c 항목의 게재 기간으로 옮긴다. 시험 묶음은 W45-c 카드를 복사해 만들었다.
-- 바꾸는 것: ops_bundles.week, ops_bundle_items의 기간과 original·edited 안의 기간, today_cards 19장의 기간.
-- 그대로 두는 것: ops_bundles.raw(제출 원문 기록), 항목 상태. 실패 항목 5건은 실패로 남긴다.
-- 지우는 것: weekly-sim-2026-W45-c 묶음과 항목·결정 기록(ON DELETE CASCADE).
-- 백업: ops_bundles_backup_20261102, ops_bundle_items_backup_20261102, ops_decisions_backup_20261102,
--       today_cards_backup_20261102 (RLS 켬, 정책 없음)

CREATE TABLE public.ops_bundles_backup_20261102 AS TABLE public.ops_bundles;
CREATE TABLE public.ops_bundle_items_backup_20261102 AS TABLE public.ops_bundle_items;
CREATE TABLE public.ops_decisions_backup_20261102 AS TABLE public.ops_decisions;
CREATE TABLE public.today_cards_backup_20261102 AS
  SELECT * FROM public.today_cards WHERE starts_at >= '2027-01-01';
ALTER TABLE public.ops_bundles_backup_20261102 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_bundle_items_backup_20261102 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_decisions_backup_20261102 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.today_cards_backup_20261102 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  src_id uuid := '65b39e60-d86e-474d-a349-cc9d8fd5781e';
  n_map int; n_items int; n_cards int; n_bundles int; n_left int; n_w52 int; n_starts int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ops_bundles WHERE id = src_id AND bundle_id = 'weekly-sim-2026-W45-c') THEN
    RAISE EXCEPTION '지울 묶음이 없다';
  END IF;

  SELECT count(*) INTO n_starts FROM public.ops_routine_starts WHERE bundle_id = src_id;
  IF n_starts <> 0 THEN
    RAISE EXCEPTION '지울 묶음에 이어진 루틴 시작 기록이 있다: %', n_starts;
  END IF;

  CREATE TEMP TABLE _w45_map ON COMMIT DROP AS
    SELECT i.id AS item_id,
           (i.created_resource->>'today_card_id')::uuid AS card_id,
           s.starts_at,
           s.ends_at
      FROM public.ops_bundle_items i
      JOIN public.ops_bundles b ON b.id = i.bundle_id AND b.week = '2027-W52'
      JOIN public.ops_bundle_items s
        ON s.bundle_id = src_id
       AND s.original->'copy'->>'title' = i.original->'copy'->>'title';

  SELECT count(*), count(DISTINCT item_id), count(DISTINCT card_id)
    INTO n_map, n_items, n_cards FROM _w45_map;
  IF n_map <> 24 OR n_items <> 24 OR n_cards <> 19 THEN
    RAISE EXCEPTION '날짜 대응이 다르다: 행 %, 항목 %, 카드 %', n_map, n_items, n_cards;
  END IF;

  UPDATE public.ops_bundle_items i
     SET starts_at = m.starts_at,
         ends_at = m.ends_at,
         original = CASE WHEN i.original ? 'starts_at' THEN i.original || jsonb_build_object(
           'starts_at', to_char(m.starts_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"'),
           'ends_at', to_char(m.ends_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"')
         ) ELSE i.original END,
         edited = CASE WHEN i.edited ? 'starts_at' THEN i.edited || jsonb_build_object(
           'starts_at', to_char(m.starts_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"'),
           'ends_at', to_char(m.ends_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"')
         ) ELSE i.edited END,
         updated_at = now()
    FROM _w45_map m
   WHERE i.id = m.item_id;

  UPDATE public.today_cards c
     SET starts_at = m.starts_at,
         ends_at = m.ends_at
    FROM _w45_map m
   WHERE c.id = m.card_id;

  UPDATE public.ops_bundles SET week = '2026-W45' WHERE week = '2027-W52';

  DELETE FROM public.ops_bundles WHERE id = src_id;

  SELECT count(*) INTO n_bundles FROM public.ops_bundles WHERE week = '2026-W45';
  SELECT count(*) INTO n_left FROM public.ops_bundle_items WHERE bundle_id = src_id;
  SELECT count(*) INTO n_w52 FROM public.today_cards WHERE starts_at >= '2027-01-01';
  IF n_bundles <> 4 OR n_left <> 0 OR n_w52 <> 0 THEN
    RAISE EXCEPTION '실행 후 개수가 다르다: W45 묶음 %, 남은 W45-c 항목 %, 2027년 카드 %', n_bundles, n_left, n_w52;
  END IF;
END $$;

-- 실행 직후 보정: 위 UPDATE가 실패 항목의 updated_at까지 바꿔 일정표 오늘 칸에 «실행 실패» 신호 5건이 새로 떴다.
-- 신호 시각이 updated_at이라 실패 항목만 원래 시각으로 되돌렸다.
UPDATE public.ops_bundle_items c
   SET updated_at = b.updated_at
  FROM public.ops_bundle_items_backup_20261102 b
 WHERE c.id = b.id AND c.status = 'failed' AND b.status = 'failed';

-- 되돌림 SQL
-- UPDATE public.today_cards c SET starts_at = b.starts_at, ends_at = b.ends_at FROM public.today_cards_backup_20261102 b WHERE c.id = b.id;
-- UPDATE public.ops_bundles c SET week = b.week FROM public.ops_bundles_backup_20261102 b WHERE c.id = b.id;
-- UPDATE public.ops_bundle_items c SET starts_at = b.starts_at, ends_at = b.ends_at, original = b.original, edited = b.edited, updated_at = b.updated_at FROM public.ops_bundle_items_backup_20261102 b WHERE c.id = b.id;
-- INSERT INTO public.ops_bundles SELECT * FROM public.ops_bundles_backup_20261102 b WHERE NOT EXISTS (SELECT 1 FROM public.ops_bundles x WHERE x.id = b.id);
-- INSERT INTO public.ops_bundle_items SELECT * FROM public.ops_bundle_items_backup_20261102 b WHERE NOT EXISTS (SELECT 1 FROM public.ops_bundle_items x WHERE x.id = b.id);
-- INSERT INTO public.ops_decisions SELECT * FROM public.ops_decisions_backup_20261102 b WHERE NOT EXISTS (SELECT 1 FROM public.ops_decisions x WHERE x.id = b.id);
