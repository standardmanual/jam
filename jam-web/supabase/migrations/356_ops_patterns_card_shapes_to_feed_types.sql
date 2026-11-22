-- 356: 운영 패턴 39개의 «카드 모양» 값(옛 7모양 이름)을 새 카드 유형 이름으로 옮긴다 (자료 변환, 티켓 20261122_1100 후속)
--
-- 옮기는 규칙(옛 모양 → 새 카드 유형, 메모(note) 글자에 따라 갈린다):
--   hero    → 메모에 «컬렉션»이 있으면 collection_intro, 아니면 hero_box
--   poster·dome·ticket·square → hero_box
--   brief   → 메모에 «드랍»이 있으면 drop_pickup, «배지»가 있으면 badge_intro, 그 밖은 text_box
--   list    → gallery_list. 단 메모가 «랭킹»으로 시작하는 항목(랭킹 행형 카드는 홈에서 더 내지 않는다)은 지운다
-- 메모 글자 중 `square`·`list` 표기(P10)는 `hero_box`·`gallery_list`로 바꾼다. 항목 순서·그 밖의 메모는 그대로다.
-- 옛 이름이 하나도 없는 패턴(이미 새 이름이거나 빈 목록)은 건드리지 않는다. 백업: ops_patterns_card_shapes_backup_20261122.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 되돌림: 356_ops_patterns_card_shapes_to_feed_types_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_patterns_card_shapes_backup_20261122 AS
SELECT pattern_no, card_shapes FROM public.ops_patterns;

ALTER TABLE public.ops_patterns_card_shapes_backup_20261122 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ops_patterns_card_shapes_backup_20261122 IS '356 변환 전 ops_patterns.card_shapes(티켓 20261122_1100 후속). 확인 뒤 삭제해도 된다. 접근 정책 없음(service_role만)';

UPDATE public.ops_patterns p
SET card_shapes = COALESCE((
  SELECT jsonb_agg(
           jsonb_build_object(
             'shape', CASE e.elem->>'shape'
               WHEN 'hero'   THEN CASE WHEN COALESCE(e.elem->>'note','') LIKE '%컬렉션%' THEN 'collection_intro' ELSE 'hero_box' END
               WHEN 'poster' THEN 'hero_box'
               WHEN 'dome'   THEN 'hero_box'
               WHEN 'ticket' THEN 'hero_box'
               WHEN 'square' THEN 'hero_box'
               WHEN 'brief'  THEN CASE
                                    WHEN COALESCE(e.elem->>'note','') LIKE '%드랍%' THEN 'drop_pickup'
                                    WHEN COALESCE(e.elem->>'note','') LIKE '%배지%' THEN 'badge_intro'
                                    ELSE 'text_box' END
               WHEN 'list'   THEN 'gallery_list'
               ELSE e.elem->>'shape' END,
             'note', replace(replace(COALESCE(e.elem->>'note',''), '`square`', '`hero_box`'), '`list`', '`gallery_list`')
           ) ORDER BY e.ord)
  FROM jsonb_array_elements(p.card_shapes) WITH ORDINALITY AS e(elem, ord)
  WHERE NOT (e.elem->>'shape' = 'list' AND COALESCE(e.elem->>'note','') LIKE '랭킹%')
), '[]'::jsonb)
WHERE jsonb_typeof(p.card_shapes) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.card_shapes) x(elem)
    WHERE x.elem->>'shape' IN ('hero','poster','dome','ticket','square','brief','list'));

COMMIT;
