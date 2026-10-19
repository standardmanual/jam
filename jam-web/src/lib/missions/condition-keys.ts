/**
 * 미션 조건(`condition_json`) 허용 키의 단일 출처 + 저장 검증 (티켓 20260905_1141)
 *
 * ## 왜 필요한가
 *
 * 미션 어드민은 `condition_json`을 **검증 없는 자유 JSON textarea**로 받는다. 그런데
 * 티켓 20260905_0028이 `evaluateConditionDetailed`에 fail-closed를 도입하면서, 조건에
 * 모르는 키(오타)나 평가 구현이 없는 키(`evaluation: 'pending'`)가 하나라도 있으면 평가를
 * 시작하지 않고 fail한다. 즉 `distnace_km`처럼 한 글자를 틀려도 **저장은 성공하고 그 미션은
 * 아무 에러 없이 영구 미달성**이 된다. 배지 쪽에는 그 오타를 막는 검증
 * (`admin/badge-validation.ts`의 `findUnknownConditionKeyError` + DB CHECK 제약)이 있지만
 * 미션 쪽에는 한 층도 없었다.
 *
 * ## 단일 출처 구조
 *
 * 허용 키 = `ALL_CONDITION_KEYS`(배지 조건 레지스트리) ∪ `MISSION_ONLY_CONDITION_KEYS`(미션 고유 어휘).
 * 이 합집합을 **평가 경로(`checker.ts`의 fail-closed 통과 목록)와 저장 검증이 함께 참조**한다.
 * 두 곳이 서로 다른 목록을 들면 「저장은 되는데 평가에서 막힌다」(또는 그 반대)가 다시 생긴다.
 *
 * `MISSION_ONLY_CONDITION_KEYS`는 예전엔 `checker.ts`의 하드코딩(`new Set(['count','badge_id'])`)
 * 이었다. 이제 `MissionCondition` 타입과 컴파일 타임으로 묶여 있어(파일 끝 단언 참고),
 * 타입에 필드를 추가했는데 배지 레지스트리에도 없고 이 목록에도 없으면 **컴파일 에러**가 난다.
 *
 * ## 배치 위치
 *
 * `checker.ts`는 `@/lib/supabase/server` 등 서버 전용 의존을 끌고 있어 API 라우트가 통째로
 * import하면 안 된다(20260904_0631 게이트 리뷰의 전이 의존 사고). 그래서 키 목록·미션 타입
 * 분류·검증 함수를 서버 의존이 없는 이 파일로 내리고, `checker.ts`가 여기서 가져다 쓴다.
 * 이 파일의 의존은 순수 상수·타입뿐이라 클라이언트 컴포넌트에서도 그대로 쓸 수 있다.
 */
import {
  ALL_CONDITION_KEYS,
  getConditionField,
  findBlockingConditionKeys,
} from '@/lib/badge-engine/conditionRegistry'
import type { ConditionKey } from '@/lib/badge-engine/conditionRegistry'
import { isMinuteInTimeRange } from '@/lib/badge-engine/timeBands'
import { missionTypeLabel } from '@/lib/admin/badge-labels'
import type { BadgeCondition, MissionCondition, MissionStatusDisplayType, MissionType } from '@/types/database'

/**
 * 티켓 20260813_001: 배지엔진 `evaluateConditionDetailed`를 재사용해 판정하는 미션 타입.
 * `condition_json`은 `BadgeCondition`과 동일한 필드 어휘(activity_type + streak_days/
 * duration_minutes/elevation_gain_m)를 그대로 사용한다.
 *
 * **이 타입만 fail-closed 경로를 탄다** — 나머지 타입은 `progressValue >= target`로 판정하므로
 * 평가 구현이 없는 키가 있어도 판정이 막히지는 않는다(대신 아무 효과도 없다).
 */
export const ENGINE_DELEGATED_MISSION_TYPES: ReadonlySet<MissionType> = new Set([
  'streak_days',
  'duration_minutes',
  'elevation_gain_m',
  // 티켓 20260906_2231 — `checker.ts`가 이 타입은 `evaluateMission`에서 먼저 특수 분기로
  // 처리한다(`evaluateEngineMissionCondition`, badge-engine 위임 + 미션 전용 어휘 결합).
  // 여기 포함시키는 이유는 저장 검증(`checkMissionCondition`)이 "이 타입은 fail-closed
  // 경로를 탄다"고 판단해 `pending` 필드를 저장 단계에서부터 막게 하기 위해서다 —
  // 빼면 `evaluateConditionDetailed`가 언젠가 fail-closed로 막을 필드를 저장은 허용해버린다.
  'engine_condition',
])

/**
 * 미션 조건에만 쓰이고 배지 조건 레지스트리에는 없는 키.
 *
 * `evaluateConditionDetailed`는 fail-closed다 — 조건에 모르는 키가 있으면 평가를 시작하지
 * 않고 fail한다. 미션은 `MissionCondition`을 `BadgeCondition`으로 캐스팅해 그 함수에 넘기므로,
 * 미션 고유 어휘를 열어 두지 않으면 **미션이 영구 미달성**이 된다.
 *
 * ⚠️ 여기 키를 추가해도 「평가된다」는 뜻은 아니다 — fail-closed를 통과시킬 뿐이고,
 * 실제 판정은 `progressValue >= target` 경로나 엔진이 아는 필드만으로 이뤄진다.
 */
const MISSION_ONLY_CONDITION_KEY_LIST = [
  'count',
  'badge_id',
  // 티켓 20260906_2231 — `engine_condition` 타입 전용 어휘. 배지 조건 레지스트리에는 없다
  // (650여 종 배지 카탈로그 어디에도 이 조합이 필요한 조건이 없어 배지엔진에 넣지 않았다 —
  // `src/lib/missions/engineCondition.ts` 상단 주석 참고). 그 파일이 이 목록을
  // `ENGINE_CONDITION_ONLY_KEYS`로 재수출해 가져다 쓴다 — 이 파일(서버 의존 없음)이 정본이고
  // `engineCondition.ts`(서버 전용, badge-engine 위임 포함)가 참조하는 방향이다. 반대 방향으로
  // 두면(엔진 위임 파일이 정본) 클라이언트 컴포넌트가 이 파일을 import할 때
  // `@/lib/supabase/server` → `next/headers` 전이 의존까지 끌려와 빌드가 깨진다
  // (티켓 20260904_0631과 같은 실패 모드).
  'distinct_weekday_count',
  'time_band_counts',
  'weekly_streak_min_count',
  'monthly_streak',
  'monthly_streak_min_count',
  'streak_subset',
  'distinct_months_required',
  'distinct_months_metric',
  'distinct_months_threshold',
  // 티켓 20261019_1445 3-A — 참가한 뒤 미션 기간 안에 모은 잼(정산된 활동의 시작 시각이 기간 안인 활동의 잼). 배지 조건 레지스트리에는 없는
  // 미션 전용 키라 여기에 둔다. DB를 읽어 세는 키라서 `MISSION_ONLY_DB_CONDITION_KEY_LIST`에도 있다(아래).
  // 판정 키 집합(`ENGINE_CONDITION_JUDGED_KEYS`)에 이 목록이 통째로 들어가므로, 판정 구현(`dbMetrics.ts`·`engineCondition.ts`)과 같은 변경에서 더했다.
  'jam_period_earned',
] as const satisfies readonly (keyof MissionCondition)[]

