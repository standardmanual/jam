-- 등록된 운영 기획과 홈피드 카드를 모두 지운다 (사용자 지시 2026-11-02 «현재 등록된 기획과 피드를 모두 삭제해»)
-- 지우는 범위: ops_bundles 전부(항목·결정 기록은 ON DELETE CASCADE)와, 지금 노출 중이거나 노출 예정인 투데이 카드(ends_at >= now()) 전부.
--   카드의 노출 기록(today_card_events)은 외래 키가 NO ACTION이라 먼저 지운다.
-- 남기는 것: 기간이 끝난 옛 카드(노출 이력), 패턴·밸런스 규칙·트렌드 출처, 저장소에 올라간 카드 이미지 파일.
-- 드라이런: DO 블록 한 번의 호출에서 RAISE EXCEPTION으로 되돌려 개수를 실측했다(카드 19, 이벤트 3, 묶음 4, 항목 24, 결정 52).
-- 백업: ops_bundles_backup_20261102b, ops_bundle_items_backup_20261102b, ops_decisions_backup_20261102b,
--       today_cards_backup_20261102b, today_card_events_backup_20261102b (RLS 켬, 정책 없음)

CREATE TABLE public.ops_bundles_backup_20261102b AS TABLE public.ops_bundles;
CREATE TABLE public.ops_bundle_items_backup_20261102b AS TABLE public.ops_bundle_items;
CREATE TABLE public.ops_decisions_backup_20261102b AS TABLE public.ops_decisions;
CREATE TABLE public.today_cards_backup_20261102b AS SELECT * FROM public.today_cards WHERE ends_at >= now();
CREATE TABLE public.today_card_events_backup_20261102b AS
  SELECT * FROM public.today_card_events WHERE card_id IN (SELECT id FROM public.today_cards WHERE ends_at >= now());
ALTER TABLE public.ops_bundles_backup_20261102b ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_bundle_items_backup_20261102b ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_decisions_backup_20261102b ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.today_cards_backup_20261102b ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.today_card_events_backup_20261102b ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_cards int; n_bundles int; n_items int; n_dec int;
BEGIN
  IF (SELECT count(*) FROM public.today_cards_backup_20261102b) <> 19 OR (SELECT count(*) FROM public.ops_bundles_backup_20261102b) <> 4 THEN
    RAISE EXCEPTION '백업 개수가 다르다';
  END IF;
  DELETE FROM public.today_card_events WHERE card_id IN (SELECT id FROM public.today_cards_backup_20261102b);
  DELETE FROM public.today_cards WHERE id IN (SELECT id FROM public.today_cards_backup_20261102b);
  DELETE FROM public.ops_bundles WHERE id IN (SELECT id FROM public.ops_bundles_backup_20261102b);
  SELECT count(*) INTO n_cards FROM public.today_cards WHERE ends_at >= now();
  SELECT count(*) INTO n_bundles FROM public.ops_bundles;
  SELECT count(*) INTO n_items FROM public.ops_bundle_items;
  SELECT count(*) INTO n_dec FROM public.ops_decisions;
  IF n_cards <> 0 OR n_bundles <> 0 OR n_items <> 0 OR n_dec <> 0 THEN
    RAISE EXCEPTION '실행 뒤 개수가 다르다: 카드 %, 묶음 %, 항목 %, 결정 %', n_cards, n_bundles, n_items, n_dec;
  END IF;
END $$;

-- 되돌림 SQL
-- INSERT INTO public.today_cards SELECT * FROM public.today_cards_backup_20261102b b WHERE NOT EXISTS (SELECT 1 FROM public.today_cards x WHERE x.id = b.id);
-- INSERT INTO public.today_card_events SELECT * FROM public.today_card_events_backup_20261102b b WHERE NOT EXISTS (SELECT 1 FROM public.today_card_events x WHERE x.id = b.id);
-- INSERT INTO public.ops_bundles SELECT * FROM public.ops_bundles_backup_20261102b b WHERE NOT EXISTS (SELECT 1 FROM public.ops_bundles x WHERE x.id = b.id);
-- INSERT INTO public.ops_bundle_items SELECT * FROM public.ops_bundle_items_backup_20261102b b WHERE NOT EXISTS (SELECT 1 FROM public.ops_bundle_items x WHERE x.id = b.id);
-- INSERT INTO public.ops_decisions SELECT * FROM public.ops_decisions_backup_20261102b b WHERE NOT EXISTS (SELECT 1 FROM public.ops_decisions x WHERE x.id = b.id);
