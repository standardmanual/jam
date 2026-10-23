/**
 * 미션 「달성 조건」 필드 빌더 폼 — 원시 JSON textarea를 대체하는 필드 선택 UI의 순수 로직
 * (티켓 20260911_2118)
 *
 * 배지 조건 빌더(`admin/badges/conditionFormFields.ts` + `lib/badge-engine/conditionRegistry.ts`)와
 * 같은 골격이다 — 필드를 채우면 값이 있는 키만 모여 AND로 결합된 `condition_json`이 된다.
 * **엔진 위임 26종(`MISSION_ENGINE_DELEGATED_KEYS`)은 새로 만들지 않고 배지 레지스트리의
 * `form.read`/`form.write`를 그대로 재사용한다** — `MissionCondition`이 그 필드들을
 * `BadgeCondition`과 동일한 이름·의미로 재사용하기 때문이다(`src/types/database.ts` 주석 참고).
 * 레지스트리를 고치지 않는다 — 라벨·단위·범위(min·max)는 레지스트리 정의 그대로다. 예외는 `day_of_week` 하나로,
 * 레지스트리에 입력 칸 정의(`form`)가 없어 이 파일이 미션 쪽에서 읽기·쓰기를 정한다(`readDayOfWeek`·`writeDayOfWeek`).
 *
 * ## mission_type별 다른 화면
 * - 단순 7종(`distance`~`elevation_gain_m`)은 필드 1~2개(목표값 + 선택적 종목 필터)만 쓴다.
 * - `engine_condition`은 배지엔진 위임 26종 + 미션 전용 어휘 9종을 자유롭게 조합하는 다중 조건
 *   빌더다(`checkMissionCondition`이 이 타입만 fail-closed로 막으므로 모르는 키를 절대 만들면
 *   안 된다 — 이 파일이 만드는 키는 전부 `MISSION_ALLOWED_CONDITION_KEYS`에 있다).
 *
 * ## `time_band_counts`는 입력 UI가 없다
 * 이 키는 배열의 배열이라 그리기 비용이 크고, 실제 카탈로그에 쓰는 미션이 드물어 전용 UI가 없다.
 * DB 기록으로 세는 키 20개(티켓 20261019_1445, `MISSION_ENGINE_DB_PRESERVED_KEYS`)도 아직 입력 칸이 없다(티켓 20261021_1114 2회).
 * 시간대·요일·계절·운동 속성 위임 키 12개는 티켓 20261021_1114 1회에서 입력 칸이 생겼다.
 * 값이 있으면 배지 폼의 `FORM_UNSUPPORTED_CONDITION_KEYS` 보존 패턴과 같은 방식으로
 * **원본 그대로 보존**한다 — 열어서 저장해도 사라지지 않는다.
 *
 * ⚠️ `MISSION_ENGINE_DELEGATED_KEYS`는 폼이 입력 칸을 그리는 위임 키 목록이다. 실제 판정에 위임되는 키의 정본은
 * `src/lib/missions/condition-keys.ts`의 `ENGINE_DELEGATED_CONDITION_KEY_LIST`다(`engineCondition.ts`도 그것을
 * 쓴다 — 그 파일은 `@/lib/badge-engine`(→ 서버 전용) 의존이 있어 이 폼이 직접 import할 수 없다). 정본에는 있는데
 * 폼에는 입력 칸이 아직 없는 키는 `MISSION_ENGINE_PRESERVED_KEYS`로 나눠 두고, 저장할 때 원본 값을 그대로
 * 보존한다(`time_band_counts`와 같은 방식) — 안 그러면 이 화면에서 미션을 열어 저장하는 순간 그 키가 사라진다.
 * 지금은 정본의 26개가 모두 폼 목록에 있어 보존 목록이 비어 있다. 정본에 키가 늘면 자동으로 보존 목록에 들어온다.
 * 이 파일의 회귀 테스트가 두 목록이 정본과 어긋나지 않는지 대조한다. 입력 칸을 추가할 때는 키를 보존 목록에서
 * 폼 목록으로 옮긴다(티켓 20261019_1312, 20261021_1114).
 */