export type MissionOnlyConditionKey = (typeof MISSION_ONLY_CONDITION_KEY_LIST)[number]

/**
 * 배지엔진(`evaluateConditionDetailed`)에 그대로 위임하는 키 — `engine_condition` 전용 (티켓 20261019_1312).
 *
 * 이름·의미가 `BadgeCondition`의 같은 키와 같아서 새 판정 로직 없이 배지엔진이 판정한다.
 * `engineCondition.ts`의 `DELEGATED_KEYS`가 이 목록을 그대로 가져다 쓰고, 어드민 폼의 거울 목록
 * (`missionConditionFields.ts`)도 이 목록과 어긋나지 않는지 시험이 대조한다. 정본이 여기인 이유는
 * `MISSION_ONLY_CONDITION_KEY_LIST`와 같다 — `engineCondition.ts`는 서버 전용 의존(`next/headers`)을 끌고
 * 있어 이 파일(저장 검증, 클라이언트에서도 쓴다)이 그쪽을 import할 수 없다.
 *
 * 기온 키(`temperature_min_c`/`temperature_max_c`)는 일부러 없다 — 날씨와 기온은 미션 조건으로 쓰지 않는다
 * (JAM 2.0 운영 로직 13.2절). 저장 검증이 따로 막는다(`MISSION_FORBIDDEN_CONDITION_KEYS`).
 */
export const ENGINE_DELEGATED_CONDITION_KEY_LIST = [
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
  // 티켓 20261019_1312 — 활동 기록만으로 판정되는 배지 조건(시간대·요일·계절·운동 속성)
  'time_range',
  'distinct_time_bands',
  'day_of_week',
  'season',
  'season_count',
  'season_count_all',
  'max_speed_kmh',
  'avg_heartrate_bpm',
  'avg_watts',
  'avg_cadence',
  'cumulative_duration_hours',
  'weekend_duration_hours',
] as const satisfies readonly (keyof MissionCondition)[]

export type EngineDelegatedConditionKey = (typeof ENGINE_DELEGATED_CONDITION_KEY_LIST)[number]

/**
 * DB 기록으로 세는 키 19개 — `engine_condition` 전용 (티켓 20261019_1445 1회 14개 + 2회 5개).
 *
 * 배지엔진 위임 키(위)와 다르게 `evaluateConditionDetailed`에 넘기지 않는다. 활동 기록이 아니라 DB 행(믹스 기록·드랍 기록 등)을
 * 세는 값이라 `lib/missions/dbMetrics.ts`의 `loadMissionDbMetrics`가 «참가한 뒤, 미션 기간 안»의 값으로 읽고,
 * `engineCondition.ts`가 그 값을 조건의 숫자와 비교한다. 그래서 `ENGINE_DELEGATED_CONDITION_KEY_LIST`(= 배지엔진 위임)에 섞지 않는다.
 *
 * 이 키들은 배지 조건 레지스트리에도 있다(같은 이름·의미) — 아래 컴파일 장치가 레지스트리에 없는 키가 섞이는 것을 막는다.
 * 키를 더하려면 읽기 함수·`dbMetrics.ts` 읽기 표·시험을 같은 회차에 만든다. 판정 구현 없이 이 목록에만 더하면
 * 그 키만 든 미션이 참가하자마자 완료된다(`ENGINE_CONDITION_JUDGED_KEYS`가 이 목록을 포함하기 때문이다).
 */
export const ENGINE_DELEGATED_DB_CONDITION_KEY_LIST = [
  // 믹스 4
  'combine_attempt_count',
  'combine_success_count',
  'combine_fail_count',
  'recipe_first_success',
  // 드랍·픽업 4
  'drop_item_count',
  'pickup_item_count',
  'pickup_from_user_count',
  'picked_up_by_user_count',
  // 완료 수 2
  'mission_complete_count',
  'collection_complete_count',
  // 새 키 4
  'capsule_open_count',
  'locked_item_open_count',
  'locked_item_pickup_count',
  'cross_tribe_combine_success_count',
  // 날짜·체크인 5 (2회) — 날짜 지표는 기간 밖 활동을 세지 않고, «처음 받은» 체크인 키는 전체 이력으로 처음 받은 시각을 정한 뒤 기간으로 좁힌다
  'weekly_active_days',
  'same_spot_checkin_days',
  'new_checkin_badge_count',
  'checkin_category_count',
  'checkin_badge_count',
] as const satisfies readonly (keyof MissionCondition)[]

export type EngineDelegatedDbConditionKey = (typeof ENGINE_DELEGATED_DB_CONDITION_KEY_LIST)[number]

/**
 * DB를 읽어 세는 **미션 전용** 키 (티켓 20261019_1445 3-A) — `engine_condition` 전용.
 *
 * `ENGINE_DELEGATED_DB_CONDITION_KEY_LIST`에는 넣지 못한다. 그 목록은 아래 컴파일 장치(`AssertDbKeysAreInRegistry`)로 «전부 배지 조건
 * 레지스트리의 키»임을 지키는데, 이 키들은 레지스트리에 없는 미션 전용 어휘(`MISSION_ONLY_CONDITION_KEY_LIST`)이기 때문이다. 그래서 DB 읽기 대상은
 * 두 목록의 합집합(`MISSION_DB_CONDITION_KEY_LIST`)으로 따로 둔다. 장치는 배지 레지스트리 쪽 목록에만 걸리므로 약해지지 않는다.
 * 허용 키와 판정 키 집합에는 `MISSION_ONLY_CONDITION_KEY_LIST`를 통해 이미 들어 있다 — 이 목록은 «읽는 방식»만 가린다.
 *
 * `satisfies readonly MissionOnlyConditionKey[]`: 여기 키는 반드시 미션 전용 목록에도 있어야 한다(없으면 컴파일 오류).
 */
