-- 134: 계열 정합성 트리거의 그룹핑 키를 (activity_types, name) → family_key 로 이관
--      (티켓 20260905_0032 B묶음, 판단 ④)
--
-- 배경:
--   128이 건 `badges_family_consistency`는 «형제»를 `(activity_types, name)`으로 찾는다.
--   그래서 128 스스로 「알려진 한계」로 적어 둔 구멍이 그대로 남아 있다 —
--   **어드민이 이름을 오타 내면 그 순간 형제가 0건이 되어 검사 자체가 스킵된다.**
--   계열 정체성은 이미 `family_key`가 갖고 있고(130이 컬럼을 만들고 207종을 백필),
--   2단 교차 게이트도 대상 계열을 `family_key`로 지정한다(133). 그룹핑 기준만 뒤늦게
--   이름에 남아 있는 상태다.
--
-- 무엇이 바뀌나:
--   형제 조회의 `activity_types = NEW.activity_types AND name = NEW.name` 두 줄이
--   `COALESCE(family_key, '#name:' || name)` 동일성 비교로 바뀐다. 이 식은
--   `src/lib/badge-engine/badgeKind.ts`의 `familyKeyOf()`와 **글자 그대로 같은 규칙**이다 —
--   `family_key`가 정본이고, 비어 있을 때만 `#name:` 폴백으로 묶는다. 엔진(`index.ts`·
--   `crossGate.ts`)·싱크(`sync.ts`)·어드민 계열 화면이 전부 그 함수로 계열을 묶으므로,
--   DB만 다른 기준으로 묶으면 「화면에서 한 계열인데 DB는 남남」인 상태가 된다.
--
--   폴백 경로(= `family_key`가 비어 있는 배지)에는 128의 `activity_types` 동일 조건을
--   **그대로 남긴다.** `familyKeyOf`의 폴백은 이름만 보므로, 종목이 다른 동명 배지가
--   새로 한 계열로 묶여 기존 데이터가 갑자기 위반이 되는 일을 만들지 않기 위해서다
--   (키가 있는 쪽은 키에 종목이 이미 들어 있어 이 조건이 필요 없다).
--
-- 기존 207종은 **동작이 바뀌지 않는다.** 130이 `family_key = "{activity_type}:{name}"`으로
-- 구웠으므로 그들에게는 두 그룹핑이 같은 집합이다 — 실행 전에 아래 «사전 확인 쿼리»로
-- 반드시 실측할 것(0행이어야 한다).
--
-- ⚠️ 130·131·132·133의 변경분을 되돌리면 회귀다. 이 파일은 앞선 마이그레이션들이 서로를
--    보존한 방식을 그대로 따른다:
--      · 130: 레벨형 스킵 두 줄(`IF NEW.level IS NOT NULL` / 형제 조회의 `AND level IS NULL`)
--      · 130: 트리거 정의의 `UPDATE OF name, activity_types, condition_json, level, rarity`
--      · 131·132: `measurable_keys` 36종(`repeat_count` 포함)
--      · 133: 교차 게이트 3종을 `measurable_keys`에 **넣지 않는다**
--      · 132: 회차 카운터 RPC(`increment_activity_badge_earn`)는 건드리지 않는다
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD / CREATE OR REPLACE 로 작성했다.

-- ── 사전 확인 쿼리 (실행 «전»에 돌려서 0행인지 볼 것) ────────────────────────
--
-- -- 기존 데이터에서 두 그룹핑이 실제로 같은 집합인지. 한 family_key 안에 (activity_types,
-- -- name)이 둘 이상이거나 그 반대면 이관으로 검사 대상이 달라진다 → 0행이어야 한다.
-- SELECT family_key, count(DISTINCT (activity_types::text || '|' || name)) AS name_groups
--   FROM public.badges
--  WHERE type = 'activity' AND deleted_at IS NULL AND family_key IS NOT NULL
--  GROUP BY 1 HAVING count(DISTINCT (activity_types::text || '|' || name)) > 1;  -- 0행
--
-- SELECT activity_types, name, count(DISTINCT family_key) AS key_groups
--   FROM public.badges
--  WHERE type = 'activity' AND deleted_at IS NULL AND family_key IS NOT NULL
--  GROUP BY 1, 2 HAVING count(DISTINCT family_key) > 1;  -- 0행
--
-- -- 키가 비어 있는 활동 배지(= 폴백 경로로 묶일 배지). 어드민이 A묶음 이후 새로 만든
-- -- 레벨형이 여기 잡힌다 — 계열 관리 화면에서 키를 발급하면 사라진다.
-- SELECT id, name, level, rarity, activity_types FROM public.badges
--  WHERE type = 'activity' AND deleted_at IS NULL AND family_key IS NULL;

