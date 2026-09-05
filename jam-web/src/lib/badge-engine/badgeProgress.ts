/**
 * 배지 진행 계산 엔진 — computeBadgeProgress() (티켓 20260904_0631)
 *
 * 배지 트리 리뉴얼 2차(진행 수치 표시)의 첫 단계. 발급 판정(`evaluateConditionDetailed`/
 * `checkCondition`, `./index.ts`)은 통과/탈락만 알고, "몇 % 남았는지"·"어느 축이 부족한지"는
 * 계산하지 않는다 — 이 파일이 그 옆에 추가하는 **완전히 새로운, 발급에 영향을 주지 않는
 * 순수 계산 계층**이다. 판정 결과(pass/fail)는 절대 건드리지 않는다.
 *
 * ## 순수 함수 원칙
 * 이 파일은 Supabase/DB를 직접 호출하지 않는다 — `computeUserPeriodMetrics`/
 * `computeBadgeProgress`/`classifyBadgeProgressKind` 모두 활동 데이터(+ 라벨 맵 +
 * 선행조건 락)만으로 동작하는 동기 순수 함수다. 라벨 조회(`getMetricLabels()`)는 호출부
 * (비동기 wrapper, 2c 몫)가 계열당 1회 수행해 `labelMap`으로 넘긴다.
 *
 * ## activityFilters.ts 헬퍼 재사용 (티켓 지시 — 같은 필터 규칙 복제 금지)
 * `calcMaxStreak`·`passesWalkingGate`·`matchesDayOfWeek`·`inTimeRange`·`dedupeOnePerDay`·
 * `getMondayKey`를 그대로 import해 재사용한다 — 요일 판정·시간대 판정·걷기 하루 1회 상한·
 * 주(월요일) 키 규칙이 발급 판정과 단 한 글자도 다르면 "3일 남음"이라고 표시해놓고 실제로는
 * 다른 날짜가 되는 사고로 이어지기 때문이다.
 *
 * **`./index`가 아니라 `./activityFilters`에서 직접 import한다.** `index.ts`는 파일
 * 최상단에서 `@/lib/supabase/server`(→ `next/headers`)를 무조건 import하므로, 이 파일이
 * `./index`를 거치면 그 전이 의존까지 함께 물려 'use client' 컴포넌트에서 이 함수들을 쓸 때
 * `npm run build`가 실패한다(1차 시도 게이트 리뷰에서 실제 재현·확인된 실패). `activityFilters.ts`는
 * NormalizedActivity/DayOfWeek 타입 외 어떤 것도 import하지 않는 완전히 독립적인 순수
 * 함수 파일이라 이 문제가 없다.
 *
 * ## 2c 추가분 (티켓 20260904_0921) — `computeRecordRegretLine()`
 * 화면(2c)이 이 계산 계층을 처음 호출하며 함께 필요해진 "기록형 아쉬움 줄" 계산을 파일
 * 끝(§2c 절)에 추가했다. `computeBadgeProgress`와 마찬가지로 순수 함수이고, 발급 판정에는
 * 전혀 관여하지 않는다 — 최종 한국어 문장 조립은 이 파일이 아니라 클라이언트 쪽
 * `src/lib/badgeProgressText.ts`가 담당한다(서버는 숫자만, 텍스트 조립은 소비처).
 *
 * ## 2d 추가분 (티켓 20260904_1058) — `BadgeProgressAxis.fraction` 노출
 * 2축형(dual) 게이지(`DualAxisGauge`, DS)가 축마다 독립된 진행 바를 그리려면 축 하나의
 * 진행 비율(0~1)이 필요한데, "클수록 좋음"/"작을수록 좋음"/한파(temperature_max_c) 축마다
 * 계산 공식이 다르다(`makeHigherBetterAxis`/`makeLowerBetterRatioAxis`/`makeColdRecordAxis`).
 * 이 비율은 `progress`(축 전체 최솟값)·`bottleneck` 계산에 이미 쓰이던 내부 값이라 —
 * 새 계산을 추가한 게 아니라 버리던 값을 axis 객체에 그대로 얹어 노출한 것뿐이다.
 */
import { kmhToPaceSecPerKm, type NormalizedActivity } from '@/types/strava'
import type { ActivityType, BadgeCondition, DayOfWeek } from '@/types/database'
import type { BadgeTreeLock } from '@/lib/badgeTree'
import { findBlockingConditionKeys } from './conditionRegistry'
import {
  calcMaxStreak,
  passesWalkingGate,
  matchesDayOfWeek,
  inTimeRange,
  dedupeOnePerDay,
  getMondayKey,
} from './activityFilters'

// ── 공개 타입 (티켓 §A 그대로) ──────────────────────────────────────────────

