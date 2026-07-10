-- 005에서 만든 부분 인덱스(ON CONFLICT 불가)를 UNIQUE 제약으로 교체
DROP INDEX IF EXISTS public.idx_poi_osm_id;

ALTER TABLE public.poi
  ADD CONSTRAINT poi_osm_id_unique UNIQUE (osm_id);
