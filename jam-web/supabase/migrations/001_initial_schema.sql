-- JAM! Phase 1 초기 스키마
-- 생성일: 2026-07-09
-- 기반: PRD/02_DATA_MODEL.md

-- =========================================
-- 확장 기능 활성화
-- =========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================
-- users 테이블 (auth.users 확장)
-- =========================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  region TEXT NOT NULL DEFAULT '',
  activity_types TEXT[] NOT NULL DEFAULT '{}',
  -- activity_types 허용값: cycling, running, hiking, walking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 정책: 자신의 row만 읽기/쓰기 가능
CREATE POLICY "users: 본인만 읽기"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: 본인만 삽입"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users: 본인만 수정"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- =========================================
-- strava_connections 테이블
-- =========================================
CREATE TABLE IF NOT EXISTS public.strava_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  strava_athlete_id BIGINT NOT NULL UNIQUE,
  -- 주의: access_token, refresh_token은 AES-256으로 암호화하여 저장
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ,
  backfill_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strava_connections: 본인만 읽기"
  ON public.strava_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "strava_connections: 본인만 삽입"
  ON public.strava_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "strava_connections: 본인만 수정"
  ON public.strava_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "strava_connections: 본인만 삭제"
  ON public.strava_connections FOR DELETE
  USING (auth.uid() = user_id);

-- =========================================
-- badges 테이블 (마스터 데이터 — 어드민 등록)
-- =========================================
CREATE TYPE badge_type AS ENUM ('activity', 'item');
CREATE TYPE badge_rarity AS ENUM ('common', 'rare', 'legendary', 'mythic');

CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type badge_type NOT NULL,
  rarity badge_rarity NOT NULL DEFAULT 'common',
  image_url TEXT NOT NULL,
  -- condition_json 예시: {"distance_km": 50, "activity_type": "cycling"}
  condition_json JSONB,
  activity_types TEXT[] NOT NULL DEFAULT '{}',
  patch_available BOOLEAN NOT NULL DEFAULT FALSE,
  patch_price_krw INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- 배지 마스터는 전체 공개 읽기 (어드민만 쓰기)
CREATE POLICY "badges: 전체 읽기 허용"
  ON public.badges FOR SELECT
  TO authenticated
  USING (TRUE);

-- 어드민 쓰기는 service_role 키로만 (RLS 우회)

-- =========================================
-- user_activity_badges 테이블
-- (유저가 획득한 액티비티 배지 — 영구 귀속, 양도 불가)
-- =========================================
CREATE TABLE IF NOT EXISTS public.user_activity_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_by TEXT, -- strava_activity_id 등
  share_card_url TEXT,
  -- 동일 배지 중복 발급 방지
  UNIQUE(user_id, badge_id)
);

ALTER TABLE public.user_activity_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_activity_badges: 본인만 읽기"
  ON public.user_activity_badges FOR SELECT
  USING (auth.uid() = user_id);

-- 삽입은 서버 사이드(service_role)에서만 (배지 어뷰징 방지)
-- 클라이언트 INSERT 정책 없음 — service_role만 가능

-- =========================================
-- inventory 테이블 (유저당 1개)
-- =========================================
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  max_slots INTEGER NOT NULL DEFAULT 50,
  used_slots INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT used_slots_non_negative CHECK (used_slots >= 0),
  CONSTRAINT used_slots_within_limit CHECK (used_slots <= max_slots)
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory: 본인만 읽기"
  ON public.inventory FOR SELECT
  USING (auth.uid() = user_id);

-- =========================================
-- inventory_items 테이블 (인벤토리 내 아이템 배지)
-- =========================================
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id),
  serial_number SERIAL UNIQUE, -- 전 세계 발견 순서 고유 번호
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  obtained_by TEXT NOT NULL DEFAULT 'system_event', -- drop / system_event
  expires_at TIMESTAMPTZ -- 30일 후 자동 소멸
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_items: 본인만 읽기"
  ON public.inventory_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory inv
      WHERE inv.id = inventory_id
        AND inv.user_id = auth.uid()
    )
  );

-- =========================================
-- item_books 테이블 (아이템북 레시피)
-- =========================================
CREATE TABLE IF NOT EXISTS public.item_books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  required_activity_badge_id UUID NOT NULL REFERENCES public.badges(id),
  required_item_badge_ids JSONB NOT NULL DEFAULT '[]', -- UUID 배열
  reward_badge_id UUID REFERENCES public.badges(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.item_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_books: 전체 읽기 허용"
  ON public.item_books FOR SELECT
  TO authenticated
  USING (TRUE);

-- =========================================
-- poi 테이블 (전국 인증 포인트 — Phase 2용, 스키마 예약)
-- =========================================
CREATE TYPE poi_category AS ENUM ('mountain', 'bike_route', 'trail', 'park', 'other');

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

ALTER TABLE public.poi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poi: 전체 읽기 허용"
  ON public.poi FOR SELECT
  TO authenticated
  USING (TRUE);

-- =========================================
-- trades 테이블 (Phase 4+용 — 구조만 예약)
-- =========================================
CREATE TYPE trade_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

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

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- 거래 당사자만 읽기 가능
CREATE POLICY "trades: 거래 당사자만 읽기"
  ON public.trades FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- =========================================
-- 트리거: updated_at 자동 갱신
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_strava_connections_updated_at
  BEFORE UPDATE ON public.strava_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================================
-- 트리거: 신규 유저 auth.users → public.users 자동 생성
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
  );
  -- 인벤토리 자동 생성
  INSERT INTO public.inventory (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