export const MISSION_ONLY_DB_CONDITION_KEY_LIST = [
  // 참가한 뒤 기간 안에 모은 잼 — 정산된 활동의 시작 시각이 기간 안인 활동의 `activity_settlement` 잼만 센다
  'jam_period_earned',
] as const satisfies readonly MissionOnlyConditionKey[]

export type MissionOnlyDbConditionKey = (typeof MISSION_ONLY_DB_CONDITION_KEY_LIST)[number]

/** DB를 읽어 세는 모든 키 = 배지 조건과 이름이 같은 DB 키 + 미션 전용 DB 키. 읽기 표(`dbMetrics.ts`)·판정(`engineCondition.ts`)이 이 합집합을 쓴다 */
export const MISSION_DB_CONDITION_KEY_LIST = [
  ...ENGINE_DELEGATED_DB_CONDITION_KEY_LIST,
  ...MISSION_ONLY_DB_CONDITION_KEY_LIST,
] as const

export type MissionDbConditionKey = EngineDelegatedDbConditionKey | MissionOnlyDbConditionKey

const MISSION_DB_CONDITION_KEY_SET: ReadonlySet<string> = new Set<string>(MISSION_DB_CONDITION_KEY_LIST)

/** 조건에 값이 들어 있는 DB 기록 키들(배지 조건과 이름이 같은 키 + 미션 전용 키). 객체가 아니면 빈 배열 */
export function dbConditionKeysIn(condition: unknown): MissionDbConditionKey[] {
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return []
  const record = condition as Record<string, unknown>
  return MISSION_DB_CONDITION_KEY_LIST.filter((key) => record[key] !== undefined)
}

/**
 * 조건에 «기간 동안 모은 잼»(`jam_period_earned`)이 들어 있는가 (티켓 20261019_1445 3-B).
 *
 * 이 키가 든 미션은 모은 양이 순위의 진행값이 되므로 홈 투데이 랭킹 보드(홈 방문자 전원)에 양이 드러나지 않게
 * 순위를 가리고, 랭킹 모드에 연결하는 저장도 거절한다. 키가 «값이 있는가»로 보는 기준은 `dbConditionKeysIn`과 같다
 * (조건이 없거나 객체가 아니면 false). 미션 타입은 따지지 않는다 — 키가 들어 있으면 가린다(안전한 쪽).
 */
export function hasPeriodEarnedKey(condition: unknown): boolean {
  return dbConditionKeysIn(condition).includes('jam_period_earned')
}

/** 키가 DB 기록으로 세는 키(`MISSION_DB_CONDITION_KEY_LIST`)인가 */
export function isDbConditionKey(key: string): key is MissionDbConditionKey {
  return MISSION_DB_CONDITION_KEY_SET.has(key)
}

/**
 * 미션 전용 키 가운데 `engine_condition`이 쓰지 않는 둘 — 다른 타입(`activity_count`·`item_collect`)의 목표 값이다.
 * `engine_condition`에 들어 있어도 판정에 쓰이지 않는다.
 */
const NON_ENGINE_MISSION_ONLY_KEYS: ReadonlySet<string> = new Set(['count', 'badge_id'])

/**
 * `engine_condition` 미션이 달성 판정에 실제로 쓰는 키 = 위임 키(26개) + 복합 조건 전용 키(9개) + 미션 전용 DB 키(`jam_period_earned` 1개) + DB 기록 키(19개).
 * 이 밖의 키는 저장은 되지만 판정에 쓰이지 않는다 — `checkMissionCondition`이 경고로 알린다.
 * `evaluateEngineMissionCondition`의 「알려진 필드가 하나라도 있는가」 검사(fail-closed)도 이 집합을 쓴다 —
 * 두 곳이 갈리면 «경고는 없는데 판정은 안 하는» 조건이 생긴다.
 * 키를 판정 가능하게 만들 때마다 여기에 더하면 경고 대상에서 빠진다(5-2b 1~3회가 DB 기록 키 20개를 더했다). **판정 구현과 같은 변경에서** 더한다 —
 * 판정 없이 키만 옮기면 그 키만 든 미션이 알려진 키가 있다고 보고 참가 즉시 완료된다.
 */
export const ENGINE_CONDITION_JUDGED_KEYS: ReadonlySet<string> = new Set<string>([
  ...ENGINE_DELEGATED_CONDITION_KEY_LIST,
  ...MISSION_ONLY_CONDITION_KEY_LIST.filter((key) => !NON_ENGINE_MISSION_ONLY_KEYS.has(key)),
  ...ENGINE_DELEGATED_DB_CONDITION_KEY_LIST,
])

/**
 * 미션 조건으로 쓰지 않기로 한 키 — 어떤 미션 타입에서도 저장하지 못한다.
 * 날씨와 기온은 배지와 미션의 조건으로 쓰지 않는다(JAM 2.0 운영 로직 13.2절). 배지 레지스트리에는 있는 키라
 * 허용 키 검사는 통과하므로 따로 막는다 — 엔진 위임 타입(streak_days 등)은 조건을 그대로 판정해 기온까지
 * 실제로 검사하고, `engine_condition`은 기온을 조용히 무시해 미션이 더 쉬워진다.
 */
export const MISSION_FORBIDDEN_CONDITION_KEYS = ['temperature_min_c', 'temperature_max_c'] as const

/**
 * 미션 기간 안의 값으로 셀 수 없어서 미션 조건으로 저장하지 못하는 키 5개 (티켓 20261019_1445 사용자 결정 1).
 *
 * 값이 «지금 상태» 하나이거나 평생 누계라서 «참가한 뒤 기간 안에 얼마나 늘었는가»를 가릴 수 없다. 조용히 지금 값을 쓰면
 * 참가 전에 쌓은 값이 섞여 참가 즉시 완료되는 미션이 생기므로, 경고가 아니라 저장 단계에서 거절한다.
 * 값은 오류 문구의 [원인]에 들어가는 이유다.
 */
export const MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS: Readonly<Record<string, string>> = {
  jam_total_earned: '지갑에 평생 쌓인 누계 하나라서 참가한 뒤 얼마나 모았는지 나눌 수 없어요.',
  chapter_reached: '지금 도달한 챕터 하나라서 참가한 뒤 기간 안의 값으로 나눌 수 없어요.',
  days_since_signup: '가입한 날부터 지난 날짜라서 미션 기간과 상관없이 늘어나요.',
  other_tribe_item_kinds_count: '지금 가진 개체를 센 스냅샷이라서 참가 전에 모은 것과 참가 뒤에 모은 것을 나눌 수 없어요.',
  signup_recent_active_days: '오늘 기준 최근 30일을 도는 창이라서 미션 기간과 다른 기간을 세요.',
}

