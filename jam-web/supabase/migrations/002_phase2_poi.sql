-- Phase 2: POI 인증 시스템
-- user_activity_badges에 POI 연결 컬럼 추가

ALTER TABLE public.user_activity_badges
  ADD COLUMN IF NOT EXISTS triggered_by_poi_id UUID REFERENCES public.poi(id);

-- poi 테이블은 Phase 1에서 이미 생성됨 (001_initial_schema.sql)
-- RLS 정책도 이미 있음 ("poi: 전체 읽기 허용")

-- triggered_by_poi_id 인덱스 추가 (POI별 발급 배지 조회 성능)
CREATE INDEX IF NOT EXISTS idx_user_activity_badges_poi
  ON public.user_activity_badges (triggered_by_poi_id)
  WHERE triggered_by_poi_id IS NOT NULL;
