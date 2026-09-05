-- 131: condition_json 허용 키 v5 확장 — 신규 20종 등록 (티켓 20260905_0028, 마스터 20260905_0026)
--
-- 배경:
--   ① `badges_condition_json_known_keys` CHECK 제약이 허용 키 **25개를 하드코딩**하고 있어
--      (117_condition_json_same_activity_flag.sql), v5 신규 필드가 하나라도 들어간 INSERT/UPDATE는
--      Postgres 레벨에서 거부된다 — 550종 시딩(티켓 20260905_0035)이 첫 행에서 막힌다
--      (마스터 티켓 B-2).
--   ② `BadgeCondition` 25개 필드가 전부 «활동이 존재한다»를 전제한 양의 임계값이라
--      «활동이 없는 기간»(휴식)을 표현할 수단이 없다 (마스터 티켓 B-6).
--   ③ 같은 키 목록이 6곳에 복제돼 있어 필드 1개 추가에 6곳을 손대야 하고, 그중 4곳은 누락돼도
--      조용히 통과한다. 코드 쪽 복제본은 이 티켓에서 `src/lib/badge-engine/conditionRegistry.ts`
--      하나로 합쳤고, **이 파일은 그 선언을 DB 쪽 2곳(CHECK 제약 · 계열 정합성 트리거 함수)에
--      그대로 옮겨 적은 것**이다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-developer 서브에이전트)에 따라 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- ⚠️ **신규 20종은 아직 badge-engine이 평가하지 않는다**(구현은 티켓 20260905_0030).
--    레지스트리의 `evaluated: false`와 `evaluateConditionDetailed`의 fail-closed 분기가
--    «미구현 필드가 든 조건은 발급되지 않는다»를 보장한다. 이 마이그레이션이 CHECK를 열어도
--    미구현 필드로 배지가 잘못 발급되는 경로는 없다.
--
-- 실행 순서: **코드 배포와 무관하게 먼저 실행해도 안전하다.** CHECK 제약을 넓히기만 하고
--    기존 condition_json 207행(조건을 가진 활동 배지 전부)은 한 글자도 건드리지 않는다(모두 25개 키 안에 있으므로
--    새 CHECK도 그대로 만족한다). badge_metric_labels 수정 2건은 화면 문구만 바꾼다.
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD / CREATE OR REPLACE /
--    ON CONFLICT DO UPDATE / 조건부 UPDATE 로 작성했다.

BEGIN;

-- ── ① CHECK 제약 갱신 — 허용 키 25 → 45 ─────────────────────────────────
--
-- `src/lib/badge-engine/conditionRegistry.ts`의 `CONDITION_FIELDS` 선언 순서·분류를 그대로
-- 옮겼다. 117의 패턴(DROP + ADD)을 유지한다.

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
        -- 수치 검사 필드 (MEASURABLE) — v5 신규 18종
        --   활동 1건의 스칼라 값 (7)
        'max_elevation_m', 'max_speed_kmh', 'single_distance_km', 'single_elevation_m',
        'avg_heartrate_bpm', 'avg_watts', 'avg_cadence',
        --   이력 패턴 (11)
        'rest_after_streak', 'rest_after_long', 'return_gap_days', 'interval_days',
        'daily_once_count', 'weekly_streak', 'distinct_time_bands',
        'activities_within_hours', 'personal_record_break', 'month_over_month_ratio',
        'vs_personal_average',
        -- 필터 전용 필드 (그 자체만으로는 pass/fail을 만들지 않음) — 기존 7종
        'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route',
        'poi_id', 'season', 'same_activity',
        -- 필터 전용 필드 — v5 신규 2종
        'negative_split', 'day_of_month',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- ── ② 계열 정합성 트리거 함수 — measurable_keys 배열 갱신 ────────────────