/** `checker.ts`가 `evaluateConditionDetailed`에 넘기는 `extraAllowedKeys` */
export const MISSION_ONLY_CONDITION_KEYS: ReadonlySet<string> = new Set<string>(
  MISSION_ONLY_CONDITION_KEY_LIST
)

/**
 * 미션 `condition_json`에 들어올 수 있는 전체 키 = 배지 조건 레지스트리 ∪ 미션 고유 어휘.
 * 저장 검증과 평가 경로가 이 하나를 공유한다.
 */
export const MISSION_ALLOWED_CONDITION_KEYS: ReadonlySet<string> = new Set<string>([
  ...ALL_CONDITION_KEYS,
  ...MISSION_ONLY_CONDITION_KEY_LIST,
])

// ── 오타 제안 ────────────────────────────────────────────────────────────

/** 두 문자열의 편집 거리(Levenshtein). 오타 제안에만 쓰는 작은 구현 */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const cur = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1, // 삭제
        cur[j - 1] + 1, // 삽입
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // 치환
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return prev[b.length]
}

/**
 * 오타로 보이는 키에 가장 가까운 허용 키를 제안한다(거리 2 이하).
 * 에러 문구에 「해결책」을 담기 위한 장치 — `distnace_km` → `distance_km`.
 * 마땅한 후보가 없으면 null.
 */
export function suggestMissionConditionKey(key: string): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of MISSION_ALLOWED_CONDITION_KEYS) {
    const d = editDistance(key, candidate)
    if (d < bestDistance) {
      bestDistance = d
      best = candidate
    }
  }
  if (best === null || bestDistance === 0 || bestDistance > 2) return null
  return best
}

// ── 저장 검증 ────────────────────────────────────────────────────────────

export interface MissionConditionCheck {
  /** 저장을 막아야 하는 사유. null이면 저장 가능 */
  error: string | null
  /** 저장은 되지만 그 필드가 판정에 아무 영향을 주지 않는다는 고지. null이면 없음 */
  warning: string | null
}

const OK: MissionConditionCheck = { error: null, warning: null }

/** 「객체가 아니다」를 어드민이 알아볼 수 있는 말로 */
function describeShape(value: unknown): string {
  if (value === null) return '빈 값(null)'
  if (Array.isArray(value)) return '목록([...])'
  if (typeof value === 'string') return '글자'
  if (typeof value === 'number') return '숫자'
  if (typeof value === 'boolean') return '참/거짓 값'
  return '알 수 없는'
}

/** `속도 편차(pace_variation)`처럼 라벨을 함께 적어 어드민이 어느 항목인지 알게 한다 */
function labelKeys(keys: string[]): string {
  return keys.map((k) => `${getConditionField(k)?.label ?? k}(${k})`).join(', ')
}

// ── 순위형 금지 (티켓 20261019_1312) ─────────────────────────────────────
//
// 밤 조건과 캡슐 연 횟수는 순위형 미션의 기준으로 쓰지 않는다(JAM 2.0 운영 로직 13.2절). 밤 조건은
// 순위를 올리려고 늦은 밤에 무리해서 움직이게 만들 수 있고, 캡슐 연 횟수는 나중에 캡슐을 빨리 채워 주는
// 유료 상품이 생기면 돈을 낸 유저가 순위에서 유리해진다. 달성형과 개인형은 허용한다.

/** 미션 틀을 비워서 만들 때 DB가 채우는 값(마이그레이션 046 `DEFAULT 'ranking'`) — 라우트와 등록 검사가 같은 값을 쓴다 */
export const DEFAULT_MISSION_STATUS_DISPLAY_TYPE: MissionStatusDisplayType = 'ranking'

/** 밤: 22:00(포함) ~ 05:00(미포함), 하루 중 분 — `timeBands.ts`의 «밤» 구간(22~5시)과 같다 */
const NIGHT_START_MIN = 22 * 60
const NIGHT_END_MIN = 5 * 60

/**
 * 시간대 `{start,end}`가 밤(22:00~05:00)과 겹치는지. 시각 해석은 배지 엔진 `inTimeRange`와 **같은 함수**
 * (`timeBands.ts`의 `isMinuteInTimeRange`)다 — `HH:MM`뿐 아니라 `HH:MM:SS`·`24:00`도 읽고, 끝이 시작보다 이르면
 * 자정을 넘기는 구간이며, **양 끝을 포함**한다. 그래서 `18:00~22:00`은 22:00에 시작한 활동을 세므로 밤 조건이다.
 * 읽을 수 없는 시각은 엔진에서도 어떤 활동과도 맞지 않으므로 밤 조건으로 보지 않는다.
 */
function timeRangeTouchesNight(range: unknown): boolean {
  if (typeof range !== 'object' || range === null) return false
  const { start, end } = range as Record<string, unknown>
  if (typeof start !== 'string' || typeof end !== 'string') return false
  const timeRange = { start, end }
  for (let minute = 0; minute < 24 * 60; minute++) {
    const inNight = minute >= NIGHT_START_MIN || minute < NIGHT_END_MIN
    if (inNight && isMinuteInTimeRange(minute, timeRange)) return true
  }
  return false
}

/**
 * 밤 조건이 들어 있는 키 이름들 — `time_range`, `time_band_counts`의 구간, 그리고 주기 안 부분집합의
 * 시간대(`streak_subset.time_range`)가 22:00~05:00(KST)과 겹치면 밤 조건이다. 부분집합 시간대를 포함하는 이유는
 * 거기에 밤을 넣으면 «밤에 한 활동을 매주 세는» 같은 순위 기준이 되어 규칙을 우회하기 때문이다.
 * `distinct_time_bands`는 서로 다른 시간대의 수만 세므로 밤 조건으로 보지 않는다.
 */
function nightConditionKeys(condition: unknown): string[] {
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return []
  const c = condition as Record<string, unknown>
  const keys: string[] = []
  if (timeRangeTouchesNight(c.time_range)) keys.push('time_range')
  if (Array.isArray(c.time_band_counts) && c.time_band_counts.some(timeRangeTouchesNight)) keys.push('time_band_counts')
  const subset = c.streak_subset
  if (typeof subset === 'object' && subset !== null && timeRangeTouchesNight((subset as Record<string, unknown>).time_range)) {
    keys.push('streak_subset.time_range')
  }
  return keys
}

/** 밤 조건(22:00~05:00 KST와 겹치는 시간대 조건)이 들어 있는가 */
export function usesNightCondition(condition: unknown): boolean {
  return nightConditionKeys(condition).length > 0
}