export type BadgeProgressAxis = {
  /** 'distance_km' | 'friday' | 'winter' … (badge_metric_labels.metric_key와 동일 네임스페이스) */
  key: string
  /** getMetricLabels() 결과로 채움 — 없으면 key 원문 노출(2a 설계 그대로) */
  label: string
  unit: string | null
  current: number
  target: number
  met: boolean
  /**
   * 이 축 하나의 진행 비율(0~1) — 티켓 20260904_1058(2d, DualAxisGauge)에서 노출. "클수록
   * 좋음"/"작을수록 좋음"/한파(temperature_max_c) 축마다 계산 공식이 다르므로(아래
   * make*Axis 함수 참고), 표시 레이어가 current/target만으로 이 값을 재계산하면 lower-is-better·
   * 한파 축에서 틀린 진행 바가 그려진다. `progress`(축 전체 최솟값)·`bottleneck` 계산에 이미
   * 쓰이던 내부 `AxisResult.fraction`을 그대로 얹은 것 — 새 계산이 아니다.
   */
  fraction: number
}

export type BadgeProgressGate = { kind: 'badge' | 'mission'; name: string; href: string; met: boolean } | null

export type BadgeProgress =
  | {
      kind: 'cumulative' | 'record' | 'periodic' | 'dual' | 'multi'
      axes: BadgeProgressAxis[]
      /** 0~1 — 축이 여럿이면 평균이 아니라 최솟값 */
      progress: number
      /** 가장 뒤처진 축의 key */
      bottleneck: string
      /** 축들을 한 활동에서 동시에 채워야 하는가 */
      sameActivity: boolean
      /** 주기형만 — ISO 문자열, 리셋 시각 */
      periodEndsAt: string | null
      gate: BadgeProgressGate
    }
  | { kind: 'unsupported'; conditionKeys: string[] }

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

/**
 * (user, activity_type) 하나당 한 번만 계산하는 중간 집계값 — 배지 192개마다 활동 이력을
 * 재순회하지 않기 위한 캐시. `activities`는 이미 activity_type 필터 + (걷기라면) 축1
 * 게이트까지 적용된 작은 배열이므로, computeBadgeProgress가 필요시 이 배열을 추가로
 * filter(time_range·day_of_week 단일값 등)하는 것은 "192개마다 전체 이력 재순회"에
 * 해당하지 않는다.
 */
export interface UserPeriodMetrics {
  activityType: ActivityType
  /** activity_type 필터 + (걷기는) passesWalkingGate까지 적용된 활동 목록 */
  activities: NormalizedActivity[]
  totalCount: number
  totalDistanceKm: number
  totalElevationGainM: number
  streakDays: number
  activeDaysCount: number
  /**
   * 오늘이 포함된 주(월요일 시작)의 활동 횟수. `weekly_count` 조건의 실측값(역대 최고 주,
   * index.ts의 maxWeek)과 다르다 — 미획득 배지는 정의상 역대 최고 주도 미달이므로 이
   * 값은 그보다 같거나 작다(과대평가 없음). 걷기는 하루 1회 상한 적용(엔진과 동일 규칙).
   */
  weeklyCountCurrent: number
  /** 다음 리셋 시각(다음 월요일 00:00) ISO — weeklyCountCurrent와 반드시 같은 경계 기준 */
  weekEndsAt: string
  /** weeklyCountCurrent와 같은 경계를 다시 계산해야 하는 축(time_range 동반 등)을 위한 키 */
  currentWeekMondayKey: string
  /** 이번 달(달력 1일~말일) 누적 거리. `monthly_km` 조건의 실측값(역대 최고 달)과 다르다 */
  monthlyKmCurrent: number
  /** 다음 리셋 시각(다음 달 1일 00:00) ISO */
  monthEndsAt: string
  /** month 필터(단일/배열) 적격 여부를 재계산할 때 쓰는 현재 달(1~12)/연도 */
  currentMonthNumber: number
  currentYear: number
  /** 요일별 활동 횟수(걷기는 날짜 dedup 적용) — day_of_week 단일/배열 축 공용 */
  dayOfWeekCounts: Record<DayOfWeek, number>
  /** 계절별 활동 횟수 — season_count(단일)·season_count_all(다중) 축 공용 */
  seasonCounts: Record<Season, number>
}

// ── 내부 유틸 ────────────────────────────────────────────────────────────

const ALL_DAYS: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ALL_SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter']
const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], winter: [12, 1, 2],
}

/** index.ts 전체가 이 "naive local" 규약을 쓴다 — startDateLocal은 Z 없는 로컬 벽시계 문자열 */
function dateOf(a: NormalizedActivity): Date {
  return new Date(a.startDateLocal ?? a.startDate)
}
function dateKey(a: NormalizedActivity): string {
  return (a.startDateLocal ?? a.startDate).slice(0, 10)
}
function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}
function maxOr(values: number[], fallback: number): number {
  return values.length > 0 ? Math.max(...values) : fallback
}
function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** 걷기 하루 1회 상한(엔진 weekly_count 블록과 동일 규칙) 적용 후 지정 주(월요일 키) 카운트 */
function countInWeek(activities: NormalizedActivity[], mondayKey: string, activityType: ActivityType): number {
  const pool = activityType === 'walking' ? dedupeOnePerDay(activities) : activities
  return pool.filter((a) => getMondayKey(dateOf(a)) === mondayKey).length
}

