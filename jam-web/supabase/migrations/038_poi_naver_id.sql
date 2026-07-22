-- 네이버 지역검색 연동을 위한 naver_id 컬럼 추가 (OSM 대체)
ALTER TABLE public.poi
  ADD COLUMN IF NOT EXISTS naver_id TEXT;

-- naver_id 유니크 제약 (upsert용, NULL은 여러 행 허용)
ALTER TABLE public.poi
  ADD CONSTRAINT poi_naver_id_unique UNIQUE (naver_id);

-- 기존 osm_id/poi_tier 컬럼과 데이터는 그대로 유지 (과거 OSM으로 수집된 tier-2 행 보존)
-- tier 1: 어드민 등록 (네이버 지역검색으로 장소를 찾아 좌표/이름을 채워 넣음)
-- tier 2: 네이버 지역검색 자동 임포트 (편의점, 카페)
