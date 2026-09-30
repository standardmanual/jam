-- 199: condition_json 허용 키 확장 — 믹스 행동 지표 4종 (JAM! 카테고리)
--      (티켓 20261001_0631, 상위 20260930_1456 ①)
--
-- 배경:
--   JAM! 종목(admin_category='jam') 배지에 "믹스를 몇 번 시도·성공·실패했는가", "이 레시피를 가장
--   먼저 성공했는가"를 조건으로 설정할 수 있게 하는 신규 키 4종을 연다:
--
--     - `combine_attempt_count`: 믹스 시도 횟수 ≥ 값. 성공 기록 수 + 실패 로그 중
--       `fail_reason = 'no_recipe_match'` 수. 재료가 소각되기 전에 끝난 실패는 세지 않는다.
--     - `combine_success_count`: 믹스 성공 횟수 ≥ 값 (`user_combine_success_logs` 행 수, 200).
--     - `combine_fail_count`: 믹스 실패 횟수 ≥ 값 (`no_recipe_match` 실패 로그 수).
--       예) {"combine_attempt_count": 10}
--     - `recipe_first_success`: 지정한 레시피를 전체 유저 중 처음 성공한 1명에게만 발급.
--       예) {"recipe_first_success": {"recipe_id": "<combination_recipes.id>"}}
--
--   155·161·172와 같은 자리(`role: 'meta'` + `evaluation: 'external'`)다. 이 키만 든 조건은
--   badge-engine의 `evaluateConditionDetailed`가 항상 fail 처리하므로(measurable 필드 없음) 메인
--   엔진에서 발급되지 않고, 실제 판정·발급은 `src/lib/badge-engine/jamActionBadges.ts`가 전담한다.
--
--   앞의 3개는 정수 ≥ 1, `recipe_first_success`는 값이 **object**다(172의 checkin 키와 같은 선례).
--
--   **measurable_keys(계열 정합성 트리거, 마이그레이션 140)에는 추가하지 않는다** —
--   role이 'meta'라 그 자체로 pass/fail을 만들지 않는다. CHECK 제약에만 추가한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포와 무관하게 먼저 실행해도 안전하다.** CHECK 제약을 넓히기만 하고
--    기존 condition_json은 한 글자도 건드리지 않는다. 다만 코드 배포(conditionRegistry.ts·
--    jamActionBadges.ts·badge-condition-guards.ts·어드민 조건 폼)보다는 먼저 실행돼야
--    어드민에서 이 키를 저장할 수 있다. 200(성공 기록 테이블)과는 서로 독립이다.
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD 로 작성했다.

BEGIN;

-- ── CHECK 제약 갱신 — 허용 키 58 → 62 ────────────────────────────────────
--
-- 172의 배열을 그대로 옮기고 신규 4종만 더한다.
-- `src/lib/badge-engine/conditionRegistry.ts`의 `CONDITION_FIELDS` 선언 순서·분류를 그대로 옮겼다.

ALTER TABLE public.badges
  DROP CONSTRAINT IF EXISTS badges_condition_json_known_keys;

ALTER TABLE public.badges
  ADD CONSTRAINT badges_condition_json_known_keys CHECK (
    condition_json IS NULL
    OR (
      condition_json - ARRAY[
        -- ── 조건 필드 (발급 판정에 관여) ──────────────────────────────
        -- 수치 검사 필드 (MEASURABLE) — 기존 17종
        'distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh',
        'max_pace_sec_per_km', 'temperature_min_c', 'temperature_max_c',
        'weekend_duration_hours', 'total_count', 'streak_days', 'weekly_count',
        'month', 'monthly_km', 'season_count', 'season_count_all',
        'active_days_count', 'time_range',
        -- 수치 검사 필드 (MEASURABLE) — v5 신규 18종 (131)
        --   활동 1건의 스칼라 값 (7)
        'max_elevation_m', 'max_speed_kmh', 'single_distance_km', 'single_elevation_m',
        'avg_heartrate_bpm', 'avg_watts', 'avg_cadence',
        --   이력 패턴 (11)
        'rest_after_streak', 'rest_after_long', 'return_gap_days', 'interval_days',
        'daily_once_count', 'weekly_streak', 'distinct_time_bands',
        'activities_within_hours', 'personal_record_break', 'month_over_month_ratio',
        'vs_personal_average',
        -- 수치 검사 필드 (MEASURABLE) — v5 반복 획득 1종 (132)
        'repeat_count',
        -- 수치 검사 필드 (MEASURABLE) — v5 확장 2종 (140)
        'cumulative_duration_hours', 'monthly_count',
        -- 필터 전용 필드 (그 자체만으로는 pass/fail을 만들지 않음) — 기존 7종
        'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route',
        'poi_id', 'season', 'same_activity',
        -- 필터 전용 필드 — v5 신규 2종 (131)
        'negative_split', 'day_of_month',
        -- 필터 전용 필드 — v5 2단 교차 게이트 3종 (133)
        'cross_in_axis', 'cross_between_axis', 'gate_mission_badge',
        -- 필터 전용 필드 — v5 확장 1종 (140, personal_record_break 짝)
        'personal_record_break_metric',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward',
        -- 메타데이터 필드 — 서비스 사용량 3종 (155, 티켓 20260910_1557)
        'follower_count', 'following_count', 'daily_sync_count',
        -- 메타데이터 필드 — 연속 동기화 일수 1종 (161, 티켓 20260911_2304)
        'daily_sync_streak_days',
        -- 메타데이터 필드 — 체크인 배지 보유 조건 2종 (172, 티켓 20260914_1725)
        'checkin_category_count', 'checkin_badge_count',
        -- 메타데이터 필드 — 믹스 행동 지표 4종 (199, 티켓 20260930_1456 ①)
        'combine_attempt_count', 'combine_success_count', 'combine_fail_count',
        'recipe_first_success'
      ]::text[]
    ) = '{}'::jsonb
  );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 기존 배지가 새 CHECK를 전부 만족하는지
-- SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;  -- 실행 전과 동일
--
-- -- ② 신규 키 4종이 실제로 통과하는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.badges (name, description, type, rarity, activity_types, condition_json)
--   VALUES ('__smoke_199__', '스모크', 'activity', 'common', ARRAY[]::text[],
--           '{"combine_attempt_count": 10, "combine_success_count": 5, "combine_fail_count": 3, "recipe_first_success": {"recipe_id": "00000000-0000-0000-0000-000000000000"}}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: 믹스 행동 지표 4키 INSERT 통과 (id=%)', v_id;
-- END
-- $smoke$;
--
-- -- ③ 미등록 키는 여전히 거부되는지 (실패해야 정상)
-- -- INSERT INTO public.badges (name, description, type, rarity, activity_types, condition_json)
-- -- VALUES ('__smoke_199_reject__', '스모크', 'activity', 'common', ARRAY[]::text[],
-- --         '{"combine_unknown_key": 1}'::jsonb);

-- 되돌림 SQL
-- 172의 CHECK 제약(허용 키 58개)으로 되돌린다: 172 파일의 DROP CONSTRAINT + ADD CONSTRAINT 블록(44-91줄)을 재실행한다.
-- 되돌리기 전에 신규 키를 쓰는 배지가 0건인지 먼저 확인한다. 0이 아니면 되돌림이 기존 행 때문에 실패한다:
-- SELECT count(*) FROM public.badges
--   WHERE condition_json ?| ARRAY['combine_attempt_count', 'combine_success_count', 'combine_fail_count', 'recipe_first_success'];
