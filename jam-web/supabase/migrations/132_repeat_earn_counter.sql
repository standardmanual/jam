-- 132: 반복 획득 — condition_json `repeat_count` 키 + 회차 카운터 원자적 증가 RPC
--      (티켓 20260905_0030 B1묶음, 마스터 20260905_0026)
--
-- 배경:
--   ① v5의 «반복 획득»은 「이 조건을 N번 달성」을 표현해야 하는데, 45개 조건 키 중 그걸
--      담는 필드가 없다. `total_count`는 «필터를 통과한 활동 수»만 세므로
--      `{single_distance_km: 20, total_count: 5}`가 「20km 활동이 1건 있고 활동이 총 5회」로
--      평가된다 — 「20km 활동이 5건」이 아니다. `repeat_count`가 그 간극을 메운다.
--   ② 회차 누적은 **한 문장 원자 갱신**이어야 한다. 앱 코드의 읽고-고치고-쓰기는 동시
--      싱크에서 회차를 유실하거나 이중 계상한다(티켓 20260905_0028이 넘긴 전제).
--      멱등 조건이 «근거 활동 id가 이미 earn_history에 있으면 올리지 않는다»인데,
--      supabase-js 쿼리 빌더에는 jsonb 포함 연산자(@>)를 조건절에 싣는 표현이 없다.
--      그래서 RPC로 뺀다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포보다 먼저 실행해야 한다.**
--   - `repeat_count`가 든 배지를 저장하려면 CHECK 제약이 먼저 열려 있어야 한다.
--   - 엔진이 `increment_activity_badge_earn`을 호출하므로 함수가 먼저 있어야 한다.
--   기존 데이터는 한 글자도 바뀌지 않는다 — 현재 카탈로그에 `repeat_count`를 쓰는 배지가
--   0건이고(카탈로그는 티켓 20260905_0035), 반복형이 0건이면 RPC도 호출되지 않는다.
--
-- 재실행 가능(idempotent): DROP ... IF EXISTS + ADD / CREATE OR REPLACE /
--   ON CONFLICT DO UPDATE 로 작성했다.

BEGIN;

-- ── ① CHECK 제약 갱신 — 허용 키 45 → 46 ─────────────────────────────────
--
-- 131의 배열을 그대로 옮기고 `repeat_count` 하나만 더한다.
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
        -- 수치 검사 필드 (MEASURABLE) — v5 반복 획득 1종 (132, 이번 추가)
        'repeat_count',
        -- 필터 전용 필드 (그 자체만으로는 pass/fail을 만들지 않음) — 기존 7종
        'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route',
        'poi_id', 'season', 'same_activity',
        -- 필터 전용 필드 — v5 신규 2종 (131)
        'negative_split', 'day_of_month',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- ── ② 계열 정합성 트리거 함수 — measurable_keys 배열 35 → 36 ──────────────
--
-- ⚠️ **130과 131이 이미 이 함수를 손댔다. 그 변경분을 전부 보존한 채 키 하나만 더한다.**
--    되돌리면 안 되는 두 줄(130, 마스터 티켓 B-4 재발 방지):
--      ① `IF NEW.level IS NOT NULL THEN RETURN NEW;` — 무한레벨형은 이 검사의 대상이 아니다
--      ② 형제 조회의 `AND level IS NULL` — 레벨형 형제가 등급형 계열 기준을 오염시키지 않게
--    트리거 정의(`badges_family_consistency`)는 **건드리지 않는다** — 130이
--    `UPDATE OF name, activity_types, condition_json, level, rarity`로 다시 만들어 뒀고
--    CREATE OR REPLACE FUNCTION은 트리거 정의에 영향을 주지 않는다(검증 쿼리 ③으로 확인).
--
-- 배열에 없는 키는 계열 조건 조합 비교에서 통째로 빠진다. 반복형 계열(같은 이름의 4장이
-- repeat_count만 1·5·20·50으로 다른 형태)이 이 배열에 없으면 모든 형제의 키 집합이 같아져
-- «조건이 서로 달라도 같다»가 아니라 **«같은데 다르다»**가 된다 — 정확히는, repeat_count가
-- 빠지면 4장 전부 키 집합이 동일해져 검사를 통과한다. 넣어도 4장 모두 repeat_count를
-- 가지므로 여전히 통과한다(값은 비교하지 않고 «키의 집합»만 비교하기 때문). 넣는 이유는
-- 레지스트리와의 동기화를 유지하기 위해서다.
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
    -- v5 반복 획득 1종 (티켓 20260905_0030 / 이번 마이그레이션)
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