/**
 * 순위형 미션에 쓸 수 없는 조건(밤 조건, 캡슐 연 횟수)이 있으면 오류 문장을, 없으면 null을 돌려준다.
 * 틀이 순위형이 아니면(달성형·개인형·정해지지 않음) 항상 null이다.
 *
 * `checkMissionCondition`이 이 함수를 부르고, PATCH가 틀만 바뀔 때(조건은 기존 행 그대로)는 다른 검사 없이
 * 이 함수만 직접 부른다 — 기존 행의 다른 문제(옛 키 등)가 틀을 바꾸는 수정까지 막지 않게 한다.
 */
export function rankingConditionError(
  condition: unknown,
  frame: MissionStatusDisplayType | string | null | undefined
): string | null {
  if (frame !== 'ranking') return null
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return null

  const usedKeys: string[] = []
  const reasons: string[] = []

  const nightKeys = nightConditionKeys(condition)
  if (nightKeys.length > 0) {
    usedKeys.push(`밤 시간대 조건(${nightKeys.join(', ')})`)
    reasons.push('밤 조건은 순위를 올리려고 늦은 밤에 무리해서 움직이게 만들 수 있어요.')
  }
  if ((condition as Record<string, unknown>).capsule_open_count !== undefined) {
    usedKeys.push('캡슐 연 횟수(capsule_open_count)')
    reasons.push('캡슐 연 횟수는 나중에 캡슐을 빨리 채워 주는 상품이 생기면 돈을 낸 유저가 순위에서 유리해져요.')
  }
  if (usedKeys.length === 0) return null

  return `조건 JSON을 저장하지 못했어요. 순위형 미션에는 쓸 수 없는 조건이 있어요 — ${usedKeys.join(', ')}. ${reasons.join(' ')} 미션 틀을 달성형이나 개인형으로 바꾸거나, 이 조건을 빼고 다시 저장해주세요.`
}

/**
 * `engine_condition`이 아닌 타입에 DB 기록 키가 들어 있으면 «이 타입은 그 키를 판정하지 않는다»는 고지를 돌려준다 (티켓 20261019_1445 4회).
 *
 * DB 기록 키는 `engine_condition`만 `loadMissionDbMetrics`로 읽어 비교한다. `distance`·`activity_count`처럼 `progressValue >= target`으로
 * 판정하는 타입과 배지엔진에 조건을 넘기는 타입(`streak_days` 등)은 이 키를 읽지 않아서, 오류도 경고도 없이 저장되면 어드민이 효과를 기대하기
 * 쉽다(특히 순위 기준으로 쓰이는 `jam_period_earned`). 저장은 막지 않는다 — 효과가 없을 뿐 미션이 깨지지는 않는다.
 */
function ignoredDbKeysWarning(missionType: MissionType, condition: unknown): string | null {
  if (missionType === 'engine_condition') return null
  const dbKeys = dbConditionKeysIn(condition)
  if (dbKeys.length === 0) return null
  const names = dbKeys.map((k) => `${missionConditionValueLabel(k)}(${k})`).join(', ')
  return `DB 기록으로 세는 조건이 있어요 — ${names}. 「${missionTypeLabel(missionType)}」 타입은 이 조건을 판정하지 않아서 저장은 되지만 달성 판정에 아무 영향도 주지 않아요. 이 조건으로 달성을 판정하려면 미션 타입을 「${missionTypeLabel('engine_condition')}」으로 바꿔 주세요.`
}

/**
 * 미션 저장 전 `condition_json` 검증. 순수 함수 — API 라우트(POST/PATCH)와 어드민 폼이
 * 같은 판정을 공유한다(`badge-validation.ts`의 `findUnknownConditionKeyError`와 같은 패턴).
 *
 * - `condition`이 `undefined`이면 검사하지 않는다(PATCH 부분 갱신에서 조건을 건드리지 않는 경우)
 * - 객체가 아니면 거부 — 자유 textarea라 `JSON.parse('[1,2]')`가 그대로 들어올 수 있다
 * - 허용 키 밖의 키는 거부 (fail-closed에 걸려 영구 미달성이 되는 것을 저장 단계에서 막는다)
 * - 기온 키는 어떤 타입에서도 거부한다 (날씨와 기온은 미션 조건으로 쓰지 않는다, 티켓 20261019_1312)
 * - 기간 안의 값으로 셀 수 없는 키 5개(`MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS`)는 어떤 타입에서도 거부한다
 *   (티켓 20261019_1445). 기온 키와 다른 사유라서 문구를 따로 둔다
 * - 틀(`frame`)이 순위형이면 밤 조건과 캡슐 연 횟수를 거부한다. 틀을 넘기지 않으면(어드민 폼 미리보기 등)
 *   이 검사는 건너뛴다 — 저장 라우트는 항상 «갱신 후 틀»을 넘긴다
 * - 평가 구현이 없는 키(`pending`)는 **엔진 위임 타입에서만 거부**한다. 그 타입만
 *   fail-closed 경로를 타기 때문이다. 나머지 타입은 저장을 막지 않고 「효과 없음」을 고지한다
 *   (선례 20260904_1426은 「저장은 막지 않고 고지」였다 — 그 건은 발급 자체는 되는 경우였고,
 *   엔진 위임 타입은 저장하면 그 미션이 영원히 달성되지 않으므로 막는 쪽이 맞다)
 * - `engine_condition`에 판정하지 않는 키(`ENGINE_CONDITION_JUDGED_KEYS` 밖)가 있으면 저장은 허용하고
 *   고지한다 — 5-2b가 판정을 만들지 않은 키(`active_week_streak`·`jam_week_count`·`total_count` 등)가 이 경로를 탄다
 * - `engine_condition`이 아닌 타입에 DB 기록 키(`MISSION_DB_CONDITION_KEY_LIST` 20개)가 있으면 저장은 허용하고
 *   고지한다 — 그 타입은 DB 기록을 읽지 않아 키가 판정에 쓰이지 않는다(티켓 20261019_1445 4회)
 */
