-- item_books: 이미지 URL 추가
ALTER TABLE public.item_books ADD COLUMN IF NOT EXISTS image_url TEXT;

-- user_activity_badges: 배지 발급 트리거 액티비티 정보 저장
ALTER TABLE public.user_activity_badges
  ADD COLUMN IF NOT EXISTS triggered_by_strava_id BIGINT,
  ADD COLUMN IF NOT EXISTS triggered_by_activity_name TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by_distance_km NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS triggered_by_activity_date TEXT;