-- ── ③ badge_metric_labels — repeat_count 라벨 ────────────────────────────
--
-- 라벨이 없는 키는 화면에 **영문 원문 그대로 노출된다**(127의 의도적 폴백).
-- 라벨은 `getMetricLabels → computeBadgeProgress → badgeProgressText`를 거쳐 유저 문장에
-- 그대로 삽입되므로 부사구가 아니라 **명사구**여야 한다.
-- 값은 `conditionRegistry.ts`의 `label`/`unit`과 한 글자도 다르면 안 된다
-- (`condition-registry.test.ts`가 이 INSERT를 파싱해 대조한다).
INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('repeat_count', '달성 횟수', '회')
ON CONFLICT (metric_key) DO UPDATE
  SET label_ko   = EXCLUDED.label_ko,
      unit_ko    = EXCLUDED.unit_ko,
      updated_at = now();

-- ── ④ earn_count 컬럼 의미 정정 ──────────────────────────────────────────
--
-- 130은 «이 배지를 획득한 총 횟수, 최초 발급이 1»이라고 적었다. B1이 「발급」과 「카운터
-- 증가」를 갈랐으므로 그 문장은 더 이상 정확하지 않다 — 반복형은 발급 시점에 이미 쌓인
-- 회차 전부가 들어간다(한 건만 심으면 다음 싱크에서 과거 회차가 뒤늦게 더해져 카운터가
-- 흔들린다). 반복형이 아닌 배지는 여전히 영원히 1이다.
COMMENT ON COLUMN public.user_activity_badges.earn_count IS
  '그 배지의 기준 조건을 만족한 활동 수. 행은 늘지 않는다(UNIQUE(user_id, badge_id) 유지).
   반복형(condition_json.repeat_count)만 회차마다 증가하며, **그 증가는 발급이 아니다** —
   피드 이벤트도 결산도 만들지 않는다. 반복형이 아닌 배지는 발급 1회로 끝나 영원히 1이다.
   불변식: earn_count = jsonb_array_length(earn_history) (단, earn_history가 상한 200에
   도달한 뒤로는 earn_count만 계속 증가한다). 티켓 20260905_0030';

COMMENT ON COLUMN public.user_activity_badges.earn_history IS
  '회차별 획득 이력(jsonb 배열). 각 원소는 { earned_at, strava_activity_id } 형태다.
   strava_activity_id가 멱등 판정의 키다 — increment_activity_badge_earn()이
   earn_history @> [{"strava_activity_id": …}] 로 같은 활동의 재계상을 막는다.
   최근 200건만 남는다(earn_count가 총계를 들고 있어 정보 손실이 작다).
   ⚠️ JSONB라 FK가 없다 — 근거 활동이 삭제되면 참조가 끊긴 채 남는다. 표시 단계(티켓
   20260905_0038)에서 결번 처리한다. 티켓 20260905_0027 / 20260905_0030';