export function checkMissionCondition(
  missionType: MissionType,
  condition: unknown,
  frame?: MissionStatusDisplayType | string | null
): MissionConditionCheck {
  if (condition === undefined) return OK

  if (condition === null) {
    return {
      error:
        '조건 JSON을 저장하지 못했어요. 조건은 중괄호로 감싼 객체여야 하는데, 필드를 모두 비운 채로 저장하려고 해서 값이 비어(null) 있어요. 최소 하나 이상의 조건 필드를 채우고 다시 저장해주세요.',
      warning: null,
    }
  }

  if (typeof condition !== 'object' || Array.isArray(condition)) {
    return {
      error: `조건 JSON을 저장하지 못했어요. 조건은 중괄호로 감싼 객체여야 하는데 지금은 ${describeShape(condition)} 형태예요. {"distance_km": 50} 같은 형태로 고쳐서 다시 저장해주세요.`,
      warning: null,
    }
  }

  const blocking = findBlockingConditionKeys(
    condition as BadgeCondition,
    MISSION_ONLY_CONDITION_KEYS
  )

  if (blocking.unknown.length > 0) {
    const pairs = blocking.unknown
      .map((k) => {
        const suggestion = suggestMissionConditionKey(k)
        return suggestion ? `${k} → ${suggestion}` : null
      })
      .filter((s): s is string => s !== null)
    const fix =
      pairs.length > 0
        ? `오타로 보여요. ${pairs.join(', ')}처럼 고쳐서 다시 저장해주세요.`
        : '필드 이름에 오타가 없는지 확인하고 다시 저장해주세요.'
    return {
      error: `조건 JSON을 저장하지 못했어요. 미션 조건에 없는 필드가 있어요 — ${blocking.unknown.join(', ')}. ${fix}`,
      warning: null,
    }
  }

  const forbidden = MISSION_FORBIDDEN_CONDITION_KEYS.filter(
    (k) => (condition as Record<string, unknown>)[k] !== undefined
  )
  if (forbidden.length > 0) {
    return {
      error: `조건 JSON을 저장하지 못했어요. 미션에는 쓰지 않는 조건이 있어요 — ${labelKeys(forbidden)}. 날씨와 기온은 미션 조건으로 쓰지 않아요. 이 필드를 빼고 다시 저장해주세요.`,
      warning: null,
    }
  }

  const periodUnsupported = Object.keys(MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS).filter(
    (k) => (condition as Record<string, unknown>)[k] !== undefined
  )
  if (periodUnsupported.length > 0) {
    const reasons = periodUnsupported.map((k) => `${k}: ${MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS[k]}`).join(' ')
    return {
      error: `조건 JSON을 저장하지 못했어요. 미션 기간 안의 값으로 셀 수 없는 조건이 있어요 — ${labelKeys(periodUnsupported)}. ${reasons} 이 필드를 빼고, 기간 안에 쌓이는 조건(믹스 성공 횟수·캡슐 연 횟수·드랍한 아이템 수·기간 동안 모은 잼 등)으로 바꿔 다시 저장해주세요.`,
      warning: null,
    }
  }

  const rankingError = rankingConditionError(condition, frame)
  if (rankingError) return { error: rankingError, warning: null }

  const typeLabel = missionTypeLabel(missionType)
  const dbKeyWarning = ignoredDbKeysWarning(missionType, condition)
  if (blocking.pending.length > 0) {
    if (ENGINE_DELEGATED_MISSION_TYPES.has(missionType)) {
      return {
        error: `조건 JSON을 저장하지 못했어요. 아직 판정이 준비되지 않은 필드가 있어요 — ${labelKeys(blocking.pending)}. 「${typeLabel}」 타입은 조건을 그대로 판정하기 때문에, 이대로 저장하면 참가자가 무엇을 해도 이 미션은 달성되지 않아요. 이 필드를 빼고 다시 저장해주세요.`,
        warning: null,
      }
    }

    const pendingWarning = `아직 판정이 준비되지 않은 필드가 있어요 — ${labelKeys(blocking.pending)}. 「${typeLabel}」 타입은 진행값으로 달성을 판정하기 때문에 저장은 되지만, 이 필드는 달성 판정에 아무 영향도 주지 않아요. 조건에서 빼도 결과는 같아요.`
    return { error: null, warning: dbKeyWarning ? `${pendingWarning} ${dbKeyWarning}` : pendingWarning }
  }

  if (missionType === 'engine_condition') {
    const unjudged = Object.entries(condition as Record<string, unknown>)
      .filter(([key, value]) => value !== undefined && !ENGINE_CONDITION_JUDGED_KEYS.has(key))
      .map(([key]) => key)
    if (unjudged.length > 0) {
      return {
        error: null,
        warning: `아직 판정하지 않는 조건이 있어요 — ${labelKeys(unjudged)}. 저장은 되지만 이 조건은 달성 판정에 쓰이지 않아요. 판정하는 다른 조건이 없으면 이 미션은 완료되지 않을 수 있고, 다른 조건이 있으면 이 조건 없이 완료돼요.`,
      }
    }
  }

  if (dbKeyWarning) return { error: null, warning: dbKeyWarning }

  return OK
}

// ── 저장 검증: 조건 «값» (티켓 20260905_1327) ────────────────────────────
//
// 위 `checkMissionCondition`은 «키»만 본다(1141). 프로덕션 `item_collect` 6건은 키는
// 전부 유효(`badge_id`)한데 값이 `null`이라 `calculateProgress()`의
// `condition.badge_id && ownership.ownedBadgeIds.has(...)`가 좌변에서 항상 false를 반환해
// **영원히 미달성**이었다(1327 배경 조사). 값 검증은 의도적으로 별도 함수로 둔다 — 기존
// `checkMissionCondition` 테스트 다수가 "이 값이면 이 키가 허용되는지"만 확인하려고
// 다른 필드는 비워 둔 조건을 쓰는데(예: `{ poi_id: 'poi-1' }`만으로 `distance` 타입 검사),
// 값 검증까지 같은 함수에 합치면 그 조건들이 "필수 값 부재"로도 걸려 테스트 의도가
// 뒤섞인다. 두 함수를 라우트 층에서 순서대로(키 → 값) 호출해 연결한다.

/** 미션 고유 키(`count`·`badge_id`)는 배지 조건 레지스트리에 라벨이 없어 여기서 직접 붙인다 */
const MISSION_ONLY_KEY_LABEL: Record<string, string> = {
  count: '목표 횟수',
  badge_id: '목표 배지',
  jam_period_earned: '기간 동안 모은 잼',
}

function missionConditionValueLabel(key: string): string {
  return getConditionField(key)?.label ?? MISSION_ONLY_KEY_LABEL[key] ?? key
}

/**
 * 라벨 뒤에 붙일 "을/를" 조사. 라벨이 "목표 배지"(받침 없음)·"지점"(받침 있음)처럼
 * 받침 유무가 갈리므로 하드코딩한 "을"은 절반의 라벨에서 문법이 틀린다.
 */
