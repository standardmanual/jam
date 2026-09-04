-- 128: 배지 진행 스냅샷 테이블 + 계열 정합성 트리거 (티켓 20260904_1156)
--
-- 배경: 배지트리 리뉴얼 3차(프로토타입 §08 C·D) 첫 단계. 2a~2d(2차)로 다섯 조건 유형 전부가
-- 화면에 진행 수치를 보여주지만 전부 "지금 이 순간" 값만 실시간 재계산한다 — 이전 상태와
-- 비교할 방법이 없다. "직전 동기화로 얼마나 나아갔는지"(레일 채움 막대 끝 밝은 꼬리, 프로토타입
-- §05)를 보여주려면 비교 기준이 되는 이전 값을 저장해야 한다. 이 마이그레이션은 그 저장소(A)와,
-- 어드민이 계열 조건을 잘못 고치는 것을 쓰기 시점에 막는 정합성 트리거(B)를 함께 추가한다.
--
-- ⚠️ 이 파일은 jam-web/CLAUDE.md 규칙에 따라 작성만 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- ## 1차 시도(HALT) 요약 — B절 트리거 원안의 결함 2건
-- 1. jsonb_object_keys 전체 비교는 안 된다 — Common엔 prerequisite_badge_names가 없고 Rare
--    이상엔 있는 게 정상 설계(badgeTree.ts:238, 계열의 정상 설계)라, 전체 키 비교로는 다등급
--    계열 40/72개(100%)가 즉시 위반한다. 비교 범위를 condition-schema.ts의
--    MEASURABLE_CONDITION_KEYS(17개)로 좁혀야 한다.
-- 2. `badges`에는 `activity_type`(단수) 컬럼이 없다(`activity_types text[]`만 있음, 길이는
--    현재 전부 정확히 1) — 원안대로면 CREATE TRIGGER 자체가 실패했을 것.
-- 아래 B절은 이 두 결함을 반영해 수정된 버전이다.
--
-- ## 사전 점검 재실측 (2026-09-04, jam-prod, 읽기 전용 SELECT — 마이그레이션 미실행)
-- badges 전체 5,596행(item 3600·activity 207·checkin 1789), mission_reward 15건 제외 활동배지
-- 후보 192건, (activity_types, name) 계열 72개(다등급 40 · 단일등급 32) — 1차 시도 실측과 완전히
-- 동일. 소프트 삭제 0건, activity_types 배열 길이 전부 1. 아래 B절(MEASURABLE_CONDITION_KEYS
-- 범위로 좁힌 버전) 기준 계열별 교집합 불일치 **0건** — 트리거를 걸어도 기존 데이터가 즉시
-- 위반하지 않음을 확인했다(원안 기준이었다면 40/72건이 즉시 위반했을 것).

-- ── A. user_family_progress — 계열 진행 스냅샷 ──────────────────────────────
--
-- user_id/strava_activities 참조는 이 저장소의 기존 관례(069_strava_activities.sql,
-- 099_mission_rank_snapshots.sql)를 그대로 따른다 — `auth.users(id)`가 아니라
-- `public.users(id)`를 참조한다(public.users.id 자체가 auth.users(id)를 FK로 물고 있음,
-- 001_initial_schema.sql). 이 문서(티켓) 초안이 예시로 든 auth.users(id) 직접 참조는 이
-- 저장소 어디에도 없는 패턴이라 교정했다.
CREATE TABLE IF NOT EXISTS public.user_family_progress (
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_type     TEXT NOT NULL,
  family_name       TEXT NOT NULL,
  progress          REAL NOT NULL,
  current           JSONB NOT NULL,
  prev              JSONB,
  last_activity_id  UUID REFERENCES public.strava_activities(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, activity_type, family_name)
);

COMMENT ON TABLE public.user_family_progress IS
  '배지 계열(activity_type, name)별 진행 스냅샷. 매 싱크마다 현재값을 계산해 직전 값(prev)과
   교체 저장한다 — "직전 동기화 대비 얼마나 나아갔는지"(레일 꼬리, 3b 화면 티켓)의 비교 기준.
   이번 티켓 범위에는 화면이 없다 — write-hook까지만. 20260904_1156';
COMMENT ON COLUMN public.user_family_progress.activity_type IS
  'ActivityType 값 하나(walking 등) — badges.activity_types[0]과 동일(활동배지의 activity_types
   배열 길이는 항상 1, 1차 시도 실측). badges.activity_types(복수형 배열)와 다른 컬럼이다.';
COMMENT ON COLUMN public.user_family_progress.family_name IS
  '= badges.name. 계열의 유일한 식별자(2b/2c 티켓에서 이미 확인된 전제)';
COMMENT ON COLUMN public.user_family_progress.progress IS
  '0~1. 계열 안 프런티어(첫 미획득 등급) 배지의 computeBadgeProgress().progress 스냅샷';
COMMENT ON COLUMN public.user_family_progress.current IS
  '프런티어 배지의 computeBadgeProgress().axes 스냅샷(jsonb 배열). 라벨(label/unit)은 이 티켓의
   write-hook이 빈 라벨 맵으로 계산해 넣으므로 원문 key로 채워진다 — 실제 라벨은 표시 시점(3b)에
   badge_metric_labels를 다시 조회해 값을 붙인다(완료 기록 참고)';
COMMENT ON COLUMN public.user_family_progress.prev IS
  '직전 동기화 시점의 current를 그대로 옮긴 값 — 새로 계산하지 않는다. 최초 1회는 NULL';