import type { ActivityType, DayOfWeek, MissionCondition, MissionType, MissionStreakSubset } from '@/types/database'
import { getConditionField, type ConditionFormValues } from '@/lib/badge-engine/conditionRegistry'
import { ENGINE_DELEGATED_CONDITION_KEY_LIST, MISSION_DB_CONDITION_KEY_LIST } from '@/lib/missions/condition-keys'

/**
 * 폼이 입력 칸을 그리는 엔진 위임 키. 정본(`ENGINE_DELEGATED_CONDITION_KEY_LIST`)의 부분집합이어야 한다 —
 * 파일 상단 주석과 회귀 테스트 참고.
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
  // 티켓 20261021_1114 1회 — 시간대·요일·계절·운동 속성 12개. 화면 순서가 이 순서다
  'time_range',
  'day_of_week',
  'season',
  'season_count',
  'season_count_all',
  'distinct_time_bands',
  'weekend_duration_hours',
  'cumulative_duration_hours',
  'max_speed_kmh',
  'avg_heartrate_bpm',
  'avg_watts',
  'avg_cadence',
] as const satisfies readonly (keyof MissionCondition)[]

export type MissionEngineDelegatedKey = (typeof MISSION_ENGINE_DELEGATED_KEYS)[number]

/**
 * 판정에는 위임되지만(정본 `ENGINE_DELEGATED_CONDITION_KEY_LIST`) 이 폼에 입력 칸이 아직 없는 위임 키.
 * 폼을 열어 저장해도 값이 사라지지 않게 원본(`initCondition`)을 그대로 보존한다.
 * 정본에서 폼 목록을 뺀 나머지라, 정본에 키가 늘어나면 자동으로 여기 들어와 보존된다.
 * 티켓 20261021_1114 1회로 시간대·요일·계절·운동 속성 12개가 폼 목록으로 옮겨 가서 지금은 비어 있다.
 */
export const MISSION_ENGINE_PRESERVED_KEYS: readonly (typeof ENGINE_DELEGATED_CONDITION_KEY_LIST)[number][] =
  ENGINE_DELEGATED_CONDITION_KEY_LIST.filter(
    (key) => !(MISSION_ENGINE_DELEGATED_KEYS as readonly string[]).includes(key)
  )

/**
 * DB 기록으로 세는 키 20개 — 믹스·드랍·픽업·완료 수·캡슐·잠긴 개체·날짜·체크인 등 배지 조건과 이름이 같은 19개와 미션 전용
 * `jam_period_earned`(기간 동안 모은 잼) 1개. 정본은 둘을 합친 `MISSION_DB_CONDITION_KEY_LIST`다 —
 * 이 폼에 입력 칸이 없다(입력 칸은 5-8 티켓에서 만든다). 폼을 열어 저장하면 `buildEngineConditionJson`이 `initCondition`의
 * 값을 그대로 보존한다. 안 그러면 이 화면에서 열어 저장하는 순간 DB 키가 사라져 미션이 다른 조건이 된다(티켓 20261019_1445).
 * 배지 레지스트리 쪽 목록(`ENGINE_DELEGATED_DB_CONDITION_KEY_LIST`)만 별칭으로 쓰면 미션 전용 키가 빠져 사라지므로 합집합을 쓴다(3-A회).
 * 위임 키 보존 목록(`MISSION_ENGINE_PRESERVED_KEYS`)과 다른 점: 이 키들은 배지엔진에 위임되지 않고 DB를 읽어 판정한다.
 */
export const MISSION_ENGINE_DB_PRESERVED_KEYS: readonly (typeof MISSION_DB_CONDITION_KEY_LIST)[number][] =
  MISSION_DB_CONDITION_KEY_LIST

const VALID_DAY_OF_WEEK: readonly DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

/** 미션 조건 빌더 폼 state — `ConditionFormValues`(`Record<string, string|boolean>`)에 구조적으로
 * 대입되려면 암묵 인덱스 시그니처가 필요해 `interface`가 아니라 `type`이다(배지 폼과 같은 이유). */
