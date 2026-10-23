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
 * 시간대·요일·계절·운동 속성 위임 키 12개는 티켓 20261021_1114 1회에서, DB 기록으로 세는 키 20개
 * (티켓 20261019_1445, `MISSION_DB_FORM_KEYS`)는 같은 티켓 2회에서 입력 칸이 생겼다.
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
import {
  ENGINE_DELEGATED_CONDITION_KEY_LIST,
  MISSION_DB_CONDITION_KEY_LIST,
  type MissionDbConditionKey,
} from '@/lib/missions/condition-keys'

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

/** «기록으로 세는 조건» 구역의 소제목 한 묶음 — 화면 순서가 이 순서다 */
export interface MissionDbFormGroup {
  title: string
  keys: readonly MissionDbConditionKey[]
}

/**
 * DB 기록으로 세는 키 20개를 6개 소제목으로 나눈 화면 묶음 (티켓 20261021_1114 2회, 사용자 결정).
 * 믹스 5, 드랍·픽업 4, 완료 수 2, 캡슐·잠긴 아이템 배지 3, 날짜·체크인 5, 잼 1. 키 타입이 `MissionDbConditionKey`라
 * 정본에 없는 키를 적으면 컴파일 오류다. 20개가 한 번씩만 들어 있는지는 회귀 테스트가 정본과 대조한다.
 */
export const MISSION_DB_FORM_GROUPS: readonly MissionDbFormGroup[] = [
  {
    title: '믹스',
    keys: [
      'combine_attempt_count',
      'combine_success_count',
      'combine_fail_count',
      'recipe_first_success',
      'cross_tribe_combine_success_count',
    ],
  },
  { title: '드랍·픽업', keys: ['drop_item_count', 'pickup_item_count', 'pickup_from_user_count', 'picked_up_by_user_count'] },
  { title: '완료 수', keys: ['mission_complete_count', 'collection_complete_count'] },
  { title: '캡슐·잠긴 아이템 배지', keys: ['capsule_open_count', 'locked_item_open_count', 'locked_item_pickup_count'] },
  {
    title: '날짜·체크인',
    keys: [
      'weekly_active_days',
      'same_spot_checkin_days',
      'new_checkin_badge_count',
      'checkin_category_count',
      'checkin_badge_count',
    ],
  },
  { title: '잼', keys: ['jam_period_earned'] },
]

/**
 * DB 기록으로 세는 키 가운데 폼이 입력 칸을 그리는 키 — 믹스·드랍·픽업·완료 수·캡슐·잠긴 개체·날짜·체크인 등 배지 조건과 이름이 같은
 * 19개와 미션 전용 `jam_period_earned`(기간 동안 모은 잼) 1개. 정본은 둘을 합친 `MISSION_DB_CONDITION_KEY_LIST`다.
 * 배지 쪽 19개는 라벨·단위·범위를 레지스트리 정의 그대로 읽고, 레지스트리에 없는 `jam_period_earned`만 이 파일이 정한다.
 */
export const MISSION_DB_FORM_KEYS: readonly MissionDbConditionKey[] = MISSION_DB_FORM_GROUPS.flatMap((group) => group.keys)

/**
 * DB 기록 키 중 폼에 입력 칸이 없는 키. 폼을 열어 저장하면 `buildEngineConditionJson`이 `initCondition`의 값을 그대로 보존한다 —
 * 안 그러면 이 화면에서 열어 저장하는 순간 DB 키가 사라져 미션이 다른 조건이 된다(티켓 20261019_1445).
 * 정본에서 폼 목록을 뺀 나머지라 정본에 키가 늘면 자동으로 여기 들어와 보존된다. 티켓 20261021_1114 2회로 20개가 모두 폼 목록으로
 * 옮겨 가서 지금은 비어 있다. 배지 레지스트리 쪽 목록(`ENGINE_DELEGATED_DB_CONDITION_KEY_LIST`)만 별칭으로 쓰면 미션 전용 키가
 * 빠져 사라지므로 정본은 합집합을 쓴다(3-A회).
 * 위임 키 보존 목록(`MISSION_ENGINE_PRESERVED_KEYS`)과 다른 점: 이 키들은 배지엔진에 위임되지 않고 DB를 읽어 판정한다.
 */
export const MISSION_ENGINE_DB_PRESERVED_KEYS: readonly MissionDbConditionKey[] = MISSION_DB_CONDITION_KEY_LIST.filter(
  (key) => !MISSION_DB_FORM_KEYS.includes(key)
)

