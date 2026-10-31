-- 308_retire_old_tribes.sql
-- 옛 트라이브 3곳(아스팔트 레인저, 숲속의 갱단, 낭만 미식가)을 끈다 (티켓 20261031_1334. 사용자 결정 = 2026-10-31 «순서대로 실행해»,
-- 계획 = docs/plan/jam2/12 JAM 2.0 오픈 전후 적용 순서.md 4절 7번)
--
-- 2026-10-31에 공용 DB에서 롤백 실측 뒤 실행했다. 이 파일은 실행한 문장과 같은 내용이다(DO 블록 한 번의 호출, v_dry = true로 롤백 실측).
--
-- ⚠️ 공용 DB 영향: tribes.is_active만 false로 바꾼다. 트라이브 행·소속 유저(2명: dev-tester@jam.local, 사용자 계정)·배지 171개는 그대로다.
--    관리자 화면의 트라이브 선택 목록과 콘텐츠 후보(content-corpus)에서 빠진다. 소속 유저의 앱 사용을 막는 코드는 없다(src에서 확인).
--
-- 선행: 282가 적용되어 세 곳에 활성 컬렉션이 없다(가드가 확인한다).
-- 백업: tribe_retire_backup_20261031(트라이브 3행 전체). 오픈 뒤 문제가 없으면 지운다.

DO $t$
DECLARE v_dry boolean := false; v_n int; v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.tribes WHERE name IN ('아스팔트 레인저','숲속의 갱단','낭만 미식가') AND is_active;
  IF coalesce(cardinality(v_ids),0) <> 3 THEN RAISE EXCEPTION '켜진 옛 트라이브가 %곳입니다(기대 3).', coalesce(cardinality(v_ids),0); END IF;
  SELECT count(*) INTO v_n FROM public.item_books WHERE tribe_id = ANY(v_ids) AND is_active;
  IF v_n <> 0 THEN RAISE EXCEPTION '옛 트라이브에 활성 컬렉션이 %개 남았습니다.', v_n; END IF;
  CREATE TABLE public.tribe_retire_backup_20261031 (row_id UUID PRIMARY KEY, snapshot JSONB NOT NULL, backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE public.tribe_retire_backup_20261031 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.tribe_retire_backup_20261031 FROM anon, authenticated;
  COMMENT ON TABLE public.tribe_retire_backup_20261031 IS '옛 트라이브 3곳(아스팔트 레인저, 숲속의 갱단, 낭만 미식가) 비활성화 되돌림용 백업. 끄기 직전 전체 행(snapshot)이다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';
  INSERT INTO public.tribe_retire_backup_20261031 SELECT t.id, to_jsonb(t), now() FROM public.tribes t WHERE t.id = ANY(v_ids);
  UPDATE public.tribes SET is_active = false WHERE id = ANY(v_ids);
  IF (SELECT count(*) FROM public.tribes WHERE id = ANY(v_ids) AND NOT is_active) <> 3 OR (SELECT count(*) FROM public.tribe_retire_backup_20261031) <> 3 THEN RAISE EXCEPTION '끝 검사 실패'; END IF;
  IF (SELECT count(*) FROM public.users WHERE tribe_id = ANY(v_ids)) <> 2 THEN RAISE EXCEPTION '소속 유저 수가 달라짐'; END IF;
  IF v_dry THEN RAISE EXCEPTION '롤백 실측 결과: 3곳 비활성, 백업 3행, 소속 유저 2명 그대로'; END IF;
END $t$;

-- 되돌림 SQL (필요할 때만)
-- UPDATE public.tribes t SET is_active = (s.snapshot->>'is_active')::boolean FROM public.tribe_retire_backup_20261031 s WHERE s.row_id = t.id;
-- 백업 표가 더 필요 없으면: DROP TABLE IF EXISTS public.tribe_retire_backup_20261031;