function eulReul(label: string): '을' | '를' {
  const ch = label[label.length - 1]
  const code = ch?.charCodeAt(0) ?? 0
  if (code < 0xac00 || code > 0xd7a3) return '를'
  return (code - 0xac00) % 28 !== 0 ? '을' : '를'
}

/**
 * 미션 타입별로 달성 판정에 실제로 쓰이는 필드 하나 + 값 종류.
 *
 * **`checker.ts`의 `getTarget()`·`calculateProgress()`가 각 타입에서 읽는 키와 정확히
 * 일치해야 한다** — 여기서 새 목록을 따로 적으면 1141이 없앤 "허용 키 목록과 실제 평가
 * 로직의 불일치" 문제를 값 검증에서 재현한다. 이 매핑이 실제 로직과 어긋나지 않는지는
 * 컴파일 타임으로 보장할 수 없다(값의 존재 여부는 런타임 정보다) — 대신
 * `checker-logic.test.ts`의 "값 검증 필수 키 ↔ getTarget/calculateProgress 실측 일치"
 * 케이스가 `getTarget`·`evaluateMission`을 직접 호출해 이 표와 실제 로직이 같은 키를
 * 읽는지 대조한다.
 */
export interface MissionConditionValueRule {
  key: 'badge_id' | 'poi_id' | 'distance_km' | 'count' | 'streak_days' | 'duration_minutes' | 'elevation_gain_m'
  kind: 'uuid' | 'positive_number'
}

/**
 * `Partial`인 이유 — `engine_condition`(티켓 20260906_2231)은 여러 필드를 조합하는 복합
 * 조건이라 "달성 판정에 쓰이는 필드 하나"가 없다. 그래서 이 표에 규칙을 두지 않는다.
 * 다만 DB 기록 키 20개의 기준 값(횟수·개수·잼 양)은 `checkMissionConditionValue`가 따로 본다
 * (아래 `engineDbThresholdError`, 티켓 20261019_1445 4회). 형태·허용 키 검증은 `checkMissionCondition`(위)이 맡는다.
 */
export const MISSION_CONDITION_VALUE_RULE: Partial<Record<MissionType, MissionConditionValueRule>> = {
  item_collect: { key: 'badge_id', kind: 'uuid' },
  checkin: { key: 'poi_id', kind: 'uuid' },
  distance: { key: 'distance_km', kind: 'positive_number' },
  activity_count: { key: 'count', kind: 'positive_number' },
  streak_days: { key: 'streak_days', kind: 'positive_number' },
  duration_minutes: { key: 'duration_minutes', kind: 'positive_number' },
  elevation_gain_m: { key: 'elevation_gain_m', kind: 'positive_number' },
}

/** RFC4122 형태 검사만 한다 — 버전 비트까지는 보지 않는다(`notifications/feed.ts`의 UUID_RE와 동일 패턴) */
const MISSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 기준 값(임계값)이 따로 없는 DB 기록 키 — 레시피 id만 든 객체라 «얼마 이상인가»가 없다 */
const DB_KEYS_WITHOUT_THRESHOLD: ReadonlySet<string> = new Set<MissionDbConditionKey>(['recipe_first_success'])

/** 기준 값이 객체 안의 `count`인 DB 기록 키 — 값 모양은 배지 조건 레지스트리의 `input: 'object'` 정의를 따른다 */
const DB_KEYS_WITH_COUNT_FIELD: ReadonlySet<string> = new Set<MissionDbConditionKey>(['checkin_category_count', 'checkin_badge_count'])

/** 기준 값이 «1 이상의 정수»인가 — DB 기록 키는 모두 개수나 잼 양을 센다 */
function isPositiveIntegerThreshold(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function describeThreshold(value: unknown): string {
  if (value === undefined) return '비어 있음'
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value) ?? String(value)
}

/**
 * `engine_condition`의 DB 기록 키 20개(`MISSION_DB_CONDITION_KEY_LIST`) 기준 값 검사 (티켓 20261019_1445 4회).
 *
 * 검사 규칙이 없으면 0 이하의 값이 그대로 저장되고, 0이면 `actual >= 0`이라 첫 동기화에서 바로 완료된다(진행률의 목표도 0이 된다).
 * 소수나 숫자가 아닌 값은 비교가 어긋나거나(`"3"`은 숫자가 아니라 영원히 충족하지 못한다) 횟수로 셀 수 없다.
 * 모든 키가 개수나 잼 양이라 기준은 «1 이상의 정수»다. 객체형 `checkin_category_count`·`checkin_badge_count`는 안의 `count`를 본다.
 * `recipe_first_success`는 기준 값이 없어 건너뛴다. 문제가 있는 키를 한 번에 모두 알린다.
 */
function engineDbThresholdError(condition: Record<string, unknown>): string | null {
  const problems: string[] = []
  for (const key of MISSION_DB_CONDITION_KEY_LIST) {
    const raw = condition[key]
    if (raw === undefined || DB_KEYS_WITHOUT_THRESHOLD.has(key)) continue
    const label = `${missionConditionValueLabel(key)}(${key})`
    if (DB_KEYS_WITH_COUNT_FIELD.has(key)) {
      const count = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>).count : undefined
      if (!isPositiveIntegerThreshold(count)) problems.push(`${label}의 count: ${describeThreshold(count)}`)
      continue
    }
    if (!isPositiveIntegerThreshold(raw)) problems.push(`${label}: ${describeThreshold(raw)}`)
  }
  if (problems.length === 0) return null
  return `조건 JSON을 저장하지 못했어요. DB 기록으로 세는 조건의 기준 값이 올바르지 않아요 — ${problems.join(', ')}. 이 값은 횟수나 개수, 잼의 양이라 1 이상의 정수여야 해요. 0 이하면 참가하자마자 달성되고, 소수나 숫자가 아닌 값은 비교할 수 없어 달성되지 않아요. 1 이상의 정수로 고쳐서 다시 저장해주세요.`
}

