-- POI 카테고리별 파이프라인 연동 여부/티어/키워드를 어드민에서 직접 관리할 수 있도록
-- poi_categories에 컬럼 추가. 이전에는 src/lib/poi/categories.ts에 8개 카테고리의
-- 키워드/티어가 하드코딩돼 있었음 — 이제 이 테이블이 단일 소스가 되고, 드랍/픽업
-- 자동검색 파이프라인(api/drops)은 매 요청마다 이 테이블을 조회해 동작한다.

ALTER TABLE public.poi_categories
  ADD COLUMN IF NOT EXISTS pipeline_linked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier SMALLINT,
  ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.poi_categories
  ADD CONSTRAINT poi_categories_tier_check CHECK (tier IS NULL OR tier IN (1, 2));

-- 기존 8개 파이프라인 카테고리 값 이관 (src/lib/poi/categories.ts POI_CATEGORIES 하드코딩값 그대로)
UPDATE public.poi_categories SET pipeline_linked = true, tier = 1, keywords = ARRAY['주민센터', '구청', '시청'] WHERE slug = 'government';
UPDATE public.poi_categories SET pipeline_linked = true, tier = 1, keywords = ARRAY['지하철역', '버스정류장'] WHERE slug = 'transit';
UPDATE public.poi_categories SET pipeline_linked = true, tier = 1, keywords = ARRAY['병원'] WHERE slug = 'hospital';
UPDATE public.poi_categories SET pipeline_linked = true, tier = 1, keywords = ARRAY['약국'] WHERE slug = 'pharmacy';
UPDATE public.poi_categories SET pipeline_linked = true, tier = 1, keywords = ARRAY['관광명소'] WHERE slug = 'tourist_attraction';
UPDATE public.poi_categories SET pipeline_linked = true, tier = 1, keywords = ARRAY['국립공원', '계곡', '해수욕장', '폭포'] WHERE slug = 'nature';
UPDATE public.poi_categories SET pipeline_linked = true, tier = 2, keywords = ARRAY['편의점', '마트'] WHERE slug = 'convenience';
UPDATE public.poi_categories SET pipeline_linked = true, tier = 2, keywords = ARRAY['카페', '음식점'] WHERE slug = 'food';

-- 나머지(mountain/bike_route/trail/park/other 등 기존 tier-1 수동등록 전용 카테고리)는
-- pipeline_linked=false 기본값 그대로 — 이번 개편 이전에 파이프라인 연동이 없던 카테고리는
-- 미연동을 기본값으로 유지한다는 요구사항.
