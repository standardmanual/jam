-- Phase 6: 드랍/픽업 시스템

-- 드랍 이벤트
CREATE TABLE IF NOT EXISTS public.drop_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  badge_id UUID NOT NULL REFERENCES public.badges(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 50,
  total_quantity INTEGER NOT NULL DEFAULT 10,
  claimed_quantity INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 픽업 기록
CREATE TABLE IF NOT EXISTS public.drop_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drop_event_id UUID NOT NULL REFERENCES public.drop_events(id),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  strava_activity_id TEXT,
  UNIQUE(drop_event_id, user_id)  -- 유저당 1회
);

-- 드랍 확률 테이블 (어드민 조정 가능)
CREATE TABLE IF NOT EXISTS public.drop_probability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rarity TEXT NOT NULL UNIQUE,  -- common/rare/legendary/mythic/none
  probability NUMERIC(5,4) NOT NULL,  -- 0.0000 ~ 1.0000
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본값 INSERT
INSERT INTO public.drop_probability (rarity, probability) VALUES
  ('common', 0.4000),
  ('rare', 0.2500),
  ('legendary', 0.1000),
  ('mythic', 0.0500),
  ('none', 0.2000)
ON CONFLICT (rarity) DO NOTHING;

-- RLS
ALTER TABLE public.drop_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_probability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drop_events: 전체 읽기" ON public.drop_events FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "drop_claims: 본인만 읽기" ON public.drop_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "drop_probability: 전체 읽기" ON public.drop_probability FOR SELECT TO authenticated USING (TRUE);