BEGIN;

-- ── ① CHECK 제약 — **키를 바꾸지 않는다.** 133의 배열을 그대로 다시 쓴다 ─────
--
-- 왜 바꾸지도 않을 제약을 다시 쓰나: `condition-registry.test.ts`가 「가장 마지막에
-- CHECK/트리거를 다시 쓴 마이그레이션 **한 파일**」을 읽어 레지스트리와 대조한다.
-- 134가 트리거만 다시 쓰고 CHECK를 133에 남겨 두면 그 대조가 두 파일로 갈라져
-- 「어느 파일이 현재 상태인가」가 다시 모호해진다 — 132·133이 같은 이유로 같은 선택을 했다.

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
        -- 필터 전용 필드 — v5 2단 교차 게이트 3종 (133)
        'cross_in_axis', 'cross_between_axis', 'gate_mission_badge',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- ── ② 계열 정합성 트리거 함수 — 그룹핑 키만 바꾼다 ──────────────────────────
--
-- `measurable_keys` 36종은 131·132가 정한 그대로다(교차 게이트 3종은 여전히 넣지 않는다 —
-- 게이트는 등급마다 달라지는 것이 정상이라 넣으면 정상적인 v5 계열이 통째로 EXCEPTION에
-- 걸린다). 130의 레벨형 스킵 두 줄도 그대로다.
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
  -- 계열 그룹핑 키 — `familyKeyOf()`(src/lib/badge-engine/badgeKind.ts)와 같은 규칙.
  -- `family_key`가 정본이고, 비어 있을 때만 `#name:` 폴백으로 묶는다. 폴백 접두어가 있어
  -- 실제 키와 절대 충돌하지 않는다. (티켓 20260905_0032 판단 ④)
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
  WHERE COALESCE(family_key, '#name:' || name) = new_family_key  -- (134) 그룹핑 키 이관
    -- 폴백 경로에서만 128의 종목 동일 조건을 유지한다 — 키가 있으면 키에 종목이 들어 있다
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

