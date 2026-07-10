-- Phase 7: OSM POI 연동을 위한 osm_id 컬럼 추가
ALTER TABLE public.poi
  ADD COLUMN IF NOT EXISTS osm_id TEXT,
  ADD COLUMN IF NOT EXISTS poi_tier INTEGER NOT NULL DEFAULT 1;

-- osm_id 유니크 인덱스 (upsert용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_poi_osm_id ON public.poi(osm_id)
  WHERE osm_id IS NOT NULL;

-- T2 POI는 tier=2
-- tier 1: 어드민 수동 등록 (지하철, 공원)
-- tier 2: OSM 자동 임포트 (편의점, 카페)