export type MissionConditionFormFields = {
  // ── 배지엔진 위임 26종과 같은 state 키(레지스트리 form.read/write를 그대로 쓴다) ──────
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
  // ── 시간대·요일·계절·운동 속성 12종(티켓 20261021_1114 1회). 키는 레지스트리 form.fields 그대로 ──
  timeStart: string
  timeEnd: string
  /** 쉼표로 구분한 요일 목록('saturday, sunday') — 레지스트리에 입력 칸 정의가 없어 미션 쪽에서 정한다 */
  dayOfWeek: string
  /** 'spring' | 'summer' | 'autumn' | 'winter' | '' */
  season: string
  seasonCount: string
  seasonCountAll: string
  distinctTimeBands: string
  weekendDurationHours: string
  cumulativeDurationHours: string
  maxSpeedKmh: string
  avgHeartrateBpm: string
  avgWatts: string
  avgCadence: string
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
    timeStart: '',
    timeEnd: '',
    dayOfWeek: '',
    season: '',
    seasonCount: '',
    seasonCountAll: '',
    distinctTimeBands: '',
    weekendDurationHours: '',
    cumulativeDurationHours: '',
    maxSpeedKmh: '',
    avgHeartrateBpm: '',
    avgWatts: '',
    avgCadence: '',
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
 * `day_of_week` 입력값(쉼표 요일 목록) → `condition_json` 값. 배지 레지스트리에 이 키의 입력 칸 정의(`form`)가 없어
 * 미션 쪽에서 정한다(티켓 20261021_1114 1회, 레지스트리는 건드리지 않는다).
 * - 한 요일만 고르면 문자열이다 — 그 요일에 시작한 활동만 거르는 조건(단일 값).
 * - 두 요일 이상은 배열이다 — `weekly_streak`와 함께 쓸 때만 반영된다(`total_count`는 미션에 없다).
 * - 원본이 배열이었으면 한 요일만 남아도 배열로 둔다 — 열어서 저장해도 값의 모양이 바뀌지 않게 한다.
 * - 아무 요일도 없으면 undefined(키를 넣지 않는다).
 */
export function readDayOfWeek(
  raw: string,
  initCondition?: MissionCondition | null
): DayOfWeek | DayOfWeek[] | undefined {
  const days = csvDayOfWeek(raw)
  if (days.length === 0) return undefined
  if (days.length === 1 && !Array.isArray(initCondition?.day_of_week)) return days[0]
  return days
}

/** `condition_json`의 `day_of_week` → 입력값(쉼표 요일 목록). `readDayOfWeek`의 역방향 */
export function writeDayOfWeek(value: unknown): string {
  return [value]
    .flat()
    .filter((v): v is string => typeof v === 'string')
    .join(', ')
}

/**
 * 기존 미션의 `condition_json`을 폼 초기값으로 되돌린다 — `buildMissionConditionJson`의 역방향.
 * 위임 키는 배지 레지스트리의 `form.write`를 그대로 써서 왕복이 배지 폼과 항상 같다(`day_of_week`만 미션 쪽 `writeDayOfWeek`).
 */
export function missionConditionFieldsFrom(condition: MissionCondition | null | undefined): MissionConditionFormFields {
  const fields = emptyMissionConditionFields()
  if (!condition) return fields
  const c = condition as Record<string, unknown>

  for (const key of MISSION_ENGINE_DELEGATED_KEYS) {
    const value = c[key]
    if (value === undefined) continue
    if (key === 'day_of_week') {
      fields.dayOfWeek = writeDayOfWeek(value)
      continue
    }
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
 * `engine_condition` 타입 — 배지엔진 위임 26종은 레지스트리의 `form.read`를 그대로 쓰고(`day_of_week`만 `readDayOfWeek`),
 * 미션 전용 9종(`time_band_counts` 제외)은 이 함수가 직접 조립한다. `initCondition`을 넘기면
 * 이 폼이 다루지 않는 `time_band_counts`와 보존 목록의 위임 키(`MISSION_ENGINE_PRESERVED_KEYS`)·DB 기록 키
 * (`MISSION_ENGINE_DB_PRESERVED_KEYS`)를 원본 그대로 보존한다(배지 폼의 `FORM_UNSUPPORTED_CONDITION_KEYS` 보존과 같은 패턴).
 */
function buildEngineConditionJson(
  fields: MissionConditionFormFields,
  initCondition?: MissionCondition | null
): MissionCondition | null {
  const cond: Record<string, unknown> = {}

  for (const key of MISSION_ENGINE_DELEGATED_KEYS) {
    if (key === 'day_of_week') {
      const days = readDayOfWeek(fields.dayOfWeek, initCondition)
      if (days !== undefined) cond[key] = days
      continue
    }
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
  for (const key of MISSION_ENGINE_PRESERVED_KEYS) {
    const value = initCondition?.[key]
    if (value !== undefined) cond[key] = value
  }
  for (const key of MISSION_ENGINE_DB_PRESERVED_KEYS) {
    const value = initCondition?.[key]
    if (value !== undefined) cond[key] = value
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
 * `engine_condition` 조건 중 이 폼이 입력 UI를 주지 않는 키(`time_band_counts`와 보존 목록의 위임 키·DB 기록 키)를
 * 안내하려고 돌려준다. 값이 있어도 저장 시 사라지지 않지만(위 보존 로직), 이 화면에서 보거나 고칠 수는 없다.
 */
export function unsupportedMissionConditionKeys(condition: MissionCondition | null | undefined): string[] {
  if (!condition) return []
  const keys: string[] = condition.time_band_counts !== undefined ? ['time_band_counts'] : []
  for (const key of MISSION_ENGINE_PRESERVED_KEYS) {
    if (condition[key] !== undefined) keys.push(key)
  }
  for (const key of MISSION_ENGINE_DB_PRESERVED_KEYS) {
    if (condition[key] !== undefined) keys.push(key)
  }
  return keys
}

/**
 * 저장 전에 입력 칸의 범위(레지스트리 `min`·`max`)를 검사하는 수치 위임 키 — 티켓 20261021_1114 1회가 입력 칸을 만든 키 가운데
 * 수치를 받는 9개. 범위는 여기 다시 적지 않고 레지스트리 정의를 그대로 읽는다(배지 양식과 한 곳).
 * 서버 저장 검사(`checkMissionConditionValue`)는 위임 키의 범위를 보지 않아서, 도달할 수 없는 값(예: 서로 다른 시간대 9개)이
 * 이 검사가 없으면 그대로 저장된다.
 */
export const MISSION_RANGE_CHECKED_KEYS = [
  'season_count',
  'season_count_all',
  'distinct_time_bands',
  'weekend_duration_hours',
  'cumulative_duration_hours',
  'max_speed_kmh',
  'avg_heartrate_bpm',
  'avg_watts',
  'avg_cadence',
] as const satisfies readonly MissionEngineDelegatedKey[]

function rangeText(min: number | undefined, max: number | undefined, unit: string): string {
  if (min !== undefined && max !== undefined) return `${min}~${max}${unit}`
  if (min !== undefined) return `${min}${unit} 이상`
  return `${max}${unit} 이하`
}

/**
 * 조립된 `condition_json`에서 입력 칸 범위를 벗어난 값이 있으면 그 문제를 한 문장으로 돌려준다(없으면 null).
 * 벗어난 키를 한 번에 모두 알린다. 숫자가 아닌 값은 이 검사의 대상이 아니다(폼은 늘 숫자를 만든다).
 */
export function missionConditionRangeError(condition: unknown): string | null {
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return null
  const record = condition as Record<string, unknown>
  const problems: string[] = []
  for (const key of MISSION_RANGE_CHECKED_KEYS) {
    const value = record[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const meta = getConditionField(key)
    if (!meta || (meta.min === undefined && meta.max === undefined)) continue
    if ((meta.min !== undefined && value < meta.min) || (meta.max !== undefined && value > meta.max)) {
      const unit = meta.unit ?? ''
      problems.push(`${meta.label} ${value}${unit}(허용 범위 ${rangeText(meta.min, meta.max, unit)})`)
    }
  }
  if (problems.length === 0) return null
  return `저장하지 못했어요. 허용 범위를 벗어난 조건이 있어요 — ${problems.join(', ')}. 범위 안의 값으로 고쳐서 다시 저장해 주세요.`
}
