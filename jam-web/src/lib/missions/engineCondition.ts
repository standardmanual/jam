/**
 * `mission_type = 'engine_condition'` 달성 판정 (티켓 20260906_2231)
 *
 * ## 왜 필요한가
 *
 * 게이트 미션 40종(걷기 8 + 4종목 32)의 완료 조건을 `v5_mission_axis_groups.json`·
 * `v5_mission_badges.json`과 전수 대조한 결과, 기존 `MissionCondition`/`mission_type` 6종
 * (distance·checkin·activity_count·item_collect·streak_days·duration_minutes·
 * elevation_gain_m — 필드 하나씩만 보는 단순 타입)으로는 32건 중 다수를 표현할 수 없었다.
 * 필요한 조합은 두 갈래다:
 *
 * 1. **배지엔진이 이미 아는 어휘의 조합** — `repeat_count`·`rest_after_long`·
 *    `single_distance_km`·`max_pace_sec_per_km`·`same_activity` 등. `evaluateConditionDetailed`
 *    (badge-engine)에 그대로 위임한다 — `missions/checker.ts`가 이미 `MissionCondition`을
 *    `BadgeCondition`으로 캐스팅해 이 함수에 넘기는 예외 통로(티켓 20260813_001)를 확장한 것이다.
 * 2. **배지엔진에 없는 미션 전용 어휘** — 「N주/개월 연속 한 기간에 M회[+부분집합]」(주기 축)·
 *    「서로 다른 K개 요일/두 달」(요일·달력 축). 650여 종 배지 카탈로그 어디에도 이 조합이
 *    필요한 조건이 없어 배지엔진(`BadgeCondition`/`conditionRegistry.ts`/`repeatOccurrences.ts`)에
 *    넣지 않았다 — 이 파일의 순수 함수가 직접 판정한다. 배지엔진 핵심 코드를 건드리지 않으므로
 *    기존 650여 종 배지 판정에 회귀 위험이 없다.
 *
 * 두 갈래는 AND로 결합된다. `activity_type` 필터(+ 걷기 축1 게이트)는 이 파일이 자체 적용한
 * 뒤 배지엔진에는 이미 좁혀진 활동 배열을 넘긴다 — 두 판정이 서로 다른 활동 집합을 보면
 * "미션 전용 어휘는 통과했는데 위임 어휘는 다른 활동으로 판정"되는 어긋남이 생긴다.
 */
