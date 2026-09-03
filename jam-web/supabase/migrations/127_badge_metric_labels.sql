-- 20260904_0430: 배지 지표(metric) 라벨·단위 관리 테이블
--
-- badge-engine condition_json의 필드 키(distance_km, friday 등)에 대응하는 한글 라벨·단위가
-- 코드에도 DB에도 없었다(index.ts의 라벨 상수는 비공개 6개뿐, badges.description은 세계관
-- 산문이라 구조화된 라벨로 못 씀). 코드(TS 상수)로 만들면 새 지표·새 액티비티 종목이 추가될
-- 때마다 배포가 필요해 콘텐츠 담당자가 손댈 수 없다 — 어드민 편집 테이블로 만들어 배포 없이
-- 라벨을 추가/수정할 수 있게 한다.
--
-- 후속 티켓(2b, computeBadgeProgress())이 condition_json의 축 키(distance_km 등)와
-- day_of_week/season 값(friday, winter 등)으로 이 테이블을 조회해 배지 트리 진행 레일의 축
-- 라벨·단위를 채운다. 행이 없는 키는 원문 그대로 노출한다 — "라벨이 안 보이는" 게 아니라
-- "아직 안 채워진 게 눈에 띄게" 만드는 의도적 폴백이다.
-- (참고: Service Plan/Assets/20260903_badge-tree-rail-prototype.html §08 G, 티켓 20260903_2329)
--
-- 시드 데이터 출처:
--  - MEASURABLE_CONDITION_KEYS(src/lib/badge-engine/condition-schema.ts) 17개 전체 — 이
--    목록이 badge-engine이 실제로 "수치 검사"를 수행하는 필드의 닫힌 집합이라(DB CHECK
--    제약·컴파일 타임 동기화 체크로 보장), 이걸 전부 채우면 기존 배지 192개가 쓰는 모든
--    측정 축이 자동으로 커버된다. activity_type/route/poi_id 등 필터 전용 필드와
--    mission_reward(메타)는 "축"이 아니므로 제외.
--  - index.ts의 비공개 SEASON_LABEL_KO(4)·INDEPENDENT_FIELD_LABEL_KO(6)는 그대로 이식.
--    DAY_LABEL_KO(7)는 다중 카운터 게이지 전용 압축 표기("금" 등 1글자)라 값 자체는
--    가져오지 않고, 그게 가리키는 요일만 확인해 전체 요일명으로 시드한다 — 이 테이블은
--    2b 이후 여러 화면이 공통 조회하는 범용 저장소라서다(추측해서 새로 짓는 게 아니라
--    이미 정해진 요일 순서를 전체 이름으로 풀어 쓰는 것).
--  - season:'all'(전체 계절) 1건 — SEASON_LABEL_KO엔 없지만 evaluateConditionDetailed의
--    인라인 삼항연산자(`condition.season === 'all' ? '전체' : ...`)에 이미 쓰이는 문자열을
--    그대로 가져왔다. BadgeCondition.season 타입에 'all'이 명시적으로 포함돼 있다.

CREATE TABLE IF NOT EXISTS public.badge_metric_labels (
  metric_key  TEXT PRIMARY KEY,
  label_ko    TEXT NOT NULL,
  unit_ko     TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.badge_metric_labels IS
  '배지 조건 측정 필드 키 및 day_of_week/season 값에 대응하는 한글 라벨·단위. 어드민 편집 테이블 — 코드 배포 없이 갱신 가능. 20260904_0430';
COMMENT ON COLUMN public.badge_metric_labels.metric_key IS
  'condition_json 필드 키(distance_km 등) 또는 day_of_week/season 값(friday, winter, all 등). condition-schema.ts ALL_CONDITION_KEYS와 자동 동기화되지 않는 자유 텍스트 — 새 조건 필드 추가 시 어드민에서 수동으로 행을 채워야 함';
COMMENT ON COLUMN public.badge_metric_labels.label_ko IS '한글 라벨 (예: 누적 거리, 금요일)';
COMMENT ON COLUMN public.badge_metric_labels.unit_ko IS '단위 (예: km, 분, 회) — NULL이면 단위 없이 표시';

-- RLS: 어드민 API(service_role)만 접근. poi_categories(050_poi_categories_table.sql)와 동일 패턴.
ALTER TABLE public.badge_metric_labels ENABLE ROW LEVEL SECURITY;
-- service_role은 RLS bypass이므로 별도 정책 불필요 — anon/authenticated는 정책 없음=거부(기본 차단)

-- ── 시드 데이터 ──────────────────────────────────────────────────────────

-- MEASURABLE_CONDITION_KEYS 17개 전체.
-- duration_minutes/min_speed_kmh/max_pace_sec_per_km/temperature_min_c/temperature_max_c/
-- weekend_duration_hours 6개는 INDEPENDENT_FIELD_LABEL_KO 값을 그대로 이식(변형 없음).
-- max_pace_sec_per_km은 formatPaceSecPerKm()이 "5:30/km"처럼 단위를 이미 포함해 포맷하므로
-- unit_ko를 별도로 두지 않는다(중복 표기 방지).
INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('distance_km', '누적 거리', 'km'),
  ('elevation_gain_m', '누적 고도', 'm'),
  ('duration_minutes', '이동시간', '분'),
  ('min_speed_kmh', '속도', 'km/h'),
  ('max_pace_sec_per_km', '페이스', NULL),
  ('temperature_min_c', '기온', '°C'),
  ('temperature_max_c', '기온', '°C'),
  ('weekend_duration_hours', '주말활동시간', '시간'),
  ('total_count', '횟수', '회'),
  ('streak_days', '연속 일수', '일'),
  ('weekly_count', '주간 횟수', '회'),
  ('month', '해당 월', NULL),
  ('monthly_km', '월 누적 거리', 'km'),
  ('season_count', '계절 활동 횟수', '회'),
  ('season_count_all', '계절별 활동 횟수', '회'),
  ('active_days_count', '누적 활동일수', '일'),
  ('time_range', '활동 시간대', NULL)
ON CONFLICT (metric_key) DO NOTHING;

-- day_of_week 값 7개 — DAY_LABEL_KO(index.ts)는 5칸 다중 카운터 게이지처럼 자리가 좁은
-- 특정 화면 하나를 위한 압축 표기("금" 등 1글자)라 이 테이블에는 그대로 이식하지 않는다.
-- 이 테이블은 2b 이후 여러 화면이 공통으로 조회하는 범용 저장소라, 한 화면의 공간 제약을
-- 전체 정답값으로 박아두면 다른 화면(레일 등)에 그대로 노출된다 — 전체 요일명을 저장하고,
-- 자리가 좁은 컴포넌트는 필요하면 렌더 시점에 스스로 줄인다(티켓 20260904_0430 논의).
INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('sunday', '일요일', NULL),
  ('monday', '월요일', NULL),
  ('tuesday', '화요일', NULL),
  ('wednesday', '수요일', NULL),
  ('thursday', '목요일', NULL),
  ('friday', '금요일', NULL),
  ('saturday', '토요일', NULL)
ON CONFLICT (metric_key) DO NOTHING;

-- season 값 5개 — SEASON_LABEL_KO(위와 동일 파일, 4개) + 'all'(같은 파일 인라인 리터럴, 1개)
INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('spring', '봄', NULL),
  ('summer', '여름', NULL),
  ('fall', '가을', NULL),
  ('winter', '겨울', NULL),
  ('all', '전체', NULL)
ON CONFLICT (metric_key) DO NOTHING;
