-- 142: missions.mission_type CHECK에 'engine_condition' 추가 (티켓 20260906_2231)
--
-- 배경:
--   게이트 미션 40종(걷기 8 + 4종목 32)의 완료 조건을 실측한 결과, 기존
--   `mission_type` 6종(distance·checkin·activity_count·item_collect·streak_days·
--   duration_minutes·elevation_gain_m — 필드 하나씩만 보는 단순 타입)으로는 32건 중
--   다수를 표현할 수 없었다(「N주 연속 한 주에 M회」·「한 번에 X 이상 / N회」·
--   「다음 날 휴식」 결합·「서로 다른 K개 요일/두 달」 등). 배지엔진 수준 표현력
--   (`repeat_count`·`rest_after_long`·`single_distance_km`·`max_pace_sec_per_km` 등)을
--   그대로 위임하는 신규 타입 `engine_condition`을 추가한다
--   (`src/lib/missions/engineCondition.ts`가 판정한다).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: 코드 배포보다 먼저 실행해야 한다 — 배포된 코드가 'engine_condition'
--    미션을 INSERT하려는 순간 이 CHECK가 없으면 저장이 거부된다. 게이트 미션 40종
--    시딩 SQL(`seed_v5_gate_missions.sql`)보다 먼저 실행할 것.
--
-- 재실행 가능(idempotent): 제약을 동적으로 찾아 지운 뒤 다시 만든다(082/103 패턴).

BEGIN;

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
    'distance', 'checkin', 'activity_count', 'item_collect',
    'streak_days', 'duration_minutes', 'elevation_gain_m',
    'engine_condition'
  ));

COMMIT;

-- 🧪 적용 후 검증
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.missions'::regclass AND contype = 'c'
--      AND pg_get_constraintdef(oid) LIKE '%mission_type%';
--   → 'engine_condition' 포함 확인

-- ↩️ 롤백 DDL (engine_condition을 쓰는 행이 없을 때만 안전)
--    ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_mission_type_check;
--    ALTER TABLE public.missions
--      ADD CONSTRAINT missions_mission_type_check
--      CHECK (mission_type IN (
--        'distance', 'checkin', 'activity_count', 'item_collect',
--        'streak_days', 'duration_minutes', 'elevation_gain_m'
--      ));
