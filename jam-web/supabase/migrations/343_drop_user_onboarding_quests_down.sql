-- 343 되돌림: user_onboarding_quests를 195번 정의로 다시 만들고 백업 표의 행을 복원한다.
-- 티켓 20261115_2059. 백업 표(user_onboarding_quests_backup_20261115)가 있을 때만 쓴다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_onboarding_quests (
  user_id           UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  step_progress     JSONB       NOT NULL DEFAULT '{}',
  skipped_at        TIMESTAMPTZ NULL,
  completed_at      TIMESTAMPTZ NULL,
  reward_granted_at TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_onboarding_quests_select_own ON public.user_onboarding_quests;
CREATE POLICY user_onboarding_quests_select_own
  ON public.user_onboarding_quests
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_onboarding_quests IS
  '온보딩 퀘스트(연출용 1~7단계) 유저별 진행 상태(티켓 20260927_2124). 343번 되돌림으로 복원됨. RLS는 본인 SELECT만 허용, 쓰기는 service_role 전용.';

INSERT INTO public.user_onboarding_quests (user_id, step_progress, skipped_at, completed_at, reward_granted_at, created_at)
  SELECT user_id, step_progress, skipped_at, completed_at, reward_granted_at, created_at
  FROM public.user_onboarding_quests_backup_20261115
  ON CONFLICT (user_id) DO NOTHING;

COMMIT;
