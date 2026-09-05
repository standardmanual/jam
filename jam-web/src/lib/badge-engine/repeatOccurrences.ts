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
import { passesWalkingGate, matchesDayOfWeek, dedupeOnePerDay, inTimeRange } from './activityFilters'
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
  // ⓪ 회차 술어가 «소비하지 않는 키»가 조건에 있으면 회차를 세지 않는다 (fail-closed).
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
