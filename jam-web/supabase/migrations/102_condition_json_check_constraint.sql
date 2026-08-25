-- 102: badges.condition_json 허용 필드 CHECK 제약 도입 (티켓 20260825_029)
--
-- 배경: 마이그레이션 084_badge_condition_cleanup.sql이 배지 상세화면 표시용으로 미션보상배지
-- 15종에 {"mission_reward": true}를 UPDATE했는데, badge-engine의 evaluateConditionDetailed가
-- "알려진 조건 필드 없음 → 검사 스킵 → pass:true"로 처리해 미션 완료 없이 미션보상배지가
-- 발급되고 레벨업 게이팅이 12일간 무력화됐다(티켓 20260825_028). 증상은 코드 레벨 3중 방어로
-- 막았지만, "condition_json에 런타임 데이터 계약이 없다"는 근본 원인은 남아 있었다.
--
-- 이 마이그레이션은 badges.condition_json의 최상위 키가 src/lib/badge-engine/condition-schema.ts
-- 의 ALL_CONDITION_KEYS(조건 필드 + mission_reward 메타데이터)에 없으면 INSERT/UPDATE 자체를
-- 거부한다. 마이그레이션·어드민·service_role 직접 조작 등 모든 쓰기 경로를 예외 없이 커버한다
-- (084 같은 마이그레이션도 이 제약이 있었다면 그 자리에서 실패해 배포 전에 드러났을 것).
--
-- 트리거 대신 CHECK를 쓰는 이유: 서브쿼리 없이 `jsonb - text[]` 연산자(IMMUTABLE)만으로 구현
-- 가능해 더 단순하다. 키 목록에 새 필드가 생기면 이 배열과 condition-schema.ts의
-- ALL_CONDITION_KEYS를 함께 갱신해야 한다(두 곳이 어긋나면 정상 필드가 거부되므로 바로 드러남).
--
-- 사전 실측 완료(2026-08-25, jam-prod): SELECT type, jsonb_object_keys(condition_json) AS key,
-- count(*) FROM badges WHERE condition_json IS NOT NULL GROUP BY type, key
-- → 미허용 키 0건. 기존 데이터와 충돌 없음 확인.
ALTER TABLE public.badges
  ADD CONSTRAINT badges_condition_json_known_keys CHECK (
    condition_json IS NULL
    OR (
      condition_json - ARRAY[
        -- ── 조건 필드 (발급 판정에 관여) ──────────────────────────────
        -- 수치 검사 필드 (MEASURABLE_CONDITION_KEYS)
        'distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh',
        'max_pace_sec_per_km', 'temperature_min_c', 'temperature_max_c',
        'weekend_duration_hours', 'total_count', 'streak_days', 'weekly_count',
        'month', 'monthly_km', 'season_count', 'season_count_all',
        'active_days_count', 'time_range',
        -- 필터 전용 필드 (그 자체만으로는 pass/fail을 만들지 않음)
        'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route',
        'poi_id', 'season',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- 확인용 (실행하지 않음, 참고): 위 배열은 src/lib/badge-engine/condition-schema.ts의
-- ALL_CONDITION_KEYS와 반드시 동기화돼야 한다.
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'badges_condition_json_known_keys';
