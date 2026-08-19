-- 티켓 20260819_012: 애니메이션 배경 — 반복 영상 굽기 + 유저단 재생
--
-- 배경 제너레이터의 "애니메이션 모드" 결과를 짧은 반복 MP4(H.264)로 구워 Storage에 올린 뒤,
-- 그 URL을 저장하는 컬럼. 20260819_008에서 도입한 background_image_url은 그대로 유지되며
-- 영상 모드일 때도 항상 함께 채워진다 — <video poster>·첫 페인트·영상 로드 실패 폴백·
-- prefers-reduced-motion 대응용 정지 이미지로 계속 쓰인다.
--
-- 배경 3모드는 상호 배타적으로 저장된다(애플리케이션 레이어 책임, DB 제약으로 강제하지 않음):
--   1) 단색            : background_color 만
--   2) 정적 제너레이터 : background_image_url 만
--   3) 애니메이션      : background_image_url(poster) + background_video_url
--
-- nullable + 기본값 NULL이므로 기존 쿼리·렌더링에 영향 없음.

ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS background_video_url TEXT DEFAULT NULL;

COMMENT ON COLUMN badges.background_video_url IS '배경 제너레이터 애니메이션 모드 결과를 구운 반복 재생 MP4(H.264)의 Storage URL. NULL이면 영상 없음(단색/정적 배경). 값이 있으면 background_image_url은 poster/폴백 정지 이미지로 함께 채워진다 (20260819_012).';