/** 레지스트리에 값 범위가 없는 객체형 두 키(`checkin_category_count`·`checkin_badge_count`)의 안쪽 `count` 입력 범위 */
export const MISSION_DB_OBJECT_COUNT_RANGE = { min: 1, max: 1000000, step: 1 } as const

/** 안쪽 `count`를 받는 객체형 DB 기록 키 */
const MISSION_DB_OBJECT_COUNT_KEYS: readonly MissionDbConditionKey[] = ['checkin_category_count', 'checkin_badge_count']

/** 폼 칸 이름 → 안쪽 `count` 칸. 레지스트리 컨트롤의 범위가 비어 있어 칸을 그릴 때 이 범위를 건다 */
export const MISSION_DB_OBJECT_COUNT_FIELDS: readonly string[] = ['checkinCategoryCountCount', 'checkinBadgeCountCount']

/**
 * 미션 전용 키 `jam_period_earned`의 입력 칸 정의 (티켓 20261021_1114 2회, 사용자 결정). 배지 조건 레지스트리에 이 키가 없어
 * 라벨·단위·범위를 미션 쪽에서 정한다. 범위의 아래쪽(1 이상의 정수)은 서버 기준 값 검사와 같고, 위쪽 한계(1,000,000)는
 * 도달할 수 없는 값이 저장되지 않도록 폼이 더한 것이다.
 */
export const JAM_PERIOD_EARNED_INPUT = {
  field: 'jamPeriodEarned',
  label: '기간 동안 모은 잼',
  unit: '잼',
  min: 1,
  max: 1000000,
  step: 1,
  placeholder: '300',
  help: '참가한 뒤 미션 기간 안에 모은 잼만 세요. 참가 전에 모은 잼은 포함되지 않아요.',
} as const

/**
 * 배지 조건 레지스트리의 도움말 가운데 미션에서는 뜻이 달라지는 것을 미션 문구로 바꾼다 — 칸 이름 → 도움말.
 * 레지스트리 도움말은 «발급»·«가입한 날부터 센다»처럼 배지 기준이라, 미션에서는 «달성»과 «참가한 뒤 미션 기간 안»으로 읽어야 한다.
 * 라벨·단위·범위는 레지스트리를 그대로 쓰고 도움말만 바꾼다. 여기 없는 칸은 레지스트리 도움말을 그대로 보인다.
 */
export const MISSION_DB_HELP_OVERRIDES: Readonly<Record<string, string>> = {
  recipeFirstSuccessRecipeId:
    '믹스 레시피 목록의 ID예요. 전체 유저 중 이 레시피를 가장 먼저 성공한 1명만 달성해요. 이미 성공한 사람이 있는 레시피에는 쓰지 마세요.',
  weeklyActiveDays:
    'JAM! 종목(러닝·사이클·트레일러닝·하이킹·걷기) 활동이 있는 날과 체크인한 날을 세요. 걷기는 0.5km·10분 이상만, 차량 속도로 이동한 기록은 빼요. 가장 많이 활동한 한 주(월~일)로 판정하고, 기간이 걸친 주는 기간 안의 날만 세요.',
  sameSpotCheckinDays:
    '장소마다 체크인한 날짜를 세고, 가장 많은 장소의 일수로 판정해요. 같은 날 여러 번 체크인해도 1일이에요.',
  checkinCategoryCountCount: '고른 카테고리의 체크인 배지 가운데 미션 기간 안에 처음 받은 배지가 몇 개 이상이어야 하는지예요.',
  checkinBadgeCountNames: '쉼표로 구분해요. 체크인 배지 이름을 정확히 입력해 주세요.',
  checkinBadgeCountCount: '지정한 배지 가운데 미션 기간 안에 처음 받은 배지가 몇 개 이상이어야 하는지예요.',
}

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
  // ── DB 기록으로 세는 20종(티켓 20261021_1114 2회). 19개는 레지스트리 form.fields 그대로, jamPeriodEarned만 미션 쪽 이름 ──
  combineAttemptCount: string
  combineSuccessCount: string
  combineFailCount: string
  recipeFirstSuccessRecipeId: string
  crossTribeCombineSuccessCount: string
  dropItemCount: string
  pickupItemCount: string
  pickupFromUserCount: string
  pickedUpByUserCount: string
  missionCompleteCount: string
  collectionCompleteCount: string
  capsuleOpenCount: string
  lockedItemOpenCount: string
  lockedItemPickupCount: string
  weeklyActiveDays: string
  sameSpotCheckinDays: string
  newCheckinBadgeCount: string
  /** 장소 카테고리 slug(`poi_categories.slug`) */
  checkinCategoryCountCategory: string
  checkinCategoryCountCount: string
  /** 쉼표로 구분한 체크인 배지 이름 */
  checkinBadgeCountNames: string
  checkinBadgeCountCount: string
  jamPeriodEarned: string
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
    combineAttemptCount: '',
    combineSuccessCount: '',
    combineFailCount: '',
    recipeFirstSuccessRecipeId: '',
    crossTribeCombineSuccessCount: '',
    dropItemCount: '',
    pickupItemCount: '',
    pickupFromUserCount: '',
    pickedUpByUserCount: '',
    missionCompleteCount: '',
    collectionCompleteCount: '',
    capsuleOpenCount: '',
    lockedItemOpenCount: '',
    lockedItemPickupCount: '',
    weeklyActiveDays: '',
    sameSpotCheckinDays: '',
    newCheckinBadgeCount: '',
    checkinCategoryCountCategory: '',
    checkinCategoryCountCount: '',
    checkinBadgeCountNames: '',
    checkinBadgeCountCount: '',
    jamPeriodEarned: '',
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
 * DB에서 읽어 주입하는 선택지(장소 카테고리 등)에 저장된 값이 없으면 그 값을 글자 그대로 덧붙인다.
 * 지워졌거나 아직 읽지 못한 카테고리가 저장돼 있을 때 선택 칸이 비어 보이는 채로 저장되는 것을 막는다.
 * 비어 있는 값(선택 안 함)은 덧붙이지 않는다.
 */
