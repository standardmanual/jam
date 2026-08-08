-- ============================================================
-- Migration 077: user_drop_state.common_streak INTEGER → NUMERIC(8,2)
--
-- 배경:
--   걷기 배지 v4의 드랍엔진 activity_type 가중치(walking 0.4, 축1 게이트
--   통과 활동에만 적용 — jam-web/src/lib/drop-engine/constants.ts의
--   ACTIVITY_TYPE_DROP_WEIGHT)로 인해 common_streak(rare+ pity 진행 카운터)가
--   더 이상 정수 1씩만 증가하지 않고 0.4 같은 소수 단위로도 증가한다.
--   INTEGER 컬럼에 소수를 넣으면 매 upsert마다 반올림되어(0.4 → 0) 걷기 활동의
--   pity 기여가 세션 간에 누적되지 못하고 사라지는 문제가 있어 컬럼 타입을 넓힌다.
-- ============================================================

BEGIN;

ALTER TABLE public.user_drop_state
  ALTER COLUMN common_streak TYPE NUMERIC(8,2) USING common_streak::NUMERIC(8,2),
  ALTER COLUMN common_streak SET DEFAULT 0;

COMMIT;
