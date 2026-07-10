-- Phase 15: 아이템 조합/비밀 조합법
CREATE TABLE IF NOT EXISTS combination_recipes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_badge_ids  UUID[]  NOT NULL,           -- 재료 배지 2~3개
  result_badge_id       UUID    NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  success_rate          FLOAT   NOT NULL DEFAULT 1.0 CHECK (success_rate >= 0 AND success_rate <= 1),
  hint_text             TEXT,                        -- is_public=false 시 표시되는 힌트
  is_public             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 16: 다이나믹 미션 시스템
CREATE TABLE IF NOT EXISTS missions (
  id               UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT     NOT NULL,
  description      TEXT,
  mission_type     TEXT     NOT NULL CHECK (mission_type IN ('distance', 'poi_visit', 'activity_count', 'item_collect')),
  condition_json   JSONB    NOT NULL,
  reward_type      TEXT     NOT NULL CHECK (reward_type IN ('badge', 'points', 'item_badge')),
  reward_id        UUID,                            -- badge/item_badge 보상 ID
  reward_points    INTEGER,                         -- points 보상 시 포인트 수
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  max_completions  INTEGER,                         -- NULL = 무제한
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_mission_completions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id   UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_missions_active ON missions (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_user_mission_completions_user ON user_mission_completions (user_id);

-- Phase 17: 신화 아이템 떠돌이 속성
ALTER TABLE badges ADD COLUMN IF NOT EXISTS is_wandering BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS wandering_mythic_state (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id         UUID NOT NULL UNIQUE REFERENCES badges(id) ON DELETE CASCADE,
  current_poi_id   UUID REFERENCES poi(id),
  holder_user_id   UUID REFERENCES users(id),
  placed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  times_caught     INTEGER NOT NULL DEFAULT 0
);

-- Phase 18: 데이터 무결성 정책
-- ① 어뷰징 정책: 차량 속도 필터 컬럼 추가
ALTER TABLE abusing_policy ADD COLUMN IF NOT EXISTS vehicle_speed_filter_kmh INTEGER NOT NULL DEFAULT 60;

-- ② poi_drops: 30일 자동 만료 컬럼 추가
ALTER TABLE poi_drops ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days');

-- 기존 드랍에도 만료일 설정 (드랍된 시점 + 30일)
UPDATE poi_drops SET expires_at = dropped_at + INTERVAL '30 days' WHERE expires_at IS NULL;
