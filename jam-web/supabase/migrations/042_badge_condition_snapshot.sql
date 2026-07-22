-- 배지 발급 근거(조건·실측값·트리거 활동)를 어드민이 나중에 확인할 수 있도록 스냅샷 저장
-- 배경: 배지가 왜 발급됐는지(어떤 실측값이 조건을 만족시켰는지) 기록이 없어서
-- 유저 문의 발생 시 원본 GPX/Strava 데이터를 다시 뒤져야 했음. 어드민 전용 필드 —
-- 일반 유저 화면에는 노출하지 않는다.
ALTER TABLE public.user_activity_badges
  ADD COLUMN IF NOT EXISTS condition_snapshot JSONB;

COMMENT ON COLUMN public.user_activity_badges.condition_snapshot IS
  '어드민 전용 — 발급 시점의 condition_json + 실측값(actual/required) + 트리거 활동 요약. 일반 유저에게 노출 금지.';
