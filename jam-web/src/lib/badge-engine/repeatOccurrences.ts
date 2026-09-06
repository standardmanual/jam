/**
 * 반복형(`repeat_count`)의 «회차» 계산 — 발급 판정과 진행 계산의 단일 출처
 * (v5 B1은 티켓 20260905_0030, 이 파일로의 분리는 티켓 20260905_0031)
 *
 * ## 왜 `index.ts`에서 나왔나 — 로직 변경 없는 순수 이동이다
 *
 * `collectRepeatOccurrences`는 원래 `index.ts`에 있었다. 그런데 진행 계산
 * (`badgeProgress.ts`)이 「N회 중 M회」 축을 그리려면 **같은 함수**를 봐야 한다 — 회차를
 * 두 번 세는 순간 「화면은 4/5인데 발급은 5회차를 인정」 같은 어긋남이 생긴다. 그리고
 * `badgeProgress.ts`는 클라이언트 세이프해야 하는데(`index.ts`는 최상단에서
 * `@/lib/supabase/server` → `next/headers`를 무조건 import한다) `index.ts`를 거치면
 * `npm run build`가 깨진다 — `activityFilters.ts` 분리 때와 **완전히 같은 이유**다
 * (티켓 20260904_0631 게이트 리뷰에서 실제로 재현된 실패).
 *
 * `index.ts`는 이 파일의 이름들을 그대로 import해 쓰고, 기존 소비처를 위해 다시 export한다.
 */
import type { BadgeCondition, DayOfWeek } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import { kmhToPaceSecPerKm } from '@/types/strava'
import { passesWalkingGate, matchesDayOfWeek, matchesDayOfWeekFilter, dedupeOnePerDay, inTimeRange, getMondayKey } from './activityFilters'
import { GATE_CONDITION_KEYS } from './crossGate'
import { PER_ACTIVITY_KEYS, CUMULATIVE_SAME_ACTIVITY_KEYS, type ScalarAxisKey } from './conditionAxes'

/** 활동 하나가 PER_ACTIVITY_KEYS + (weekly_count 없을 때의) time_range를 전부 만족하는지 */
export function matchesPerActivityCondition(condition: BadgeCondition, a: NormalizedActivity): boolean {
  if (condition.distance_km !== undefined && a.distanceKm < condition.distance_km) return false
  if (condition.elevation_gain_m !== undefined && a.elevationGainM < condition.elevation_gain_m) return false
  if (condition.duration_minutes !== undefined && a.movingTimeSec / 60 < condition.duration_minutes) return false
  if (condition.min_speed_kmh !== undefined && a.averageSpeedKmh < condition.min_speed_kmh) return false
  if (condition.max_pace_sec_per_km !== undefined && kmhToPaceSecPerKm(a.averageSpeedKmh) > condition.max_pace_sec_per_km) return false
  if (condition.temperature_min_c !== undefined) {
    if (a.weatherTempC == null || a.weatherTempC < condition.temperature_min_c) return false
  }
  if (condition.temperature_max_c !== undefined) {
    if (a.weatherTempC == null || a.weatherTempC > condition.temperature_max_c) return false
  }
  if (condition.weekend_duration_hours !== undefined) {
    const day = new Date(a.startDateLocal ?? a.startDate).getDay()
    const isWeekend = day === 0 || day === 6
    if (!isWeekend || a.movingTimeSec / 3600 < condition.weekend_duration_hours) return false
  }
  if (condition.time_range !== undefined && condition.weekly_count === undefined) {
    if (!inTimeRange(a, condition.time_range)) return false
  }
  // v5 스칼라 7종 (티켓 20260906_0110 ②) — 값이 없는(undefined) 활동은 «측정 안 됨»으로
  // 실패 처리한다(레지스트리 `activityField` 주석의 「데이터 없음 = 카운트 안 함」과 동일 태도).
  if (condition.max_elevation_m !== undefined) {
    if (a.maxElevationM === undefined || a.maxElevationM < condition.max_elevation_m) return false
  }
  if (condition.max_speed_kmh !== undefined) {
    if (a.maxSpeedKmh === undefined || a.maxSpeedKmh < condition.max_speed_kmh) return false
  }
  if (condition.single_distance_km !== undefined && a.distanceKm < condition.single_distance_km) return false
  if (condition.single_elevation_m !== undefined && a.elevationGainM < condition.single_elevation_m) return false
  if (condition.avg_heartrate_bpm !== undefined) {
    if (a.avgHeartrateBpm === undefined || a.avgHeartrateBpm < condition.avg_heartrate_bpm) return false
  }
  if (condition.avg_watts !== undefined) {
    if (a.avgWatts === undefined || a.avgWatts < condition.avg_watts) return false
  }
  if (condition.avg_cadence !== undefined) {
    if (a.avgCadence === undefined || a.avgCadence < condition.avg_cadence) return false
  }
  return true
}