COMMENT ON COLUMN public.user_family_progress.last_activity_id IS
  '이 스냅샷을 갱신한 싱크 배치에서 가장 최신인 활동의 strava_activities.id(감사용). 계열별
   활동 종목과 무관하게 그 싱크를 트리거한 배치 전체 기준 1개 값을 모든 계열 행에 공유한다 —
   활동 단위 기여도 계산에는 쓰이지 않는다(D절 설계 수정: current/prev 축 차이로 대체)';

-- RLS: 유저별 데이터이지만(badge_metric_labels/127과 다름) 이 테이블을 직접 읽는 클라이언트
-- 코드가 아직 없다(이번 티켓 범위에 화면 없음). mission_rank_snapshots(099)·engine_decision_log
-- (074)·poi_views(096)와 동일하게 "RLS 켜고 정책 없음" = service_role 전용으로 기본값을
-- 닫아둔다 — 필요해지면(3b) 그때 authenticated 자기 행 read 정책을 추가한다.
ALTER TABLE public.user_family_progress ENABLE ROW LEVEL SECURITY;

-- ── B. 계열 정합성 트리거 (DB advisor 정합성 체크 — 이전 세션 의사결정 D2) ──────
--
-- 동기: family_name이 유일한 식별자이므로, 어드민에서 조건을 잘못 고치면 그 계열 안에서
-- computeBadgeProgress()가 가정하는 "계열 하나 = 조건 필드 조합 하나"가 깨진다. 쓰기 시점에
-- 막는 트리거로 방지한다 — 기존 102_condition_json_check_constraint.sql이 이미 쓰는 "DB가
-- 조건 형태를 직접 검증한다"는 방침의 연장.
--
-- 비교 범위는 MEASURABLE_CONDITION_KEYS(condition-schema.ts)로 좁힌다 — jsonb_object_keys
-- 전체를 비교하면 안 된다(위 "1차 시도 요약" 참고). 이 배열은 condition-schema.ts의
-- MEASURABLE_CONDITION_KEYS와 반드시 동기화돼야 한다(102와 같은 관행).
CREATE OR REPLACE FUNCTION public.check_family_condition_consistency()
RETURNS TRIGGER AS $$
DECLARE
  measurable_keys TEXT[] := ARRAY[
    'distance_km','elevation_gain_m','duration_minutes','min_speed_kmh','max_pace_sec_per_km',
    'temperature_min_c','temperature_max_c','weekend_duration_hours','total_count','streak_days',
    'weekly_count','month','monthly_km','season_count','season_count_all','active_days_count','time_range'
  ];
  sibling_keys TEXT[];
  new_keys     TEXT[] := (
    SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(NEW.condition_json) k
    WHERE k = ANY(measurable_keys)
  );
BEGIN
  IF (NEW.condition_json->>'mission_reward')::boolean IS TRUE THEN
    RETURN NEW;  -- mission_reward 배지는 애초에 계열 그룹핑에서 빠진다(badgeTree.ts:166) — 대상 아님
  END IF;

  SELECT array_agg(DISTINCT k ORDER BY k) INTO sibling_keys
  FROM public.badges, jsonb_object_keys(condition_json) k
  WHERE activity_types = NEW.activity_types  -- activity_type(단수) 컬럼은 없다 — 배열 전체 비교
    AND name = NEW.name
    AND id <> NEW.id
    AND deleted_at IS NULL  -- 소프트 삭제된 형제의 옛 조건 형태가 살아있는 배지 수정을 막지 않게 함
    AND (condition_json->>'mission_reward')::boolean IS NOT TRUE  -- 형제 쪽도 동일 제외(1차 시도 지적)
    AND k = ANY(measurable_keys);

  IF sibling_keys IS NOT NULL AND sibling_keys <> new_keys THEN
    RAISE EXCEPTION '"%" 계열(%) 측정 조건 필드 불일치 — 기존 % / 신규 %',
      NEW.name, NEW.activity_types, sibling_keys, new_keys;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 알려진 한계(고치지 않고 그대로 남겨둔다): 이 트리거는 "형제 존재 여부"로 비교 대상을
-- 찾는다. 어드민이 name을 완전히 다른 문자열로 오타 내면 그 순간 형제가 0건이 되어 검사
-- 자체가 스킵된다 — 이름 오타로 계열이 쪼개지는 시나리오는 이 트리거로 막히지 않는다. 이
-- 트리거가 실제로 막는 건 (a) 기존 계열에 형태가 다른 배지를 새로 추가하는 것, (b) 이름은
-- 그대로 두고 condition_json 측정 필드 조합만 어긋나게 고치는 것, 두 가지다. 더 넓은 보호는
-- 이 티켓 범위 밖(예: 카탈로그 전체 정합성 주기 재검사 크론).
--
-- WHEN (NEW.type = 'activity') — 티켓 B절 "권장" 사항 반영. item·checkin 타입은 현재
-- condition_json이 전량 NULL이라 실질적 영향은 없지만(1차 시도 실측), 트리거 자체를 활동배지
-- 쓰기에만 국한해 다른 타입의 쓰기 경로에 이 검사가 관여할 여지를 원천 차단한다.
CREATE TRIGGER badges_family_consistency
  BEFORE INSERT OR UPDATE OF name, activity_types, condition_json ON public.badges
  FOR EACH ROW
  WHEN (NEW.type = 'activity')
  EXECUTE FUNCTION public.check_family_condition_consistency();

-- ↩️ 롤백 DDL
--    DROP TRIGGER IF EXISTS badges_family_consistency ON public.badges;
--    DROP FUNCTION IF EXISTS public.check_family_condition_consistency();
--    DROP TABLE IF EXISTS public.user_family_progress;