--
-- ⚠️ 이 함수는 130(티켓 20260905_0027)이 이미 한 번 손댔다. **130의 본문을 그대로 두고
--    measurable_keys 배열만 17 → 35로 늘린다.** 130이 넣은 두 줄
--    (① NEW.level IS NOT NULL이면 검사 스킵 ② 형제 조회에서 level IS NOT NULL 제외)을
--    되돌리면 무한레벨형 계열 INSERT가 다시 EXCEPTION으로 막힌다(마스터 티켓 B-4 재발).
--
-- 트리거 자체(`badges_family_consistency`)는 **건드리지 않는다** — 130이
-- `UPDATE OF name, activity_types, condition_json, level, rarity`로 다시 만들어 뒀고,
-- CREATE OR REPLACE FUNCTION은 트리거 정의에 영향을 주지 않는다. 아래 검증 쿼리 ③으로
-- 그 목록이 유지됐는지 확인할 것.
--
-- 이 갱신이 필요한 이유: 배열에 없는 키는 계열 조건 조합 비교에서 통째로 빠진다. v5 계열이
-- 신규 필드만 쓰면 모든 형제의 키 집합이 빈 배열로 계산돼 «조건이 서로 달라도 같다»고
-- 오판정한다 — 트리거가 조용히 무력화되는 형태의 결함이다.
CREATE OR REPLACE FUNCTION public.check_family_condition_consistency()
RETURNS TRIGGER AS $$
DECLARE
  measurable_keys TEXT[] := ARRAY[
    -- 기존 17종
    'distance_km','elevation_gain_m','duration_minutes','min_speed_kmh','max_pace_sec_per_km',
    'temperature_min_c','temperature_max_c','weekend_duration_hours','total_count','streak_days',
    'weekly_count','month','monthly_km','season_count','season_count_all','active_days_count','time_range',
    -- v5 신규 18종 (티켓 20260905_0028) — conditionRegistry.ts의 measurable 역할과 동일 집합
    'max_elevation_m','max_speed_kmh','single_distance_km','single_elevation_m',
    'avg_heartrate_bpm','avg_watts','avg_cadence',
    'rest_after_streak','rest_after_long','return_gap_days','interval_days','daily_once_count',
    'weekly_streak','distinct_time_bands','activities_within_hours','personal_record_break',
    'month_over_month_ratio','vs_personal_average'
  ];
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
  WHERE activity_types = NEW.activity_types  -- activity_type(단수) 컬럼은 없다 — 배열 전체 비교
    AND name = NEW.name
    AND id <> NEW.id
    AND deleted_at IS NULL  -- 소프트 삭제된 형제의 옛 조건 형태가 살아있는 배지 수정을 막지 않게 함
    AND (condition_json->>'mission_reward')::boolean IS NOT TRUE  -- 형제 쪽도 동일 제외
    AND level IS NULL  -- ② v5: 무한레벨형 형제는 등급형 계열의 비교 기준에서 제외 (130)
    AND k = ANY(measurable_keys);

  IF sibling_keys IS NOT NULL AND sibling_keys <> new_keys THEN
    RAISE EXCEPTION '"%" 계열(%) 측정 조건 필드 불일치 — 기존 % / 신규 %',
      NEW.name, NEW.activity_types, sibling_keys, new_keys;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── ③ badge_metric_labels — 신규 라벨 추가 + 기존 2건 수정 ─────────────────
--
-- 라벨·단위는 `conditionRegistry.ts`의 `label`/`unit`을 그대로 옮겼다. 다만 **런타임 단일
-- 출처는 이 테이블이다** — 어드민이 코드 배포 없이 고칠 수 있도록 만든 편집 테이블이고
-- (127), 조회 API에 키 화이트리스트 대조가 없다.
--
-- 라이팅 규칙(마스터 티켓 20260905_0026): 「이상·이하」만 쓰고 「초과·미만」은 쓰지 않는다 /
-- 「주」가 들어가면 예외 없이 (월~일)을 표기한다(→ 'weekly_streak').
--
-- ⚠️ 티켓 본문은 «추가 12종»으로 적고 있으나, 신규 조건 필드는 20종이고 그중 라벨이 없는
--    키는 화면에 **영문 원문 그대로 노출된다**(127의 의도적 폴백 — 티켓이 지적한 복제 위치 ⑤의
--    실패 모드가 정확히 이것이다). 8종을 비워 두면 그 실패 모드를 그대로 남기게 되므로
--    **20종 전부를 채운다.** 지표가 아닌 필터 성격 필드(negative_split·day_of_month)도
--    조건 문구 조립에서 키로 조회될 수 있어 함께 넣는다.
--
-- DO UPDATE를 쓰는 이유: 재실행 시에도 최신 라벨로 수렴하게 하기 위함(127은 DO NOTHING이라
-- 이미 있는 행의 라벨을 고치지 못한다). updated_at도 함께 갱신한다.

-- ③-1. 기존 라벨 수정 2건
--   duration_minutes 「이동시간」 → 「한 번의 이동시간」 (누적/단일 구분이 불명확했다)
--   weekend_duration_hours 「주말활동시간」 → 「주말 활동시간」 (띄어쓰기 누락)
UPDATE public.badge_metric_labels
   SET label_ko = '한 번의 이동시간', updated_at = now()
 WHERE metric_key = 'duration_minutes' AND label_ko IS DISTINCT FROM '한 번의 이동시간';

UPDATE public.badge_metric_labels
   SET label_ko = '주말 활동시간', updated_at = now()
 WHERE metric_key = 'weekend_duration_hours' AND label_ko IS DISTINCT FROM '주말 활동시간';

