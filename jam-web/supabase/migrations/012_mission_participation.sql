-- Phase 미션 고도화: 참가 선택 + 진행도 추적
CREATE TABLE IF NOT EXISTS user_mission_participations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id     UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  progress_value NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (user_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mission_participations_user ON user_mission_participations (user_id);
CREATE INDEX IF NOT EXISTS idx_user_mission_participations_mission ON user_mission_participations (mission_id);
