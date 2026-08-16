-- 티켓 20260815_003: missions 테이블에 썸네일 이미지 URL 컬럼 추가
-- 기존 미션에는 null, 이후 어드민에서 업로드 시 채워짐

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

COMMENT ON COLUMN missions.image_url IS '미션 카드 썸네일 이미지 URL (Supabase Storage). NULL이면 이미지 없음 처리.';
