-- 티켓 20260819_013: 컬렉션·세계관 배경 일괄 적용 — 스키마 신설(선행 작업)
--
-- badges 테이블에 이미 있는 background_image_url(20260819_008)/background_video_url(20260819_012)과
-- 동일한 패턴을 item_books/factions에도 추가한다. 상위 관리 단위(컬렉션/세계관)에서 배경 제너레이터로
-- 만든 배경을 소속 배지 전체에 일괄 적용할 수 있게 하기 위한 선행 스키마 작업이다.
--
-- 기존 background_color/background_shader_id(20260818_004)는 이번 범위에서 다루지 않는다
-- (background_shader_id는 이미 미사용 placeholder — 제거하지 않음).
--
-- nullable + 기본값 NULL이므로 기존 쿼리·렌더링에 영향 없음. 실제 어드민 화면 UI 연결과
-- "하위 배지 일괄 적용" 캐스케이드 로직 확장은 후속 티켓(014, 015)에서 진행한다.

ALTER TABLE item_books
  ADD COLUMN IF NOT EXISTS background_image_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_video_url TEXT DEFAULT NULL;

ALTER TABLE factions
  ADD COLUMN IF NOT EXISTS background_image_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_video_url TEXT DEFAULT NULL;

COMMENT ON COLUMN item_books.background_image_url IS '컬렉션 단위 배경 제너레이터 결과(정적 이미지 또는 애니메이션 poster)의 Storage URL. NULL이면 배경 없음. 소속 배지에 일괄 적용하는 캐스케이드 로직은 후속 티켓에서 구현 (20260819_013).';
COMMENT ON COLUMN item_books.background_video_url IS '컬렉션 단위 배경 제너레이터 애니메이션 모드 결과를 구운 반복 재생 MP4(H.264)의 Storage URL. NULL이면 영상 없음. 값이 있으면 background_image_url은 poster/폴백 정지 이미지로 함께 채워진다 (20260819_013).';
COMMENT ON COLUMN factions.background_image_url IS '세계관 단위 배경 제너레이터 결과(정적 이미지 또는 애니메이션 poster)의 Storage URL. NULL이면 배경 없음. 소속 배지에 일괄 적용하는 캐스케이드 로직은 후속 티켓에서 구현 (20260819_013).';
COMMENT ON COLUMN factions.background_video_url IS '세계관 단위 배경 제너레이터 애니메이션 모드 결과를 구운 반복 재생 MP4(H.264)의 Storage URL. NULL이면 영상 없음. 값이 있으면 background_image_url은 poster/폴백 정지 이미지로 함께 채워진다 (20260819_013).';
