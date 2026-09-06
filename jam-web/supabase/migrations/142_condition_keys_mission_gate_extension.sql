-- 142: condition_json 허용 키 확장 — 미션 게이트 확장 어휘 4종
--      + missions.mission_type CHECK에 'engine_condition' 추가
--      (티켓 20260906_2231, 마스터 20260905_0026 후속)
--
-- 배경:
--   게이트 미션 40종(걷기 8 + 4종목 32)이 요구하는 「주기(N주/개월 연속 M회)」·
--   「시간대별 각 N회」·「서로 다른 요일 수」·「서로 다른 달 개수(각각 임계값)」 4가지는
--   기존 어휘로 근사하면 반복·시간대 분산 요건이 사라지는 실제 결함이 된다(티켓
--   20260906_1947이 미션 INSERT를 보류하고 분리한 이유). `missions/checker.ts`가
--   `MissionCondition`을 `BadgeCondition`으로 캐스팅해 `evaluateConditionDetailed`에
--   넘기는 기존 통로(티켓 20260813_001)를 그대로 확장한다 — `src/lib/badge-engine/
--   conditionRegistry.ts`의 `CONDITION_FIELDS`에 4종을 추가했다(engine 평가, 티켓
--   20260906_2231에서 바로 구현·`evaluateConditionDetailed`에 반영 완료).
--
--   **badges에는 아직 쓰이지 않는다** — 이 4종은 지금까지 `missions.condition_json`
--   전용이다. 그래도 `condition-registry.test.ts`가 「레지스트리 ↔ DB CHECK ↔ 트리거
--   measurable_keys」 3자 동기화를 강제하므로(140 파일과 같은 원칙 — 조건 필드 1개를
--   추가하면 이 세 곳을 함께 고친다), badges 테이블에도 CHECK를 열어 둔다. badges에
--   이 키를 실제로 쓰는 계열이 생기기 전까지는 이 CHECK가 통과 범위를 넓히기만 할 뿐
--   기존 630여 행의 판정에는 아무 영향이 없다.
--
--   ⚠️ **게이트 리뷰 FAIL 재작업(2026-09-06)**: 초안은 `condition_json` 허용 키만
--   확장하고 `missions.mission_type` CHECK 제약(`missions_mission_type_check`)에
--   `engine_condition`을 추가하지 않았다. 이 제약의 최신 정의는 082가 처음 만들고
--   103이 값 하나를 바꾼(`poi_visit`→`checkin`) 7종(`distance`·`checkin`·
--   `activity_count`·`item_collect`·`streak_days`·`duration_minutes`·
--   `elevation_gain_m`)뿐이라, `seed_v5_gate_missions.sql`의 `mission_type='engine_condition'`
--   INSERT 33건이 전부 CHECK 위반으로 트랜잭션 롤백된다(0행 삽입). 082·103이 쓴 패턴
--   그대로(제약 이름을 하드코딩하지 않고 동적으로 찾아 DROP 후 확장 목록으로 재생성)
--   ⑤ 블록에서 8번째 값으로 추가한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포와 무관하게 먼저 실행해도 안전하다.** CHECK 제약을 넓히기만 하고
--    기존 condition_json·mission_type 행은 한 글자도 건드리지 않는다 — 전부 기존 값
--    안에 있다(추가만, UPDATE 없음).
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD / CREATE OR REPLACE /
--    ON CONFLICT DO UPDATE 로 작성했다.

BEGIN;

