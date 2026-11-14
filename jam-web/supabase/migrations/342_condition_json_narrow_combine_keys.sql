-- 342: condition_json 허용 키 축소 — `recipe_first_success` 제거 (티켓 20261114_1705 4회차)
--
-- 배경:
--   «가장 먼저 성공» 배지 조건(`recipe_first_success`)을 없애고 레시피의 첫 성공자 보상 옵션(340의 `first_success_badge_id`)으로
--   바꿨다. 코드·양식·문구에서 이 조건을 걷었고, 이 조건을 쓰는 배지는 프로덕션 DB에 0개다(삭제된 배지 포함, 2026-11-14 확인).
--   `badges.condition_json`의 허용 키(CHECK `badges_condition_json_known_keys`)를 92 → 91개로 좁힌다. 나머지 키는 247과 같다.
--   함수·표·칸은 바꾸지 않는다. 믹스 성공 기록의 `is_recipe_first` 칸·`record_combine_success_with_id`·부분 유일 인덱스는 첫 성공자 보상이 쓰므로 남긴다.
--
-- 실행 순서: 축소(Contract)라 «이 키를 쓰는 코드가 배포된 뒤»가 아니라 «이 키를 더 이상 쓰지 않는 코드가 배포된 뒤»에 실행한다
--   (옛 코드가 이 키로 저장하면 이 제약이 거절한다). 재실행 가능(DROP ... IF EXISTS + ADD).
--
-- 되돌림 SQL은 `_down.sql` 짝 파일이 아니라 아래 파일 끝 주석에 둔다 — `condition-registry.test.ts`가 «ADD CONSTRAINT badges_condition_json_known_keys»를
--   가진 파일 중 번호가 가장 큰 것을 최신 CHECK 정의로 읽는데, 같은 번호의 `_down.sql`이 이 문장을 가지면 그쪽이 최신으로 읽힌다(247도 같은 이유로 주석 형식이다).

BEGIN;

-- 사전 점검: 지우는 키를 쓰는 배지가 하나라도 있으면(삭제된 배지 포함) 새 CHECK가 걸리지 않고 ADD가 실패한다.
-- 프로덕션 확인값은 0건(2026-11-14)이다. 0이 아니면 조건을 바꾼 뒤 다시 실행한다.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.badges WHERE condition_json ? 'recipe_first_success';
  IF n > 0 THEN
    RAISE EXCEPTION 'recipe_first_success 조건을 쓰는 배지가 %개 남아 있어요. 먼저 조건을 바꾸거나 지워주세요.', n;
  END IF;
END $$;

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
        -- 메타데이터 필드 — 믹스 행동 지표 3종 (199, 티켓 20260930_1456 ①. 4번째 `recipe_first_success`는 342에서 걷었다)
        'combine_attempt_count', 'combine_success_count', 'combine_fail_count',
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
-- ① 제약이 걸렸는지(ADD가 실패하지 않으면 통과): SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;
-- ② `recipe_first_success`가 거부되고 다른 키는 통과하는지는 롤백 스모크(DO 블록 + RAISE EXCEPTION)로 확인한다.

-- 되돌림 SQL
-- 247의 CHECK 제약(허용 키 92개, `recipe_first_success` 포함)으로 되돌린다: 247 파일의 DROP CONSTRAINT + ADD CONSTRAINT 블록을 재실행한다.
-- 되돌리면 `recipe_first_success` 조건을 다시 저장할 수 있지만, 코드가 이 조건을 판정하지 않아 발급되지 않는다(코드까지 되돌려야 판정된다).
