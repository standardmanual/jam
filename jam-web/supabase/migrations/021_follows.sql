BEGIN;

CREATE TABLE user_follows (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_follows_unique UNIQUE (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

CREATE INDEX idx_user_follows_follower  ON user_follows(follower_id);
CREATE INDEX idx_user_follows_following ON user_follows(following_id);

-- RLS
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- 누구나 팔로우 관계 조회 가능 (공개 팔로우)
CREATE POLICY "Anyone can view follows"
  ON user_follows FOR SELECT
  USING (true);

-- 본인만 팔로우 추가 가능
CREATE POLICY "Users can follow others"
  ON user_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- 본인만 언팔로우 가능
CREATE POLICY "Users can unfollow"
  ON user_follows FOR DELETE
  USING (auth.uid() = follower_id);

COMMIT;
