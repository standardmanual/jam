-- JAM! 유저 활동 피드 테이블
-- 생성일: 2026-07-13

CREATE TYPE feed_event_type AS ENUM (
  'badge_earned',
  'item_dropped',
  'item_picked_up',
  'mission_joined',
  'mission_completed',
  'mission_cancelled'
);

CREATE TABLE IF NOT EXISTS public.user_activity_feed (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type feed_event_type NOT NULL,
  event_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 이벤트별 메타데이터:
  -- badge_earned:     { badge_id, badge_name, badge_image_url, rarity }
  -- item_dropped:     { badge_id, badge_name, badge_image_url, rarity, poi_name }
  -- item_picked_up:   { badge_id, badge_name, badge_image_url, rarity, poi_name, dropper_user_id }
  -- mission_joined:   { mission_id, mission_title }
  -- mission_completed:{ mission_id, mission_title, reward_type, reward_points }
  -- mission_cancelled:{ mission_id, mission_title }
  metadata   JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_user_activity_feed_user_event
  ON public.user_activity_feed (user_id, event_at DESC);

ALTER TABLE public.user_activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_feed: 본인만 읽기"
  ON public.user_activity_feed FOR SELECT
  USING (auth.uid() = user_id);

-- service_role은 RLS 우회하므로 별도 정책 불필요