function sumKmInMonth(activities: NormalizedActivity[], year: number, month0: number): number {
  return activities
    .filter((a) => { const d = dateOf(a); return d.getFullYear() === year && d.getMonth() === month0 })
    .reduce((s, a) => s + a.distanceKm, 0)
}

/** 다음 주 월요일 00:00 ISO 문자열 — getMondayKey와 동일한 "naive local" 규약(index.ts) */
function nextMondayIso(mondayKey: string): string {
  const monday = new Date(`${mondayKey}T00:00:00`)
  monday.setDate(monday.getDate() + 7)
  return monday.toISOString()
}

/** 다음 달 1일 00:00 ISO 문자열(달력 기준) */
function nextMonthStartIso(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).toISOString()
}

// ── B. 유저 지표 집계 ────────────────────────────────────────────────────

export function computeUserPeriodMetrics(
  activityType: ActivityType,
  /** 유저의 전체 활동 이력(모든 종목 혼재) — 이 함수가 activity_type으로 좁힌다 */
  allActivities: NormalizedActivity[],
  now: Date = new Date()
): UserPeriodMetrics {
  const byType = allActivities.filter((a) => a.jamActivityType === activityType)
  const activities = activityType === 'walking' ? byType.filter(passesWalkingGate) : byType

  const totalCount = activities.length
  const totalDistanceKm = activities.reduce((s, a) => s + a.distanceKm, 0)
  const totalElevationGainM = activities.reduce((s, a) => s + a.elevationGainM, 0)
  const streakDays = calcMaxStreak(activities)
  const activeDaysCount = new Set(activities.map(dateKey)).size

  const currentWeekMondayKey = getMondayKey(now)
  const weeklyCountCurrent = countInWeek(activities, currentWeekMondayKey, activityType)
  const weekEndsAt = nextMondayIso(currentWeekMondayKey)

  const currentYear = now.getFullYear()
  const currentMonthNumber = now.getMonth() + 1
  const monthlyKmCurrent = sumKmInMonth(activities, currentYear, now.getMonth())
  const monthEndsAt = nextMonthStartIso(now)

  const dayOfWeekCounts = ALL_DAYS.reduce((acc, day) => {
    const pool = activities.filter((a) => matchesDayOfWeek(a, day))
    // 요일 단일값으로 이미 좁힌 뒤라 "하루 1회 상한"은 "그 요일의 고유 날짜 수"와 동치
    acc[day] = activityType === 'walking' ? new Set(pool.map(dateKey)).size : pool.length
    return acc
  }, {} as Record<DayOfWeek, number>)

  const seasonCounts = ALL_SEASONS.reduce((acc, season) => {
    acc[season] = activities.filter((a) => SEASON_MONTHS[season].includes(dateOf(a).getMonth() + 1)).length
    return acc
  }, {} as Record<Season, number>)

  return {
    activityType,
    activities,
    totalCount,
    totalDistanceKm,
    totalElevationGainM,
    streakDays,
    activeDaysCount,
    weeklyCountCurrent,
    weekEndsAt,
    currentWeekMondayKey,
    monthlyKmCurrent,
    monthEndsAt,
    currentMonthNumber,
    currentYear,
    dayOfWeekCounts,
    seasonCounts,
  }
}

// ── A. 분류 함수 (§H — 어드민 경고가 나중에 그대로 재사용) ───────────────────

/**
 * 엔진이 실제로 "단일 활동 값 vs 단일 활동 값"으로 비교하거나(record) 전체 누적으로
 * 비교하는(cumulative, same_activity 없을 때) 8개 필드. distance_km/elevation_gain_m을
 * 뺀 6개는 index.ts의 `PER_ACTIVITY_KEYS`와 동일 — 이름을 다시 import하지 않고 이 파일이
 * 필요한 형태(축 판별용 튜플)로 다시 선언한다(값은 index.ts와 동일해야 하며, 그 파일이
 * 바뀌면 이 목록도 함께 봐야 한다 — 재사용이 아니라 재선언인 이유는 index.ts의
 * PER_ACTIVITY_KEYS가 private이고, 티켓이 명시적으로 재사용을 지정한 헬퍼 목록에는
 * 포함되지 않았기 때문).
 */
const SCALAR_AXIS_KEYS = [
  'distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh',
  'max_pace_sec_per_km', 'temperature_min_c', 'temperature_max_c', 'weekend_duration_hours',
] as const satisfies readonly (keyof BadgeCondition)[]

type ScalarAxisKey = (typeof SCALAR_AXIS_KEYS)[number]

/** "작을수록 좋음" 축 — 나머지는 전부 "클수록 좋음" */
const LOWER_IS_BETTER: ReadonlySet<ScalarAxisKey> = new Set(['max_pace_sec_per_km', 'temperature_max_c'])

/**
 * 표시 레이어(`badgeProgressText.ts`, 티켓 20260904_0921/2c)가 "아쉬움 줄" diff 방향을
 * 재사용하기 위한 노출. 값은 위 `LOWER_IS_BETTER`와 항상 같다 — 별도로 재정의하지 않는다.
 */
