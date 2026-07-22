-- 네이버 지역검색 재호출 방지용 캐시
-- 같은 위치(grid_key)·카테고리 조합을 최근에 이미 검색했다면 TTL 내에는 재호출을 건너뛴다.
-- (하루 호출 한도 25,000회 절약 목적. 실제 POI 데이터 자체는 poi 테이블에 영구 저장되어 재사용됨 —
--  이 테이블은 "이 지역을 언제 마지막으로 검색했는지"만 기록하는 순수 캐시 메타데이터)
CREATE TABLE IF NOT EXISTS public.poi_search_cache (
  grid_key TEXT NOT NULL,
  category TEXT NOT NULL,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (grid_key, category)
);

ALTER TABLE public.poi_search_cache ENABLE ROW LEVEL SECURITY;
-- 서버(service role)만 접근 — 별도 정책 없이 anon/authenticated는 접근 불가