export function selectOptionsWithCurrent(
  options: readonly { value: string; label: string }[],
  current: string
): { value: string; label: string }[] {
  if (current === '' || options.some((o) => o.value === current)) return [...options]
  return [...options, { value: current, label: current }]
}

/** `jam_period_earned` 입력값 → `condition_json` 값(1 이상의 정수 칸이라 정수로 읽는다). 비어 있으면 undefined */
export function readJamPeriodEarned(raw: string): number | undefined {
  return int(raw)
}

/** `condition_json`의 `jam_period_earned` → 입력값. `readJamPeriodEarned`의 역방향 */
export function writeJamPeriodEarned(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

/** DB 기록 키 하나를 폼 입력값에서 `condition_json` 값으로 읽는다. 값이 없으면 undefined — 19개는 레지스트리 `form.read`를 그대로 쓴다 */
function readDbKey(key: MissionDbConditionKey, fields: MissionConditionFormFields): unknown {
  if (key === 'jam_period_earned') return readJamPeriodEarned(fields.jamPeriodEarned)
  return getConditionField(key)?.form?.read(fields as unknown as ConditionFormValues)
}

/**
 * 입력 칸에 값이 들어 있어 `engine_condition`으로 저장하면 조건이 되는 DB 기록 키들. 다른 미션 타입으로 바꾸면 이 조건은 저장되지 않으므로
 * 화면이 경고 박스를 띄울 때 쓴다(티켓 20261021_1114 2회). 폼 값만 보고 가르며 미션 타입은 따지지 않는다.
 */
export function filledMissionDbKeys(fields: MissionConditionFormFields): MissionDbConditionKey[] {
  return MISSION_DB_FORM_KEYS.filter((key) => readDbKey(key, fields) !== undefined)
}

/**
 * 기존 미션의 `condition_json`을 폼 초기값으로 되돌린다 — `buildMissionConditionJson`의 역방향.
 * 위임 키는 배지 레지스트리의 `form.write`를 그대로 써서 왕복이 배지 폼과 항상 같다(`day_of_week`만 미션 쪽 `writeDayOfWeek`).
 * DB 기록 키도 같다(`jam_period_earned`만 미션 쪽 `writeJamPeriodEarned`). 미션 타입은 따지지 않고 값이 있으면 채운다 —
 * 타입을 바꿨다 되돌려도 입력이 돌아오게 하려는 것이다.
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

  for (const key of MISSION_DB_FORM_KEYS) {
    const value = c[key]
    if (value === undefined) continue
    if (key === 'jam_period_earned') {
      fields.jamPeriodEarned = writeJamPeriodEarned(value)
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
 * `engine_condition` 타입 — 배지엔진 위임 26종과 DB 기록 20종은 레지스트리의 `form.read`를 그대로 쓰고(`day_of_week`만 `readDayOfWeek`,
 * `jam_period_earned`만 `readJamPeriodEarned`), 미션 전용 9종(`time_band_counts` 제외)은 이 함수가 직접 조립한다. `initCondition`을 넘기면
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

  // DB 기록으로 세는 20종 — 입력 칸 값이 있는 키만 넣는다(티켓 20261021_1114 2회)
  for (const key of MISSION_DB_FORM_KEYS) {
    const value = readDbKey(key, fields)
    if (value !== undefined) cond[key] = value
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
 * 안내하려고 돌려준다. 입력 칸이 생긴 DB 기록 키 20개(티켓 20261021_1114 2회)는 더 이상 여기 들지 않는다. 값이 있어도 저장 시 사라지지 않지만(위 보존 로직), 이 화면에서 보거나 고칠 수는 없다.
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

/** 범위를 검사할 값 하나 — 라벨·단위·허용 범위와 입력된 값. `integerOnly`면 소수도 막는다 */
interface RangeSubject {
  value: unknown
  label: string
  unit: string
  min: number | undefined
  max: number | undefined
  integerOnly: boolean
}

/**
 * DB 기록 키 가운데 숫자를 받는 키 19개(`recipe_first_success`는 숫자가 없는 레시피 지정이라 뺀다) — 티켓 20261021_1114 2회가 입력 칸을 만든 키.
 * 서버 기준 값 검사(`checkMissionConditionValue`)는 1 이상의 정수만 보고 위쪽 한계는 보지 않는다. 그래서 이 검사가 없으면 입력 칸의 상한을
 * 넘는 값(예: 주간 활동일 8일)이 그대로 저장된다.
 */
export const MISSION_DB_RANGE_CHECKED_KEYS: readonly MissionDbConditionKey[] = MISSION_DB_FORM_KEYS.filter(
  (key) => key !== 'recipe_first_success'
)

/** 범위 검사 대상을 입력된 조건에서 뽑는다. 수치 위임 키 9개는 레지스트리 정의, DB 기록 키는 레지스트리(19개 중 17개)·객체형 안쪽 `count`·미션 전용 정의를 따른다 */
function rangeSubjects(record: Record<string, unknown>): RangeSubject[] {
  const subjects: RangeSubject[] = []
  for (const key of MISSION_RANGE_CHECKED_KEYS) {
    const meta = getConditionField(key)
    if (!meta) continue
    subjects.push({ value: record[key], label: meta.label, unit: meta.unit ?? '', min: meta.min, max: meta.max, integerOnly: false })
  }
  for (const key of MISSION_DB_RANGE_CHECKED_KEYS) {
    if (key === 'jam_period_earned') {
      const { label, unit, min, max } = JAM_PERIOD_EARNED_INPUT
      subjects.push({ value: record[key], label, unit, min, max, integerOnly: true })
      continue
    }
    const meta = getConditionField(key)
    if (!meta) continue
    if (MISSION_DB_OBJECT_COUNT_KEYS.includes(key)) {
      // 객체형 두 키는 레지스트리에 범위가 없어 안쪽 `count`에 같은 계열 키의 상한을 건다
      const raw = record[key]
      const count = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>).count : undefined
      const { min, max } = MISSION_DB_OBJECT_COUNT_RANGE
      subjects.push({ value: count, label: meta.label, unit: meta.unit ?? '', min, max, integerOnly: true })
      continue
    }
    subjects.push({ value: record[key], label: meta.label, unit: meta.unit ?? '', min: meta.min, max: meta.max, integerOnly: true })
  }
  return subjects
}

