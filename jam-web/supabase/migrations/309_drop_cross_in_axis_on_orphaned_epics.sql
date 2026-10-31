-- 309_drop_cross_in_axis_on_orphaned_epics.sql
-- 244로 짝 계열이 꺼져 받을 수 없게 된 Epic 6개에서 cross_in_axis 조건만 뺀다 (티켓 20261031_1334. 사용자 결정 = 2026-10-31 «1»(조건 빼기))
--
-- 2026-10-31에 공용 DB에서 롤백 실측 뒤 실행했다. 이 파일은 실행한 문장과 같은 내용이다(DO 블록 한 번의 호출, v_dry = true로 롤백 실측).
--
-- 배경: 244가 JAM 2.0 이전 배지를 끌 때 유지한 계열의 cross_in_axis는 그대로 뒀는데, 짝 계열이 유지 목록에 없어 꺼졌다.
--   엔진(crossGate.ts)은 짝 계열의 배지를 가진 유저에게만 Epic을 주므로, 아래 6개는 새로 받을 수 없게 됐다.
--   cycling:D1(짝 cycling:D2), running:D2(running:D1), running:T1(running:T2), trail_running:T1(trail_running:T2),
--   walking:A6(walking:A1), walking:A9(walking:A10). walking:A8의 Epic은 짝(walking:A9)이 살아 있어 그대로 둔다.
--
-- ⚠️ 공용 DB 영향: 6개 Epic은 자기 계열의 횟수 기준만 채우면 받을 수 있게 된다. 이미 받은 기록은 바꾸지 않는다.
-- 백업: cross_gate_backup_20261031(제거 전 badges 행 전체 6행). 오픈 뒤 문제가 없으면 지운다.

DO $t$
DECLARE v_dry boolean := false; v_ids uuid[]; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.badges WHERE type='activity' AND deleted_at IS NULL AND condition_json ? 'cross_in_axis';
  IF v_n <> 7 THEN RAISE EXCEPTION 'cross_in_axis가 있는 활성 배지가 %개입니다(기대 7).', v_n; END IF;
  SELECT array_agg(id) INTO v_ids FROM public.badges
   WHERE type='activity' AND deleted_at IS NULL AND rarity::text = 'epic' AND condition_json ? 'cross_in_axis'
     AND family_key IN ('cycling:D1','running:D2','running:T1','trail_running:T1','walking:A6','walking:A9');
  IF coalesce(cardinality(v_ids),0) <> 6 THEN RAISE EXCEPTION '대상 Epic이 %개입니다(기대 6).', coalesce(cardinality(v_ids),0); END IF;
  CREATE TABLE public.cross_gate_backup_20261031 (row_id UUID PRIMARY KEY, family_key TEXT NOT NULL, snapshot JSONB NOT NULL, backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE public.cross_gate_backup_20261031 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.cross_gate_backup_20261031 FROM anon, authenticated;
  COMMENT ON TABLE public.cross_gate_backup_20261031 IS '꺼진 계열을 요구하던 Epic 6개의 cross_in_axis 제거 되돌림용 백업(티켓 20261031_1334). snapshot은 제거 전 badges 행 전체다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';
  INSERT INTO public.cross_gate_backup_20261031 SELECT b.id, b.family_key, to_jsonb(b), now() FROM public.badges b WHERE b.id = ANY(v_ids);
  UPDATE public.badges SET condition_json = condition_json - 'cross_in_axis' WHERE id = ANY(v_ids);
  IF (SELECT count(*) FROM public.badges WHERE type='activity' AND deleted_at IS NULL AND condition_json ? 'cross_in_axis') <> 1
     OR (SELECT count(*) FROM public.badges WHERE id = ANY(v_ids) AND NOT (condition_json ? 'cross_in_axis')) <> 6
     OR (SELECT count(*) FROM public.cross_gate_backup_20261031) <> 6
     OR (SELECT count(*) FROM public.badges b JOIN public.cross_gate_backup_20261031 s ON s.row_id = b.id WHERE b.condition_json = (s.snapshot->'condition_json') - 'cross_in_axis') <> 6
     OR (SELECT count(*) FROM public.badges b JOIN public.cross_gate_backup_20261031 s ON s.row_id = b.id WHERE to_jsonb(b) - 'condition_json' = s.snapshot - 'condition_json') <> 6
  THEN RAISE EXCEPTION '끝 검사 실패'; END IF;
  IF v_dry THEN RAISE EXCEPTION '롤백 실측 결과'; END IF;
END $t$;

-- 되돌림 SQL (필요할 때만)
-- UPDATE public.badges b SET condition_json = s.snapshot->'condition_json' FROM public.cross_gate_backup_20261031 s WHERE s.row_id = b.id;
-- 백업 표가 더 필요 없으면: DROP TABLE IF EXISTS public.cross_gate_backup_20261031;