/**
 * 회차 술어가 «소비하는» 조건 키. 여기 없는 키가 조건에 있으면 회차를 세지 않는다(fail-closed).
 *
 * ⚠️ **게이트 키는 예외다.** `prerequisite_badge_names`·교차 게이트 3종은 활동을 보는 술어가
 * 아니라 «유저가 무엇을 보유했는가»를 보는 별도 판정이며(`evaluateBadgeGates`), 회차 계산과는
 * 층이 다르다. 이 목록에 넣지 않으면 게이트가 붙은 반복형 배지의 회차가 통째로 0이 되어
 * **영원히 발급되지 않는다**(티켓 20260905_0030 B-10).
 *
 * ⚠️ **휴식 4종은 게이트와 다르다 — 이 목록에 넣지 않는다**(v5 B3, B-10). 게이트는
 * 「보유 여부」라 회차와 층이 다르지만, 휴식은 **이력 패턴 술어**라 넣는 순간 「휴식 조건을
 * 무시한 회차」가 세어진다. 조합 자체를 `evaluateConditionDetailed`가 「회차와 함께 쓸 수 없는
 * 조건」으로 먼저 막으므로 이 경로에 휴식 키가 도달하지 않는다.
 */
const CONSUMED_REPEAT_KEYS: ReadonlySet<string> = new Set<string>([
  'repeat_count',
  'activity_type',
  'day_of_week',
  'same_activity',
  'time_range',
  ...PER_ACTIVITY_KEYS,
  ...CUMULATIVE_SAME_ACTIVITY_KEYS,
  ...GATE_CONDITION_KEYS,
])

/**
 * 회차 술어가 다루지 못하는 조건 키 목록. 하나라도 있으면 회차는 0이다(fail-closed).
 *
 * `collectRepeatOccurrences`가 이 판정으로 회차를 0으로 떨어뜨리고, `badgeProgress.ts`의
 * 분류(`classifyBadgeProgressKind`)는 **같은 함수**로 「진행률을 그리지 않는다」를 결정한다 —
 * 두 곳이 각자 목록을 들면 「화면엔 3/5회가 뜨는데 발급은 0회차로 막힌 상태」가 된다.
 * 분류 쪽은 경고를 찍지 않으려고 이 함수를 직접 부른다(배지 × 유저마다 로그가 폭발한다).
 */
export function unconsumedRepeatConditionKeys(condition: BadgeCondition): string[] {
  return Object.entries(condition)
    .filter(([k, v]) => v !== undefined && !CONSUMED_REPEAT_KEYS.has(k))
    .map(([k]) => k)
}

/**
 * 회차 술어가 «활동 1건 단위 조건으로 실제로 흡수하는» 수치 축 키 (티켓 20260905_0031 재시도).
 *
 * `CONSUMED_REPEAT_KEYS`(위)와 다르다. 저 목록은 「이 키가 있어도 회차를 셀 수 있는가」를
 * 묻고, 이 함수는 「그 키가 회차 축에 흡수되는가」를 묻는다. `distance_km`/
 * `elevation_gain_m`이 정확히 이 둘 사이에서 갈린다 — `same_activity`가 없으면 **누적 합계로
 * 따로 평가되는 독립 축**이라 회차 축이 흡수하지 못한다. 그런데도 회차를 세는 것 자체는
 * 막지 않으므로(막으면 `{repeat_count, distance_km}` 배지가 영원히 발급되지 않는다)
 * `CONSUMED_REPEAT_KEYS`에는 무조건 들어 있다.
 *
 * 그 차이를 모른 채 진행률을 그리면 「회차 5/5 = 100%」 옆에서 1,000km 축이 사라진다 —
 * `badgeProgress.ts`가 이 함수로 그 경우를 `unsupported`로 떨어뜨린다.
 *
 * 아래 ③이 이 함수의 결과로 술어를 조립한다 — **흡수 목록이 한 곳뿐이라** 두 판단이 갈라질 수 없다.
 */
