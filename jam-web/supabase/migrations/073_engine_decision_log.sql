-- 배지·드랍 엔진 판정 과정 구조화 로그
-- 목적: "왜 이 배지가 발급/미발급됐는지", "왜 이 아이템이 뽑혔는지"를
-- 사후에 SQL 조회만으로 재구성할 수 있게 한다. (2026-08-01 배지·드랍 엔진 신뢰성 개선)

CREATE TABLE IF NOT EXISTS public.engine_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('badge', 'drop')),
  -- 'sync_result' | 'drop_attempt' | 'point_award_failed' | 'faction_constant_missing' 등
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engine_decision_log_user
  ON public.engine_decision_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_decision_log_event
  ON public.engine_decision_log (engine, event, created_at DESC);

-- drop_policy와 동일하게 어드민(service_role) 전용 — RLS 미적용
