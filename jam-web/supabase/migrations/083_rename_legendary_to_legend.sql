-- badge_rarity enum 값 'legendary' → 'legend' 변경
-- PostgreSQL 10+에서 지원하는 RENAME VALUE는 기존 행 데이터를 자동으로 반영하므로
-- activity_badges, item_badges, drops 등 badge_rarity 컬럼을 가진 테이블의
-- 데이터 UPDATE는 불필요하다.

ALTER TYPE badge_rarity RENAME VALUE 'legendary' TO 'legend';

-- 실행 후 검증 쿼리 (아래를 별도로 실행해 enum 값이 'legend'로 변경됐는지 확인)
-- SELECT enum_range(NULL::badge_rarity);
-- 기대 결과: {common,rare,legend,mythic}
