/**
 * 미션 「달성 조건」 필드 빌더 폼 — 원시 JSON textarea를 대체하는 필드 선택 UI의 순수 로직
 * (티켓 20260911_2118)
 *
 * 배지 조건 빌더(`admin/badges/conditionFormFields.ts` + `lib/badge-engine/conditionRegistry.ts`)와
 * 같은 골격이다 — 필드를 채우면 값이 있는 키만 모여 AND로 결합된 `condition_json`이 된다.
 * **엔진 위임 14종(`MISSION_ENGINE_DELEGATED_KEYS`)은 새로 만들지 않고 배지 레지스트리의
 * `form.read`/`form.write`를 그대로 재사용한다** — `MissionCondition`이 그 필드들을
 * `BadgeCondition`과 동일한 이름·의미로 재사용하기 때문이다(`src/types/database.ts` 주석 참고).
 *
 * ## mission_type별 다른 화면
 * - 단순 7종(`distance`~`elevation_gain_m`)은 필드 1~2개(목표값 + 선택적 종목 필터)만 쓴다.
 * - `engine_condition`은 배지엔진 위임 14종 + 미션 전용 어휘 9종을 자유롭게 조합하는 다중 조건
 *   빌더다(`checkMissionCondition`이 이 타입만 fail-closed로 막으므로 모르는 키를 절대 만들면
 *   안 된다 — 이 파일이 만드는 키는 전부 `MISSION_ALLOWED_CONDITION_KEYS`에 있다).
 *
 * ## `time_band_counts`는 입력 UI가 없다
 * `MissionCondition`의 26개 필드 중 이 하나만 전용 UI가 없다(배열의 배열이라 그리기 비용이
 * 크고, 실제 카탈로그에 쓰는 미션이 드물다). 값이 있으면 배지 폼의 `FORM_UNSUPPORTED_CONDITION_KEYS`
 * 보존 패턴과 같은 방식으로 **원본 그대로 보존**한다 — 열어서 저장해도 사라지지 않는다.
 *
 * ⚠️ `MISSION_ENGINE_DELEGATED_KEYS`는 `src/lib/missions/engineCondition.ts`의 `DELEGATED_KEYS`를
 * 거울처럼 복제한 목록이다. 그 파일은 `@/lib/badge-engine`(→ 서버 전용) 의존이 있어 이 폼(클라이언트
 * 컴포넌트)이 직접 import할 수 없다 — 두 목록이 어긋나면 "폼에 보이는 필드"와 "실제 판정에
 * 위임되는 필드"가 달라진다. 이 파일의 회귀 테스트가 두 목록이 같은 길이·같은 원소인지 배지
 * 레지스트리 기준으로 대조한다(완전한 값 동일성 보장은 `engineCondition.test.ts`가 진다).
 */
import type { ActivityType, DayOfWeek, MissionCondition, MissionType, MissionStreakSubset } from '@/types/database'
import { getConditionField, type ConditionFormValues } from '@/lib/badge-engine/conditionRegistry'

/**
 * `evaluateEngineMissionCondition`(engineCondition.ts) `DELEGATED_KEYS`의 거울 목록.
 * 파일 상단 주석 참고 — 어긋나면 폼과 판정이 다른 키 집합을 본다.
 */