export function repeatConsumedAxisKeys(condition: BadgeCondition): readonly ScalarAxisKey[] {
  return condition.same_activity === true
    ? [...PER_ACTIVITY_KEYS, ...CUMULATIVE_SAME_ACTIVITY_KEYS]
    : PER_ACTIVITY_KEYS
}

// ── 기간 단위 회차 (티켓 20260906_0110 ②) ───────────────────────────────
//
// `streak_days`·`weekly_count`·`monthly_count`·`weekly_streak`는 활동 «1건»이 아니라
// **날짜·주·달 단위 기간**이 조건을 만족하는가를 본다 — `matchesPerActivityCondition`으로는
// 표현할 수 없다(그 함수는 활동 한 건의 스칼라 값만 비교한다). 이 네 키가 `repeat_count`와
// 만나면 「그 기간 조건을 몇 번 채웠는가」를 세야 하므로 전용 계산이 필요하다.
//
// 넷은 서로 배타적이라고 가정한다(현재 카탈로그 실측 — 한 조건에 최대 하나만 등장한다).
// `activity_type`·`day_of_week`(필터)·`repeat_count` 외의 다른 키가 섞이면(현재 없음)
// **안전하게 폴백한다** — 아래 `detectPeriodOccurrenceDriver`가 `undefined`를 돌려주고,
// 그 키는 `CONSUMED_REPEAT_KEYS`에도 없으므로 기존 ⓪ 경로가 fail-closed로 회차를 0으로 막는다.

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

