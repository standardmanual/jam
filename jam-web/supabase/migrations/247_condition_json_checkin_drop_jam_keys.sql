-- 247: condition_json 허용 키 확장 — 체크인·드랍·잼 새 지표 6종 (JAM 2.0 액티비티 배지 조건 엔진 보강 2회)
--      (티켓 20261019_0542, 상위 20261018_1811, 운영 로직 10.2절, 새 계열 5-1·5-4·5-5·7-3·7-4·8-4)
--
-- 배경:
--   `badges.condition_json`의 허용 키(CHECK `badges_condition_json_known_keys`)를 86 → 92개로 넓힌다.
--     - `new_checkin_badge_count`: 새로 받은 체크인 배지의 서로 다른 종류 수 ≥ 값(5-1 처음 가 본 동네, 5-4는 값 1).
--     - `checkin_season_year_count`: 달력 연도(KST) 안에서 네 계절 모두 새 체크인 배지를 받은 해의 수 ≥ 값(5-5).
--     - `dropped_item_picked_up_count`: 내가 드랍한 서로 다른 아이템 중 다른 유저가 픽업한 수 ≥ 값(8-4).
--     - `jam_week_count`: 월~일(KST) 한 주에 `jam_week_min_earned` 이상 잼을 모은 주의 수 ≥ 값(7-3).
--     - `jam_week_streak`: 그런 주가 이어진 최장 주 수 ≥ 값(7-4).
--     - `jam_week_min_earned`: `jam_week_count`·`jam_week_streak`의 보조 키. 한 주에 모은 잼이 이 값 이상이면 «채운 주»다(7-3·7-4는 200).
--   242·246과 같은 자리(`role: 'meta'` + `evaluation: 'external'`)다. measurable_keys(마이그레이션 140)에는 넣지 않는다. 값은 정수 ≥ 1이다.
--
--   기존 `condition_json`은 한 글자도 건드리지 않고 허용 키만 넓힌다. 새 칸·새 함수·새 테이블은 없다.
--   CHECK 제약을 지우고 다시 거는 것은 기존 객체를 바꾸는 일이므로(넓히기만 한다) 사용자 승인을 받았다(티켓 20261019_0542 「사용자 결정」).
--
-- 실행 순서: 코드 배포보다 먼저 실행한다(넓히기만 하므로 안전). 재실행 가능(DROP ... IF EXISTS + ADD).

BEGIN;

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
        'recipe_first_success',
        -- 메타데이터 필드 — 드랍·픽업 지표 4종 (201, 티켓 20261001_0632)
        'drop_item_count', 'pickup_item_count', 'pickup_from_user_count',
        'picked_up_by_user_count',
        -- 메타데이터 필드 — 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표 (203, 티켓 20261001_0633)
        'mission_complete_count', 'collection_complete_count', 'days_since_signup',
        'signup_recent_active_days', 'weekly_active_days', 'same_spot_checkin_days',
        -- 메타데이터 필드 — 새 JAM 조건·잼·챕터 지표 8종 (242, 티켓 20261018_1815 2회)
        'capsule_open_count', 'locked_item_open_count', 'locked_item_pickup_count',
        'other_tribe_item_kinds_count', 'cross_tribe_combine_success_count',
        'jam_total_earned', 'jam_weekly_earned', 'chapter_reached',
        -- 메타데이터 필드 — 활동 기반 새 지표 6종 (246, 티켓 20261019_0542 1회)
        'active_week_streak', 'active_week_min_days', 'return_streak_weeks',
        'full_week_count', 'full_season_year_count', 'distinct_activity_type_count',
        -- 메타데이터 필드 — 체크인·드랍·잼 새 지표 6종 (247, 티켓 20261019_0542 2회)
        'new_checkin_badge_count', 'checkin_season_year_count', 'dropped_item_picked_up_count',
        'jam_week_count', 'jam_week_streak', 'jam_week_min_earned'
      ]::text[]
    ) = '{}'::jsonb
  );

COMMIT;

-- ── 검증 쿼리 ──────────────────────────────────────────────────────────────
-- ① 기존 배지가 새 CHECK를 전부 만족하는지(ADD가 실패하지 않으면 통과): SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;
-- ② 새 키 6종이 통과하고 미등록 키는 거부되는지는 롤백 스모크(DO 블록 + RAISE EXCEPTION)로 확인한다.

-- 되돌림 SQL
-- 246의 CHECK 제약(허용 키 86개)으로 되돌린다: 246 파일의 DROP CONSTRAINT + ADD CONSTRAINT 블록을 재실행한다.
-- 되돌리기 전에 새 키를 쓰는 배지가 0건인지 먼저 확인한다. 0이 아니면 되돌림이 기존 행 때문에 실패한다:
-- SELECT count(*) FROM public.badges
--   WHERE condition_json ?| ARRAY['new_checkin_badge_count', 'checkin_season_year_count', 'dropped_item_picked_up_count', 'jam_week_count', 'jam_week_streak', 'jam_week_min_earned'];
