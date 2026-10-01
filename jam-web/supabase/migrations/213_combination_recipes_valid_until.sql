-- combination_recipes(믹스 레시피) 테이블에 종료 시각 컬럼 추가 (티켓 20261002_0710, 상위 20260930_1450)
-- badges.valid_until(마이그레이션 025)·item_books.valid_until(마이그레이션 171)과 같은 이름·같은 의미다.
-- valid_until: null이면 종료 없음(상시, 기존 레시피 전체의 현재 동작), 값이 있으면 그 시각부터 종료한다.
--
-- 2026-10-01에 정한 「레시피에는 종료 시각이 없고 내릴 때는 삭제한다」(마이그레이션 204)를 2026-10-02
-- 사용자 결정 「레시피에도 기간 설정 필요」로 뒤집는다. 204 파일의 주석은 옛 파일이라 고치지 않는다.
-- 종료된 레시피는 공개 전과 같이 일반 유저에게 「없는 레시피」다: 믹스 화면 목록·슬롯·보상 미리보기에서
-- 빠지고, 믹스 시도는 재료를 소각하기 전에 recipe_not_found로 거절된다(판정은 코드의 isRecipeReleased 하나).
-- 이미 받은 보상은 그대로이고, 삭제 가드도 그대로다.
--
-- 확장(Expand) 단계 하나뿐이다. 백필 없음 — 기존 행은 null로 남아 동작이 바뀌지 않는다.
-- 코드가 valid_until을 select하므로 이 마이그레이션을 코드 머지보다 먼저 적용한다.
-- 기존 행은 valid_until이 null이라 아래 CHECK가 기존 행을 깨지 않는다.

ALTER TABLE public.combination_recipes
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ NULL;

-- 공개 시각과 종료 시각이 모두 있으면 공개가 종료보다 앞서야 한다(서버 assertValidPeriod와 같은 규칙).
-- ADD CONSTRAINT에는 IF NOT EXISTS가 없어 DROP 후 추가로 재실행에 안전하게 한다.
ALTER TABLE public.combination_recipes
  DROP CONSTRAINT IF EXISTS combination_recipes_valid_period_check;

ALTER TABLE public.combination_recipes
  ADD CONSTRAINT combination_recipes_valid_period_check
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_from < valid_until);

COMMENT ON COLUMN public.combination_recipes.valid_until IS
  '종료 시각. null = 종료 없음(상시), 값이 있으면 그 시각부터 종료(valid_from <= now < valid_until일 때만 공개). 종료된 레시피는 일반 유저에게 없는 레시피와 같고 이미 받은 보상은 그대로다. 티켓 20261002_0710';

-- 되돌림 SQL
-- 칸을 지우면 이미 종료된(내려간) 레시피가 즉시 다시 공개된다. 되돌리기 전에 아래 쿼리가 0인지 확인한다.
--   SELECT count(*) FROM public.combination_recipes WHERE valid_until IS NOT NULL AND valid_until <= now();
-- 0이 아니면 그 레시피를 먼저 삭제하거나(슬롯은 CASCADE), 다시 공개할지 정한 뒤 되돌린다.
-- 순서: 제약 → 칼럼.
-- ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_valid_period_check;
-- ALTER TABLE public.combination_recipes DROP COLUMN IF EXISTS valid_until;