-- ── ③ 트리거 정의 — `UPDATE OF`에 family_key를 더한다 ───────────────────────
--
-- 그룹핑 키가 `family_key`가 됐으므로 **그 컬럼을 바꾸는 UPDATE가 곧 계열 이동**이다.
-- 130의 다섯 컬럼(name, activity_types, condition_json, level, rarity)을 한 개도 빼지 않고
-- family_key만 더한다 — 빼면 130이 닫은 구멍(레벨형↔등급형 전환이 검사를 건너뛰던 것)이
-- 다시 열린다.
--
-- 이 목록에 family_key가 들어가면 어드민 「계열 키 발급」(티켓 20260905_0032 B-3)이
-- 검사를 통과해야 한다. 그것이 의도다 — 조건 조합이 다른 배지를 기존 계열에 키로 끌어다
-- 붙이는 것은 막아야 한다. 발급 API는 그 EXCEPTION을 사람이 읽을 수 있는 문구로 감싼다.
--
-- IF NOT EXISTS로 두면 트리거가 이미 있는 환경에서 컬럼 목록이 갱신되지 않으므로
-- (130이 같은 이유로 같은 선택을 했다) 조건부가 아니라 DROP 후 CREATE 한다.
DROP TRIGGER IF EXISTS badges_family_consistency ON public.badges;
CREATE TRIGGER badges_family_consistency
  BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity, family_key
  ON public.badges
  FOR EACH ROW
  WHEN (NEW.type = 'activity')
  EXECUTE FUNCTION public.check_family_condition_consistency();

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 트리거 정의에 여섯 컬럼이 전부 들어갔는지 (130의 다섯 + family_key)
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgname = 'badges_family_consistency' AND tgrelid = 'public.badges'::regclass;
--    → BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity, family_key
--
-- -- ② 함수 본문이 130~133의 변경분을 전부 보존했는지 (마지막 하나만 false여야 한다)
-- SELECT prosrc LIKE '%repeat_count%'                    AS has_repeat_count,
--        prosrc LIKE '%IF NEW.level IS NOT NULL%'        AS has_level_skip,
--        prosrc LIKE '%AND level IS NULL%'               AS has_sibling_skip,
--        prosrc LIKE '%COALESCE(family_key%'             AS has_family_key_grouping,
--        prosrc LIKE '%cross_in_axis%'                   AS has_cross_key  -- ← 이것만 false
--   FROM pg_proc WHERE proname = 'check_family_condition_consistency';
--
-- -- ③ 132가 만든 회차 카운터 RPC가 그대로 살아 있는지 (134는 건드리지 않는다)
-- SELECT proname FROM pg_proc WHERE proname = 'increment_activity_badge_earn';
--
-- -- ④ 기존 카탈로그가 새 그룹핑에서도 전부 통과하는지 — 계열별 측정 키 집합이 1종류여야 한다.
-- --    (트리거는 «쓰기»에만 걸리므로 이미 저장된 데이터는 이 쿼리로 확인한다)
-- WITH keys AS (
--   SELECT COALESCE(family_key, '#name:' || name) AS fkey, id,
--          (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(condition_json) k
--            WHERE k = ANY(ARRAY['distance_km','elevation_gain_m','duration_minutes','min_speed_kmh',
--              'max_pace_sec_per_km','temperature_min_c','temperature_max_c','weekend_duration_hours',
--              'total_count','streak_days','weekly_count','month','monthly_km','season_count',
--              'season_count_all','active_days_count','time_range','max_elevation_m','max_speed_kmh',
--              'single_distance_km','single_elevation_m','avg_heartrate_bpm','avg_watts','avg_cadence',
--              'rest_after_streak','rest_after_long','return_gap_days','interval_days','daily_once_count',
--              'weekly_streak','distinct_time_bands','activities_within_hours','personal_record_break',
--              'month_over_month_ratio','vs_personal_average','repeat_count'])) AS mkeys
--     FROM public.badges
--    WHERE type = 'activity' AND deleted_at IS NULL AND level IS NULL
--      AND (condition_json->>'mission_reward')::boolean IS NOT TRUE
-- )
-- SELECT fkey, count(DISTINCT mkeys) FROM keys GROUP BY 1 HAVING count(DISTINCT mkeys) > 1;  -- 0행
--
-- -- ⑤ 롤백 스모크 — 이름을 오타 내도(계열 키는 그대로) 검사가 걸리는지.
-- --    128의 「알려진 한계」가 실제로 닫혔는지 보는 쿼리다. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID; v_key TEXT;
-- BEGIN
--   SELECT family_key INTO v_key FROM public.badges
--    WHERE type = 'activity' AND level IS NULL AND family_key IS NOT NULL LIMIT 1;
--   INSERT INTO public.badges (name, description, type, rarity, activity_types, family_key, condition_json)
--   VALUES ('__smoke_134_오타난이름__', '스모크', 'activity', 'mystic', ARRAY['walking'], v_key,
--           '{"activity_type":"walking","avg_watts":9999}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백(실패): 이름이 달라도 계열 키가 같으면 막혔어야 한다 (id=%)', v_id;
-- END
-- $smoke$;
--    → 기대: 「"…" 계열(…) 측정 조건 필드 불일치」 EXCEPTION (「롤백(실패)」가 뜨면 이관이 안 된 것)

-- ↩️ 롤백 DDL
--    -- 트리거 함수·정의를 133 시점으로 되돌린다(133 파일의 ②를 재실행한 뒤 아래 CREATE TRIGGER).
--    DROP TRIGGER IF EXISTS badges_family_consistency ON public.badges;
--    CREATE TRIGGER badges_family_consistency
--      BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity
--      ON public.badges
--      FOR EACH ROW WHEN (NEW.type = 'activity')
--      EXECUTE FUNCTION public.check_family_condition_consistency();
--    -- CHECK 제약은 133과 같은 내용이라 되돌릴 것이 없다.
