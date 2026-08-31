/**
 * condition_json 데이터 계약 — 허용 필드 단일 소스 (티켓 20260825_031)
 *
 * `badges.condition_json`에 들어올 수 있는 필드를 이 파일 하나로 정의한다. DB CHECK 제약
 * (`supabase/migrations/102_condition_json_check_constraint.sql`), 어드민 API 검증
 * (`src/lib/admin/badge-validation.ts`), badge-engine의 "평가 가능한 조건 없음" 게이트가
 * 모두 이 목록을 참조/동기화한다.
 *
 * 배경: 마이그레이션 `084_badge_condition_cleanup.sql`이 배지 상세화면 표시용으로 넣은
 * `{"mission_reward": true}`가 badge-engine의 `evaluateConditionDetailed`에서 "알려진 조건
 * 필드 없음 → 검사 스킵 → pass:true"로 처리되어 미션 완료 없이 미션보상배지가 발급되는
 * 사고로 이어졌다(레벨업 게이팅 12일 무력화, 티켓 20260825_028). 증상은 3중 방어로
 * 막았지만 근본 원인인 "condition_json에 런타임 데이터 계약이 없다"는 남아 있었다 —
 * 이 파일이 그 계약이다.
 */
import type { BadgeCondition } from '@/types/database'

/**
 * badge-engine(`evaluateConditionDetailed`)이 실제로 "수치 검사"를 수행하는 필드
 * (티켓 20260825_028에서 최초 도입한 `MEASURABLE_CONDITION_KEYS`를 이 파일로 이전).
 *
 * 이 중 하나도 없는 조건은 어떤 검사 블록에도 걸리지 않아 `evaluateConditionDetailed`
 * 마지막 줄의 `pass: true`로 그대로 떨어진다 — 즉 "활동 1건만 있으면 무조건 발급"이 된다.
 * 아래 `FILTER_ONLY_CONDITION_KEYS`(activity_type 등)는 의도적으로 여기 포함하지 않는다 —
 * 포함하면 예를 들어 `{activity_type: 'walking'}` 단독 조건(필터만 있고 실제 수치 검사는
 * 없음)이 이 게이트를 통과해 마지막 `pass: true`로 새어나간다. 정확히 084 사고와 같은 유형.
 */
export const MEASURABLE_CONDITION_KEYS = [
  'distance_km',
  'elevation_gain_m',
  'duration_minutes',
  'min_speed_kmh',
  'max_pace_sec_per_km',
  'temperature_min_c',
  'temperature_max_c',
  'weekend_duration_hours',
  'total_count',
  'streak_days',
  'weekly_count',
  'month',
  'monthly_km',
  'season_count',
  'season_count_all',
  'active_days_count',
  'time_range',
] as const satisfies readonly (keyof BadgeCondition)[]

/**
 * 발급 후보 활동군을 좁히는 "필터 전용" 필드 — 그 자체만으로는 pass/fail을 만들지 않고
 * `MEASURABLE_CONDITION_KEYS` 중 최소 하나와 함께 있어야 실제로 평가된다.
 *
 * `season`은 티켓 20260825_031 원문 스펙에는 나열돼 있지 않았으나, `BadgeCondition`
 * 필드 목록과의 컴파일 타임 동기화 체크(하단 `AssertAllConditionKeysCovered`)에서 누락이
 * 발견돼 추가했다 — `season_count`의 짝 필드로, 단독으로는 판정에 관여하지 않아 필터
 * 전용으로 분류한다(구현 중 발견, 작업 요약의 alerts 참고).
 */
const FILTER_ONLY_CONDITION_KEYS = [
  'activity_type',
  'day_of_week',
  'prerequisite_badge_names',
  'route',
  'poi_id',
  'season',
  /**
   * `distance_km`/`elevation_gain_m`을 "한 활동에서 동시 충족"으로 평가하도록 전환하는
   * 플래그(2026-08-31, 티켓 20260831_2100). 단독으로는 pass/fail을 만들지 않고 반드시
   * 그 두 필드와 함께 있어야 의미가 있다 — `activity_type`과 동일한 성격이라 필터 전용으로
   * 분류한다. 현재 카탈로그에서는 T1 '야생의 첫발' 1건만 사용.
   */
  'same_activity',
] as const satisfies readonly (keyof BadgeCondition)[]

/** 발급 판정에 실제로 관여하는 "조건 필드" 전체 — 수치 검사 필드 + 필터 전용 필드 */
export const CONDITION_FIELD_KEYS = [
  ...MEASURABLE_CONDITION_KEYS,
  ...FILTER_ONLY_CONDITION_KEYS,
] as const

/**
 * 발급 판정에 관여하지 않는 "메타데이터" 필드 — 표시·안내 용도로만 쓰인다.
 * `mission_reward`: 미션 완료(`grantMissionRewards`)로만 지급되는 배지 표시용 플래그.
 * badge-engine은 이 값을 검사가 아니라 "발급 후보에서 제외"하는 방어 분기에만 사용한다.
 */
export const CONDITION_META_KEYS = ['mission_reward'] as const satisfies readonly (keyof BadgeCondition)[]

/** `condition_json`에 허용되는 전체 키 — DB CHECK 제약·API 검증이 공유하는 단일 출처 */
export const ALL_CONDITION_KEYS = [...CONDITION_FIELD_KEYS, ...CONDITION_META_KEYS] as const

// ── 컴파일 타임 동기화 체크 ──────────────────────────────────────────────
// BadgeCondition(src/types/database.ts)에 필드가 추가/변경됐는데 위 목록 반영을 빠뜨리면
// 여기서 컴파일 에러로 즉시 드러난다 — 084 사고("아무도 검증하지 않는 필드가 조용히
// 발급 판정을 뒤집는다")의 재발을 구조적으로 막는 핵심 장치.
type AssertNever<T extends never> = T
type MissingFromAllConditionKeys = Exclude<keyof BadgeCondition, (typeof ALL_CONDITION_KEYS)[number]>
/** ALL_CONDITION_KEYS가 BadgeCondition의 모든 필드를 커버하지 못하면 이 타입에서 컴파일 에러가 난다 */
export type AssertAllConditionKeysCovered = AssertNever<MissingFromAllConditionKeys>