export const LOWER_IS_BETTER_KEYS: ReadonlySet<string> = new Set(LOWER_IS_BETTER)

function measurableScalarKeys(condition: BadgeCondition): ScalarAxisKey[] {
  // temperature_min_c/max_c + total_count는 엔진에서 "카운팅 대상 필터"로만 쓰인다 — 축 아님
  // (index.ts relevantPerActivityKeys 구성부의 동일 예외, T12~T14 어뷰징 방지 목적과 동일 이유)
  const tempIsFilterOnly = condition.total_count !== undefined
  return SCALAR_AXIS_KEYS.filter((k) => {
    if (condition[k] === undefined) return false
    if (tempIsFilterOnly && (k === 'temperature_min_c' || k === 'temperature_max_c')) return false
    return true
  })
}

export function classifyBadgeProgressKind(condition: BadgeCondition): BadgeProgress['kind'] | 'unsupported' {
  if (!condition) return 'unsupported'

  // fail-closed와 보조를 맞춘다 (티켓 20260905_0028 개선 리뷰).
  // 아래 분류는 아는 축만 세므로, «기존 축 1개 + 평가 대기 필드 1개»인 조건은 대기 필드를
  // 무시한 채 cumulative/record 진행률을 그린다 — 조건은 fail-closed로 막혀 발급되지 않는데
  // 화면에는 「78% 달성」이 뜨는 상태가 된다. 이건 어드민이 아니라 유저 노출(배지 트리 진행
  // 레일)이라, 발급이 막히는 조건은 진행률도 그리지 않는 편이 정직하다.
  const blocking = findBlockingConditionKeys(condition)
  if (blocking.unknown.length > 0 || blocking.pending.length > 0) return 'unsupported'

  // 반복형(repeat_count)은 아직 진행 계산 축이 없다 — 확장은 티켓 20260905_0031.
  // 그때까지 unsupported로 둔다. 이 줄이 없으면 `{ duration_minutes: 60, repeat_count: 5 }`가
  // scalarKeys 1개(duration_minutes)로 잡혀 «record» 진행률을 그리는데, 그건
  // 「60분을 채웠는지」만 보여주고 **「5번 채워야 한다」를 통째로 숨긴다** — 발급은 안 되는데
  // 화면은 100%가 되는, fail-closed 분기가 막으려던 것과 같은 형태의 거짓말이다.
  if (condition.repeat_count !== undefined) return 'unsupported'

  const isMulti =
    (Array.isArray(condition.day_of_week) && condition.total_count !== undefined) ||
    condition.season_count_all !== undefined
  if (isMulti) return 'multi'

  // month 단독(monthly_km 없이)은 현재 카탈로그에 0건 — "활동 1회 이상 있었는지"만 보는
  // 별개 메커니즘이라(진행률로 표현 가능한 수치 축이 아님) periodic으로 묶지 않는다.
  const isPeriodic = condition.weekly_count !== undefined || condition.monthly_km !== undefined

  const isCounterAlone =
    (condition.total_count !== undefined && !Array.isArray(condition.day_of_week)) ||
    condition.streak_days !== undefined ||
    condition.active_days_count !== undefined ||
    condition.season_count !== undefined

  const scalarKeys = measurableScalarKeys(condition)

  const axisCount = scalarKeys.length + (isPeriodic ? 1 : 0) + (isCounterAlone ? 1 : 0)

  if (axisCount === 1) {
    if (isPeriodic) return 'periodic'
    if (isCounterAlone) return 'cumulative'
    const key = scalarKeys[0]
    if (key === 'distance_km' || key === 'elevation_gain_m') {
      // same_activity:true면 "그 활동 하나"의 값이 기준(record) — 기본은 누적 합계(cumulative)
      return condition.same_activity === true ? 'record' : 'cumulative'
    }
    return 'record'
  }

  if (axisCount === 2 && scalarKeys.length === 2) return 'dual'

  return 'unsupported'
}

// ── A. 축 계산 헬퍼 ──────────────────────────────────────────────────────

type LabelMap = Map<string, { label: string; unit: string | null }>
type AxisResult = { axis: BadgeProgressAxis; fraction: number }

function resolveLabel(labelMap: LabelMap, key: string): { label: string; unit: string | null } {
  const found = labelMap.get(key)
  return { label: found?.label ?? key, unit: found?.unit ?? null }
}

/** "클수록 좋음" 축 — target<=0인 축은 카탈로그에 없지만 방어적으로 처리 */
function makeHigherBetterAxis(key: string, current: number, target: number, labelMap: LabelMap): AxisResult {
  const { label, unit } = resolveLabel(labelMap, key)
  const met = current >= target
  const fraction = target > 0 ? clamp01(current / target) : (met ? 1 : 0)
  return { axis: { key, label, unit, current, target, met, fraction }, fraction }
}

