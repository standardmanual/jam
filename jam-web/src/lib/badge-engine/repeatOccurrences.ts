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
import {
  passesWalkingGate,
  matchesDayOfWeek,
  matchesDayOfWeekFilter,
  dedupeOnePerDay,
  inTimeRange,
  getMondayKey,
  // 휴식 4종 + repeat_count 조합(티켓 20260906_2056) — 사건 하나를 활동 기반이 아니라
  // 활동 "사이의 간격"(RestInterval)으로 세야 하므로, evaluateRestConditions와 같은 눈으로
  // 구간을 만드는 이 세 조각을 그대로 가져다 쓴다. 둘이 각자 구간을 만들면 「진행률은
  // 3/5회인데 발급은 4회차를 인정」 같은 어긋남이 생긴다.
  restConditionKeysIn,
  restConsumedPairKeys,
  restPool,
  buildRestIntervals,
  isPositiveDays,
  type RestConditionKey,
  type RestInterval,
  // distinct_time_bands + streak_days 조합(walking:A3, 티켓 20260908_1318)의 창 안 판정에 쓴다.
  countDistinctTimeBands,
} from './activityFilters'
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
 * 무시한 회차」가 세어진다. 휴식 키가 «정확히 하나»면 아래 `detectRestOccurrenceDriver`가
 * 먼저 가로채 전용 계산으로 보내므로(티켓 20260906_2056), 이 목록에 여전히 없어도 그 조합은
 * 이 경로(활동 1건 단위 술어)에 도달하지 않는다. 휴식 키가 둘 이상이면 "사건 하나"의 경계가
 * 정의되지 않아(§B-10 재설계) `evaluateConditionDetailed`가 여전히 먼저 막는다.
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

/** 런(run) 하나가 `minLength`에 처음 도달한 지점 — 그 지점의 키와, 그 지점까지 채운 창(윈도우) 전체 키 */
type RunHit = { hitKey: string; windowKeys: string[] }

/**
 * 정렬된 고유 기간 키 배열에서 `stepMs` 간격으로 이어지는 최대 런(run)들을 찾아, `minLength`
 * 이상인 런마다 **그 런이 minLength에 처음 도달한 키**와 그 창을 채운 `minLength`개의 키를
 * 돌려준다 — 런 하나 = 회차 하나. (한 번의 아주 긴 런이 `floor(길이/minLength)`만큼 여러
 * 회차로 쪼개지지 않는다 — 「몇 번 다시 해냈는가」를 세는 것이지 「총 길이를 minLength로
 * 나눈 몫」을 세는 것이 아니다.)
 *
 * `windowKeys`는 `distinct_time_bands` + `streak_days` 조합(walking:A3, 티켓 20260908_1318)이
 * "그 스트릭 창 안에서" 서로 다른 시간대를 세야 해서 추가됐다 — 그 전까지는 `hitKey`만 썼다.
 */
function findRunThresholdKeys(sortedKeys: readonly string[], stepMs: number, minLength: number): RunHit[] {
  const hits: RunHit[] = []
  let runStart = 0
  for (let i = 1; i <= sortedKeys.length; i++) {
    const broke = i === sortedKeys.length || Date.parse(`${sortedKeys[i]}T00:00:00Z`) - Date.parse(`${sortedKeys[i - 1]}T00:00:00Z`) !== stepMs
    if (broke) {
      const runLen = i - runStart
      if (runLen >= minLength) {
        const hitIndex = runStart + minLength - 1
        hits.push({ hitKey: sortedKeys[hitIndex], windowKeys: sortedKeys.slice(runStart, hitIndex + 1) })
      }
      runStart = i
    }
  }
  return hits
}

/** 대표 활동 하나를 뽑아 시간순으로 정렬한다 — earn_history·selectTriggerActivity가 기대하는 형태 */
function toSortedOccurrences(reps: NormalizedActivity[]): NormalizedActivity[] {
  return [...reps].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
}

/**
 * `streak_days` + `repeat_count` — 「N일 연속」이 몇 번 (다시) 만들어졌는가.
 *
 * `distinct_time_bands`가 함께 있으면(walking:A3 「리듬 브레이커」, 티켓 20260908_1318) 그
 * minLength일 창 **안의** 활동만으로 서로 다른 시간대 수를 세어, 미달인 런은 회차에서 뺀다 —
 * "사흘 내리 시간대를 흔들었다"는 그 3일 창 자체의 성질이지 이력 전체의 성질이 아니다.
 */
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
  let runs = findRunThresholdKeys(sortedKeys, DAY_MS, minLength)
  if (condition.distinct_time_bands !== undefined) {
    const requiredBands = condition.distinct_time_bands
    runs = runs.filter((r) => {
      const windowActivities = r.windowKeys.flatMap((k) => byDate.get(k) ?? [])
      return countDistinctTimeBands(windowActivities) >= requiredBands
    })
  }
  return toSortedOccurrences(
    runs.map((r) => byDate.get(r.hitKey)!.reduce((first, a) => (a.startDate < first.startDate ? a : first)))
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
  const runs = findRunThresholdKeys(sortedKeys, WEEK_MS, minLength)
  return toSortedOccurrences(
    runs.map((r) => byWeek.get(r.hitKey)!.reduce((first, a) => (a.startDate < first.startDate ? a : first)))
  )
}

