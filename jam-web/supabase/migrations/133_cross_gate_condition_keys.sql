-- 133: 2단 교차 게이트 — condition_json `cross_in_axis` · `cross_between_axis` ·
--      `gate_mission_badge` 3종 추가 (티켓 20260905_0030 B2묶음, 마스터 20260905_0026 §게이트)
--
-- 배경:
--   v5의 2단 게이트는 「Rare → Epic = 축 내 교차 **또는** 축 간 교차」,
--   「Epic → Mystic = 축 간 교차 **+** 미션 보상 배지」다. 지금 조건 어휘에서 게이트를
--   표현할 수 있는 필드는 `prerequisite_badge_names` **하나뿐이고 OR 배열**이라
--   ① AND 관계를 표현할 수 없고 ② 대상을 **이름**으로 지정한다.
--
--   ②가 특히 위험하다. v5는 「무한레벨형·반복형이 등급형과 이름을 공유할 수 있다」를
--   설계 전제로 두므로 이름은 배지를 유일하게 식별하지 못한다 — 레벨형 Lv.1을 보유한
--   것만으로 동명 등급형의 게이트가 열린다(티켓 20260905_0030 B-6). 신규 3종은 처음부터
--   **`family_key`(계열) 기준**이다.
--
-- 값의 형태(앱 계약, `src/types/database.ts`의 `BadgeGateRequirement`):
--   { "family_keys": ["running:tempo", "running:interval"],   -- 대상 계열(OR)
--     "min_rarity":  "rare",                                   -- 생략 시 「그 계열 보유」
--     "min_count":   2 }                                       -- 생략 시 1. 2 이상이면 AND
--
--   ⚠️ CHECK 제약은 **키 이름만** 검사한다(jsonb 값 스키마 검사는 이 테이블에 없다).
--      값이 깨진 게이트는 엔진이 fail-closed로 막는다 — `src/lib/badge-engine/crossGate.ts`의
--      `normalizeRequirement()`가 「형태 오류」 사유로 발급을 차단한다. 「검사할 게 없으니
--      통과」로 두면 게이트가 조용히 사라지기 때문이다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포보다 먼저 실행해야 한다.**
--   교차 게이트가 든 배지를 저장하려면 CHECK 제약이 먼저 열려 있어야 한다.
--   기존 데이터는 한 글자도 바뀌지 않는다 — 현재 카탈로그에 이 세 키를 쓰는 배지가 0건이다
--   (카탈로그는 티켓 20260905_0035).
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD / CREATE OR REPLACE 로 작성했다.

BEGIN;

-- ── ① CHECK 제약 갱신 — 허용 키 46 → 49 ─────────────────────────────────
--
-- 132의 배열을 그대로 옮기고 게이트 3종만 더한다.
-- `src/lib/badge-engine/conditionRegistry.ts`의 `CONDITION_FIELDS` 선언 순서·분류를 따른다.
-- (`condition-registry.test.ts`가 이 배열을 파싱해 레지스트리와 대조한다 — 어긋나면 깨진다)

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
        -- 필터 전용 필드 (그 자체만으로는 pass/fail을 만들지 않음) — 기존 7종
        'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route',
        'poi_id', 'season', 'same_activity',
        -- 필터 전용 필드 — v5 신규 2종 (131)
        'negative_split', 'day_of_month',
        -- 필터 전용 필드 — v5 2단 교차 게이트 3종 (133, 이번 추가)
        --   게이트는 «후보를 좁히는» 필드다. 수치 조건이 하나도 없는 배지는 여전히
        --   「평가 가능한 조건 없음」으로 막혀야 하므로 MEASURABLE에 넣지 않는다(084 사고 방어).
        'cross_in_axis', 'cross_between_axis', 'gate_mission_badge',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- ── ② 계열 정합성 트리거 함수 — measurable_keys 배열은 36개 그대로 ─────────