-- ── ① CHECK 제약 갱신 — 허용 키 52 → 56 ─────────────────────────────────
--
-- 140의 배열을 그대로 옮기고 신규 4종만 더한다.
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
        -- 수치 검사 필드 (MEASURABLE) — 미션 게이트 확장 4종 (142, 이 파일 — 티켓 20260906_2231)
        'period_streak', 'time_bands_requirement', 'distinct_days_of_week_count',
        'distinct_months_threshold',
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
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- ── ② 계열 정합성 트리거 함수 — measurable_keys 배열 갱신 ────────────────
--
-- 140의 본문을 그대로 두고 measurable_keys에 신규 4종만 더한다. 4종 모두 role이
-- `measurable`이다(conditionRegistry.ts) — 131이 `negative_split`·`day_of_month`를
-- (role: filter라서) 뺀 것과 반대로, 이번엔 넷 다 넣는다.
--
-- 134의 그룹핑 키 이관(`family_key` 기준)·130의 레벨형 스킵 두 줄은 전부 그대로 보존한다.
CREATE OR REPLACE FUNCTION public.check_family_condition_consistency()
RETURNS TRIGGER AS $$
DECLARE
  measurable_keys TEXT[] := ARRAY[
    -- 기존 17종
    'distance_km','elevation_gain_m','duration_minutes','min_speed_kmh','max_pace_sec_per_km',
    'temperature_min_c','temperature_max_c','weekend_duration_hours','total_count','streak_days',
    'weekly_count','month','monthly_km','season_count','season_count_all','active_days_count','time_range',
    -- v5 신규 18종 (티켓 20260905_0028 / 마이그레이션 131)
    'max_elevation_m','max_speed_kmh','single_distance_km','single_elevation_m',
    'avg_heartrate_bpm','avg_watts','avg_cadence',
    'rest_after_streak','rest_after_long','return_gap_days','interval_days','daily_once_count',
    'weekly_streak','distinct_time_bands','activities_within_hours','personal_record_break',
    'month_over_month_ratio','vs_personal_average',
    -- v5 반복 획득 1종 (티켓 20260905_0030 B1 / 마이그레이션 132)
    'repeat_count',
    -- v5 확장 2종 (티켓 20260906_0110 ① / 마이그레이션 140)
    'cumulative_duration_hours','monthly_count',
    -- 미션 게이트 확장 4종 (티켓 20260906_2231 / 마이그레이션 142, 이 파일)
    'period_streak','time_bands_requirement','distinct_days_of_week_count','distinct_months_threshold'
  ];
  -- 계열 그룹핑 키 — `familyKeyOf()`(src/lib/badge-engine/badgeKind.ts)와 같은 규칙(134).
  new_family_key TEXT := COALESCE(NEW.family_key, '#name:' || NEW.name);
  sibling_keys TEXT[];
  new_keys     TEXT[] := (
    SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(NEW.condition_json) k
    WHERE k = ANY(measurable_keys)
  );
BEGIN
  IF (NEW.condition_json->>'mission_reward')::boolean IS TRUE THEN
    RETURN NEW;  -- mission_reward 배지는 애초에 계열 그룹핑에서 빠진다(badgeTree.ts) — 대상 아님
  END IF;

  -- ① v5 무한레벨형(= rarity IS NULL, badges_rarity_level_exclusive가 둘을 묶어 준다)은
  --    레벨마다 조건 필드가 달라지는 것이 정상 설계다 — 이 검사의 대상이 아니다. (130)
  IF NEW.level IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(DISTINCT k ORDER BY k) INTO sibling_keys
  FROM public.badges, jsonb_object_keys(condition_json) k
  WHERE COALESCE(family_key, '#name:' || name) = new_family_key  -- (134) 그룹핑 키
    AND (NEW.family_key IS NOT NULL OR activity_types = NEW.activity_types)
    AND id <> NEW.id
    AND deleted_at IS NULL  -- 소프트 삭제된 형제의 옛 조건 형태가 살아있는 배지 수정을 막지 않게 함
    AND (condition_json->>'mission_reward')::boolean IS NOT TRUE  -- 형제 쪽도 동일 제외
    AND level IS NULL  -- ② v5: 무한레벨형 형제는 등급형 계열의 비교 기준에서 제외 (130)
    AND k = ANY(measurable_keys);

  IF sibling_keys IS NOT NULL AND sibling_keys <> new_keys THEN
    RAISE EXCEPTION '"%" 계열(%) 측정 조건 필드 불일치 — 기존 % / 신규 %',
      NEW.name, new_family_key, sibling_keys, new_keys;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── ③ 트리거 정의 — **바꾸지 않는다.** 140의 정의를 그대로 다시 만든다 ──────
--
-- 이 파일이 CHECK 제약·트리거 함수를 다시 쓰므로, `condition-registry.test.ts`가 읽는
-- 「CHECK·measurable_keys·트리거 정의가 전부 들어 있는 가장 최근 파일」이 140에서 이
-- 파일로 넘어온다. 트리거 정의(`UPDATE OF` 컬럼 목록) 자체는 바뀌지 않는다.
DROP TRIGGER IF EXISTS badges_family_consistency ON public.badges;
CREATE TRIGGER badges_family_consistency
  BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity, family_key
  ON public.badges
  FOR EACH ROW
  WHEN (NEW.type = 'activity')
  EXECUTE FUNCTION public.check_family_condition_consistency();