/**
 * `activities_within_hours` + `repeat_count` — 「hours시간 안에 count회」를 몇 번 (다시)
 * 채웠는가 (walking:A4 「스물넷의 산책」, 티켓 20260908_1318).
 *
 * `startDate`(UTC) 기준 슬라이딩 윈도우로 창이 처음 count에 도달한 활동을 회차로 잡고,
 * 그 직후 창을 리셋한다(`findRunThresholdKeys`의 런 개념과 같은 태도 — 겹치는 창을 여러
 * 회차로 중복 세지 않는다). 걷기 하루 1회 상한은 **적용하지 않는다** — 하루에 여러 번
 * 하는 것이 이 배지의 핵심 의도다(index.ts의 독립 평가 블록과 같은 예외).
 */
function collectActivitiesWithinHoursOccurrences(condition: BadgeCondition, activities: NormalizedActivity[]): NormalizedActivity[] {
  const spec = condition.activities_within_hours
  if (
    !spec ||
    typeof spec.hours !== 'number' || !Number.isFinite(spec.hours) || spec.hours <= 0 ||
    typeof spec.count !== 'number' || !Number.isFinite(spec.count) || spec.count < 1
  ) {
    return []
  }
  let pool = typeFilteredPool(condition, activities)
  if (condition.day_of_week !== undefined && !Array.isArray(condition.day_of_week)) {
    pool = pool.filter((a) => matchesDayOfWeek(a, condition.day_of_week as DayOfWeek))
  }
  const sorted = [...pool].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const windowMs = spec.hours * 60 * 60 * 1000
  const hits: NormalizedActivity[] = []
  let left = 0
  for (let right = 0; right < sorted.length; right++) {
    while (Date.parse(sorted[right].startDate) - Date.parse(sorted[left].startDate) > windowMs) left++
    if (right - left + 1 >= spec.count) {
      hits.push(sorted[right])
      left = right + 1 // 창을 채운 순간 리셋 — 다음 회차는 새 창에서 시작한다(겹침 중복 카운트 방지)
    }
  }
  return toSortedOccurrences(hits)
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
 * **엄격하게 좁힌다** — `activity_type`·`day_of_week`·`repeat_count`·게이트 3종
 * (`GATE_CONDITION_KEYS`) 외의 다른 키가 하나라도 더 있으면(현재 카탈로그엔 없는 조합)
 * `undefined`를 돌려준다. 잘못 짐작해서 세는 것보다 「모르는 조합은 안전하게 막는다」가
 * 이 파일 전체의 원칙이다(위 헤더 주석).
 *
 * ⚠️ **게이트 키는 예외다**(티켓 20260908_1438). 게이트는 「보유 여부」만 보는 별도 판정이라
 * (위 91행 `CONSUMED_REPEAT_KEYS` 주석과 동일 근거) 기간 단위 회차 계산 자체에는 관여하지
 * 않는다. 여기 넣지 않으면 `streak_days`/휴식 키에 게이트가 붙은 조합(주로 Epic·Mystic)의
 * 회차가 통째로 0이 되어 영원히 발급되지 않는다(전수 감사 실측: cycling:N1 epic/mystic 등
 * 26계열 49종).
 */
function detectPeriodOccurrenceDriver(condition: BadgeCondition): PeriodOccurrenceCollector | undefined {
  if (condition.repeat_count === undefined) return undefined
  const ALLOWED_COMPANIONS = new Set<string>(['repeat_count', 'activity_type', 'day_of_week', ...GATE_CONDITION_KEYS])
  const extraKeys = Object.entries(condition)
    .filter(([k, v]) => v !== undefined && !ALLOWED_COMPANIONS.has(k))
    .map(([k]) => k)

  // `streak_days` + `distinct_time_bands` 조합(walking:A3, 티켓 20260908_1318) — 다른
  // 드라이버와 달리 여기만 driver 키가 둘이다. 이 조합 하나만 예외로 허용하고 다른 결합은
  // 여전히 막는다(이 파일의 「모르는 조합은 안전하게 막는다」 원칙, 위 헤더 주석).
  if (extraKeys.length === 2 && extraKeys.includes('streak_days') && extraKeys.includes('distinct_time_bands')) {
    return collectStreakDayOccurrences
  }

  if (extraKeys.length !== 1) return undefined
  const driver = extraKeys[0]

  // `activities_within_hours` + `repeat_count` 조합(walking:A4, 티켓 20260908_1318) —
  // `PERIOD_DRIVER_KEYS`(날짜·주·달 단위 기간)와 성격이 달라 별도 분기로 둔다.
  if (driver === 'activities_within_hours') return collectActivitiesWithinHoursOccurrences

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

// ── 휴식 4종 + repeat_count (티켓 20260906_2056, §B-10 재설계) ───────────────
//
// `0030`은 이 조합을 의도적으로 막았다 — 휴식은 활동 1건 단위 술어가 아니라 **이력 패턴**
// (활동 사이의 간격)이라, `CONSUMED_REPEAT_KEYS`에 넣고 `matchesPerActivityCondition`으로
// 세면 "휴식 조건을 무시한 회차"가 세어진다(§B-10). 그래서 기간 단위 회차(위 ⓪-a)와 같은
// 자리에서 **완전히 별도 계산**으로 처리한다.
//
// ## 사건(occurrence)의 경계 — activityFilters의 `RestInterval` 하나 = 사건 하나
//
// `evaluateRestConditions`가 이미 이력을 인접한 두 활동일 사이의 **닫힌 구간**(`RestInterval`)
// 목록으로 쪼갠다. 구간 하나는 정확히 (직전 활동일, 복귀일) 한 쌍만 가리키는 원자적 단위다 —
// 그 앞의 스트릭이 아무리 길어도, 그 뒤의 공백이 아무리 길어도 "그 한 번의 물리적 전환"은
// 항상 구간 하나로만 표현된다. 그래서 `collectStreakDayOccurrences`(위)가 "런 하나가 여러
// 회차로 쪼개지지 않게" `findRunThresholdKeys`로 따로 막아야 했던 문제가 여기엔 없다 —
// 구간 자체가 이미 쪼갤 수 없는 단위이기 때문이다. `evaluateRestConditions`가 "그런 구간이
// 하나라도 있는가"만 묻는 데 비해, 여기서는 그 구간들 중 조건을 만족하는 것을 전부 세고
// (같은 eligible·threshold 판정을 그대로 재사용한다), 그 개수가 곧 사건 수다.
//
// ## 휴식 키가 «정확히 하나»일 때만 지원한다
//
// 서로 다른 두 휴식 키(예: `rest_after_streak` + `return_gap_days`)가 `repeat_count`와
// 함께 오면 "사건 하나"가 같은 구간에서 두 키를 동시에 만족해야 하는지, 각 키가 독립적으로
// 다른 구간에서 만족해도 되는지가 정의돼 있지 않다. `evaluateRestConditions`의 단발 판정도
// 이 경우 각 키가 독립적으로 자기 구간을 찾아 AND로 묶을 뿐(§ 388 이하 `evaluateRestConditions`
// 참조), "사건 하나"로 셀 방법을 정의하지 않는다. 구현 착수 시 전수 조사한 현재 카탈로그에는
// 이런 조합이 없다(완료 기록 참고) — 있더라도 사건 경계가 모호하므로 안전하게 막는다
// (fail-closed, `detectPeriodOccurrenceDriver`와 같은 태도). `evaluateConditionDetailed`가
// 이 판정(`isRestDrivenRepeatCondition`)이 거짓일 때 여전히 「회차와 함께 쓸 수 없는 조건」으로
// 막는다.

// ⚠️ 게이트 키는 예외다(티켓 20260908_1438) — 위 `detectPeriodOccurrenceDriver`의
// `ALLOWED_COMPANIONS`와 동일 근거. 게이트는 「보유 여부」만 보는 별도 판정이라 휴식-회차
// 계산에는 관여하지 않는다. 빠져 있으면 휴식 키+게이트 조합의 회차가 통째로 0이 된다.
const REST_OCCURRENCE_ALLOWED_COMPANIONS: ReadonlySet<string> = new Set<string>([
  'repeat_count',
  'activity_type',
  'day_of_week',
  ...GATE_CONDITION_KEYS,
])

/** 조건이 휴식-회차 전용 계산이 필요한 형태인지 판단해 드라이버 키를 고른다 (엄격하게 좁힌다) */
function detectRestOccurrenceDriver(condition: BadgeCondition): RestConditionKey | undefined {
  if (condition.repeat_count === undefined) return undefined
  const restKeys = restConditionKeysIn(condition)
  if (restKeys.length !== 1) return undefined // 휴식 키 2개 이상 — 사건 경계 미정의, 폴백
  const driver = restKeys[0]
  if (!isPositiveDays(condition[driver])) return undefined // 형태 오류 — 아래에서 다시 막힌다

  // 짝 필드(streak_days·single_distance_km·duration_minutes)는 휴식 술어가 실제로 읽으므로
  // 허용 동반 키에 합류한다 — `restConsumedPairKeys`가 그 목록의 단일 출처다. 드라이버 키
  // 자신(예: rest_after_streak)도 당연히 조건에 있으므로 허용 목록에 넣는다.
  const allowed = new Set<string>([driver, ...REST_OCCURRENCE_ALLOWED_COMPANIONS, ...restConsumedPairKeys(condition)])
  const extraKeys = Object.entries(condition)
    .filter(([k, v]) => v !== undefined && !allowed.has(k))
    .map(([k]) => k)
  if (extraKeys.length > 0) return undefined

  return driver
}

/**
 * 조건이 `detectRestOccurrenceDriver`가 다루는 «휴식-회차» 형태인지 — `evaluateConditionDetailed`의
 * 회차 차단 분기와 `badgeProgress.ts`의 `classifyConditionKind`가 같은 판단을 하기 위한 공개 창구다.
 */
export function isRestDrivenRepeatCondition(condition: BadgeCondition): boolean {
  return detectRestOccurrenceDriver(condition) !== undefined
}

/**
 * 휴식 조건을 만족한 «복귀 사건» 목록 — 시간순.
 *
 * `evaluateRestConditions`의 짝 필드 검사(①③)와 같은 검사를 여기서도 한다 — 이 함수가
 * 순수 함수로 단독 호출될 수 있고(진행 계산), 값의 형태를 믿을 수 없으면 「사건이 있다」로
 * 잘못 새지 않아야 한다.
 */
function collectRestOccurrences(
  driverKey: RestConditionKey,
  condition: BadgeCondition,
  activities: NormalizedActivity[],
  anchorDate?: string
): NormalizedActivity[] {
  if (!isPositiveDays(condition[driverKey])) return []
  if (driverKey === 'rest_after_streak' && !isPositiveDays(condition.streak_days)) return []
  if (
    driverKey === 'rest_after_long' &&
    !isPositiveDays(condition.single_distance_km) &&
    !isPositiveDays(condition.duration_minutes)
  ) {
    return []
  }

  const value = condition[driverKey] as number
  const intervals = buildRestIntervals(restPool(condition, activities, anchorDate))

  const isEligible = (i: RestInterval): boolean => {
    switch (driverKey) {
      case 'rest_after_streak':
        return i.streakBefore >= (condition.streak_days as number)
      case 'rest_after_long':
        if (condition.single_distance_km !== undefined && i.maxDistanceKmBefore < condition.single_distance_km) return false
        if (condition.duration_minutes !== undefined && i.maxDurationMinBefore < condition.duration_minutes) return false
        return true
      case 'return_gap_days':
      case 'interval_days':
        return true
    }
  }
  const measure = (i: RestInterval): number => (driverKey === 'interval_days' ? i.intervalDays : i.restDays)

  const hits = intervals.filter((i) => isEligible(i) && measure(i) >= value).map((i) => i.resume)
  return toSortedOccurrences(hits)
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
  activities: NormalizedActivity[],
  /**
   * 휴식-회차 조합(⓪-a2) 전용 — 가입 앵커. 안 넘기면 가입 이전 공백까지 사건으로 잡힌다
   * (`evaluateRestConditions`가 같은 이유로 앵커를 받는 것과 동일, 티켓 20260906_2056).
   * 기간 단위 회차·활동 1건 단위 회차는 앵커가 필요 없다 — 호출부가 이미 앵커로 자른
   * 이력을 넘긴다(기존 동작 무변경).
   */
  anchorDate?: string
): NormalizedActivity[] {
  // ⓪-a1 기간 단위 회차(streak_days·weekly_count·monthly_count·weekly_streak) — 활동 1건
  //     단위 술어와 완전히 다른 계산이 필요해 가장 먼저 갈라진다(위 헤더 주석, 티켓 20260906_0110 ②).
  const periodCollector = detectPeriodOccurrenceDriver(condition)
  if (periodCollector) return periodCollector(condition, activities)

  // ⓪-a2 휴식 4종 + repeat_count — 이력 패턴 술어라 활동 1건 단위 술어와 완전히 다른
  //     계산이 필요하다(위 헤더 주석, 티켓 20260906_2056). 휴식 키가 둘 이상이면(사건 경계
  //     미정의) `undefined`가 돌아와 아래로 흘러가고, ⓪-b의 fail-closed가 막는다 —
  //     `CONSUMED_REPEAT_KEYS`에 휴식 키가 없기 때문이다.
  const restDriver = detectRestOccurrenceDriver(condition)
  if (restDriver) return collectRestOccurrences(restDriver, condition, activities, anchorDate)

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