/**
 * 조립된 `condition_json`에서 입력 칸 범위를 벗어난 값이 있으면 그 문제를 한 문장으로 돌려준다(없으면 null).
 * 벗어난 키를 한 번에 모두 알린다. 숫자가 아닌 값은 이 검사의 대상이 아니다(폼은 늘 숫자를 만든다).
 * DB 기록 키는 개수나 잼의 양이라 소수도 벗어난 값으로 본다(서버 기준 값 검사와 같은 «1 이상의 정수»).
 */
export function missionConditionRangeError(condition: unknown): string | null {
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return null
  const record = condition as Record<string, unknown>
  const problems: string[] = []
  for (const { value, label, unit, min, max, integerOnly } of rangeSubjects(record)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (min === undefined && max === undefined) continue
    const outOfRange = (min !== undefined && value < min) || (max !== undefined && value > max)
    if (outOfRange || (integerOnly && !Number.isInteger(value))) {
      problems.push(`${label} ${value}${unit}(허용 범위 ${rangeText(min, max, unit)}${integerOnly ? '의 정수' : ''})`)
    }
  }
  if (problems.length === 0) return null
  return `저장하지 못했어요. 허용 범위를 벗어난 조건이 있어요 — ${problems.join(', ')}. 범위 안의 값으로 고쳐서 다시 저장해 주세요.`
}
