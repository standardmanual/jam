-- 117: condition_json에 same_activity 플래그 도입 (티켓 20260831_2100)
--
-- 배경: distance_km/elevation_gain_m은 badge-engine에서 기본이 "전체 이력 누적 합계"
-- 평가였는데(원래 의도, ACTIVITY_BADGES.md §"패턴별 트랙 분류" 참조), 커밋 27163030
-- (2026-07-31)이 "서로 다른 활동의 값을 조합해 잘못 통과되던 버그"를 고치면서 이 두 필드까지
-- "한 활동에서 동시 충족"으로 과잉 일반화했다. 이번 마이그레이션은 배지엔진 코드 수정
-- (src/lib/badge-engine/index.ts)과 짝을 이루어, distance_km/elevation_gain_m을 다시
-- 누적 합계로 되돌리되 예외적으로 "한 활동에서 진짜 동시 충족"이 맞는 유일한 배지
-- (T1 '야생의 첫발' — distance_km+elevation_gain_m 복합 AND, 이력전반 문구 없음)만
-- `same_activity: true` 플래그로 명시해 옛 동작을 유지시킨다.
--
-- 이 마이그레이션이 하는 일:
--   ① badges_condition_json_known_keys CHECK 제약(102)에 'same_activity' 키 추가
--      (src/lib/badge-engine/condition-schema.ts의 ALL_CONDITION_KEYS와 동기화 유지)
--   ② T1 '야생의 첫발' 4개 등급 전부에 same_activity:true 설정
--
-- ⚠️ 순서 중요: 배지엔진 코드가 이 값을 읽기 전에(=이 마이그레이션 실행 전에) 코드만 먼저
-- 배포되면, T1이 일시적으로 "누적 합계"로 잘못 평가된다(코드가 same_activity!==true를
-- 기본 취급하므로). 코드 배포와 이 마이그레이션 실행은 같은 배포 사이클에서 함께 처리한다.

BEGIN;

-- ── ① CHECK 제약 갱신 ──────────────────────────────────────────────────
ALTER TABLE public.badges
  DROP CONSTRAINT IF EXISTS badges_condition_json_known_keys;

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
        'poi_id', 'season', 'same_activity',
        -- ── 메타데이터 필드 (발급 판정에 관여하지 않음) ────────────────
        'mission_reward'
      ]::text[]
    ) = '{}'::jsonb
  );

-- ── ② T1 '야생의 첫발' — 유일한 same_activity:true 대상 (4개 등급 전부) ──
UPDATE public.badges
   SET condition_json = condition_json || '{"same_activity": true}'::jsonb
 WHERE type = 'activity'
   AND name = '야생의 첫발'
   AND condition_json ? 'distance_km'
   AND condition_json ? 'elevation_gain_m';

COMMIT;

-- ── 확인용 (실행하지 않음, 참고) ──────────────────────────────────────
-- SELECT rarity, condition_json FROM public.badges
--  WHERE type='activity' AND name='야생의 첫발' ORDER BY rarity;
--    → 4행 전부 condition_json에 "same_activity":true 포함돼야 함