/**
 * "작을수록 좋음" + 항상 양수인 축(페이스 전용). target/current 비율로 0~1을 만든다 —
 * current가 없으면(Infinity, 활동 없음) fraction 0. temperature_max_c는 음수가 가능해
 * 이 공식을 못 쓴다 — makeColdRecordAxis 별도 사용.
 */
function makeLowerBetterRatioAxis(key: string, current: number, target: number, labelMap: LabelMap): AxisResult {
  const { label, unit } = resolveLabel(labelMap, key)
  const hasData = Number.isFinite(current) && current > 0
  const met = hasData && current <= target
  const fraction = hasData ? clamp01(target / current) : 0
  return { axis: { key, label, unit, current: hasData ? current : 0, target, met, fraction }, fraction }
}

/**
 * temperature_max_c(한파 기록형) 전용 — 값이 음수일 수 있어 비율 공식이 성립하지 않는다.
 * COLD_PROGRESS_BASELINE_C는 met/target 판정에는 전혀 관여하지 않는, fraction(진행률 바
 * 채움 비율) 계산에만 쓰는 임의 기준점이다 — met은 항상 `current <= target`로만 결정된다.
 */
const COLD_PROGRESS_BASELINE_C = 35

function makeColdRecordAxis(key: string, current: number, target: number, labelMap: LabelMap): AxisResult {
  const { label, unit } = resolveLabel(labelMap, key)
  const hasData = Number.isFinite(current)
  const met = hasData && current <= target
  const c = hasData ? current : COLD_PROGRESS_BASELINE_C
  const span = COLD_PROGRESS_BASELINE_C - target
  const fraction = span > 0 ? clamp01((COLD_PROGRESS_BASELINE_C - c) / span) : (met ? 1 : 0)
  return { axis: { key, label, unit, current: hasData ? current : 0, target, met, fraction }, fraction }
}

function getFieldValue(field: ScalarAxisKey, a: NormalizedActivity): number {
  switch (field) {
    case 'distance_km': return a.distanceKm
    case 'elevation_gain_m': return a.elevationGainM
    case 'duration_minutes': return a.movingTimeSec / 60
    case 'min_speed_kmh': return a.averageSpeedKmh
    case 'max_pace_sec_per_km': return kmhToPaceSecPerKm(a.averageSpeedKmh)
    case 'temperature_min_c': return a.weatherTempC ?? -Infinity
    case 'temperature_max_c': return a.weatherTempC ?? Infinity
    case 'weekend_duration_hours': return isWeekend(dateOf(a)) ? a.movingTimeSec / 3600 : -Infinity
  }
}

/**
 * time_range 등 필터가 붙는 필드의 "관련 활동 풀" — `buildScalarAxis`(역대 최댓값)와
 * `computeRecordRegretLine`(직전 활동, 티켓 20260904_0921/2c)이 반드시 같은 풀을 봐야
 * "N분 남음"이라고 해놓고 아쉬움 줄은 다른 필터 결과로 계산되는 불일치를 막는다 — 필터
 * 로직 자체는 여기 한 곳에만 둔다.
 */
function poolForScalarField(field: ScalarAxisKey, condition: BadgeCondition, metrics: UserPeriodMetrics): NormalizedActivity[] {
  if (field === 'duration_minutes' && condition.time_range !== undefined) {
    return metrics.activities.filter((a) => inTimeRange(a, condition.time_range!))
  }
  if (field === 'weekend_duration_hours') {
    return metrics.activities.filter((a) => isWeekend(dateOf(a)))
  }
  return metrics.activities
}

/**
 * 8개 축 필드 중 하나를 "단독 필드 규칙"으로 계산한다 — dual(독립 평가)의 각 축, 그리고
 * record 단독 축(distance_km/elevation_gain_m 제외 6개) 양쪽에서 공유한다.
 * distance_km/elevation_gain_m은 여기서는 항상 "누적 합계"(cumulative) 규칙을 쓴다 —
 * same_activity:true인 단일 필드(T23)는 이 함수를 거치지 않고 buildSameActivitySingleAxis를
 * 쓴다.
 */
