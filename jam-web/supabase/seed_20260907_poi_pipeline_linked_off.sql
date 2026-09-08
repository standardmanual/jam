-- 티켓 20260907_1811 [Infra] POI 자동수집 중단 및 수동등록 전환
--
-- 순수 데이터 변경(스키마 변경 없음). 네이버 지역검색 기반 자동수집(T2) 파이프라인 연동
-- 10개 카테고리(government/convenience/nature/tourist_attraction/stadium/school/park/
-- hospital/pharmacy/food) 전부 pipeline_linked=false로 전환한다.
--
-- 배경: 티켓 문서(Service Plan/Tickets/P2-일반/20260907_1811_...)의 "배경/문제 정의" 참고.
-- 네이버 지역검색 API의 반경/밀도 한계, 검증 게이트 사실상 비활성 상태, 포괄 명사 키워드의
-- 명칭 오염(음식점이 편의점으로 저장되는 등) 다수 실측 확인. 좌표기반 서드파티 대안도 전무
-- (NCP Maps 미지원, 카카오는 이용정책상 영구저장 금지)해 자동수집을 전면 중단하고 수동등록으로
-- 전환하기로 결정.
--
-- 이미 mountain·train_subway는 마이그레이션 144에서 pipeline_linked=false로 전환됐다(별도
-- 공공데이터 스크립트 등록 데이터라 이번 오염 문제와 무관). 이번 변경은 나머지 10개 카테고리다.
--
-- 기존 자동수집 POI(poi_tier=2, mountain, train_subway)는 이 변경으로 손대지 않는다 —
-- 지금 상태(활성/비활성) 그대로 유지한다.
--
-- 코드(naver.ts/category-gate.ts/search-cache.ts, drops/route.ts의 searchAndPersistCategories·
-- refreshPoisInBackground)는 삭제하지 않고 그대로 남겨 나중에 재사용 가능하게 한다.

UPDATE public.poi_categories
SET pipeline_linked = false
WHERE slug IN (
  'government', 'convenience', 'nature', 'tourist_attraction', 'stadium',
  'school', 'park', 'hospital', 'pharmacy', 'food'
);
