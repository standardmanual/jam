-- poi_category는 Postgres ENUM이라 어드민에서 카테고리를 생성/삭제/수정할 수 없었음.
-- poi_categories 테이블로 옮기고 poi.category를 이 테이블을 참조하는 TEXT 컬럼으로 전환한다.
-- 드랍/픽업 자동검색 파이프라인(src/lib/poi/categories.ts)이 쓰는 8개 카테고리도 포함해서
-- 시드하되, 코드에 키워드가 하드코딩돼 있으므로 어드민 화면에서 "파이프라인 연동" 배지로 표시만 하고
-- 삭제/수정 자체는 막지 않는다(요청대로 자유 관리, 대신 UI에서 경고 표시).

CREATE TABLE IF NOT EXISTS public.poi_categories (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.poi_categories (slug, label) VALUES
  ('mountain', '산'),
  ('bike_route', '자전거길'),
  ('trail', '트레일'),
  ('park', '공원'),
  ('other', '기타'),
  ('government', '관공서'),
  ('transit', '대중교통'),
  ('hospital', '병원'),
  ('pharmacy', '약국'),
  ('tourist_attraction', '관광명소'),
  ('convenience', '편의점/마트'),
  ('food', '음식점/카페'),
  ('nature', '자연')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.poi ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.poi ALTER COLUMN category TYPE TEXT USING category::TEXT;
ALTER TABLE public.poi ALTER COLUMN category SET DEFAULT 'other';

ALTER TABLE public.poi
  ADD CONSTRAINT poi_category_fkey FOREIGN KEY (category)
  REFERENCES public.poi_categories(slug) ON UPDATE CASCADE ON DELETE RESTRICT;

DROP TYPE IF EXISTS public.poi_category;

ALTER TABLE public.poi_categories ENABLE ROW LEVEL SECURITY;
-- 서버(service role)만 접근 — 카테고리 목록도 어드민 API를 통해서만 노출