function buildScalarAxis(field: ScalarAxisKey, condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  const target = condition[field] as number
  switch (field) {
    case 'distance_km':
      return makeHigherBetterAxis('distance_km', metrics.totalDistanceKm, target, labelMap)
    case 'elevation_gain_m':
      return makeHigherBetterAxis('elevation_gain_m', metrics.totalElevationGainM, target, labelMap)
    case 'duration_minutes': {
      const pool = poolForScalarField('duration_minutes', condition, metrics)
      return makeHigherBetterAxis('duration_minutes', maxOr(pool.map((a) => a.movingTimeSec / 60), 0), target, labelMap)
    }
    case 'min_speed_kmh':
      return makeHigherBetterAxis('min_speed_kmh', maxOr(metrics.activities.map((a) => a.averageSpeedKmh), 0), target, labelMap)
    case 'max_pace_sec_per_km': {
      const paces = metrics.activities.map((a) => kmhToPaceSecPerKm(a.averageSpeedKmh)).filter((p) => Number.isFinite(p))
      const best = paces.length > 0 ? Math.min(...paces) : Infinity
      return makeLowerBetterRatioAxis('max_pace_sec_per_km', best, target, labelMap)
    }
    case 'temperature_min_c': {
      const temps = metrics.activities.map((a) => a.weatherTempC).filter((t): t is number => t != null)
      const best = temps.length > 0 ? Math.max(...temps) : -Infinity
      return makeHigherBetterAxis('temperature_min_c', Number.isFinite(best) ? best : 0, target, labelMap)
    }
    case 'temperature_max_c': {
      const temps = metrics.activities.map((a) => a.weatherTempC).filter((t): t is number => t != null)
      const best = temps.length > 0 ? Math.min(...temps) : Infinity
      return makeColdRecordAxis('temperature_max_c', best, target, labelMap)
    }
    case 'weekend_duration_hours': {
      const pool = poolForScalarField('weekend_duration_hours', condition, metrics)
      return makeHigherBetterAxis('weekend_duration_hours', maxOr(pool.map((a) => a.movingTimeSec / 3600), 0), target, labelMap)
    }
  }
}

function buildSameActivitySingleAxis(field: 'distance_km' | 'elevation_gain_m', condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  const target = condition[field] as number
  const best = maxOr(metrics.activities.map((a) => getFieldValue(field, a)), 0)
  return makeHigherBetterAxis(field, best, target, labelMap)
}

// ── A. kind별 axes 계산 ──────────────────────────────────────────────────

function buildCumulativeAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  if (condition.distance_km !== undefined) {
    return makeHigherBetterAxis('distance_km', metrics.totalDistanceKm, condition.distance_km, labelMap)
  }
  if (condition.elevation_gain_m !== undefined) {
    return makeHigherBetterAxis('elevation_gain_m', metrics.totalElevationGainM, condition.elevation_gain_m, labelMap)
  }
  if (condition.streak_days !== undefined) {
    return makeHigherBetterAxis('streak_days', metrics.streakDays, condition.streak_days, labelMap)
  }
  if (condition.active_days_count !== undefined) {
    return makeHigherBetterAxis('active_days_count', metrics.activeDaysCount, condition.active_days_count, labelMap)
  }
  if (condition.season_count !== undefined) {
    const season = condition.season
    const current = season && season !== 'all' ? metrics.seasonCounts[season as Season] : metrics.totalCount
    const key = season && season !== 'all' ? season : 'total_count'
    return makeHigherBetterAxis(key, current, condition.season_count, labelMap)
  }
  // total_count — day_of_week(단일)/time_range/temperature 필터가 붙어 있을 수 있음
  let pool = metrics.activities
  let key = 'total_count'
  if (condition.day_of_week !== undefined && !Array.isArray(condition.day_of_week)) {
    key = condition.day_of_week
    pool = pool.filter((a) => matchesDayOfWeek(a, condition.day_of_week as DayOfWeek))
  }
  if (condition.time_range !== undefined) {
    pool = pool.filter((a) => inTimeRange(a, condition.time_range!))
  }
  if (condition.temperature_min_c !== undefined) {
    pool = pool.filter((a) => a.weatherTempC != null && a.weatherTempC >= condition.temperature_min_c!)
  }
  if (condition.temperature_max_c !== undefined) {
    pool = pool.filter((a) => a.weatherTempC != null && a.weatherTempC <= condition.temperature_max_c!)
  }
  // 걷기 + day_of_week(단일)+total_count 조합은 엔진이 dedupeOnePerDay를 적용한다(하루 1회 상한)
  if (metrics.activityType === 'walking' && condition.day_of_week !== undefined && !Array.isArray(condition.day_of_week)) {
    pool = dedupeOnePerDay(pool)
  }
  return makeHigherBetterAxis(key, pool.length, condition.total_count ?? 0, labelMap)
}

function buildRecordAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  if (condition.distance_km !== undefined) return buildSameActivitySingleAxis('distance_km', condition, metrics, labelMap)
  if (condition.elevation_gain_m !== undefined) return buildSameActivitySingleAxis('elevation_gain_m', condition, metrics, labelMap)
  // SCALAR_AXIS_KEYS에서 파생 — 손으로 다시 나열하면 그 목록에 축이 추가될 때 여기가 누락돼
  // classifyBadgeProgressKind는 'record'로 분류하는데 여기서 throw하는 불일치가 생길 수 있다
  // (개선 리뷰 지적, 티켓 20260904_0631 재시도).
  const key = SCALAR_AXIS_KEYS.filter((k) => k !== 'distance_km' && k !== 'elevation_gain_m').find(
    (k) => condition[k] !== undefined
  )
  if (!key) throw new Error('[computeBadgeProgress] buildRecordAxis: 필드를 찾을 수 없음 — classifyBadgeProgressKind와 불일치')
  return buildScalarAxis(key, condition, metrics, labelMap)
}

function buildPeriodicAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): { axisResult: AxisResult; periodEndsAt: string } {
  if (condition.weekly_count !== undefined) {
    let current = metrics.weeklyCountCurrent
    if (condition.time_range !== undefined) {
      // time_range가 있으면 그 시간대로 좁힌 뒤 이번 주만 다시 집계 — 일반값(무필터) 재사용 불가
      const pool = metrics.activities.filter((a) => inTimeRange(a, condition.time_range!))
      current = countInWeek(pool, metrics.currentWeekMondayKey, metrics.activityType)
    }
    return { axisResult: makeHigherBetterAxis('weekly_count', current, condition.weekly_count, labelMap), periodEndsAt: metrics.weekEndsAt }
  }
  // monthly_km — month 필터(단일/배열)가 있으면 "이번 달"이 그 목록에 속할 때만 값을 인정한다.
  // (예: '1월의 다짐'은 9월엔 진행이 0이다 — 리셋 경계 자체는 항상 "다음 달 1일"로 통일)
  let current = metrics.monthlyKmCurrent
  if (condition.month !== undefined) {
    const months = Array.isArray(condition.month) ? condition.month : [condition.month]
    if (!months.includes(metrics.currentMonthNumber)) current = 0
  }
  return { axisResult: makeHigherBetterAxis('monthly_km', current, condition.monthly_km ?? 0, labelMap), periodEndsAt: metrics.monthEndsAt }
}

function buildDualAxes(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): { axes: AxisResult[]; sameActivity: boolean } {
  const fields = measurableScalarKeys(condition)
  const sameActivity = condition.same_activity === true

  if (sameActivity) {
    return { axes: buildSameActivityDualAxes(fields, condition, metrics, labelMap), sameActivity: true }
  }
  return { axes: fields.map((f) => buildScalarAxis(f, condition, metrics, labelMap)), sameActivity: false }
}

/**
 * same_activity:true인 2축 — "그 활동 하나"가 두 값을 함께 만족해야 한다(T1 야생의 첫발).
 * 아직 미달인 유저에게는 "가장 근접한 시도"를 보여준다(프로토타입 §05: "가장 가까운 기록은
 * 9월 1일 12.4km · 260m") — 두 축의 (실측/목표) 비율 중 최솟값(병목)이 가장 큰 활동 하나를
 * 골라 그 활동의 두 값을 그대로 노출한다. 필드 조합은 이론상 임의의 2개를 지원하지만,
 * 현재 카탈로그에서 same_activity와 결합 가능한 필드는 index.ts의
 * CUMULATIVE_SAME_ACTIVITY_KEYS(distance_km/elevation_gain_m) 2개뿐이다.
 */