-- ── ④ badge_metric_labels — 신규 4종 라벨 추가 ────────────────────────────
--
-- 라벨·단위는 `conditionRegistry.ts`의 `label`/`unit`을 그대로 옮겼다. 넷 다 복합 객체
-- 필드라 단위가 없다(`activities_within_hours` 등 기존 object 필드와 같은 태도, unit_ko NULL).
INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('period_streak',              '주기(연속 기간별 최소 횟수)', NULL),
  ('time_bands_requirement',     '시간대별 각 최소 횟수',       NULL),
  ('distinct_days_of_week_count','서로 다른 요일 수',           '개'),
  ('distinct_months_threshold',  '서로 다른 달 개수(각각 임계값)', NULL)
ON CONFLICT (metric_key) DO UPDATE
  SET label_ko   = EXCLUDED.label_ko,
      unit_ko    = EXCLUDED.unit_ko,
      updated_at = now();

-- ── ⑤ missions_mission_type_check — 'engine_condition' 추가 (게이트 리뷰 FAIL 수정) ──
--
-- 082가 만들고 103이 값을 바꾼(`poi_visit`→`checkin`) 최신 정의 7종에 8번째 값을
-- 더한다. 082·103과 같은 패턴 — 제약 이름을 하드코딩하지 않고 동적으로 찾아 지운다
-- (자동 생성 이름이 초기 상태에 따라 다를 수 있어 하드코딩하면 그 지점에서 트랜잭션
-- 전체가 롤백된다). 이 파일의 `condition_json` 확장과 달리 이건 신규 값 추가라
-- `distinct` UPDATE는 필요 없다 — 기존 행 중 `engine_condition`을 쓰는 행이 없다
-- (이 값은 이 티켓에서 처음 도입됐고, `seed_v5_gate_missions.sql`은 아직 미실행이다).
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

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 기존 배지가 새 CHECK를 전부 만족하는지
-- SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;  -- 실행 전과 동일
--
-- -- ② 신규 키가 실제로 통과하는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.badges (name, description, type, rarity, level, activity_types, condition_json)
--   VALUES ('__smoke_142__', '스모크', 'activity', NULL, 1, ARRAY['walking'],
--           '{"activity_type":"walking","distinct_days_of_week_count":5}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: 신규 키 INSERT 통과 (id=%)', v_id;
-- END
-- $smoke$;
--
-- -- ③ 트리거 함수의 measurable_keys에 신규 4종이 들어갔는지
-- SELECT prosrc LIKE '%distinct_months_threshold%' AS has_mission_gate_keys
--   FROM pg_proc WHERE proname = 'check_family_condition_consistency';  -- true
--
-- -- ④ 라벨 4행이 반영됐는지
-- SELECT metric_key, label_ko, unit_ko FROM public.badge_metric_labels
--  WHERE metric_key IN ('period_streak','time_bands_requirement','distinct_days_of_week_count','distinct_months_threshold');
--
-- -- ⑤ missions_mission_type_check가 engine_condition을 허용하는지 — 롤백 스모크
-- --    (컬럼 목록은 seed_v5_gate_missions.sql이 실제로 쓰는 것과 동일하게 맞췄다).
-- DO $smoke_mission$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.missions (
--     title, description, mission_type, condition_json, status_display_type, starts_at, ends_at
--   ) VALUES (
--     '__smoke_142_mission__', '스모크', 'engine_condition',
--     '{"activity_type":"walking","distinct_days_of_week_count":5}'::jsonb,
--     'individual', now(), NULL
--   ) RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: engine_condition INSERT 통과 (id=%)', v_id;
-- END
-- $smoke_mission$;
--
-- -- ⑥ CHECK 제약 정의에 engine_condition이 들어갔는지
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.missions'::regclass AND conname = 'missions_mission_type_check';

-- ↩️ 롤백 DDL
--    -- CHECK 제약을 140의 배열로 되돌린다 (140 파일의 ① 블록 재실행)
--    -- 트리거 함수는 140의 본문으로 되돌린다 (140 파일의 ② 블록 재실행)
--    DELETE FROM public.badge_metric_labels WHERE metric_key IN (
--      'period_streak','time_bands_requirement','distinct_days_of_week_count','distinct_months_threshold');
--    -- missions_mission_type_check를 082/103의 7종 정의로 되돌린다 (engine_condition 제거).
--    -- 되돌리기 전 missions.mission_type = 'engine_condition' 행이 없는지 먼저 확인할 것
--    -- (seed_v5_gate_missions.sql이 이미 실행됐다면 33행이 이 값을 쓴다).
--    ALTER TABLE public.missions DROP CONSTRAINT missions_mission_type_check;
--    ALTER TABLE public.missions ADD CONSTRAINT missions_mission_type_check
--      CHECK (mission_type IN ('distance','checkin','activity_count','item_collect',
--                              'streak_days','duration_minutes','elevation_gain_m'));
