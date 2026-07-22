-- 네이버 지역검색 기반 T2 POI 카테고리 확장
-- 기존 poi_category는 tier-1(어드민 수동 등록, 산/자전거길/트레일/공원)만 표현했음.
-- 드랍/픽업 지점 POI를 관공서/교통/병원/약국/관광명소/편의점/카페 등으로 넓히기 위해 값 추가.
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'government';
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'transit';
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'hospital';
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'pharmacy';
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'tourist_attraction';
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'convenience';
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'food';
ALTER TYPE public.poi_category ADD VALUE IF NOT EXISTS 'nature';