-- ── ⑤ increment_activity_badge_earn() — 회차 카운터 원자적 증가 ───────────
--
-- 핵심은 **한 문장 UPDATE의 WHERE 절에 멱등 조건을 담는 것**이다:
--
--   UPDATE ... SET earn_count = earn_count + 1, earn_history = earn_history || $entry
--    WHERE user_id = ? AND badge_id = ?
--      AND NOT (earn_history @> jsonb_build_array(jsonb_build_object('strava_activity_id', ?)))
--
-- 읽고-고치고-쓰는 왕복이 없다. READ COMMITTED에서 동시 싱크가 같은 행을 노리면 뒤쪽
-- 트랜잭션은 행 잠금을 기다렸다가 **갱신된 행으로 WHERE를 다시 평가**하므로, 같은 활동은
-- 두 번 세어지지 않고 서로 다른 활동은 유실되지 않는다. 이 조건절이 예전에 23505(중복키)로
-- 대신하던 멱등 방어를 대체한다.
--
-- 여러 회차를 한 번에 받는 이유: 싱크 한 번에 같은 배지의 회차가 여러 건 생길 수 있다.
-- 배열을 통째로 합치는 대신 **원소마다 위 UPDATE를 한 번씩** 돌린다 — 각 문장이 원자적이라
-- 위 보장이 원소 단위로 그대로 성립하고, CTE로 묶어 스냅샷을 섞는 것보다 추론이 쉽다.
--
-- 반환값: 실제로 증가한 회차 수(이미 세어진 활동은 0으로 떨어진다).
--
-- ⚠️ 상한(p_history_limit)을 넘겨 밀려난 원소는 이 조건절이 막지 못한다. 다만 싱크는
--    getProcessedStravaIds가 이미 처리한 활동을 상위에서 걸러내므로 **이중 방어**다.
CREATE OR REPLACE FUNCTION public.increment_activity_badge_earn(
  p_user_id       UUID,
  p_badge_id      UUID,
  p_entries       JSONB,
  p_history_limit INTEGER DEFAULT 200
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry     JSONB;
  v_activity  JSONB;
  v_added     INTEGER := 0;
  v_rows      INTEGER;
  v_seen      JSONB := '[]'::jsonb;  -- 같은 배치 안의 중복 활동 방어
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RETURN 0;
  END IF;
  IF p_history_limit IS NULL OR p_history_limit < 1 THEN
    p_history_limit := 200;
  END IF;

  FOR v_entry IN SELECT e FROM jsonb_array_elements(p_entries) AS t(e) LOOP
    v_activity := v_entry -> 'strava_activity_id';

    -- 근거 활동 id가 없으면 멱등 판정을 할 수 없다 — 세지 않는다.
    -- (반복형의 회차는 언제나 활동 1건이므로 정상 경로에서는 발생하지 않는다)
    CONTINUE WHEN v_activity IS NULL OR jsonb_typeof(v_activity) = 'null';

    -- 같은 호출 안에 같은 활동이 두 번 실려 오면 두 번째부터는 건너뛴다.
    -- (아래 UPDATE는 문장 단위로 원자적이라 첫 번째가 커밋되기 전 두 번째가 같은 행을
    --  다시 보면 WHERE가 통과할 수 있다 — 같은 트랜잭션 안에서는 자기 변경이 보이므로
    --  실제로는 막히지만, 의도를 코드에 남긴다)
    CONTINUE WHEN v_seen @> jsonb_build_array(v_activity);
    v_seen := v_seen || jsonb_build_array(v_activity);

    UPDATE public.user_activity_badges
       SET earn_count   = earn_count + 1,
           earn_history = (
             -- 상한을 넘기면 **오래된 것부터** 밀어낸다
             SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
               FROM jsonb_array_elements(earn_history || jsonb_build_array(v_entry))
                    WITH ORDINALITY AS t(e, ord)
              WHERE ord > GREATEST(jsonb_array_length(earn_history) + 1 - p_history_limit, 0)
           )
     WHERE user_id = p_user_id
       AND badge_id = p_badge_id
       AND NOT (earn_history @> jsonb_build_array(jsonb_build_object('strava_activity_id', v_activity)));

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_added := v_added + v_rows;
  END LOOP;

  RETURN v_added;
END;
$$;

-- anon/authenticated의 EXECUTE 권한을 회수하고 service_role에만 남긴다
-- (109~111과 같은 방어 — 이 함수는 호출자 검증 없이 p_user_id를 그대로 신뢰하므로,
--  anon 키로 PostgREST를 직접 호출하면 임의 유저의 회차 카운터를 조작할 수 있다).
REVOKE ALL ON FUNCTION public.increment_activity_badge_earn(UUID, UUID, JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_activity_badge_earn(UUID, UUID, JSONB, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.increment_activity_badge_earn(UUID, UUID, JSONB, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_activity_badge_earn(UUID, UUID, JSONB, INTEGER) TO service_role;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 기존 배지가 새 CHECK를 전부 만족하는지 (제약 추가가 성공했다면 이미 보장되지만 재확인)
-- SELECT count(*) FROM public.badges WHERE condition_json IS NOT NULL;  -- 207 (실행 전과 동일)
--
-- -- ② repeat_count가 실제로 통과하는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.badges (name, description, type, rarity, activity_types, condition_json)
--   VALUES ('__smoke_132__', '스모크', 'activity', 'common', ARRAY['running'],
--           '{"activity_type":"running","duration_minutes":60,"repeat_count":5}'::jsonb)
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백: repeat_count INSERT 통과 (id=%)', v_id;
-- END
-- $smoke$;
--
-- -- ③ 130이 만든 트리거 정의(UPDATE OF에 level·rarity 포함)가 그대로인지
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgname = 'badges_family_consistency' AND tgrelid = 'public.badges'::regclass;
--    → BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity
--
-- -- ④ 트리거 함수의 measurable_keys가 36개인지 + 130의 레벨형 스킵 두 줄이 살아 있는지
-- SELECT prosrc LIKE '%repeat_count%'            AS has_repeat_count,
--        prosrc LIKE '%IF NEW.level IS NOT NULL%' AS has_level_skip,
--        prosrc LIKE '%AND level IS NULL%'        AS has_sibling_skip
--   FROM pg_proc WHERE proname = 'check_family_condition_consistency';  -- 전부 true
--
-- -- ⑤ RPC 멱등 스모크 — 같은 활동을 두 번 넣어도 earn_count가 한 번만 오른다.
-- --    (임의 유저/배지로 바꿔 실행하고, 끝에 RAISE EXCEPTION으로 되돌릴 것)
-- DO $smoke$
-- DECLARE v_user UUID; v_badge UUID; v_a INTEGER; v_b INTEGER; v_count INTEGER;
-- BEGIN
--   SELECT user_id, badge_id INTO v_user, v_badge FROM public.user_activity_badges LIMIT 1;
--   v_a := public.increment_activity_badge_earn(v_user, v_badge,
--            '[{"earned_at":"2026-09-05T00:00:00Z","strava_activity_id":999999999}]'::jsonb);
--   v_b := public.increment_activity_badge_earn(v_user, v_badge,
--            '[{"earned_at":"2026-09-05T00:00:00Z","strava_activity_id":999999999}]'::jsonb);
--   SELECT earn_count INTO v_count FROM public.user_activity_badges
--    WHERE user_id = v_user AND badge_id = v_badge;
--   RAISE EXCEPTION '롤백: 1회차 %건 / 2회차 %건 / earn_count %', v_a, v_b, v_count;
--   -- 기대: 1건 / 0건
-- END
-- $smoke$;
--
-- -- ⑥ 권한이 service_role에만 남았는지
-- SELECT proacl FROM pg_proc WHERE proname = 'increment_activity_badge_earn';
--
-- -- ⑦ 지표 라벨
-- SELECT metric_key, label_ko, unit_ko FROM public.badge_metric_labels WHERE metric_key = 'repeat_count';
--    → 달성 횟수 / 회

-- ↩️ 롤백 DDL
--    DROP FUNCTION IF EXISTS public.increment_activity_badge_earn(UUID, UUID, JSONB, INTEGER);
--    DELETE FROM public.badge_metric_labels WHERE metric_key = 'repeat_count';
--    -- CHECK 제약과 트리거 함수는 131의 ①·② 블록을 재실행해 되돌린다
--    -- (되돌리기 전에 condition_json에 repeat_count를 쓰는 행이 없는지 먼저 확인할 것:
--    --  SELECT count(*) FROM public.badges WHERE condition_json ? 'repeat_count';)
--    -- earn_count/earn_history COMMENT는 130 파일의 해당 COMMENT 문을 재실행한다.
