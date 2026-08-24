-- 기차/지하철 POI 카테고리 분리 (20260824_023)
--
-- 배경: transit(대중교통) 카테고리에 지하철·기차역과 버스정류장·출구·자전거대여소가 섞여 있었다.
-- 역 929개에 JAM METRO 디자인 배지 이미지를 새로 만들면서(20260824_020) 이 둘을 분리한다.
--
-- 실행 순서 주의: poi.category → poi_categories.slug FK(ON UPDATE CASCADE / ON DELETE RESTRICT)가
-- 있으므로 카테고리 행을 먼저 INSERT한 뒤에야 poi를 UPDATE할 수 있다.
--
-- 코드 선행 배포 필수: src/lib/poi/radius-policy.ts의 EXACT_MATCH_RADIUS_BY_CATEGORY에
-- train_subway: 50 이 배포된 뒤에 실행해야 한다. 없으면 어드민에서 해당 POI를 수정하거나
-- 배지를 재연결하는 순간 반경이 기본값 500m로 풀려 20260811_006 오탐 인시던트가 재발한다.

-- 1) 새 카테고리 생성
--    slug는 API 검증 규칙(^[a-z][a-z0-9_]*$)상 한글 불가 → train_subway
--    label은 기존 컨벤션("편의점/마트", "음식점/카페")에 맞춰 슬래시 사용
INSERT INTO public.poi_categories (slug, label, pipeline_linked, tier, keywords)
VALUES ('train_subway', '기차/지하철', true, 1, ARRAY['지하철역'])
ON CONFLICT (slug) DO NOTHING;

-- 2) 이름이 '역'으로 끝나는 transit POI를 새 카테고리로 이동 (929건)
--    tier 1 = 929건(역), tier 2 = 69건(그 외)으로 경계가 정확히 일치함을 사전 확인했다.
UPDATE public.poi SET category = 'train_subway'
WHERE category = 'transit' AND name LIKE '%역';

-- 3) 자동수집 키워드 이관 — '지하철역'은 새 카테고리가 가져가고 transit에는 '버스정류장'만 남긴다.
--    이렇게 해야 앞으로 수집되는 역 POI가 다시 대중교통으로 섞이지 않는다.
UPDATE public.poi_categories SET keywords = ARRAY['버스정류장']
WHERE slug = 'transit';

-- 4) 산 카테고리 정리 — 네이버 검색이 '산' 키워드로 잘못 수집한 6건을 기타로 이동.
--    (산김영준국어논술전문학원 / 산안드레스 / 산오빌라 / 샌프란시스코마켓 /
--     서울용산국제학교 / 신동와인 본사 직영점 — 전부 배지 미연결 tier 2)
--    이로써 mountain은 POI 847개 = 배지 847개로 1:1 완전 일치한다.
UPDATE public.poi SET category = 'other'
WHERE category = 'mountain' AND linked_badge_id IS NULL;