-- ③-2. v5 신규 20종 라벨
-- ⚠️ 라벨은 어드민 표시용이 아니다. getMetricLabels → computeBadgeProgress →
--    badgeProgressText.ts를 거쳐 **유저 문장에 그대로 삽입**된다:
--      「지난 활동 {label} 기록은 {값}{단위}.」 · 「{label} 조건은 이미 채웠어요.」
--    그래서 부사구가 아니라 **명사구**여야 한다 — 「전월 대비」는 「지난 활동 전월 대비
--    기록은」이 되어 비문이므로 「전월 대비 배수」로 끝맺는다(티켓 20260905_0028 개선 리뷰).
INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  -- 활동 1건의 스칼라 값 (7)
  ('max_elevation_m',        '최고 도달 고도',   'm'),
  ('max_speed_kmh',          '최고 속도',        'km/h'),
  ('single_distance_km',     '한 번의 거리',     'km'),
  ('single_elevation_m',     '한 번의 고도',     'm'),
  ('avg_heartrate_bpm',      '평균 심박수',      'bpm'),
  ('avg_watts',              '평균 파워',        'W'),
  -- 케이던스는 단위가 종목마다 다르다(러닝 spm · 자전거 rpm) — 잘못된 단위를 박지 않고 비워 둔다
  ('avg_cadence',            '평균 케이던스',    NULL),
  -- 이력 패턴 (13)
  ('rest_after_streak',      '연속 활동 후 휴식일', '일'),
  ('rest_after_long',        '장거리 활동 후 휴식일', '일'),
  ('return_gap_days',        '복귀 전 휴식일',   '일'),
  ('interval_days',          '활동 간격',        '일'),
  ('daily_once_count',       '하루 1회 활동일',  '일'),
  ('negative_split',         '후반 구간 페이스', NULL),
  ('weekly_streak',          '연속 주(월~일)',   '주'),
  ('distinct_time_bands',    '서로 다른 시간대', '개'),
  ('day_of_month',           '매달 지정일',      NULL),
  ('activities_within_hours','지정 시간 내 활동 횟수', '회'),
  ('personal_record_break',  '개인 기록 갱신',   '회'),
  ('month_over_month_ratio', '전월 대비 배수',        '배'),
  ('vs_personal_average',    '평소 평균 대비 배수',   '배')
ON CONFLICT (metric_key) DO UPDATE
  SET label_ko   = EXCLUDED.label_ko,
      unit_ko    = EXCLUDED.unit_ko,
      updated_at = now();

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 기존 배지가 새 CHECK를 전부 만족하는지 (제약 추가가 성공했다면 이미 보장되지만 재확인)
-- SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;  -- 207 (실행 전과 동일)
--    ⚠️ 207이 맞다. badges 테이블 «전체» 행수는 5,596이지만 그중 조건을 가진 건 활동 배지
--       207행뿐이고 나머지 5,389행(아이템 배지 등)은 condition_json이 NULL이다(실측 2026-09-05).
--
-- -- ② 신규 키가 실제로 통과하는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.badges (name, description, type, rarity, activity_types, condition_json)
--   VALUES ('__smoke_131__', '스모크', 'activity', 'common', ARRAY['running'],
--           '{"activity_type":"running","weekly_streak":4,"negative_split":true}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: 신규 키 INSERT 통과 (id=%)', v_id;
-- END
-- $smoke$;
--
-- -- ③ 130이 만든 트리거 정의(UPDATE OF에 level·rarity 포함)가 그대로인지
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgname = 'badges_family_consistency' AND tgrelid = 'public.badges'::regclass;
--    → BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity
--
-- -- ④ 트리거 함수의 measurable_keys가 35개인지
-- SELECT prosrc LIKE '%vs_personal_average%' AS has_v5_keys
--   FROM pg_proc WHERE proname = 'check_family_condition_consistency';  -- true
--
-- -- ⑤ 지표 라벨 45행 중 조건 키에 대응하는 행이 45개인지 (요일 7 · 계절 5는 별도)
-- SELECT count(*) FROM public.badge_metric_labels
--  WHERE metric_key NOT IN ('sunday','monday','tuesday','wednesday','thursday','friday','saturday',
--                           'spring','summer','fall','winter','all');  -- 37 (기존 17 + 신규 20)
--
-- -- ⑥ 수정 2건이 반영됐는지
-- SELECT metric_key, label_ko FROM public.badge_metric_labels
--  WHERE metric_key IN ('duration_minutes','weekend_duration_hours');
--    → 한 번의 이동시간 / 주말 활동시간

-- ↩️ 롤백 DDL
--    -- CHECK 제약을 117의 25개 키로 되돌린다 (117 파일의 ① 블록 재실행)
--    -- 트리거 함수는 130의 본문으로 되돌린다 (130 파일의 C절 재실행)
--    DELETE FROM public.badge_metric_labels WHERE metric_key IN (
--      'max_elevation_m','max_speed_kmh','single_distance_km','single_elevation_m',
--      'avg_heartrate_bpm','avg_watts','avg_cadence','rest_after_streak','rest_after_long',
--      'return_gap_days','interval_days','daily_once_count','negative_split','weekly_streak',
--      'distinct_time_bands','day_of_month','activities_within_hours','personal_record_break',
--      'month_over_month_ratio','vs_personal_average');
--    UPDATE public.badge_metric_labels SET label_ko = '이동시간'    WHERE metric_key = 'duration_minutes';
--    UPDATE public.badge_metric_labels SET label_ko = '주말활동시간' WHERE metric_key = 'weekend_duration_hours';
