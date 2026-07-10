-- =============================================
-- JAM! 어뷰징 정책 시스템
-- =============================================

-- 1. 어뷰징 정책 설정 (싱글톤 — id=1 고정)
CREATE TABLE IF NOT EXISTS public.abusing_policy (
  id                        INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Soft-ban: 고가치 아이템 차단 배율 (0.0 = 완전 차단, 1.0 = 정상)
  soft_common_rate          NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  soft_rare_rate            NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  soft_legendary_rate       NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  soft_mythic_rate          NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  -- Hard-ban: 잡템만 허용
  hard_common_rate          NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  hard_rare_rate            NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  hard_legendary_rate       NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  hard_mythic_rate          NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  -- GPS 조작 감지 임계값 (km/h 초과 시 이동 불가 판정)
  gps_max_speed_kmh         INTEGER NOT NULL DEFAULT 300,
  -- GPS 조작 감지 후 POI 블록 지속 시간 (기본 72시간)
  poi_block_hours           INTEGER NOT NULL DEFAULT 72,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기본 정책 삽입
INSERT INTO public.abusing_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. 유저 섀도우밴
CREATE TABLE IF NOT EXISTS public.user_shadow_bans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ban_level    TEXT NOT NULL CHECK (ban_level IN ('soft', 'hard')),
  reason       TEXT NOT NULL DEFAULT '',
  expires_at   TIMESTAMPTZ,           -- NULL = 영구
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT NOT NULL DEFAULT 'admin',
  UNIQUE (user_id)
);

-- 3. POI 영역 개인 블록 (GPS 조작 감지 후 72시간 드랍/픽업 차단)
CREATE TABLE IF NOT EXISTS public.poi_blocks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  poi_id         UUID NOT NULL REFERENCES public.poi(id) ON DELETE CASCADE,
  blocked_until  TIMESTAMPTZ NOT NULL,
  reason         TEXT NOT NULL DEFAULT 'gps_spoof_detected',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, poi_id)
);

-- 4. users 테이블에 마지막 위치 추가 (GPS 조작 감지용)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_location_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_location_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_location_at   TIMESTAMPTZ;

-- 5. 어뷰징 로그
CREATE TABLE IF NOT EXISTS public.abusing_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,  -- 'gps_spoof_detected' | 'soft_ban_applied' | 'hard_ban_applied' | 'poi_block_applied'
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: 어드민만 읽기/쓰기 (service_role로만 접근)
ALTER TABLE public.abusing_policy   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_shadow_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_blocks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abusing_logs     ENABLE ROW LEVEL SECURITY;

-- service_role는 RLS bypass이므로 별도 정책 불필요
-- anon / authenticated 유저는 읽기 불가 (정책 없음 = 거부)
