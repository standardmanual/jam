-- 티켓 20260819_008: 배경 제너레이터 실제 저장 연동
-- 배경 제너레이터(패턴/애니메이션 + Paper 필터)로 합성한 결과를 static PNG로 구워(bake)
-- Storage에 업로드한 뒤, 그 URL을 저장하는 컬럼. 원시 설정값(JSON)은 저장하지 않는다 —
-- 재편집 가능한 설정이 아니라 완성된 배경 이미지 1장을 저장하는 방식이다.
-- nullable + 기본값 NULL이므로 기존 쿼리·렌더링에 영향 없음.
-- background_color와 상호 배타적으로 쓰인다(둘 다 값이 남지 않도록 저장 시 반대쪽을 null로 정리
-- — 애플리케이션 레이어 책임, DB 제약으로 강제하지 않음).

ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS background_image_url TEXT DEFAULT NULL;

COMMENT ON COLUMN badges.background_image_url IS '배경 제너레이터로 합성 후 구운(bake) 정적 PNG의 Storage URL. NULL이면 기본 배경/background_color 사용. background_color와 상호 배타적(둘 다 값이 남지 않도록 애플리케이션에서 관리) (20260819_008).';
