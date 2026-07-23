-- poi_search_cache: 결과 0건이었던 검색은 짧은 TTL로 재시도되도록 구분
--
-- 배경: 2026-07-23 네이버 지역검색 API에 좌표/지역명을 안 붙이던 버그(마이그레이션 불필요,
-- 코드 수정 건)로 인해 상권이 밀집한 지역에서도 검색 결과가 0건으로 나왔고, 그 "0건" 결과가
-- 7일 TTL로 캐시돼버려 코드를 고친 뒤에도 같은 지역은 최대 7일간 재검색이 안 되는 문제가 있었다.
-- had_results=false인 캐시는 훨씬 짧은 TTL(1시간)로 재시도하도록 애플리케이션 로직을 분기한다.
--
-- 기존 행은 전부 had_results=false로 백필 — 그 시점 결과가 0건이었는지 실제로는 알 수 없지만,
-- true로 기본값을 주면 이번 버그로 오염된 0건 캐시가 계속 7일 TTL로 남아있게 되므로 안전한
-- 쪽(짧은 TTL로 재검색되게)으로 백필한다. 이미 POI가 실제로 존재하는 지역은 poi 테이블에
-- 데이터가 남아있어 재검색해도 중복 삽입 없이(naver_id UNIQUE) 정상 동작한다.
ALTER TABLE public.poi_search_cache
  ADD COLUMN IF NOT EXISTS had_results BOOLEAN NOT NULL DEFAULT false;
