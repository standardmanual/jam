-- 티켓 20260909_2119: 온보딩 재설계 — 트라이브(세계관) 선택 도입
--
-- 1) users.faction_id 추가 — 온보딩에서 고른 트라이브(세계관). nullable로 추가한다
--    (기존 유저 로우가 이미 존재하므로 NOT NULL 즉시 강제는 불가 — 온보딩 API 레벨
--    필수 검증으로 시작하고, DB 제약 전환은 기존 유저 백필 이후 별도 과제로 미룬다).
-- 2) users.onboarding_completed_at 추가 — SERVICE_OPERATIONS.md에는 "이미 존재"로
--    서술돼 있었으나 착수 시 실제 스키마·코드 전수 확인 결과 이 컬럼이 어디에도
--    존재하지 않는 것으로 드러났다(문서-구현 불일치, 이번 티켓에서 신규 추가로 정정).
--    온보딩 완료(2단계, 트라이브 포함) 시점에만 이 값을 기록해, 1단계만 마친 신규
--    유저는 재로그인 시 온보딩으로 정확히 복귀하고 기존 유저는 강제 재온보딩되지
--    않도록 판정 기준으로 쓴다.
--
-- 배포 순서(안전, region/activity_types 삭제와 분리 — 파괴적이지 않으므로 코드 배포와
-- 동시 적용 가능): 이 마이그레이션만 우선 적용한다.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS faction_id UUID REFERENCES public.factions(id),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.faction_id IS
  '온보딩에서 유저가 직접 선택한 세계관(유저 대면 명칭: 트라이브). 탈퇴 전까지 불변 — 변경 API 없음.';
COMMENT ON COLUMN public.users.onboarding_completed_at IS
  '온보딩 2단계(아이디·이름 + 트라이브·프로필이미지)까지 완료된 시각. NULL이면 온보딩 미완료.';

-- ⚠️ 백필 필수 — 이 컬럼은 방금 처음 추가됐으므로 기존 로우는 전부 NULL이다.
-- `/auth/callback`은 이 값이 NULL이면 무조건 `/onboarding`으로 리다이렉트하므로, 백필 없이
-- 배포하면 이미 가입을 마친 기존 유저(username 보유)까지 전부 다음 로그인 때 강제로
-- 온보딩 화면에 갇힌다 — 성공 기준("기존 유저는 강제 재온보딩 없음")을 정면으로 위반한다.
-- username이 이미 있는 유저는 과거 1단계 온보딩을 이미 마친 것으로 간주해 지금 이 시점을
-- 완료 시각으로 채운다(faction_id는 여전히 NULL로 남아 후속 백필 과제로 넘긴다).
UPDATE public.users
SET onboarding_completed_at = NOW()
WHERE username IS NOT NULL
  AND onboarding_completed_at IS NULL;
