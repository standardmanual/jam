-- ============================================================
-- Migration 060: 배지 소프트 삭제
--
-- 배경: 이미 유저가 보유한 배지(user_activity_badges 등)를 하드 삭제하면
--  FK 위반 에러가 나고, 억지로 CASCADE 시키면 유저의 발급 이력까지 같이
--  사라진다. 요구사항은 "서비스에서는 삭제된 것처럼 취급하되, 이미 보유한
--  유저의 이력은 서버에 남긴다" — 즉 badges 행 자체는 유지하고
--  deleted_at만 세팅해 신규 발급/노출 대상에서 제외한다.
-- ============================================================

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.badges.deleted_at IS
  '소프트 삭제 시각. NULL이 아니면 신규 발급/드랍/노출 대상에서 제외되지만, 이미 발급받은 유저의 이력(user_activity_badges 등)은 그대로 조회 가능.';

CREATE INDEX IF NOT EXISTS badges_deleted_at_idx ON public.badges (deleted_at) WHERE deleted_at IS NOT NULL;
