-- 140: condition_json 허용 키 확장 — 누적 이동시간 · 월간 활동 횟수 · 개인 기록 지표 3종
--      (티켓 20260906_0110 ①·③, 마스터 20260905_0026 후속)
--
-- 배경:
--   v5 카탈로그 시딩(20260905_0035)이 레지스트리에 없는 키 2개(누적 이동시간·월간 활동
--   횟수) 때문에 5계열 27종을 아예 빼고 시작했다 — `walking:K2`·`running:K2`·`hiking:K2`
--   (누적 이동시간, `cumulative_duration_hours`) · `cycling:G2`·`hiking:C2`(월간 활동 횟수,
--   `monthly_count`). 이번 파일이 그 두 키를 연다.
--
--   `personal_record_break_metric`은 별개 문제다 — `personal_record_break`만으로는
--   「어느 지표의 기록인가」를 담을 수 없어 자동 상승형 14계열 중 7쌍이 조건 값이
--   글자 그대로 같아진다(`walking:B1`↔`B2` 등). `personal_record_break` 자체는 여전히
--   `evaluation: 'pending'`이라 이 필드가 있어도 지금 당장 발급되는 배지는 없다 — 스키마만
--   먼저 열어 콘텐츠가 계열을 구분해 저장할 수 있게 한다(엔진 평가는 후속 티켓).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포와 무관하게 먼저 실행해도 안전하다.** CHECK 제약을 넓히기만 하고
--    기존 condition_json 630행(v5 카탈로그 시딩, 티켓 20260905_0035)은 한 글자도 건드리지
--    않는다 — 전부 기존 키 안에 있다.
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD / CREATE OR REPLACE /
--    ON CONFLICT DO UPDATE 로 작성했다.

BEGIN;

-- ── ① CHECK 제약 갱신 — 허용 키 49 → 52 ─────────────────────────────────
--
-- 134의 배열을 그대로 옮기고 신규 3종만 더한다.
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
        -- 수치 검사 필드 (MEASURABLE) — v5 확장 2종 (140, 이 파일 — 티켓 20260906_0110 ①)
        'cumulative_duration_hours', 'monthly_count',
        -- 필터 전용 필드 (그 자체만으로는 pass/fail을 만들지 않음) — 기존 7종
        'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route',
        'poi_id', 'season', 'same_activity',
        -- 필터 전용 필드 — v5 신규 2종 (131)
        'negative_split', 'day_of_month',
        -- 필터 전용 필드 — v5 2단 교차 게이트 3종 (133)
        'cross_in_axis', 'cross_between_axis', 'gate_mission_badge',
        -- 필터 전용 필드 — v5 확장 1종 (140 — 티켓 20260906_0110 ③, personal_record_break 짝)
        'personal_record_break_metric',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- ── ② 계열 정합성 트리거 함수 — measurable_keys 배열 갱신 ────────────────
--
-- 134의 본문을 그대로 두고 measurable_keys에 `cumulative_duration_hours`·`monthly_count`
-- 2종만 더한다. `personal_record_break_metric`은 넣지 않는다 — role이 `filter`라 그 자체로
-- pass/fail을 만들지 않는다(131이 negative_split·day_of_month를 뺀 것과 같은 이유).
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
    -- v5 확장 2종 (티켓 20260906_0110 ① / 마이그레이션 140, 이 파일)
    'cumulative_duration_hours','monthly_count'
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

-- ── ③ 트리거 정의 — **바꾸지 않는다.** 134의 정의를 그대로 다시 만든다 ──────
--
-- 이 파일이 CHECK 제약·트리거 함수를 다시 쓰므로, `condition-registry.test.ts`가 읽는
-- 「CHECK·measurable_keys·트리거 정의가 전부 들어 있는 가장 최근 파일」이 134에서 이
-- 파일로 넘어온다. 트리거 정의(`UPDATE OF` 컬럼 목록) 자체는 바뀌지 않지만, 같은 파일 안에
-- 셋을 함께 두는 관례를 134가 이미 세웠다(132·133·134가 같은 이유로 같은 선택을 했다).
DROP TRIGGER IF EXISTS badges_family_consistency ON public.badges;
CREATE TRIGGER badges_family_consistency
  BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity, family_key
  ON public.badges
  FOR EACH ROW
  WHEN (NEW.type = 'activity')
  EXECUTE FUNCTION public.check_family_condition_consistency();

-- ── ④ badge_metric_labels — 신규 3종 라벨 추가 ────────────────────────────
--
-- 라벨·단위는 `conditionRegistry.ts`의 `label`/`unit`을 그대로 옮겼다.
INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('cumulative_duration_hours',  '누적 이동시간',   '시간'),
  ('monthly_count',              '월간 활동 횟수',  '회'),
  ('personal_record_break_metric', '개인 기록 지표', NULL)
ON CONFLICT (metric_key) DO UPDATE
  SET label_ko   = EXCLUDED.label_ko,
      unit_ko    = EXCLUDED.unit_ko,
      updated_at = now();

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 기존 배지가 새 CHECK를 전부 만족하는지
-- SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;  -- 630 (실행 전과 동일, 실측 시점 기준)
--
-- -- ② 신규 키가 실제로 통과하는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.badges (name, description, type, rarity, level, activity_types, condition_json)
--   VALUES ('__smoke_140__', '스모크', 'activity', NULL, 1, ARRAY['walking'],
--           '{"activity_type":"walking","cumulative_duration_hours":2}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: 신규 키 INSERT 통과 (id=%)', v_id;
-- END
-- $smoke$;
--
-- -- ③ 트리거 함수의 measurable_keys에 신규 2종이 들어갔는지
-- SELECT prosrc LIKE '%cumulative_duration_hours%' AS has_v5_ext_keys
--   FROM pg_proc WHERE proname = 'check_family_condition_consistency';  -- true
--
-- -- ④ 라벨 3행이 반영됐는지
-- SELECT metric_key, label_ko, unit_ko FROM public.badge_metric_labels
--  WHERE metric_key IN ('cumulative_duration_hours','monthly_count','personal_record_break_metric');

-- ↩️ 롤백 DDL
--    -- CHECK 제약을 134의 배열로 되돌린다 (134 파일의 ① 블록 재실행)
--    -- 트리거 함수는 134의 본문으로 되돌린다 (134 파일의 ② 블록 재실행)
--    DELETE FROM public.badge_metric_labels WHERE metric_key IN (
--      'cumulative_duration_hours','monthly_count','personal_record_break_metric');
