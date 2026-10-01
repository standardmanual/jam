-- 203: condition_json 허용 키 확장 — 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표 6종 (JAM! 카테고리)
--      (티켓 20261001_0633, 상위 20260930_1456 ③)
--
-- 배경:
--   JAM! 종목(admin_category='jam') 배지에 "미션을 몇 개 완료했는가", "컬렉션을 몇 개 완성했는가",
--   "가입한 지 며칠인가", "한 주에 며칠 활동했는가", "같은 지점에 며칠 체크인했는가"를 조건으로
--   설정할 수 있게 하는 신규 키 6종을 연다:
--
--     - `mission_complete_count`: 내가 완료한 서로 다른 미션 수 ≥ 값. 전체 기록.
--     - `collection_complete_count`: 내가 완성한 서로 다른 컬렉션 수 ≥ 값. 전체 기록.
--     - `days_since_signup`: 가입한 날(KST)부터 오늘(KST)까지의 날짜 차 ≥ 값. 가입한 날이 0.
--     - `signup_recent_active_days`: `days_since_signup`의 보조 키(선택). 오늘(KST)을 포함한 최근
--       30일 가운데 활동한 날 수 ≥ 값. 있으면 가입 일수와 이 조건을 둘 다 채워야 발급한다.
--     - `weekly_active_days`: 월~일(KST) 한 주 안의 활동한 날 수 ≥ 값. 역대 최고 주의 값.
--     - `same_spot_checkin_days`: 지점(poi_id)별 체크인한 서로 다른 날(KST) 수의 최댓값 ≥ 값.
--       예) {"days_since_signup": 100, "signup_recent_active_days": 4}
--
--   155·161·172·199·201과 같은 자리(`role: 'meta'` + `evaluation: 'external'`)다. 이 키만 든 조건은
--   badge-engine의 `evaluateConditionDetailed`가 항상 fail 처리하므로(measurable 필드 없음) 메인
--   엔진에서 발급되지 않고, 실제 판정·발급은 `src/lib/badge-engine/jamActionBadges.ts`가 전담한다
--   (계산은 `jamActionCompletionMetrics.ts`·`jamActionDayMetrics.ts`).
--
--   6개 모두 값이 정수 ≥ 1이다(199·201의 수치 키와 같은 모양).
--
--   **measurable_keys(계열 정합성 트리거, 마이그레이션 140)에는 추가하지 않는다** —
--   role이 'meta'라 그 자체로 pass/fail을 만들지 않는다. CHECK 제약에만 추가한다.
--
--   새 테이블·함수·인덱스는 없다. 원천 네 테이블(`user_mission_completions`·
--   `user_item_book_completions`·`strava_activities`·`user_checkin_badge_earns`)은 모두 `user_id`
--   선두 인덱스가 있어 별도 인덱스 마이그레이션을 만들지 않는다(2026-10-01 라이브 확인).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포보다 먼저 실행한다.** CHECK 제약을 넓히기만 하고 기존 condition_json은
--    한 글자도 건드리지 않으므로 먼저 실행해도 안전하다. 코드 배포(conditionRegistry.ts·
--    jamActionBadges.ts·어드민 조건 폼)보다 먼저 실행돼야 어드민에서 이 키를 저장할 수 있다.
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD 로 작성했다.

BEGIN;

-- ── CHECK 제약 갱신 — 허용 키 66 → 72 ────────────────────────────────────
--
-- 201의 배열을 그대로 옮기고 신규 6종만 더한다.
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
        'recipe_first_success',
        -- 메타데이터 필드 — 드랍·픽업 지표 4종 (201, 티켓 20261001_0632)
        'drop_item_count', 'pickup_item_count', 'pickup_from_user_count',
        'picked_up_by_user_count',
        -- 메타데이터 필드 — 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표 (203, 티켓 20261001_0633)
        'mission_complete_count', 'collection_complete_count', 'days_since_signup',
        'signup_recent_active_days', 'weekly_active_days', 'same_spot_checkin_days'
      ]::text[]
    ) = '{}'::jsonb
  );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 기존 배지가 새 CHECK를 전부 만족하는지
-- SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;  -- 실행 전과 동일
--
-- -- ② 신규 키 6종이 실제로 통과하는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.badges (name, description, type, rarity, activity_types, condition_json)
--   VALUES ('__smoke_203__', '스모크', 'activity', 'common', ARRAY[]::text[],
--           '{"mission_complete_count": 1, "collection_complete_count": 1, "days_since_signup": 100, "signup_recent_active_days": 4, "weekly_active_days": 3, "same_spot_checkin_days": 10}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표 6키 INSERT 통과 (id=%)', v_id;
-- END
-- $smoke$;
--
-- -- ③ 미등록 키는 여전히 거부되는지 (실패해야 정상)
-- -- INSERT INTO public.badges (name, description, type, rarity, activity_types, condition_json)
-- -- VALUES ('__smoke_203_reject__', '스모크', 'activity', 'common', ARRAY[]::text[],
-- --         '{"signup_unknown_key": 1}'::jsonb);
--
-- ── 6지표 기준값 쿼리 (읽기 전용 — 코드 계산(jamActionDayMetrics.ts 머리 주석의 SQL 등가식)과 대조한다) ──
-- 2026-10-01 라이브에서 실행 확인했다. 「활동한 날」 = 가입한 날(KST) 이후, JAM! 종목이 있고 걷기 게이트
-- (0.5km·10분 이상, 평균 시속 2~8km)와 차량 속도 상한을 통과한 활동의 시작 날짜(KST) ∪ 체크인한 날
-- (triggered_by_activity_date, KST). date_trunc('week', …)는 월요일 시작이라 월~일 규칙과 같다.
--
-- WITH su AS (SELECT id, (created_at AT TIME ZONE 'Asia/Seoul')::date AS sd FROM users),
-- pol AS (
--   SELECT CASE WHEN (to_jsonb(p)->>'vehicle_speed_filter_kmh')::numeric > 0 THEN (to_jsonb(p)->>'vehicle_speed_filter_kmh')::numeric ELSE 60 END AS vmax
--   FROM abusing_policy p WHERE p.id = 1
-- ),
-- act_days AS (
--   SELECT a.user_id, (a.start_date AT TIME ZONE 'Asia/Seoul')::date AS d
--   FROM strava_activities a JOIN su ON su.id = a.user_id
--   WHERE (a.start_date AT TIME ZONE 'Asia/Seoul')::date >= su.sd
--     AND a.normalized->>'jamActivityType' IS NOT NULL
--     AND (a.normalized->>'averageSpeedKmh')::numeric <= (SELECT vmax FROM pol)
--     AND (a.normalized->>'jamActivityType' <> 'walking'
--          OR ((a.normalized->>'distanceKm')::numeric >= 0.5
--              AND (a.normalized->>'movingTimeSec')::numeric / 60 >= 10
--              AND (a.normalized->>'averageSpeedKmh')::numeric BETWEEN 2 AND 8))
-- ),
-- chk AS (
--   SELECT e.user_id, e.poi_id, (e.triggered_by_activity_date AT TIME ZONE 'Asia/Seoul')::date AS d
--   FROM user_checkin_badge_earns e JOIN su ON su.id = e.user_id
--   WHERE e.triggered_by_activity_date IS NOT NULL
--     AND (e.triggered_by_activity_date AT TIME ZONE 'Asia/Seoul')::date >= su.sd
-- ),
-- days AS (SELECT user_id, d FROM act_days UNION SELECT user_id, d FROM chk),
-- wk AS (SELECT user_id, date_trunc('week', d)::date AS w, count(*) AS n FROM days GROUP BY 1, 2),
-- spot AS (SELECT user_id, poi_id, count(DISTINCT d) AS n FROM chk GROUP BY 1, 2)
-- SELECT su.id,
--   (SELECT count(*) FROM user_mission_completions m WHERE m.user_id = su.id) AS mission_complete_count,
--   (SELECT count(*) FROM user_item_book_completions c WHERE c.user_id = su.id) AS collection_complete_count,
--   (now() AT TIME ZONE 'Asia/Seoul')::date - su.sd AS days_since_signup,
--   (SELECT count(*) FROM days WHERE days.user_id = su.id AND days.d > (now() AT TIME ZONE 'Asia/Seoul')::date - 30) AS signup_recent_active_days,
--   COALESCE((SELECT max(n) FROM wk WHERE wk.user_id = su.id), 0) AS weekly_active_days,
--   COALESCE((SELECT max(n) FROM spot WHERE spot.user_id = su.id), 0) AS same_spot_checkin_days
-- FROM su;

-- 되돌림 SQL
-- 201의 CHECK 제약(허용 키 66개)으로 되돌린다: 201 파일의 DROP CONSTRAINT + ADD CONSTRAINT 블록(44-97줄)을 재실행한다.
-- 되돌리기 전에 신규 키를 쓰는 배지가 0건인지 먼저 확인한다. 0이 아니면 되돌림이 기존 행 때문에 실패한다:
-- SELECT count(*) FROM public.badges
--   WHERE condition_json ?| ARRAY['mission_complete_count', 'collection_complete_count', 'days_since_signup', 'signup_recent_active_days', 'weekly_active_days', 'same_spot_checkin_days'];