/**
 * 미션 저장 전 `condition_json`의 «값» 검증. 순수 함수 — API 라우트(POST/PATCH)가
 * `checkMissionCondition`(키) 다음에 이 함수(값)를 순서대로 호출해 연결한다.
 *
 * - `item_collect`/`checkin`: 목표 대상(`badge_id`/`poi_id`)이 없거나 UUID 형태가 아니면 거부.
 * - 나머지 수치 타입(`distance`/`activity_count`/`streak_days`/`duration_minutes`/
 *   `elevation_gain_m`): 대응 키가 없거나(`?? 0` 폴백이 목표를 0으로 만들어 **즉시 달성**되는
 *   반대 방향 사고를 막는다) 0 이하이면 거부.
 * - **참조 무결성(그 UUID가 실제 배지·POI 행으로 존재하는지)은 이 함수의 범위 밖이다.**
 *   형태 검증만 하는 순수 함수로 유지한다 — 존재 여부 확인에는 DB 조회가 필요해 이 함수가
 *   서버 의존 함수가 되고, 파일 상단 주석의 "서버 의존 없는 배치" 원칙과 충돌한다. 존재하지
 *   않는 UUID를 저장하면 그 미션도 똑같이 영구 미달성되지만, 어드민이 목록에서 고르는 UI가
 *   아니라 자유 textarea로 입력하는 한 이 위험은 남는다 — 이 티켓(6건의 `null` 재발 방지)의
 *   범위 밖이라 후속 과제로 남긴다.
 * - `engine_condition`: 조건에 든 DB 기록 키의 기준 값이 1 이상의 정수가 아니면 거부(`engineDbThresholdError`, 티켓 20261019_1445 4회).
 *   그 밖의 필드 값은 검사하지 않는다.
 * - `condition`이 `undefined`(PATCH 부분 갱신)이거나 객체가 아니면 검사하지 않는다 — 형태
 *   검증은 `checkMissionCondition`의 책임이라 여기서 중복하지 않는다.
 * - 그 미션 타입에 대응 규칙이 없으면(존재하지 않는 값 — 방어적 처리) 통과시킨다.
 */
export function checkMissionConditionValue(
  missionType: MissionType,
  condition: unknown
): MissionConditionCheck {
  if (condition === undefined) return OK
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return OK

  if (missionType === 'engine_condition') {
    const thresholdError = engineDbThresholdError(condition as Record<string, unknown>)
    return thresholdError ? { error: thresholdError, warning: null } : OK
  }

  const rule = MISSION_CONDITION_VALUE_RULE[missionType]
  if (!rule) return OK

  const value = (condition as Record<string, unknown>)[rule.key]
  const label = missionConditionValueLabel(rule.key)
  const typeLabel = missionTypeLabel(missionType)

  if (rule.kind === 'uuid') {
    if (value === undefined || value === null) {
      return {
        error: `조건 JSON을 저장하지 못했어요. 「${typeLabel}」 타입은 ${label}${eulReul(label)} 지정해야 달성 여부를 판정할 수 있는데 비어 있어요. ${label}${eulReul(label)} 선택해서 다시 저장해주세요.`,
        warning: null,
      }
    }
    if (typeof value !== 'string' || !MISSION_UUID_RE.test(value)) {
      return {
        error: `조건 JSON을 저장하지 못했어요. ${label} 값의 형식이 올바르지 않아요. 목록에서 ${label}${eulReul(label)} 다시 선택해 저장해주세요.`,
        warning: null,
      }
    }
    return OK
  }

  // positive_number
  if (value === undefined) {
    return {
      error: `조건 JSON을 저장하지 못했어요. 「${typeLabel}」 타입은 ${label} 목표값을 지정해야 하는데 비어 있어요. ${label}에 0보다 큰 숫자를 넣어 다시 저장해주세요.`,
      warning: null,
    }
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return {
      error: `조건 JSON을 저장하지 못했어요. ${label} 값은 0보다 큰 숫자여야 하는데 지금은 ${JSON.stringify(value)}예요. 0보다 큰 숫자로 고쳐서 다시 저장해주세요.`,
      warning: null,
    }
  }
  return OK
}

// ── 컴파일 타임 동기화 체크 ──────────────────────────────────────────────
// `conditionRegistry.ts`의 `AssertAllConditionKeysCovered`와 같은 장치.
// `MissionCondition`(src/types/database.ts)에 필드를 추가했는데 그 키가 배지 조건 레지스트리에도
// 없고 위 `MISSION_ONLY_CONDITION_KEY_LIST`에도 없으면 여기서 컴파일 에러가 난다 —
// 「타입엔 있는데 허용 키 목록엔 없어서 저장이 막히거나 평가가 막히는」 어긋남을 구조적으로 차단한다.
type AssertNever<T extends never> = T
type MissingFromMissionAllowedKeys = Exclude<
  keyof MissionCondition,
  ConditionKey | MissionOnlyConditionKey
>
/** 허용 키 목록이 `MissionCondition`의 모든 필드를 커버하지 못하면 컴파일 에러가 난다 */
export type AssertAllMissionConditionKeysCovered = AssertNever<MissingFromMissionAllowedKeys>

// 반대 방향 — 배지 레지스트리에 이미 있는 키를 「미션 고유」로 중복 선언하면 컴파일 에러.
// (레지스트리에 그 키가 추가됐다면 이 목록에서 빼야 단일 출처가 유지된다)
type MissionOnlyKeyAlreadyInRegistry = Extract<MissionOnlyConditionKey, ConditionKey>
/** 미션 고유 키 목록에 배지 레지스트리와 겹치는 키가 있으면 컴파일 에러가 난다 */
export type AssertMissionOnlyKeysAreNotInRegistry = AssertNever<MissionOnlyKeyAlreadyInRegistry>

// DB 기록 키도 전부 배지 레지스트리의 키여야 한다 — 같은 이름·의미로 `BadgeCondition`과 값 모양을 공유한다.
type DbKeyNotInRegistry = Exclude<EngineDelegatedDbConditionKey, ConditionKey>
/** DB 기록 키 목록에 배지 레지스트리에 없는 키가 있으면 컴파일 에러가 난다 */
export type AssertDbKeysAreInRegistry = AssertNever<DbKeyNotInRegistry>

// DB 기록 키는 배지엔진 위임 키와 겹치면 안 된다 — 겹치면 같은 키를 배지엔진(활동 기록)과 DB 읽기가 둘 다 판정한다.
type DbKeyAlsoDelegated = Extract<EngineDelegatedDbConditionKey, EngineDelegatedConditionKey>
/** DB 기록 키 목록과 배지엔진 위임 키 목록이 겹치면 컴파일 에러가 난다 */
export type AssertDbKeysAreNotDelegated = AssertNever<DbKeyAlsoDelegated>

// 위임 키는 전부 배지 레지스트리의 키여야 한다 — 레지스트리에 없는 키를 위임하면 배지엔진이
// 「알 수 없는 필드」로 판정을 막는다(fail-closed). 어긋나면 여기서 컴파일 에러가 난다.
type DelegatedKeyNotInRegistry = Exclude<EngineDelegatedConditionKey, ConditionKey>
/** 위임 키 목록에 배지 레지스트리에 없는 키가 있으면 컴파일 에러가 난다 */
export type AssertDelegatedKeysAreInRegistry = AssertNever<DelegatedKeyNotInRegistry>