import type { BadgeCondition, MissionCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import { evaluateConditionDetailed } from '@/lib/badge-engine'
import { passesWalkingGate, inTimeRange, matchesDayOfWeekFilter, getMondayKey } from '@/lib/badge-engine/activityFilters'
// 미션 전용 어휘 목록은 `condition-keys.ts`(서버 의존 없음)가 정본이다 — 이 파일이 그쪽을
// 참조하는 방향이어야 한다. 반대로 두면(이 파일이 정본) `condition-keys.ts`를 import하는
// 클라이언트 컴포넌트가 이 파일의 `@/lib/badge-engine`(→ `next/headers`) 전이 의존까지
// 끌고 가 빌드가 깨진다(티켓 20260904_0631과 같은 실패 모드) — 이 파일은 이미 서버 전용이라
// (`checker.ts`에서만 쓴다) 반대 방향(정본 참조)은 안전하다.
import { MISSION_ONLY_CONDITION_KEYS } from '@/lib/missions/condition-keys'

const WEEK_MS = 7 * 86_400_000

/** activity_type 필터 + 걷기 축1 게이트 — 배지엔진의 같은 규칙(index.ts `filtered`)과 동일 */
function typeFiltered(condition: MissionCondition, activities: NormalizedActivity[]): NormalizedActivity[] {
  return condition.activity_type
    ? activities.filter(
        (a) => a.jamActivityType === condition.activity_type && (condition.activity_type !== 'walking' || passesWalkingGate(a))
      )
    : activities
}

function activityDate(a: NormalizedActivity): Date {
  return new Date(a.startDateLocal ?? a.startDate)
}

/** 월 단위 정렬 가능한 정수 키 — 연도*12+월(0-11), 연속 여부를 뺄셈 1로 판정 가능 */
function monthOrdinal(a: NormalizedActivity): number {
  const d = activityDate(a)
  return d.getFullYear() * 12 + d.getMonth()
}

/** 주 단위(월요일 기준) 정렬 가능한 정수 키 — 7일 간격이면 연속 */
function weekOrdinal(a: NormalizedActivity): number {
  const key = getMondayKey(activityDate(a))
  return Math.round(Date.parse(`${key}T00:00:00Z`) / WEEK_MS)
}

function groupByOrdinal(activities: NormalizedActivity[], ordinalFn: (a: NormalizedActivity) => number): Map<number, NormalizedActivity[]> {
  const map = new Map<number, NormalizedActivity[]>()
  for (const a of activities) {
    const key = ordinalFn(a)
    const list = map.get(key)
    if (list) list.push(a)
    else map.set(key, [a])
  }
  return map
}

function subsetMatches(a: NormalizedActivity, subset: NonNullable<MissionCondition['streak_subset']>): boolean {
  if (subset.day_of_week && !matchesDayOfWeekFilter(a, subset.day_of_week)) return false
  if (subset.time_range && !inTimeRange(a, subset.time_range)) return false
  return true
}

/**
 * 「N개 기간(주/달) 연속, 매 기간 최소 M회[+부분집합 K회]」의 최장 연속 길이.
 * `weekly_streak`/`monthly_streak` + `weekly_streak_min_count`/`monthly_streak_min_count` +
 * `streak_subset`이 이 함수 하나를 공유한다.
 */
function maxPeriodStreak(
  activities: NormalizedActivity[],
  ordinalFn: (a: NormalizedActivity) => number,
  minCountPerPeriod: number,
  subset?: MissionCondition['streak_subset']
): number {
  const grouped = groupByOrdinal(activities, ordinalFn)
  const qualifyingOrdinals = [...grouped.entries()]
    .filter(([, acts]) => {
      if (acts.length < minCountPerPeriod) return false
      if (subset && acts.filter((a) => subsetMatches(a, subset)).length < subset.min_count) return false
      return true
    })
    .map(([ordinal]) => ordinal)
    .sort((a, b) => a - b)

  let maxStreak = 0
  let current = 0
  let prev: number | null = null
  for (const ordinal of qualifyingOrdinals) {
    current = prev !== null && ordinal === prev + 1 ? current + 1 : 1
    maxStreak = Math.max(maxStreak, current)
    prev = ordinal
  }
  return maxStreak
}

/** 서로 다른 요일(월~일)의 수 — 특정 요일을 지정하지 않고 「며칠에 나눠 했는지」만 센다 */
function countDistinctWeekdays(activities: NormalizedActivity[]): number {
  const seen = new Set<number>()
  for (const a of activities) seen.add(activityDate(a).getDay())
  return seen.size
}

/** 그 시간대에 속하는 활동 수 */
function countInTimeBand(activities: NormalizedActivity[], band: { start: string; end: string }): number {
  return activities.filter((a) => inTimeRange(a, band)).length
}

/** 지표(거리/고도) 합계가 문턱을 넘긴 서로 다른 달(연-월)의 수 */
function countQualifyingMonths(
  activities: NormalizedActivity[],
  metric: 'distance_km' | 'elevation_gain_m',
  threshold: number
): number {
  const grouped = groupByOrdinal(activities, monthOrdinal)
  let count = 0
  for (const acts of grouped.values()) {
    const sum = acts.reduce((s, a) => s + (metric === 'distance_km' ? a.distanceKm : a.elevationGainM), 0)
    if (sum >= threshold) count += 1
  }
  return count
}

/** 배지엔진(`evaluateConditionDetailed`)에 그대로 위임 가능한 필드 — BadgeCondition과 같은 이름·의미 */
const DELEGATED_KEYS = [
  'activity_type',
  'distance_km',
  'elevation_gain_m',
  'single_distance_km',
  'single_elevation_m',
  'max_elevation_m',
  'max_pace_sec_per_km',
  'min_speed_kmh',
  'duration_minutes',
  'same_activity',
  'repeat_count',
  'rest_after_long',
  'streak_days',
  'weekly_streak',
] as const satisfies readonly (keyof MissionCondition)[]

/**
 * 위임 대상 필드만 뽑아 배지엔진에 넘길 부분 조건을 만든다.
 * `weekly_streak_min_count`가 함께 있으면 `weekly_streak`는 이 파일이 이미 더 엄격한 기준
 * (매주 존재가 아니라 매주 M회 이상)으로 판정했으므로 위임분에서 뺀다 — 배지엔진의
 * "매주 1회 이상"(더 느슨한 기준)과 이중으로 걸어도 결과는 같지만(더 엄격한 조건을 만족하면
 * 느슨한 조건도 항상 만족) 두 판정이 같은 이름을 다른 뜻으로 검사하는 모양을 남기지 않는다.
 */
function extractDelegatedCondition(condition: MissionCondition): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of DELEGATED_KEYS) {
    if (key === 'weekly_streak' && condition.weekly_streak_min_count !== undefined) continue
    const value = condition[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * `engine_condition` 미션의 달성 판정. 순수 함수 — `checker.ts`가 참가 시점 이후로 이미
 * 필터링한 활동 배열을 넘긴다(다른 위임 타입과 같은 규약).
 *
 * ⚠️ `rest_after_long`(휴식) 판정은 `activities` 배열 자체의 첫 활동 이전 공백을 보지
 * 않는다(가입 앵커를 별도로 받지 않는다) — `checker.ts`가 이미 `joinedAt` 하한으로 잘라
 * 넘기므로 배열 밖(가입 이전) 공백이 애초에 섞이지 않는다. 이 함수를 다른 곳에서 재사용할
 * 때는 호출자가 반드시 참가 시점 이후로 걸러서 넘겨야 한다(`evaluateMission`의 같은 주석 참고).
 */
export function evaluateEngineMissionCondition(condition: MissionCondition, activities: NormalizedActivity[]): boolean {
  const filtered = typeFiltered(condition, activities)

  if (condition.weekly_streak !== undefined && condition.weekly_streak_min_count !== undefined) {
    const streak = maxPeriodStreak(filtered, weekOrdinal, condition.weekly_streak_min_count, condition.streak_subset)
    if (streak < condition.weekly_streak) return false
  }

  if (condition.monthly_streak !== undefined) {
    const streak = maxPeriodStreak(filtered, monthOrdinal, condition.monthly_streak_min_count ?? 1, condition.streak_subset)
    if (streak < condition.monthly_streak) return false
  }

  if (condition.distinct_weekday_count !== undefined) {
    if (countDistinctWeekdays(filtered) < condition.distinct_weekday_count) return false
  }

  if (condition.time_band_counts !== undefined) {
    for (const band of condition.time_band_counts) {
      if (countInTimeBand(filtered, band) < band.count) return false
    }
  }

  if (condition.distinct_months_required !== undefined) {
    const metric = condition.distinct_months_metric ?? 'distance_km'
    const threshold = condition.distinct_months_threshold ?? 0
    if (countQualifyingMonths(filtered, metric, threshold) < condition.distinct_months_required) return false
  }

  // `activity_type`은 이미 위에서 `filtered`로 반영했다 — 그 하나만 있으면(다른 위임
  // 필드가 없으면) evaluateConditionDetailed에 넘기지 않는다. 그 함수는 "측정 가능한 필드가
  // 하나도 없는 조건"을 fail-closed로 막는데(MEASURABLE_CONDITION_KEYS 가드), activity_type만
  // 있는 조건(= 이 미션의 나머지가 전부 미션 전용 어휘인 경우, 예: M2)을 여기서 걸러버리면
  // 위 미션 전용 어휘 검사를 이미 통과한 조건이 이 지점에서 잘못 fail된다.
  const delegated = extractDelegatedCondition(condition)
  const hasMeasurableDelegatedField = Object.keys(delegated).some((k) => k !== 'activity_type')
  if (hasMeasurableDelegatedField) {
    if (!evaluateConditionDetailed(delegated as BadgeCondition, activities).pass) return false
  }

  // 알려진 필드가 하나도 없는 조건(형태 오류·오타, `activity_type`만 있는 경우 포함)은
  // 통과시키지 않는다 — fail-closed. 저장 단계(`checkMissionCondition`)가 이미 허용 키 밖의
  // 필드를 막으므로, 여기서는 "측정 가능한 값이 하나라도 있는가"만 다시 확인한다(저장 검증과
  // 같은 목록, MISSION_ONLY_CONDITION_KEYS 재사용 — `count`·`badge_id`처럼 이 타입에 안 쓰이는
  // 키가 섞여 있어도 OR 판정이라 무해하다).
  const hasAnyKnownKey =
    hasMeasurableDelegatedField ||
    Object.keys(condition).some((k) => k !== 'activity_type' && MISSION_ONLY_CONDITION_KEYS.has(k))
  return hasAnyKnownKey
}