export const MISSION_ENGINE_DELEGATED_KEYS = [
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

export type MissionEngineDelegatedKey = (typeof MISSION_ENGINE_DELEGATED_KEYS)[number]

const VALID_DAY_OF_WEEK: readonly DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

/** 미션 조건 빌더 폼 state — `ConditionFormValues`(`Record<string, string|boolean>`)에 구조적으로
 * 대입되려면 암묵 인덱스 시그니처가 필요해 `interface`가 아니라 `type`이다(배지 폼과 같은 이유). */
export type MissionConditionFormFields = {
  // ── 배지엔진 위임 14종과 같은 state 키(레지스트리 form.read/write를 그대로 쓴다) ──────
  distanceKm: string
  elevationM: string
  singleDistanceKm: string
  singleElevationM: string
  maxElevationM: string
  maxPace: string
  minSpeedKmh: string
  durationMinutes: string
  activityType: string
  sameActivity: boolean
  repeatCount: string
  restAfterLong: string
  streakDays: string
  weeklyStreak: string
  // ── 단순 타입 전용(checkin/activity_count/item_collect) ──────────────────────────
  count: string
  poiId: string
  badgeId: string
  // ── 미션 전용 어휘(engine_condition 복합 조건, 티켓 20260906_2231) ───────────────
  weeklyStreakMinCount: string
  monthlyStreak: string
  monthlyStreakMinCount: string
  distinctWeekdayCount: string
  distinctMonthsRequired: string
  /** 'distance_km' | 'elevation_gain_m' | '' */
  distinctMonthsMetric: string
  distinctMonthsThreshold: string
  streakSubsetDayOfWeek: string
  streakSubsetTimeStart: string
  streakSubsetTimeEnd: string
  streakSubsetMinCount: string
}

export function emptyMissionConditionFields(): MissionConditionFormFields {
  return {
    distanceKm: '',
    elevationM: '',
    singleDistanceKm: '',
    singleElevationM: '',
    maxElevationM: '',
    maxPace: '',
    minSpeedKmh: '',
    durationMinutes: '',
    activityType: '',
    sameActivity: false,
    repeatCount: '',
    restAfterLong: '',
    streakDays: '',
    weeklyStreak: '',
    count: '',
    poiId: '',
    badgeId: '',
    weeklyStreakMinCount: '',
    monthlyStreak: '',
    monthlyStreakMinCount: '',
    distinctWeekdayCount: '',
    distinctMonthsRequired: '',
    distinctMonthsMetric: '',
    distinctMonthsThreshold: '',
    streakSubsetDayOfWeek: '',
    streakSubsetTimeStart: '',
    streakSubsetTimeEnd: '',
    streakSubsetMinCount: '',
  }
}

/** 폼 문자열 → 소수. 빈 문자열이면 undefined */
function num(raw: string): number | undefined {
  if (raw === '') return undefined
  const v = parseFloat(raw)
  return Number.isNaN(v) ? undefined : v
}

/** 폼 문자열 → 정수. 빈 문자열이면 undefined */
function int(raw: string): number | undefined {
  if (raw === '') return undefined
  const v = parseInt(raw, 10)
  return Number.isNaN(v) ? undefined : v
}

function csvDayOfWeek(raw: string): DayOfWeek[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is DayOfWeek => (VALID_DAY_OF_WEEK as readonly string[]).includes(s))
}

/**
 * 기존 미션의 `condition_json`을 폼 초기값으로 되돌린다 — `buildMissionConditionJson`의 역방향.
 * 델리게이트 14종은 배지 레지스트리의 `form.write`를 그대로 써서 왕복이 배지 폼과 항상 같다.
 */
