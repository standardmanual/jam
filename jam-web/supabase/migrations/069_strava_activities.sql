-- Strava 활동 영구 저장 테이블
-- 생성일: 2026-07-30
--
-- 배경: 동기화가 커서(last_synced_at) 기반 단방향 조회라서,
-- Strava/Garmin 쪽 색인 지연으로 활동이 커서를 지나쳐버리면 영원히 누락되는 문제가 있었음.
-- 이를 해결하기 위해 (1) 동기화 시 소폭 overlap을 두고 재조회하고,
-- (2) 이미 처리된 활동은 이 테이블로 멱등 처리하여 중복 보상을 막고,
-- (3) 별도 정합성 점검(reconcile) 크론이 이 테이블과 Strava 목록을 대조해 누락분을 소급 처리한다.

CREATE TABLE IF NOT EXISTS public.strava_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  strava_id       BIGINT NOT NULL,
  start_date      TIMESTAMPTZ NOT NULL,
  jam_activity_type TEXT,
  distance_km     NUMERIC,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_via   TEXT NOT NULL DEFAULT 'sync', -- 'sync' | 'reconcile' | 'manual_backfill'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, strava_id)
);

CREATE INDEX IF NOT EXISTS idx_strava_activities_user_start
  ON public.strava_activities (user_id, start_date DESC);

ALTER TABLE public.strava_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strava_activities: 본인만 읽기"
  ON public.strava_activities FOR SELECT
  USING (auth.uid() = user_id);

-- service_role은 RLS 우회하므로 별도 정책 불필요
