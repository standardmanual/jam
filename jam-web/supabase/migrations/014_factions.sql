-- factions (세계관) 마스터 테이블
CREATE TABLE IF NOT EXISTS public.factions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  image_url TEXT,
  drop_weight NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  drop_condition_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;

-- 전체 읽기 허용 (authenticated), 쓰기는 service_role만 (RLS 우회)
CREATE POLICY "factions: 전체 읽기 허용"
  ON public.factions FOR SELECT
  TO authenticated
  USING (TRUE);