function dateKeyOf(a: NormalizedActivity): string {
  return (a.startDateLocal ?? a.startDate).slice(0, 10)
}
function weekKeyOf(a: NormalizedActivity): string {
  return getMondayKey(new Date(a.startDateLocal ?? a.startDate))
}
function monthKeyOf(a: NormalizedActivity): string {
  const d = new Date(a.startDateLocal ?? a.startDate)
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

/** activity_type 필터 + 걷기 축1 게이트 — 다른 술어들과 같은 규칙 */
function typeFilteredPool(condition: BadgeCondition, activities: NormalizedActivity[]): NormalizedActivity[] {
  return condition.activity_type
    ? activities.filter(
        (a) => a.jamActivityType === condition.activity_type && (condition.activity_type !== 'walking' || passesWalkingGate(a))
      )
    : activities
}

/**
 * 정렬된 고유 기간 키 배열에서 `stepMs` 간격으로 이어지는 최대 런(run)들을 찾아, `minLength`
 * 이상인 런마다 **그 런이 minLength에 처음 도달한 키** 하나씩을 돌려준다 — 런 하나 = 회차 하나.
 * (한 번의 아주 긴 런이 `floor(길이/minLength)`만큼 여러 회차로 쪼개지지 않는다 — 「몇 번
 * 다시 해냈는가」를 세는 것이지 「총 길이를 minLength로 나눈 몫」을 세는 것이 아니다.)
 */
function findRunThresholdKeys(sortedKeys: readonly string[], stepMs: number, minLength: number): string[] {
  const hits: string[] = []
  let runStart = 0
  for (let i = 1; i <= sortedKeys.length; i++) {
    const broke = i === sortedKeys.length || Date.parse(`${sortedKeys[i]}T00:00:00Z`) - Date.parse(`${sortedKeys[i - 1]}T00:00:00Z`) !== stepMs
    if (broke) {
      const runLen = i - runStart
      if (runLen >= minLength) hits.push(sortedKeys[runStart + minLength - 1])
      runStart = i
    }
  }
  return hits
}

/** 대표 활동 하나를 뽑아 시간순으로 정렬한다 — earn_history·selectTriggerActivity가 기대하는 형태 */
function toSortedOccurrences(reps: NormalizedActivity[]): NormalizedActivity[] {
  return [...reps].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
}

/** `streak_days` + `repeat_count` — 「N일 연속」이 몇 번 (다시) 만들어졌는가 */
function collectStreakDayOccurrences(condition: BadgeCondition, activities: NormalizedActivity[]): NormalizedActivity[] {
  const minLength = condition.streak_days as number
  const pool = typeFilteredPool(condition, activities)
  const byDate = new Map<string, NormalizedActivity[]>()
  for (const a of pool) {
    const key = dateKeyOf(a)
    const list = byDate.get(key)
    if (list) list.push(a)
    else byDate.set(key, [a])
  }
  const sortedKeys = [...byDate.keys()].sort()
  const hitKeys = findRunThresholdKeys(sortedKeys, DAY_MS, minLength)
  return toSortedOccurrences(
    hitKeys.map((k) => byDate.get(k)!.reduce((first, a) => (a.startDate < first.startDate ? a : first)))
  )
}

/** `weekly_streak` + `repeat_count` — 「N주(월~일) 연속 활동」이 몇 번 (다시) 만들어졌는가 */
function collectWeeklyStreakOccurrences(condition: BadgeCondition, activities: NormalizedActivity[]): NormalizedActivity[] {
  const minLength = condition.weekly_streak as number
  let pool = typeFilteredPool(condition, activities)
  if (condition.day_of_week !== undefined) pool = pool.filter((a) => matchesDayOfWeekFilter(a, condition.day_of_week!))
  const byWeek = new Map<string, NormalizedActivity[]>()
  for (const a of pool) {
    const key = weekKeyOf(a)
    const list = byWeek.get(key)
    if (list) list.push(a)
    else byWeek.set(key, [a])
  }
  const sortedKeys = [...byWeek.keys()].sort()
  const hitKeys = findRunThresholdKeys(sortedKeys, WEEK_MS, minLength)
  return toSortedOccurrences(
    hitKeys.map((k) => byWeek.get(k)!.reduce((first, a) => (a.startDate < first.startDate ? a : first)))
  )
}

/**
 * `weekly_count`/`monthly_count` + `repeat_count` — 그 주기(주/달)의 활동 횟수 임계값을
 * 채운 기간이 몇 번 있었는가. 기간은 원래 서로 겹치지 않으므로(연속일 필요 없음) «런» 개념이
 * 필요 없다 — 임계값을 채운 기간마다 대표 활동 하나씩.
 */
function collectPeriodCountOccurrences(
  condition: BadgeCondition,
  activities: NormalizedActivity[],
  periodKeyFn: (a: NormalizedActivity) => string,
  threshold: number
): NormalizedActivity[] {
  const pool = typeFilteredPool(condition, activities)
  // 걷기 하루 1회 상한 — index.ts의 weekly_count 블록과 동일 규칙(월간도 같은 규칙을 따른다)
  const capped = condition.activity_type === 'walking' ? dedupeOnePerDay(pool) : pool
  const byPeriod = new Map<string, NormalizedActivity[]>()
  for (const a of capped) {
    const key = periodKeyFn(a)
    const list = byPeriod.get(key)
    if (list) list.push(a)
    else byPeriod.set(key, [a])
  }
  const reps: NormalizedActivity[] = []
  for (const acts of byPeriod.values()) {
    if (acts.length >= threshold) {
      // 그 기간을 «채운» 시점 — 마지막(=임계값을 완성한) 활동을 대표로 삼는다
      reps.push(acts.reduce((last, a) => (a.startDate > last.startDate ? a : last)))
    }
  }
  return toSortedOccurrences(reps)
}

type PeriodOccurrenceCollector = (condition: BadgeCondition, activities: NormalizedActivity[]) => NormalizedActivity[]

const PERIOD_DRIVER_KEYS = ['streak_days', 'weekly_count', 'monthly_count', 'weekly_streak'] as const

/**
 * 조건이 기간 단위 회차 계산이 필요한 형태인지 판단해 계산 함수를 고른다.
 *
 * **엄격하게 좁힌다** — `activity_type`·`day_of_week`·`repeat_count` 외의 다른 키가 하나라도
 * 더 있으면(현재 카탈로그엔 없는 조합) `undefined`를 돌려준다. 잘못 짐작해서 세는 것보다
 * 「모르는 조합은 안전하게 막는다」가 이 파일 전체의 원칙이다(위 헤더 주석).
 */
function detectPeriodOccurrenceDriver(condition: BadgeCondition): PeriodOccurrenceCollector | undefined {
  if (condition.repeat_count === undefined) return undefined
  const ALLOWED_COMPANIONS = new Set<string>(['repeat_count', 'activity_type', 'day_of_week'])
  const extraKeys = Object.entries(condition)
    .filter(([k, v]) => v !== undefined && !ALLOWED_COMPANIONS.has(k))
    .map(([k]) => k)
  if (extraKeys.length !== 1) return undefined
  const driver = extraKeys[0]
  if (!(PERIOD_DRIVER_KEYS as readonly string[]).includes(driver)) return undefined

  switch (driver as (typeof PERIOD_DRIVER_KEYS)[number]) {
    case 'streak_days':
      return collectStreakDayOccurrences
    case 'weekly_streak':
      return collectWeeklyStreakOccurrences
    case 'weekly_count':
      return (c, activities) => collectPeriodCountOccurrences(c, activities, weekKeyOf, c.weekly_count as number)
    case 'monthly_count':
      return (c, activities) => collectPeriodCountOccurrences(c, activities, monthKeyOf, c.monthly_count as number)
  }
}

/**
 * 조건이 `detectPeriodOccurrenceDriver`가 다루는 «기간 단위 회차» 형태인지 — 진행 계산
 * (`badgeProgress.ts`의 `classifyConditionKind`)이 발급과 같은 판단을 하기 위한 공개 창구다.
 *
 * ⚠️ **이 판정이 `unconsumedRepeatConditionKeys` 앞에 와야 한다.** `streak_days`·
 * `weekly_count`·`monthly_count`·`weekly_streak`는 `CONSUMED_REPEAT_KEYS`(위)에 없다 —
 * 활동 1건 단위 술어가 아니라 이 파일의 전용 계산(`collectPeriodCountOccurrences` 등)이
 * 따로 흡수하기 때문이다. `unconsumedRepeatConditionKeys`만 보면 이 네 키가 매번
 * 「회차 술어가 못 다루는 키」로 잘못 잡혀 `{repeat_count, streak_days}` 같은 정상 조합도
 * `unsupported`로 떨어진다 — 발급(`collectRepeatOccurrences`)은 이 함수를 먼저 확인해
 * 정상 발급되는데 화면엔 「진행 표시 준비 중」이 남는 어긋남이 생긴다(티켓 20260906_0110 ②
 * 개선 리뷰 실측: `repeat_count + streak_days` 14계열·`repeat_count + weekly_count` 3계열).
 *
 * 참이면 `unabsorbedAxisKeys` 검사도 건너뛰어도 안전하다 — `detectPeriodOccurrenceDriver`
 * 자체가 이미 「드라이버 키 하나 + 허용된 동반 키(`activity_type`·`day_of_week`·
 * `repeat_count`)뿐」을 엄격하게 강제하므로, 그 밖의 축이 조건에 섞여 들어올 여지가 없다.
 */
export function isPeriodDrivenRepeatCondition(condition: BadgeCondition): boolean {
  return detectPeriodOccurrenceDriver(condition) !== undefined
}

/**
 * 반복형의 «회차» 목록 — **활동 1건이 조건을 통째로 만족**한 활동을 시간순으로 돌려준다.
 * (v5 B1, 티켓 20260905_0030 §2)
 *
 * `total_count`와의 차이가 이 함수의 존재 이유다. `total_count`는 «필터를 통과한 활동 수»만
 * 세므로 `{ duration_minutes: 60, total_count: 5 }`는 「60분 이상 활동이 1건 있고, 활동이 총
 * 5회」로 평가된다(수치 필드는 이력 전반에서 독립 평가되기 때문). `repeat_count`는
 * 「60분 이상 활동이 5건」이어야 하므로 활동 단위 술어가 따로 필요하다.
 *
 * ⚠️ **조건 평가(`evaluateConditionDetailed`) · 카운터 증가(`evaluateBadgesDetailed`) ·
 * 진행 계산(`badgeProgress.ts`)이 이 함수 하나를 공유해야 한다.** 세 곳이 각자 회차를 세면
 * 「발급은 됐는데 카운터는 안 오른다」·「화면은 다 찼는데 발급은 안 된다」 같은 어긋남이
 * 생긴다. 그래서 앞의 두 곳은 **필터를 거치지 않은 원본 활동 배열**을 그대로 넘긴다.
 */
export function collectRepeatOccurrences(
  condition: BadgeCondition,
  activities: NormalizedActivity[]
): NormalizedActivity[] {
  // ⓪-a 기간 단위 회차(streak_days·weekly_count·monthly_count·weekly_streak) — 활동 1건
  //     단위 술어와 완전히 다른 계산이 필요해 가장 먼저 갈라진다(위 헤더 주석, 티켓 20260906_0110 ②).
  const periodCollector = detectPeriodOccurrenceDriver(condition)
  if (periodCollector) return periodCollector(condition, activities)

  // ⓪-b 회차 술어가 «소비하지 않는 키»가 조건에 있으면 회차를 세지 않는다 (fail-closed).
  //
  //    아래 ①~③은 자기가 아는 키만 술어로 조립하고 나머지는 조용히 무시한다. 그래서
  //    `{ season: 'winter', duration_minutes: 60, repeat_count: 5 }`는 계절 필터가 빠진 채
  //    「60분 이상 활동 5건」으로 세어져 **회차가 실제보다 많이 잡힌다** — 조건 평가의
  //    fail-closed(모르는 키가 있으면 발급을 막는다)와 정반대 방향이다.
  //    v5 스칼라 7종을 'engine'으로 뒤집는 순간(티켓 0035 선행 작업) 실제로 성립하므로
  //    미리 막는다(티켓 20260905_0030 B1 개선 리뷰).
  const unconsumed = unconsumedRepeatConditionKeys(condition)
  if (unconsumed.length > 0) {
    console.warn(
      `[badge-engine] 회차 술어가 다루지 못하는 조건 필드 — 회차 0으로 처리: ${unconsumed.join(', ')}`
    )
    return []
  }

  // ① 종목 필터 + 걷기 축1 게이트 — evaluateConditionDetailed의 `filtered`와 같은 규칙
  const pool = condition.activity_type
    ? activities.filter(
        (a) =>
          a.jamActivityType === condition.activity_type &&
          (condition.activity_type !== 'walking' || passesWalkingGate(a))
      )
    : activities

  // ② 요일 단일값 필터 (배열 + total_count 조합은 「요일별 독립 카운터」라 반복형과 섞지 않는다)
  const dayFiltered =
    condition.day_of_week !== undefined && !Array.isArray(condition.day_of_week)
      ? pool.filter((a) => matchesDayOfWeek(a, condition.day_of_week as DayOfWeek))
      : pool

  // ③ 회차 술어 — 조건에 실제로 든 «활동 1건 단위» 필드만 모아 부분 조건을 만든다.
  //    distance_km/elevation_gain_m은 기본이 «누적 합계»라 여기 들어오지 않는다.
  //    same_activity:true일 때만 합류한다(기존 규칙 그대로 — `repeatConsumedAxisKeys`가
  //    그 규칙의 단일 출처이며, 진행 계산도 같은 함수로 「흡수되는가」를 판단한다).
  const occurrenceCondition: Record<string, unknown> = {}
  for (const k of repeatConsumedAxisKeys(condition)) {
    if (condition[k] !== undefined) occurrenceCondition[k] = condition[k]
  }
  if (condition.time_range !== undefined && condition.weekly_count === undefined) {
    occurrenceCondition.time_range = condition.time_range
  }

  const matched = dayFiltered.filter((a) => matchesPerActivityCondition(occurrenceCondition as BadgeCondition, a))

  // ④ 걷기 하루 1회 상한 — 걷기 배지 v4 정책(같은 날 여러 번 걸어도 1회)을 회차에도 적용한다
  const capped = condition.activity_type === 'walking' ? dedupeOnePerDay(matched) : matched

  // 시간순 고정 — earn_history 순서와 「임계값을 넘긴 회차」 선정이 호출 순서에 좌우되지 않게 한다
  return [...capped].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
}