--
-- **키를 더하지 않는데도 이 함수를 다시 쓰는 이유**: `condition-registry.test.ts`가
-- 「가장 마지막에 CHECK/트리거를 다시 쓴 마이그레이션 한 파일」을 읽어 레지스트리와
-- 대조한다. 133이 CHECK만 다시 쓰고 트리거를 132에 남겨 두면 그 대조가 두 파일로 갈라져
-- 「어느 파일이 현재 상태인가」가 다시 모호해진다(132가 없앤 바로 그 모호성이다).
--
-- ⚠️ **130·131·132가 이미 이 함수를 손댔다. 그 변경분을 전부 보존한다.**
--    되돌리면 안 되는 두 줄(130, 마스터 티켓 B-4 재발 방지):
--      ① `IF NEW.level IS NOT NULL THEN RETURN NEW;` — 무한레벨형은 이 검사의 대상이 아니다
--      ② 형제 조회의 `AND level IS NULL` — 레벨형 형제가 등급형 계열 기준을 오염시키지 않게
--    트리거 정의(`badges_family_consistency`)는 **건드리지 않는다** — 130이
--    `UPDATE OF name, activity_types, condition_json, level, rarity`로 다시 만들어 뒀고
--    CREATE OR REPLACE FUNCTION은 트리거 정의에 영향을 주지 않는다(검증 쿼리 ③으로 확인).
--
-- 교차 게이트 3종을 이 배열에 넣지 않는 이유: 이 배열은 «측정 조건 필드»의 집합이 계열
-- 형제끼리 같은지 비교한다. 게이트는 등급마다 달라지는 것이 정상이다(Rare엔 없고 Epic엔
-- 축 내 교차, Mystic엔 축 간 교차 + 미션). 넣으면 **정상적인 v5 계열이 통째로 EXCEPTION**에
-- 걸린다 — 마스터 티켓 B-4와 같은 형태의 사고가 된다.
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
    'repeat_count'
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

-- ── ③ badge_metric_labels — **이번에는 추가하지 않는다** ────────────────────
--
-- `badge_metric_labels`는 «진행률 지표 이름»의 단일 출처다. 라벨은
-- `getMetricLabels → computeBadgeProgress → badgeProgressText`를 거쳐
-- 「지난 활동 {label} 기록은 …」 형태의 유저 문장에 삽입된다. 교차 게이트는 진행률 축이
-- 아니라 «보유 여부» 게이트라 그 문장에 등장할 자리가 없다.
-- 같은 성격의 기존 필터 필드(`prerequisite_badge_names`·`poi_id`·`same_activity`)도
-- 127 이후 한 번도 시드된 적이 없다(실측). 어드민 표시는 `conditionRegistry.ts`의
-- chip/detail이 담당한다.

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 기존 배지가 새 CHECK를 전부 만족하는지 (제약 추가가 성공했다면 이미 보장되지만 재확인)
-- SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;  -- 207 (실행 전과 동일)
--
-- -- ② 교차 게이트 3종이 실제로 통과하는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.badges (name, description, type, rarity, activity_types, condition_json)
--   VALUES ('__smoke_133__', '스모크', 'activity', 'epic', ARRAY['running'],
--           '{"activity_type":"running","total_count":10,
--             "cross_in_axis":{"family_keys":["running:tempo"]},
--             "cross_between_axis":{"family_keys":["running:streak"],"min_rarity":"rare"},
--             "gate_mission_badge":{"family_keys":["running:oath"]}}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: 교차 게이트 INSERT 통과 (id=%)', v_id;
-- END
-- $smoke$;
--
-- -- ③ 130이 만든 트리거 정의(UPDATE OF에 level·rarity 포함)가 그대로인지
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgname = 'badges_family_consistency' AND tgrelid = 'public.badges'::regclass;
--    → BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity
--
-- -- ④ 트리거 함수의 measurable_keys가 36개 그대로인지 + 130의 레벨형 스킵 두 줄이 살아 있는지
-- SELECT prosrc LIKE '%repeat_count%'             AS has_repeat_count,
--        prosrc LIKE '%IF NEW.level IS NOT NULL%' AS has_level_skip,
--        prosrc LIKE '%AND level IS NULL%'        AS has_sibling_skip,
--        prosrc LIKE '%cross_in_axis%'            AS has_cross_key  -- ← 이것만 false여야 한다
--   FROM pg_proc WHERE proname = 'check_family_condition_consistency';
--
-- -- ⑤ 132가 만든 RPC가 그대로 살아 있는지 (133은 건드리지 않는다)
-- SELECT proname FROM pg_proc WHERE proname = 'increment_activity_badge_earn';

-- ↩️ 롤백 DDL
--    -- CHECK 제약과 트리거 함수는 132의 ①·② 블록을 재실행해 되돌린다
--    -- (되돌리기 전에 교차 게이트를 쓰는 행이 없는지 먼저 확인할 것:
--    --  SELECT count(*) FROM public.badges
--    --   WHERE condition_json ?| ARRAY['cross_in_axis','cross_between_axis','gate_mission_badge'];)
--    -- 라벨·RPC·COMMENT는 133이 손대지 않았으므로 되돌릴 것이 없다.
