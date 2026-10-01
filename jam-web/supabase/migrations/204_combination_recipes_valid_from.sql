-- combination_recipes(믹스 레시피) 테이블에 공개 시각 컬럼 추가 (티켓 20261001_1157, 상위 20260930_1458 O16)
-- badges.valid_from(마이그레이션 025)·item_books.valid_from(마이그레이션 171)과 같은 이름·같은 의미다.
-- valid_from: null이면 처음부터 공개(기존 레시피 전체의 현재 동작), 값이 있으면 그 시각부터 공개한다.
--
-- 종료 시각(valid_until)은 만들지 않는다 — 레시피는 영구이고 내릴 때는 삭제한다.
-- 공개 전 레시피는 일반 유저에게 「없는 레시피」와 같다: 믹스 화면 목록·슬롯·보상 미리보기에서 빠지고,
-- 믹스 시도는 재료를 소각하기 전에 recipe_not_found로 거절된다(판정은 코드의 isRecipeReleased 하나).
--
-- 확장(Expand) 단계 하나뿐이다. 백필 없음 — 기존 행은 null로 남아 즉시 공개가 유지된다.

ALTER TABLE public.combination_recipes
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;

COMMENT ON COLUMN public.combination_recipes.valid_from IS
  '공개 시각. null = 처음부터 공개, 값이 있으면 그 시각부터 공개(경계 포함). 공개 전에는 일반 유저에게 없는 레시피와 같다. 종료 시각은 없다. 티켓 20261001_1157';

-- 되돌림 SQL
-- 칸을 지우면 아직 공개 전인(예약 중인) 레시피가 즉시 공개로 바뀐다. 되돌리기 전에 아래 쿼리가 0인지 확인한다.
--   SELECT count(*) FROM public.combination_recipes WHERE valid_from > now();
-- 0이 아니면 그 레시피를 먼저 삭제하거나(슬롯은 CASCADE), valid_from을 null로 지워 공개 여부를 정한 뒤 되돌린다.
-- ALTER TABLE public.combination_recipes DROP COLUMN IF EXISTS valid_from;
