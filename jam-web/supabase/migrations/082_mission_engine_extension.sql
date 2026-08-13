-- 티켓 20260813_001: 종목별 대표 배지 레벨업 미션 게이팅 — 엔진/스키마 확장
-- 1) mission_type에 배지엔진 evaluateConditionDetailed 재사용 타입 3종 추가
--    (streak_days/duration_minutes/elevation_gain_m — badge-engine의 BadgeCondition과
--    동일한 필드 어휘를 그대로 사용)
-- 2) ends_at nullable화 — "상시 미션"(종료일 없음) 지원
-- 3) status_display_type에 개인형(individual) 추가 — 본인 진행상황만 반환하는 모드

-- 1) mission_type CHECK 재정의 (제약 이름을 하드코딩하지 않고 동적으로 찾아 교체)
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.missions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%mission_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.missions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_mission_type_check
  CHECK (mission_type IN (
    'distance', 'poi_visit', 'activity_count', 'item_collect',
    'streak_days', 'duration_minutes', 'elevation_gain_m'
  ));

-- 2) ends_at nullable — NULL = 상시 미션 (종료일 없음)
ALTER TABLE public.missions ALTER COLUMN ends_at DROP NOT NULL;

-- 3) status_display_type CHECK 재정의 — 'individual'(개인형: 본인 진행상황만 반환) 추가
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.missions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status_display_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.missions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_status_display_type_check
  CHECK (status_display_type IN ('ranking', 'achievement', 'individual'));
