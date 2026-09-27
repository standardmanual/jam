-- 195: 온보딩 퀘스트 진행 상태 테이블(user_onboarding_quests) 신규
-- 티켓 20260927_2124(상위 20260927_2123) — 작성만, 실행은 사용자 승인 후 오케스트레이터
--
-- 배경:
--   온보딩 퀘스트(1~7단계는 연출용)를 기기와 무관하게 이어 가려면 서버에 유저 단위 진행
--   상태가 필요하다. 대상은 기능 배포 이후 온보딩 2단계를 마친 신규 유저뿐이므로, 행의
--   존재 자체를 "퀘스트 대상"의 기준으로 삼는다(기존 유저 백필 없음).
--
-- 설계:
--   - user_id: PK이자 users(id) FK. 유저 삭제 시 CASCADE로 함께 삭제.
--   - step_progress: 단계 키(sync·bag·pickup·mix_fail·mix_success·drop·browse, 퀘스트 1~7단계)
--     → 완료 시각(ISO 문자열) JSONB. 기본값 '{}'.
--   - skipped_at: 건너뛰기(T8) 시각. 값이 있으면 완료 배지를 받을 수 없다.
--   - completed_at: 실제 첫 활동 유입 시각(T6).
--   - reward_granted_at: 완료 배지·100P 지급 시각(T7, 멱등 기준).
--   - RLS: 켜고 본인 행 SELECT만 허용. INSERT·UPDATE·DELETE 정책은 두지 않는다
--     (서버의 service_role 경로만 쓴다).
--   - 행 생성은 POST /api/onboarding/complete가 service_role로 처리한다(이 파일은 스키마만 연다).
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS · DROP POLICY IF EXISTS로 작성했다.

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
  '온보딩 퀘스트(연출용 1~7단계) 유저별 진행 상태(티켓 20260927_2124). 기능 배포 이후 온보딩 2단계를 마친 신규 유저에게만 행이 생긴다(기존 유저 백필 없음) — 행의 존재 자체가 퀘스트 대상 기준. RLS는 본인 SELECT만 허용, 쓰기는 service_role 전용.';
COMMENT ON COLUMN public.user_onboarding_quests.step_progress IS
  '단계 키(sync·bag·pickup·mix_fail·mix_success·drop·browse, 퀘스트 1~7단계) → 완료 시각(ISO 문자열) 매핑.';
COMMENT ON COLUMN public.user_onboarding_quests.skipped_at IS
  '건너뛰기(T8) 시각. 값이 있으면 완료 배지를 받을 수 없다.';
COMMENT ON COLUMN public.user_onboarding_quests.completed_at IS
  '실제 첫 활동 유입 시각(T6).';
COMMENT ON COLUMN public.user_onboarding_quests.reward_granted_at IS
  '완료 배지·100P 지급 시각(T7). 멱등 처리 기준 컬럼.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 테이블·PK·FK가 만들어졌는지
-- SELECT conname, contype FROM pg_constraint WHERE conrelid = 'public.user_onboarding_quests'::regclass;
--
-- -- ② RLS가 켜졌고 본인 SELECT 정책만 있는지
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'user_onboarding_quests';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_onboarding_quests'; -- select 1행이어야 정상
--
-- -- ③ 기존 유저에게 소급 생성된 행이 없는지(배포 직후 0행이어야 정상)
-- SELECT count(*) FROM public.user_onboarding_quests;

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.user_onboarding_quests;
