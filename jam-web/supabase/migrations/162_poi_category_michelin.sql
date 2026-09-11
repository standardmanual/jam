-- 162_poi_category_michelin.sql
-- POI 카테고리에 '미슐랭'(미쉐린 가이드 서울 스타 레스토랑) 신설.
-- 수동 큐레이션 카테고리라 mountain·train_subway·route와 동일하게
-- pipeline_linked=false, requires_review=false(직접 등록 후 pending_review로 검토 큐 처리),
-- display_on_map=true, keywords=[](자동 수집 대상 아님).
insert into poi_categories (slug, label, pipeline_linked, tier, requires_review, display_on_map, keywords)
values ('michelin', '미슐랭', false, null, false, true, '[]'::jsonb)
on conflict (slug) do nothing;
