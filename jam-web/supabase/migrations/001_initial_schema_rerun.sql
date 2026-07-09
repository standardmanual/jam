-- JAM! Phase 1 초기 스키마 — 재실행 안전 버전
-- 이미 일부 실행된 경우에도 오류 없이 재실행 가능

-- =========================================
-- 확장 기능 활성화
-- =========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================
-- ENUM 타입 (이미 존재하면 건너뜀)
-- =========================================
DO $$ BEGIN
  CREATE TYPE badge_type AS ENUM ('activity', 'item');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE badge_rarity AS ENUM ('common', 'rare', 'legendary', 'mythic');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE poi_category AS ENUM ('mountain', 'bike_route', 'trail', 'park', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================
-- 테이블 생성 (IF NOT EXISTS)
-- =========================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  region TEXT NOT NULL DEFAULT '',
  activity_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strava_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  strava_athlete_id BIGINT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ,
  backfill_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type badge_type NOT NULL,
  rarity badge_rarity NOT NULL DEFAULT 'common',
  image_url TEXT NOT NULL,
  condition_json JSONB,
  activity_types TEXT[] NOT NULL DEFAULT '{}',
  patch_available BOOLEAN NOT NULL DEFAULT FALSE,
  patch_price_krw INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_activity_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_by TEXT,
  share_card_url TEXT,
  UNIQUE(user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  max_slots INTEGER NOT NULL DEFAULT 50,
  used_slots INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT used_slots_non_negative CHECK (used_slots >= 0),
  CONSTRAINT used_slots_within_limit CHECK (used_slots <= max_slots)
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id),
  serial_number SERIAL UNIQUE,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  obtained_by TEXT NOT NULL DEFAULT 'system_event',
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.item_books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  required_activity_badge_id UUID NOT NULL REFERENCES public.badges(id),
  required_item_badge_ids JSONB NOT NULL DEFAULT '[]',
  reward_badge_id UUID REFERENCES public.badges(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poi (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 50,
  category poi_category NOT NULL DEFAULT 'other',
  linked_badge_id UUID REFERENCES public.badges(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offer_item_id UUID NOT NULL REFERENCES public.inventory_items(id),
  request_item_id UUID NOT NULL REFERENCES public.inventory_items(id),
  status trade_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- RLS 활성화
-- =========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- =========================================
-- RLS 정책 — 기존 것 삭제 후 재생성
-- =========================================

-- users
DROP POLICY IF EXISTS "users: 본인만 읽기" ON public.users;
DROP POLICY IF EXISTS "users: 본인만 삽입" ON public.users;
DROP POLICY IF EXISTS "users: 본인만 수정" ON public.users;
CREATE POLICY "users: 본인만 읽기" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users: 본인만 삽입" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users: 본인만 수정" ON public.users FOR UPDATE USING (auth.uid() = id);

-- strava_connections
DROP POLICY IF EXISTS "strava_connections: 본인만 읽기" ON public.strava_connections;
DROP POLICY IF EXISTS "strava_connections: 본인만 삽입" ON public.strava_connections;
DROP POLICY IF EXISTS "strava_connections: 본인만 수정" ON public.strava_connections;
DROP POLICY IF EXISTS "strava_connections: 본인만 삭제" ON public.strava_connections;
CREATE POLICY "strava_connections: 본인만 읽기" ON public.strava_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "strava_connections: 본인만 삽입" ON public.strava_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strava_connections: 본인만 수정" ON public.strava_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "strava_connections: 본인만 삭제" ON public.strava_connections FOR DELETE USING (auth.uid() = user_id);

-- badges
DROP POLICY IF EXISTS "badges: 전체 읽기 허용" ON public.badges;
CREATE POLICY "badges: 전체 읽기 허용" ON public.badges FOR SELECT TO authenticated USING (TRUE);

-- user_activity_badges
DROP POLICY IF EXISTS "user_activity_badges: 본인만 읽기" ON public.user_activity_badges;
CREATE POLICY "user_activity_badges: 본인만 읽기" ON public.user_activity_badges FOR SELECT USING (auth.uid() = user_id);

-- inventory
DROP POLICY IF EXISTS "inventory: 본인만 읽기" ON public.inventory;
CREATE POLICY "inventory: 본인만 읽기" ON public.inventory FOR SELECT USING (auth.uid() = user_id);

-- inventory_items
DROP POLICY IF EXISTS "inventory_items: 본인만 읽기" ON public.inventory_items;
CREATE POLICY "inventory_items: 본인만 읽기" ON public.inventory_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.inventory inv WHERE inv.id = inventory_id AND inv.user_id = auth.uid()));

-- item_books
DROP POLICY IF EXISTS "item_books: 전체 읽기 허용" ON public.item_books;
CREATE POLICY "item_books: 전체 읽기 허용" ON public.item_books FOR SELECT TO authenticated USING (TRUE);

-- poi
DROP POLICY IF EXISTS "poi: 전체 읽기 허용" ON public.poi;
CREATE POLICY "poi: 전체 읽기 허용" ON public.poi FOR SELECT TO authenticated USING (TRUE);

-- trades
DROP POLICY IF EXISTS "trades: 거래 당사자만 읽기" ON public.trades;
CREATE POLICY "trades: 거래 당사자만 읽기" ON public.trades FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- =========================================
-- 트리거 함수 (OR REPLACE — 항상 안전)
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 (DROP IF EXISTS 후 재생성)
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_strava_connections_updated_at ON public.strava_connections;
CREATE TRIGGER trg_strava_connections_updated_at
  BEFORE UPDATE ON public.strava_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_trades_updated_at ON public.trades;
CREATE TRIGGER trg_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================================
-- 신규 유저 자동 생성 트리거
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.inventory (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