export function missionConditionFieldsFrom(condition: MissionCondition | null | undefined): MissionConditionFormFields {
  const fields = emptyMissionConditionFields()
  if (!condition) return fields
  const c = condition as Record<string, unknown>

  for (const key of MISSION_ENGINE_DELEGATED_KEYS) {
    const value = c[key]
    if (value === undefined) continue
    const meta = getConditionField(key)
    if (!meta?.form) continue
    try {
      Object.assign(fields, meta.form.write(value as never))
    } catch {
      // condition_json은 jsonb라 형태 보장이 없다 — 한 필드가 깨져도 나머지 폼은 그린다.
    }
  }

  if (typeof c.count === 'number') fields.count = String(c.count)
  if (typeof c.poi_id === 'string') fields.poiId = c.poi_id
  if (typeof c.badge_id === 'string') fields.badgeId = c.badge_id

  if (typeof c.weekly_streak_min_count === 'number') fields.weeklyStreakMinCount = String(c.weekly_streak_min_count)
  if (typeof c.monthly_streak === 'number') fields.monthlyStreak = String(c.monthly_streak)
  if (typeof c.monthly_streak_min_count === 'number') fields.monthlyStreakMinCount = String(c.monthly_streak_min_count)
  if (typeof c.distinct_weekday_count === 'number') fields.distinctWeekdayCount = String(c.distinct_weekday_count)
  if (typeof c.distinct_months_required === 'number') fields.distinctMonthsRequired = String(c.distinct_months_required)
  if (typeof c.distinct_months_metric === 'string') fields.distinctMonthsMetric = c.distinct_months_metric
  if (typeof c.distinct_months_threshold === 'number') fields.distinctMonthsThreshold = String(c.distinct_months_threshold)

  const subset = c.streak_subset as MissionStreakSubset | undefined
  if (subset && typeof subset === 'object') {
    if (Array.isArray(subset.day_of_week)) fields.streakSubsetDayOfWeek = subset.day_of_week.join(', ')
    if (subset.time_range) {
      fields.streakSubsetTimeStart = subset.time_range.start ?? ''
      fields.streakSubsetTimeEnd = subset.time_range.end ?? ''
    }
    if (typeof subset.min_count === 'number') fields.streakSubsetMinCount = String(subset.min_count)
  }

  return fields
}

/** 이 mission_type이 `activity_type` 필터를 함께 쓰는가(체크인·아이템 픽업 제외) */
export function missionTypeUsesActivityTypeFilter(missionType: MissionType): boolean {
  return (
    missionType === 'distance' ||
    missionType === 'activity_count' ||
    missionType === 'streak_days' ||
    missionType === 'duration_minutes' ||
    missionType === 'elevation_gain_m'
  )
}

function activityTypeValue(fields: MissionConditionFormFields): ActivityType | undefined {
  return fields.activityType ? (fields.activityType as ActivityType) : undefined
}

function buildSimpleConditionJson(missionType: MissionType, fields: MissionConditionFormFields): MissionCondition | null {
  const cond: MissionCondition = {}
  const at = missionTypeUsesActivityTypeFilter(missionType) ? activityTypeValue(fields) : undefined

  switch (missionType) {
    case 'distance': {
      const v = num(fields.distanceKm)
      if (v !== undefined) cond.distance_km = v
      break
    }
    case 'activity_count': {
      const v = int(fields.count)
      if (v !== undefined) cond.count = v
      break
    }
    case 'checkin': {
      if (fields.poiId) cond.poi_id = fields.poiId
      return Object.keys(cond).length > 0 ? cond : null // 체크인은 종목 필터를 쓰지 않는다
    }
    case 'item_collect': {
      if (fields.badgeId) cond.badge_id = fields.badgeId
      return Object.keys(cond).length > 0 ? cond : null // 아이템 픽업도 종목 필터를 쓰지 않는다
    }
    case 'streak_days': {
      const v = int(fields.streakDays)
      if (v !== undefined) cond.streak_days = v
      break
    }
    case 'duration_minutes': {
      const v = int(fields.durationMinutes)
      if (v !== undefined) cond.duration_minutes = v
      break
    }
    case 'elevation_gain_m': {
      const v = num(fields.elevationM)
      if (v !== undefined) cond.elevation_gain_m = v
      break
    }
    default:
      return null
  }

  if (at) cond.activity_type = at
  return Object.keys(cond).length > 0 ? cond : null
}

/**
 * `engine_condition` 타입 — 배지엔진 위임 14종은 레지스트리의 `form.read`를 그대로 쓰고,
 * 미션 전용 9종(`time_band_counts` 제외)은 이 함수가 직접 조립한다. `initCondition`을 넘기면
 * 이 폼이 다루지 않는 `time_band_counts`를 원본 그대로 보존한다(배지 폼의
 * `FORM_UNSUPPORTED_CONDITION_KEYS` 보존과 같은 패턴).
 */