function buildSameActivityDualAxes(fields: ScalarAxisKey[], condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult[] {
  const activities = metrics.activities
  if (activities.length === 0) {
    return fields.map((f) => makeHigherBetterAxis(f, 0, condition[f] as number, labelMap))
  }

  let bestActivity = activities[0]
  let bestScore = -Infinity
  for (const a of activities) {
    const score = Math.min(
      ...fields.map((f) => {
        const value = getFieldValue(f, a)
        const target = condition[f] as number
        if (LOWER_IS_BETTER.has(f)) {
          return Number.isFinite(value) && value > 0 ? target / value : 0
        }
        return target > 0 ? value / target : (value >= target ? 1 : 0)
      })
    )
    if (score > bestScore) {
      bestScore = score
      bestActivity = a
    }
  }

  return fields.map((f) => {
    const value = getFieldValue(f, bestActivity)
    const target = condition[f] as number
    return LOWER_IS_BETTER.has(f)
      ? makeLowerBetterRatioAxis(f, value, target, labelMap)
      : makeHigherBetterAxis(f, value, target, labelMap)
  })
}

function buildMultiAxes(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult[] {
  if (Array.isArray(condition.day_of_week)) {
    return condition.day_of_week.map((day) => makeHigherBetterAxis(day, metrics.dayOfWeekCounts[day], condition.total_count as number, labelMap))
  }
  return ALL_SEASONS.map((s) => makeHigherBetterAxis(s, metrics.seasonCounts[s], condition.season_count_all as number, labelMap))
}

function buildGate(locks: BadgeTreeLock[]): BadgeProgressGate {
  if (locks.length === 0) return null
  // OR 조건 — 하나라도 충족했으면 그 락을 대표로, 전부 미충족이면 첫 번째를 대표로 노출
  const chosen = locks.find((l) => l.fulfilled) ?? locks[0]
  return { kind: chosen.kind, name: chosen.name, href: chosen.href, met: chosen.fulfilled }
}

// ── A. 진행 계산 (공개 함수) ─────────────────────────────────────────────

export function computeBadgeProgress(
  condition: BadgeCondition,
  metrics: UserPeriodMetrics,
  labelMap: LabelMap,
  locks: BadgeTreeLock[]
): BadgeProgress {
  const kind = classifyBadgeProgressKind(condition)
  if (kind === 'unsupported') {
    return { kind: 'unsupported', conditionKeys: Object.keys(condition ?? {}) }
  }

  const gate = buildGate(locks)
  let results: AxisResult[]
  let sameActivity = false
  let periodEndsAt: string | null = null

  switch (kind) {
    case 'cumulative':
      results = [buildCumulativeAxis(condition, metrics, labelMap)]
      break
    case 'record':
      results = [buildRecordAxis(condition, metrics, labelMap)]
      sameActivity = condition.same_activity === true
      break
    case 'periodic': {
      const built = buildPeriodicAxis(condition, metrics, labelMap)
      results = [built.axisResult]
      periodEndsAt = built.periodEndsAt
      break
    }
    case 'dual': {
      const built = buildDualAxes(condition, metrics, labelMap)
      results = built.axes
      sameActivity = built.sameActivity
      break
    }
    case 'multi':
      results = buildMultiAxes(condition, metrics, labelMap)
      break
  }

  const progress = clamp01(Math.min(...results.map((r) => r.fraction)))
  const bottleneck = results.reduce((min, cur) => (cur.fraction < min.fraction ? cur : min), results[0]).axis.key

  return {
    kind,
    axes: results.map((r) => r.axis),
    progress,
    bottleneck,
    sameActivity,
    periodEndsAt,
    gate,
  }
}

// ── 2c. 기록형 "아쉬움 줄" (티켓 20260904_0921) ─────────────────────────────

export type RegretLineData = {
  /** BadgeProgressAxis.key와 동일 네임스페이스(예: 'duration_minutes') */
  key: string
  /** 직전 활동 하나의 실측값(pace는 초/km 원값 — 표시 레이어가 mm:ss로 포맷) */
  current: number
  target: number
  unit: string | null
  label: string
}

/**
 * "그 활동 하나"의 값을 축으로 감싼다 — `makeHigherBetterAxis`/`makeLowerBetterRatioAxis`/
 * `makeColdRecordAxis`는 "current가 어떻게 나온 값인지"(역대 최댓값이든 직전 활동 하나든)
 * 신경 쓰지 않는 순수 매핑이라 그대로 재사용한다. `buildRecordAxis`/`buildScalarAxis`의
 * 필드별 분기와 반드시 같은 함수를 골라야 한다(다르게 고르면 met/fraction 기준이 어긋난다).
 */
function axisForSingleValue(field: ScalarAxisKey, rawValue: number, target: number, labelMap: LabelMap): AxisResult {
  if (field === 'temperature_max_c') return makeColdRecordAxis(field, rawValue, target, labelMap)
  if (LOWER_IS_BETTER.has(field)) return makeLowerBetterRatioAxis(field, rawValue, target, labelMap)
  return makeHigherBetterAxis(field, rawValue, target, labelMap)
}

/** 아쉬움 줄 표시 임계값 — 직전 활동이 다음 임계값의 이 비율 이상일 때만 보여준다(§05). */
const REGRET_LINE_THRESHOLD = 0.85

/**
 * 기록형(record) 계열 프런티어 전용 — "직전 활동 하나"가 다음 등급 임계값의 85% 이상인데
 * 아직 못 채웠을 때만 데이터를 반환한다(§05 "기록형에는 아쉬움 줄", §07 문구 참고 — 최종
 * 문장 조립은 표시 레이어 `badgeProgressText.ts`가 담당한다. 이 함수는 순수 계산만 한다).
 *
 * `axis.current`(역대 최고 기록)와 다른 값이다 — 최고 기록은 과거 어느 활동일 수 있어
 * "지금 나가면 될까"에 답하지 못한다. 이 함수는 `metrics.activities`(이미 activity_type +
 * 걷기 게이트가 적용된 목록)에서 **가장 최근 활동 하나**만 다시 평가한다.
 *
 * distance_km/elevation_gain_m(same_activity:true인 record, 예: T23)은 대상에서 뺀다 —
 * 2c 범위(레일 표시)의 기록형 계열 8개(§05 프로토타입 표 근거) 중 이 조합이 없고,
 * `buildRecordAxis`도 이 두 필드는 별도 함수(`buildSameActivitySingleAxis`)로 처리한다.
 */
export function computeRecordRegretLine(
  condition: BadgeCondition,
  metrics: UserPeriodMetrics,
  labelMap: LabelMap
): RegretLineData | null {
  if (classifyBadgeProgressKind(condition) !== 'record') return null

  const key = SCALAR_AXIS_KEYS.filter((k) => k !== 'distance_km' && k !== 'elevation_gain_m').find(
    (k) => condition[k] !== undefined
  )
  if (!key) return null

  const pool = poolForScalarField(key, condition, metrics)
  if (pool.length === 0) return null
  const latest = pool.reduce((a, b) => (dateOf(a) > dateOf(b) ? a : b))
  const rawValue = getFieldValue(key, latest)
  if (!Number.isFinite(rawValue)) return null

  const target = condition[key] as number
  const { axis, fraction } = axisForSingleValue(key, rawValue, target, labelMap)
  if (axis.met || fraction < REGRET_LINE_THRESHOLD) return null

  return { key, current: axis.current, target: axis.target, unit: axis.unit, label: axis.label }
}