function buildEngineConditionJson(
  fields: MissionConditionFormFields,
  initCondition?: MissionCondition | null
): MissionCondition | null {
  const cond: Record<string, unknown> = {}

  for (const key of MISSION_ENGINE_DELEGATED_KEYS) {
    const meta = getConditionField(key)
    if (!meta?.form) continue
    const value = meta.form.read(fields as unknown as ConditionFormValues)
    if (value !== undefined) cond[key] = value
  }

  if (cond.weekly_streak !== undefined) {
    const minCount = int(fields.weeklyStreakMinCount)
    if (minCount !== undefined) cond.weekly_streak_min_count = minCount
  }

  const monthlyStreak = int(fields.monthlyStreak)
  if (monthlyStreak !== undefined) {
    cond.monthly_streak = monthlyStreak
    const minCount = int(fields.monthlyStreakMinCount)
    if (minCount !== undefined) cond.monthly_streak_min_count = minCount
  }

  // streak_subset — weekly_streak/monthly_streak 중 하나가 있을 때만 의미가 있다.
  // min_count는 필수 필드(MissionStreakSubset)라 그게 없으면 subset 자체를 만들지 않는다.
  if (cond.weekly_streak !== undefined || cond.monthly_streak !== undefined) {
    const minCount = int(fields.streakSubsetMinCount)
    const days = csvDayOfWeek(fields.streakSubsetDayOfWeek)
    const hasTimeRange = fields.streakSubsetTimeStart !== '' && fields.streakSubsetTimeEnd !== ''
    if (minCount !== undefined && (days.length > 0 || hasTimeRange)) {
      const subset: MissionStreakSubset = { min_count: minCount }
      if (days.length > 0) subset.day_of_week = days
      if (hasTimeRange) subset.time_range = { start: fields.streakSubsetTimeStart, end: fields.streakSubsetTimeEnd }
      cond.streak_subset = subset
    }
  }

  const distinctWeekday = int(fields.distinctWeekdayCount)
  if (distinctWeekday !== undefined) cond.distinct_weekday_count = distinctWeekday

  const distinctMonthsRequired = int(fields.distinctMonthsRequired)
  if (distinctMonthsRequired !== undefined) {
    cond.distinct_months_required = distinctMonthsRequired
    if (fields.distinctMonthsMetric) cond.distinct_months_metric = fields.distinctMonthsMetric
    const threshold = num(fields.distinctMonthsThreshold)
    if (threshold !== undefined) cond.distinct_months_threshold = threshold
  }

  // 폼이 다루지 않는 필드 — 값이 있으면 원본 그대로 보존(유실 방지)
  if (initCondition?.time_band_counts !== undefined) {
    cond.time_band_counts = initCondition.time_band_counts
  }

  return Object.keys(cond).length > 0 ? (cond as MissionCondition) : null
}

/**
 * 조건 빌더 폼 입력값을 `condition_json`(`MissionCondition`)으로 조립한다.
 * `initCondition`(폼을 열 때 미션에 이미 저장돼 있던 원본 조건)은 `engine_condition`의
 * `time_band_counts` 보존에만 쓴다.
 */
export function buildMissionConditionJson(
  missionType: MissionType,
  fields: MissionConditionFormFields,
  initCondition?: MissionCondition | null
): MissionCondition | null {
  if (missionType === 'engine_condition') return buildEngineConditionJson(fields, initCondition)
  return buildSimpleConditionJson(missionType, fields)
}

/**
 * `engine_condition` 조건 중 이 폼이 입력 UI를 주지 않는 키(`time_band_counts`)를 안내하려고
 * 돌려준다. 값이 있어도 저장 시 사라지지 않지만(위 보존 로직), 이 화면에서 보거나 고칠 수는 없다.
 */
export function unsupportedMissionConditionKeys(condition: MissionCondition | null | undefined): string[] {
  if (!condition) return []
  return condition.time_band_counts !== undefined ? ['time_band_counts'] : []
}
