/**
 * 배지 조건 평가용 활동 필터 순수 헬퍼 (티켓 20260904_0631 게이트 리뷰 재시도로 분리)
 *
 * `index.ts`(발급 판정, 서버 전용)와 `badgeProgress.ts`(진행 계산, 클라이언트에서도 import
 * 가능해야 함)가 **같은 필터 규칙**(요일 판정·시간대 판정·걷기 하루 1회 상한·걷기 축1
 * 게이트·주 경계·연속일수)을 공유해야 하는데, 원래 이 6개 함수는 `index.ts`에 있었다.
 * `index.ts`는 파일 최상단에서 `@/lib/supabase/server`(→ `next/headers`)를 무조건 import하기
 * 때문에, `badgeProgress.ts`가 `./index`에서 이 함수들을 가져오면 그 전이 의존까지 함께
 * 끌려와 'use client' 컴포넌트에서 `npm run build`가 실패한다(1차 시도 게이트 리뷰 FAIL 사유).
 *
 * 이 파일은 그래서 **NormalizedActivity/DayOfWeek/BadgeCondition 타입 외 어떤 것도 import하지
 * 않는다** — Supabase도, next/headers도, index.ts도. 셋 다 순수 타입 정의 파일
 * (`@/types/strava`, `@/types/database`)에서 온 type-only import라 런타임 의존이 전혀 없다.
 * (`BadgeCondition`은 v5 B3의 휴식 판정 헬퍼가 조건을 직접 읽으면서 추가됐다 — 티켓 20260905_0030 §4)
 *
 * 함수 본문은 index.ts에 있던 것을 그대로 옮긴 것이다 — 로직 변경 없음.
 */
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, DayOfWeek } from '@/types/database'
import { getConditionField } from './conditionRegistry'
import { kmhToPaceSecPerKm } from '@/types/strava'

// ── 축1 게이트 (걷기 전용 "진짜 걷기" 판정) ────────────────────────────────
// 걷기(activity_type='walking') 활동이 이 네 값을 모두 통과해야 어떤 걷기 배지
// 조건 평가에도 포함된다. 미통과 시 그 활동은 걷기 배지 평가에서 완전 배제.
// 다른 종목에는 영향 없음. 값은 튜닝 대상이라 상수로 분리해 한 곳에 모아둔다.
export const WALKING_GATE_MIN_DISTANCE_KM = 0.5
export const WALKING_GATE_MIN_DURATION_MIN = 10
export const WALKING_GATE_MIN_SPEED_KMH = 2.0
export const WALKING_GATE_MAX_SPEED_KMH = 8.0

/** 걷기 활동이 축1 게이트를 통과하는지. 걷기가 아니면 항상 true(영향 없음). */
export function passesWalkingGate(a: NormalizedActivity): boolean {
  if (a.jamActivityType !== 'walking') return true
  if (a.distanceKm < WALKING_GATE_MIN_DISTANCE_KM) return false
  if (a.movingTimeSec / 60 < WALKING_GATE_MIN_DURATION_MIN) return false
  if (a.averageSpeedKmh < WALKING_GATE_MIN_SPEED_KMH || a.averageSpeedKmh > WALKING_GATE_MAX_SPEED_KMH) return false
  return true
}

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

/** 활동의 (로컬 기준) 요일이 지정한 day_of_week와 일치하는지 */
export function matchesDayOfWeek(a: NormalizedActivity, day: DayOfWeek): boolean {
  const dateOnly = (a.startDateLocal ?? a.startDate).slice(0, 10)
  return new Date(`${dateOnly}T00:00:00Z`).getUTCDay() === DAY_INDEX[day]
}

/** 같은 날짜(로컬 기준)의 활동을 1건으로 압축 — 걷기 빈도 조건 하루 1회 상한용 */
export function dedupeOnePerDay(activities: NormalizedActivity[]): NormalizedActivity[] {
  const seen = new Set<string>()
  const result: NormalizedActivity[] = []
  for (const a of activities) {
    const key = (a.startDateLocal ?? a.startDate).slice(0, 10)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(a)
  }
  return result
}

/** 활동 시작시각(로컬)이 {start,end} 시간대 범위 내인지 (자정 걸침 지원) */
export function inTimeRange(activity: NormalizedActivity, range: { start: string; end: string }): boolean {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const local = activity.startDateLocal ?? activity.startDate
  const t = toMin(local.slice(11, 16))
  const s = toMin(range.start)
  const e = toMin(range.end)
  return s > e ? (t >= s || t <= e) : (t >= s && t <= e)
}

/** 주어진 날짜가 속한 주의 월요일 날짜(YYYY-MM-DD)를 키로 반환. */
export function getMondayKey(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

/** 활동 목록에서 가장 긴 "연속 일수"를 계산. 미션 엔진(streak_days 타입)에서도 재사용. */
export function calcMaxStreak(activities: NormalizedActivity[]): number {
  if (activities.length === 0) return 0
  const dates = activities.map((a) => (a.startDateLocal ?? a.startDate).slice(0, 10)).sort()
  const uniqueDates = [...new Set(dates)]
  let maxStreak = 1
  let currentStreak = 1
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1])
    const curr = new Date(uniqueDates[i])
    const diffDays = (curr.getTime() - prev.getTime()) / 86_400_000
    if (diffDays === 1) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 1
    }
  }
  return maxStreak
}

/**
 * `day_of_week` 조건값(단일 또는 배열)에 활동이 걸리는지 — 단일이면 그 요일, 배열이면
 * 그중 하루라도(OR). `weekly_streak`(티켓 20260906_0110 ②)가 배열 필터를 받는 유일한
 * 자리라 여기 한 곳에 둔다 — `matchesDayOfWeek`를 두 번 쓰는 자리가 갈라지지 않게 한다.
 */
export function matchesDayOfWeekFilter(a: NormalizedActivity, days: DayOfWeek | DayOfWeek[]): boolean {
  return Array.isArray(days) ? days.some((d) => matchesDayOfWeek(a, d)) : matchesDayOfWeek(a, days)
}

/**
 * 활동 목록에서 가장 긴 "연속 주(월요일 키, 활동이 있던 주)" 스트릭 — `calcMaxStreak`의 주
 * 단위 버전(티켓 20260906_0110 ②, `weekly_streak` 조건). 단독 평가(`index.ts`)와 회차
 * 계산(`repeatOccurrences.ts`)이 같은 함수를 본다.
 */
export function calcMaxWeeklyStreak(activities: NormalizedActivity[]): number {
  if (activities.length === 0) return 0
  const weekKeys = [...new Set(activities.map((a) => getMondayKey(new Date(a.startDateLocal ?? a.startDate))))].sort()
  let maxStreak = 1
  let currentStreak = 1
  for (let i = 1; i < weekKeys.length; i++) {
    const diffDays = (Date.parse(weekKeys[i]) - Date.parse(weekKeys[i - 1])) / 86_400_000
    if (diffDays === 7) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 1
    }
  }
  return maxStreak
}

/** 활동의 (로컬 기준) 「일(day of month)」이 지정한 값과 일치하는지 — `day_of_month` 조건(티켓 20260908_1318) */
export function matchesDayOfMonth(a: NormalizedActivity, day: number): boolean {
  const dateOnly = (a.startDateLocal ?? a.startDate).slice(0, 10)
  return new Date(`${dateOnly}T00:00:00Z`).getUTCDate() === day
}

// ── 서로 다른 시간대 판정 (`distinct_time_bands`, 티켓 20260908_1318) ─────────
//
// 시간대 6구간 경계는 `badgeConditionText.ts`의 `timeSlotLabel`(time_range 칩 표기용)과
// **똑같다** — 두 곳이 다른 경계를 쓰면 「시간대 문구」와 「시간대 개수 판정」이 어긋난다.
// `distinct_time_bands`의 min:2~max:6(conditionRegistry.ts)이 이 6구간 수와 정확히
// 일치하는 것도 같은 경계를 의도했다는 근거다.
export const TIME_BANDS = ['새벽', '아침', '점심', '오후', '저녁', '심야'] as const
export type TimeBand = (typeof TIME_BANDS)[number]

/** 활동 시작시각(로컬)이 속하는 시간대(6구간 중 하나) */
export function timeBandOf(a: NormalizedActivity): TimeBand {
  const local = a.startDateLocal ?? a.startDate
  const h = Number(local.slice(11, 13))
  if (h >= 4 && h < 8) return '새벽'
  if (h >= 8 && h < 11) return '아침'
  if (h >= 11 && h < 14) return '점심'
  if (h >= 14 && h < 18) return '오후'
  if (h >= 18 && h < 22) return '저녁'
  return '심야'
}

/** 활동 목록이 서로 다른 시간대를 몇 개나 포함하는지 (`distinct_time_bands` 조건 평가) */
export function countDistinctTimeBands(activities: NormalizedActivity[]): number {
  return new Set(activities.map(timeBandOf)).size
}

// ── 지정 시간 창 안의 활동 횟수 (`activities_within_hours`, 티켓 20260908_1318) ────
//
// `{hours, count}` — 실제 경과 시각(`startDate`, UTC) 기준 슬라이딩 윈도우다. 로컬 날짜
// 경계(자정)로 자르지 않는다 — "24시간 안에 3회"는 달력의 하루가 아니라 실제 24시간
// 경과를 뜻하기 때문이다(예: 23시 활동 → 다음날 22시 활동도 24시간 안).

/** 시간순 정렬된 활동 배열에서, `hours`시간 슬라이딩 창 안에 든 활동의 최댓값 */
export function maxActivitiesWithinHours(activities: NormalizedActivity[], hours: number): number {
  if (activities.length === 0) return 0
  const times = activities.map((a) => Date.parse(a.startDate)).sort((a, b) => a - b)
  const windowMs = hours * 60 * 60 * 1000
  let left = 0
  let max = 0
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] > windowMs) left++
    max = Math.max(max, right - left + 1)
  }
  return max
}

// ── 휴식(활동 공백) 판정 (v5 B3, 티켓 20260905_0030 §4) ────────────────────
//
// **`index.ts`(발급 판정)와 `badgeProgress.ts`(진행 계산)가 이 파일의 같은 함수를 본다.**
// 두 곳이 「무엇이 휴식 조건인가」·「공백을 어떻게 세는가」를 각자 정의하면 진행률과 발급
// 판정이 어긋난다 — §4가 이 헬퍼를 여기에 두라고 못 박은 이유다.
//
// ## 공백은 «닫힌 공백»만 센다 — 「데이터 없음」을 「쉬었음」으로 읽지 않는다 (B-7)
//
// 모든 판정은 **인접한 두 활동일 사이**의 간격으로만 이뤄진다. 양 끝이 전부 실제 활동이므로
//   ① 활동이 0~1건인 유저는 인접 쌍이 없어 「90일 겨울잠」으로 오판되지 않는다
//   ② 「마지막 활동 ~ 지금」의 열린 공백을 보지 않으므로 현재 시각(`now`)이 판정에 끼어들지
//      않는다 — 화면과 발급이 다른 시각을 볼 여지가 없다(B-8)
//   ③ 공백은 **다음 활동이 들어온 순간에만** 닫히므로 「다음 활동 시 소급 판정」이 자연히 성립한다
//
// ## 앵커는 하한이다 (B-7)
//
// `getActivityHistory`는 `gte(start_date, anchor)`라 **앵커 직전 활동 1건을 아예 읽지 못한다.**
// 그러나 `evaluateBadgesDetailed`는 이번 배치를 앵커와 무관하게 합치므로(첫 싱크 정산분은 대개
// 가입 직전 활동이다) 넘어온 배열에는 앵커 이전 활동이 섞일 수 있다. 그래서 이 헬퍼가 **직접
// 앵커로 한 번 더 자른다** — 「직전 활동이 창 안에 실제로 존재할 때만」 공백을 계산한다.
//
// 앵커 직전 활동을 별도 조회해 경계 공백을 살리는 안은 **채택하지 않았다.** 그건 가입 이전
// 이력을 판정에 되살리는 것이고, A묶음에서 「과거 이력은 아예 배제 — 엄격 유지」로 확정된
// 사항을 약화시킨다. 창의 첫 활동 앞에는 공백이 없다(= B1이 「창이 좁혀져 회차가 임계 아래로
// 내려가면 카운터도 올리지 않는다」로 남긴 태도와 같다).
//
// ## 종목 필터를 그대로 적용한다
//
// 공백도 `activity_type` + 걷기 축1 게이트를 통과한 활동만으로 센다. 즉 「그 종목을 하지 않은
// 기간」이 휴식이다. 엔진의 다른 모든 블록이 `filtered` 위에서 판정하므로 여기만 «전 종목»으로
// 두면 `activity_type`이 조용한 no-op이 되고, 「가끔만 틀리는」 비대칭이 생긴다.

/** 휴식(활동 공백) 조건 필드 4종 — 이 목록이 「무엇이 휴식 조건인가」의 단일 출처다 */
export const REST_CONDITION_KEYS = [
  'rest_after_streak',
  'rest_after_long',
  'return_gap_days',
  'interval_days',
] as const
export type RestConditionKey = (typeof REST_CONDITION_KEYS)[number]

/**
 * 활동이 선행되지 않아도 성립하는 «순수 공백» 조건.
 *
 * `rest_after_streak`(연속 활동 뒤) · `rest_after_long`(장거리 활동 뒤)은 활동이 선행되어야
 * 성립하므로 역인센티브가 없다. 이 둘에는 그 안전장치가 없다.
 *
 * ## §4 「순수 공백 기반(「겨울잠」)만 쿨다운 90일」은 **카탈로그 설계 지침이다**
 * (2026-09-05 스펙 소유자 확정)
 *
 * 「공백만으로 주는 배지는 90일 이상으로 잡아라」는 **시딩 규칙**이지 엔진이 강제할 값이
 * 아니다. 초안은 엔진에서 90일 미만을 「휴식 조건 설정 오류」로 막았는데 두 가지가 어긋났다:
 *  1. `conditionRegistry.ts`가 이 필드들을 `min: 1, max: 365`로 선언한다 — **조건 필드 메타의
 *     단일 출처**가 유효 범위에 대해 엔진과 다른 말을 하게 된다
 *  2. 그 경로의 경고 로그는 «배지 × 유저 × 싱크»마다 찍혀 오설정 1건이 로그 폭주가 된다
 *
 * 그래서 엔진은 값을 강제하지 않는다. 하한 준수는 티켓 20260905_0035(카탈로그 시딩)의 몫이다.
 */
export const REST_PURE_GAP_KEYS: readonly RestConditionKey[] = ['return_gap_days', 'interval_days']

/** 조건에 실제로 들어 있는 휴식 조건 키. 선언 순서를 그대로 따른다 */
export function restConditionKeysIn(condition: BadgeCondition | null | undefined): RestConditionKey[] {
  if (!condition) return []
  return REST_CONDITION_KEYS.filter((k) => condition[k] !== undefined)
}

/**
 * 휴식 술어가 «짝 필드»로 흡수하는 조건 키 (티켓 20260905_0031 재시도).
 *
 * `evaluateRestConditions`의 `switch`가 실제로 읽는 필드다 — `rest_after_streak`는
 * `streak_days`를(「며칠 연속 뒤인가」), `rest_after_long`은 `single_distance_km`을
 * (「무엇이 장거리인가」) 함께 읽어야 뜻이 완성된다. 나머지 필드는 휴식 판정이 **보지 않는다.**
 *
 * 진행 계산(`badgeProgress.ts`)이 「휴식 축이 이 조건을 통째로 대표할 수 있는가」를 판단할 때
 * 이 목록을 예외로 쓴다. 예외를 두지 않으면 `{ rest_after_streak: 2, streak_days: 6 }`이
 * 「연속일수 축이 숨겨졌다」로 잘못 걸리고, 반대로 목록을 넓히면
 * `{ return_gap_days: 5, streak_days: 6 }`처럼 **휴식 판정이 보지도 않는 축**을 숨긴 채
 * 진행률 100%를 그린다(게이트 실측 재현 사례).
 *
 * ⚠️ `evaluateRestConditions`의 `switch`에 짝 필드를 읽는 분기를 추가하면 여기도 함께 넓힌다.
 */
export function restConsumedPairKeys(condition: BadgeCondition): string[] {
  const keys: string[] = []
  if (condition.rest_after_streak !== undefined) keys.push('streak_days')
  if (condition.rest_after_long !== undefined) {
    // 짝 필드는 OR다(단, 실제로 조건에 든 쪽만 소비한다) — 티켓 20260906_0110 ④.
    if (condition.single_distance_km !== undefined) keys.push('single_distance_km')
    if (condition.duration_minutes !== undefined) keys.push('duration_minutes')
  }
  return keys
}

/** 휴식 판정 결과. `index.ts`가 사유 문자열을 그대로 미발급 사유에 싣는다 */
export type RestEvaluation =
  | { kind: 'none' }
  | { kind: 'pass'; actual: string[]; required: string[]; resumeActivity: NormalizedActivity }
  | {
      kind: 'fail'
      reason: string
      actual: string
      required: string
      /**
       * 현재 달성한 최대 공백(일). 티켓 20260905_0031이 `kind: 'rest'` 진행 축을 만들 때
       * 필요한 값이라 문자열(`actual`)에만 담지 않고 구조로도 싣는다 — 안 그러면 0031이
       * 이 헬퍼 내부를 다시 파헤치거나 문자열을 파싱하게 된다(B3 개선 리뷰).
       * 조건 형태 오류처럼 «측정 자체가 불가능»한 경우에는 없다.
       */
      bestDays?: number
      /**
       * 모자란 휴식 키와 그 요구 일수 (티켓 20260905_0031).
       *
       * `bestDays`만으로는 축을 만들 수 없다 — 「무엇의 2일인가」(연속 후 휴식? 활동 간격?)와
       * 「몇 일이 목표인가」가 있어야 `휴식 2/5일` 한 줄이 완성된다. **`bestDays`와 항상 같이
       * 실린다** — 셋 중 하나만 있는 상태는 만들지 않는다(진행 축이 반쪽으로 그려지는 것을
       * 막는다). 조건 형태 오류·짝 필드 없음처럼 «값 자체를 믿을 수 없는» 경우에는 셋 다 없다.
       */
      shortfallKey?: RestConditionKey
      /** `shortfallKey`가 요구하는 일수 — `condition[shortfallKey]` 원값 */
      requiredDays?: number
    }

/**
 * 인접한 두 활동일 사이의 한 구간.
 *
 * 티켓 20260906_2056부터 `repeatOccurrences.ts`도 이 형태를 본다 — 휴식 4종 +
 * `repeat_count` 조합에서 "사건 하나"가 정확히 이 구간 하나에 대응하기 때문이다
 * (구간은 (직전 활동일, 복귀일) 한 쌍만 가리키는 원자적 단위라 쪼개거나 합칠 필요가 없다).
 */
export type RestInterval = {
  /** 두 활동일의 날짜 차이(일). 연속한 날이면 1 */
  intervalDays: number
  /** 쉰 일수 = 날짜 차이 − 1. 연속한 날이면 0 */
  restDays: number
  /** 공백 직전 활동일에서 끝나는 연속 활동일 수 */
  streakBefore: number
  /** 공백 직전 활동일의 최장 단일 활동 거리(km) */
  maxDistanceKmBefore: number
  /** 공백 직전 활동일의 최장 단일 활동 이동시간(분) — `rest_after_long`의 시간 축(티켓 20260906_0110 ④) */
  maxDurationMinBefore: number
  /** 공백을 닫은 «복귀 활동» — 그날의 첫 활동. 배지 상세의 「계기 활동일」이 된다 */
  resume: NormalizedActivity
}

const DAY_MS = 86_400_000

function dayMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`)
}

function localDateKey(a: NormalizedActivity): string {
  return (a.startDateLocal ?? a.startDate).slice(0, 10)
}

/**
 * 휴식 판정용 활동 풀 — 앵커 하한 → 종목 필터 + 걷기 축1 게이트.
 * `evaluateConditionDetailed`의 `filtered`를 재사용하지 않고 **원본 배열에서 다시 만든다** —
 * 그 변수는 `time_range`·기온·걷기 하루 1회 상한으로 추가로 좁혀져 있어 공백의 정의가
 * 조건 조합에 따라 흔들린다(`collectRepeatOccurrences`가 원본을 받는 것과 같은 이유).
 */
export function restPool(
  condition: BadgeCondition,
  activities: NormalizedActivity[],
  anchorDate?: string
): NormalizedActivity[] {
  let pool = activities
  if (anchorDate) {
    const anchorMs = Date.parse(anchorDate)
    // 파싱 불가한 앵커는 «필터 없음»으로 폴백한다 — getSignupAnchorDate의 폴백과 같은 태도.
    if (Number.isFinite(anchorMs)) {
      // ⚠️ 공백 계산의 날짜 키가 `startDateLocal`(localDateKey)이므로 앵커 컷도 같은 값을 쓴다.
      //    `startDate`(UTC)로 자르면 앵커 경계 ±9시간에 걸친 활동 1건이 «창 안에 있는데
      //    공백 계산에서는 빠지는» 식으로 기준이 갈린다(게이트 리뷰 지적).
      pool = pool.filter((a) => Date.parse(a.startDateLocal ?? a.startDate) >= anchorMs)
    }
  }
  if (condition.activity_type) {
    pool = pool.filter(
      (a) =>
        a.jamActivityType === condition.activity_type &&
        (condition.activity_type !== 'walking' || passesWalkingGate(a))
    )
  }
  return pool
}

/**
 * 인접 활동일 구간 목록(시간순).
 *
 * 정렬은 `getActivityHistory`가 `ORDER BY start_date`로 이미 고정했지만(B2), 이번 배치를
 * 합친 배열은 그 순서를 보장하지 않으므로 **날짜 키를 여기서 다시 정렬한다.** 「인접 활동
 * 사이의 간격」이 판정의 전제라 정렬이 어긋나면 「가끔만 틀리는」 판정이 된다.
 */
export function buildRestIntervals(pool: NormalizedActivity[]): RestInterval[] {
  const byDate = new Map<string, NormalizedActivity[]>()
  for (const a of pool) {
    const key = localDateKey(a)
    const list = byDate.get(key)
    if (list) list.push(a)
    else byDate.set(key, [a])
  }
  const dates = [...byDate.keys()].sort()
  if (dates.length < 2) return []

  // 각 활동일에서 끝나는 연속 활동일 수
  const runLength: number[] = []
  for (let i = 0; i < dates.length; i++) {
    runLength[i] = i > 0 && dayMs(dates[i]) - dayMs(dates[i - 1]) === DAY_MS ? runLength[i - 1] + 1 : 1
  }

  const intervals: RestInterval[] = []
  for (let i = 1; i < dates.length; i++) {
    const before = byDate.get(dates[i - 1])!
    const resumeList = byDate.get(dates[i])!
    const intervalDays = Math.round((dayMs(dates[i]) - dayMs(dates[i - 1])) / DAY_MS)
    intervals.push({
      intervalDays,
      restDays: intervalDays - 1,
      streakBefore: runLength[i - 1],
      maxDistanceKmBefore: Math.max(...before.map((a) => a.distanceKm)),
      maxDurationMinBefore: Math.max(...before.map((a) => a.movingTimeSec / 60)),
      resume: resumeList.reduce((first, a) => (a.startDate < first.startDate ? a : first), resumeList[0]),
    })
  }
  return intervals
}

/**
 * 조건값이 「1 이상의 유한한 수」인지. `condition_json`은 jsonb라 형태 보장이 없다.
 *
 * `repeatOccurrences.ts`(티켓 20260906_2056)도 휴식-회차 조합을 세기 전에 같은 검사를
 * 해야 한다 — 여기서 export해 판정을 두 번 적지 않는다.
 */
export function isPositiveDays(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
}

/**
 * 휴식 조건의 표시 라벨 — **`conditionRegistry`가 단일 출처다.**
 *
 * 여기에 문자열을 다시 적으면 어드민에서 라벨을 다듬었을 때 엔진 사유 문구만 옛 이름으로
 * 남는다(레지스트리는 `badge_metric_labels` 시드의 출처이기도 하다). 이 저장소는
 * `RARITY_LABEL`이 5곳에 복제돼 누락 사고를 낸 전례가 있다(티켓 20260813_003·20260905_0027).
 * 레지스트리에 없으면 키를 그대로 쓴다 — 조용히 빈 문자열이 되지 않게.
 */
function restKeyLabel(key: RestConditionKey): string {
  return getConditionField(key)?.label ?? key
}

const REST_KEY_SHORTFALL_REASON: Record<RestConditionKey, string> = {
  rest_after_streak: '연속 활동 후 휴식 부족',
  rest_after_long: '장거리 활동 후 휴식 부족',
  return_gap_days: '복귀 전 휴식 부족',
  interval_days: '활동 간격 부족',
}

/**
 * 휴식 조건 판정 — 조건에 휴식 키가 없으면 `{ kind: 'none' }`.
 *
 * 키가 여럿이면 **각 키를 독립으로 평가하고 AND로 묶는다**(엔진의 「이력 전반 독립 평가」와
 * 같은 규칙). 계기 활동은 «각 키가 처음 성립한 구간» 중 **가장 늦은 것**의 복귀 활동이다 —
 * 조건 전체가 성립한 시점이기 때문이다.
 */
export function evaluateRestConditions(
  condition: BadgeCondition,
  activities: NormalizedActivity[],
  options?: { anchorDate?: string }
): RestEvaluation {
  const keys = restConditionKeysIn(condition)
  if (keys.length === 0) return { kind: 'none' }

  // ── ① 값의 형태 — 깨진 값을 「검사할 게 없으니 통과」로 두면 조건이 조용히 사라진다
  for (const key of keys) {
    if (!isPositiveDays(condition[key])) {
      return {
        kind: 'fail',
        reason: '휴식 조건 형태 오류',
        actual: `${restKeyLabel(key)}: ${String(condition[key])}`,
        required: '1 이상의 수',
      }
    }
  }

  // ── ③ 짝 필드 — 없으면 「며칠 연속 뒤」·「무엇이 장거리인지」가 정의되지 않는다.
  //    레지스트리의 fail-closed(`findBlockingConditionKeys`)가 먼저 막지만, 이 헬퍼는
  //    순수 함수로 단독 호출될 수 있으므로 여기서도 방어한다.
  if (condition.rest_after_streak !== undefined && !isPositiveDays(condition.streak_days)) {
    return { kind: 'fail', reason: '휴식 조건 짝 필드 없음', actual: 'streak_days 없음', required: '연속 일수(streak_days)' }
  }
  // 짝 필드는 OR다 — single_distance_km(거리 기준) 또는 duration_minutes(시간 기준) 중
  // 하나만 있으면 「무엇이 장거리인가」가 정의된다(티켓 20260906_0110 ④).
  if (
    condition.rest_after_long !== undefined &&
    !isPositiveDays(condition.single_distance_km) &&
    !isPositiveDays(condition.duration_minutes)
  ) {
    return {
      kind: 'fail',
      reason: '휴식 조건 짝 필드 없음',
      actual: 'single_distance_km · duration_minutes 없음',
      required: '장거리 기준(single_distance_km 또는 duration_minutes)',
    }
  }

  // ── ④ 창 안의 인접 활동 — 없으면 공백을 **계산하지 않는다**(B-7).
  //    「데이터 없음」을 「쉬었음」으로 읽지 않는 지점이 여기다.
  // 앵커가 없으면(조회 실패 폴백) 이력 전체 위에서 센다 — **다른 조건과 같은 태도다.**
  //
  // 「휴식만 앵커 부재를 판정 불가로 둬야 한다」는 안을 검토했다가 채택하지 않았다.
  // 근거: 이 블록은 «인접한 두 활동 사이의 닫힌 공백»만 세므로 **양 끝이 전부 실제 활동**이고,
  // 창이 넓어져도 «유령 공백»이 생기지 않는다 — 넓어질 때 들어오는 건 유저가 실제로 쉰
  // 가입 이전 공백이며, 그건 휴식 고유의 오판이 아니라 「과거 이력 배제」라는 횡단 결정의
  // 문제다(앵커가 그 결정의 유일한 수단이다). 여기서만 다르게 폴백하면 일시적 DB 오류가
  // 「휴식 배지만 사라졌다」로 보이고, `getSignupAnchorDate`가 명시한 폴백 태도와도 어긋난다.
  const intervals = buildRestIntervals(restPool(condition, activities, options?.anchorDate))
  if (intervals.length === 0) {
    return {
      kind: 'fail',
      reason: '휴식 판정 불가 — 창 안에 인접 활동이 없음',
      actual: '공백 앞뒤 활동 0쌍',
      required: '가입 이후 서로 다른 날의 활동 2건',
      // 진행 축용(티켓 20260905_0031) — 위 ①②③을 이미 통과했으므로 값의 형태는 믿을 수 있다.
      // 「아직 0일 쉬었다」는 사실 그대로다: 공백을 «셀 수 없었다»가 아니라 «닫힌 공백이 0쌍»이다.
      bestDays: 0,
      shortfallKey: keys[0],
      requiredDays: condition[keys[0]] as number,
    }
  }

  const actual: string[] = []
  const required: string[] = []
  let triggerInterval: RestInterval | null = null

  for (const key of keys) {
    const value = condition[key] as number
    let eligible: RestInterval[]
    let measured: (i: RestInterval) => number
    switch (key) {
      case 'rest_after_streak':
        eligible = intervals.filter((i) => i.streakBefore >= (condition.streak_days as number))
        measured = (i) => i.restDays
        break
      case 'rest_after_long':
        // 짝 필드는 OR다 — 둘 다 있으면(현재 카탈로그엔 없다) 둘 다 만족해야 「장거리」로 본다.
        eligible = intervals.filter((i) => {
          if (condition.single_distance_km !== undefined && i.maxDistanceKmBefore < condition.single_distance_km) return false
          if (condition.duration_minutes !== undefined && i.maxDurationMinBefore < condition.duration_minutes) return false
          return true
        })
        measured = (i) => i.restDays
        break
      case 'return_gap_days':
        eligible = intervals
        measured = (i) => i.restDays
        break
      case 'interval_days':
        eligible = intervals
        measured = (i) => i.intervalDays
        break
    }

    const hit = eligible.find((i) => measured(i) >= value)
    if (!hit) {
      const best = eligible.length > 0 ? Math.max(...eligible.map(measured)) : 0
      return {
        kind: 'fail',
        reason: REST_KEY_SHORTFALL_REASON[key],
        actual: `${best}일`,
        required: describeRestRequirement(key, condition),
        bestDays: best,
        shortfallKey: key,
        requiredDays: value,
      }
    }
    if (!triggerInterval || hit.resume.startDate > triggerInterval.resume.startDate) triggerInterval = hit
    actual.push(`${restKeyLabel(key)}: ${measured(hit)}일`)
    required.push(describeRestRequirement(key, condition))
  }

  return { kind: 'pass', actual, required, resumeActivity: triggerInterval!.resume }
}

// ── 개인 기록 갱신(personal_record_break) 판정 (티켓 20260906_2055) ─────────
//
// `index.ts`(발급 판정)와 `badgeProgress.ts`(진행 계산)가 이 파일의 같은 함수를 본다 —
// 각자 세면 「화면은 3회인데 발급은 2회」로 발급-진행률이 어긋난다(0110이 반복 지적한
// 실패 패턴). `evaluateRestConditions`와 같은 태도로 이 파일에 둔다.
//
// 콘텐츠가 채워진 지표는 현재 4종이다(선행 티켓 20260906_2055 콘텐츠 값 확정 3종 +
// 티켓 20260908_1438 페이스 1종 추가): `single_distance_km`(한 번의 거리) ·
// `duration_minutes`(한 번의 이동시간) · `max_elevation_m`(도달 고도) ·
// `max_pace_sec_per_km`(페이스, 값이 작을수록 갱신). `PersonalRecordMetric` 타입엔 그 외에도
// 더 있지만 카탈로그에 값이 없다 — 지원을 넓히려면 `personalRecordMetricValue`·
// `PERSONAL_RECORD_METRIC_DIRECTION`의 분기와 이 상수를 함께 늘린다.
export const SUPPORTED_PERSONAL_RECORD_METRICS = [
  'single_distance_km',
  'duration_minutes',
  'max_elevation_m',
  'max_pace_sec_per_km',
] as const
export type SupportedPersonalRecordMetric = (typeof SUPPORTED_PERSONAL_RECORD_METRICS)[number]

/** `personal_record_break_metric` 값이 지금 엔진이 평가할 수 있는 지표 중 하나인지 */
export function isSupportedPersonalRecordMetric(value: unknown): value is SupportedPersonalRecordMetric {
  return typeof value === 'string' && (SUPPORTED_PERSONAL_RECORD_METRICS as readonly string[]).includes(value)
}

/**
 * 지표별 「기록 갱신」 방향. `conditionRegistry.ts`의 `ConditionDirection`(`'higher'|'lower'`)
 * 관례를 그대로 따른다 — 대부분의 지표는 값이 클수록 갱신(`higher`)이지만, 페이스는 값이
 * 작을수록(빠를수록) 갱신(`lower`)이라 반대다.
 */
const PERSONAL_RECORD_METRIC_DIRECTION: Record<SupportedPersonalRecordMetric, 'higher' | 'lower'> = {
  single_distance_km: 'higher',
  duration_minutes: 'higher',
  max_elevation_m: 'higher',
  max_pace_sec_per_km: 'lower',
}

/** 지표별로 활동 1건에서 비교할 값을 꺼낸다. 값이 없는 활동(고도계 미탑재 등)은 undefined */
function personalRecordMetricValue(metric: SupportedPersonalRecordMetric, a: NormalizedActivity): number | undefined {
  switch (metric) {
    case 'single_distance_km':
      return a.distanceKm
    case 'duration_minutes':
      return a.movingTimeSec / 60
    case 'max_elevation_m':
      return a.maxElevationM
    case 'max_pace_sec_per_km':
      return kmhToPaceSecPerKm(a.averageSpeedKmh)
  }
}

/**
 * 「개인 기록 갱신」 횟수 — 넘어온 `activities`(가입 시점 이후로 이미 좁혀져 있다는 전제,
 * 마스터 티켓 20260905_0026 「가입 시점부터 카운트」)를 시간순으로 훑으며, 지표 값이
 * 그때까지의 최고 기록을 **엄격히 초과**할 때마다 1회로 센다.
 *
 * 최초의 유효 활동은 항상 1회로 잡힌다 — 직전 기록이 없으므로(비교 대상이 방향별 최악값,
 * `higher`는 −Infinity·`lower`는 +Infinity) 어떤 값도 새 기록이다. Strava 자체의 PR(personal
 * record) 개념과 같은 태도다(예: `hiking:R1` 레벨 1 문구 「닿아본 적 없는 높이에 처음
 * 섰습니다」— 첫 활동이 곧 최초 기록이라는 뜻).
 *
 * 지표 값이 없는 활동(예: 고도계 미탑재)은 시퀀스에서 완전히 건너뛴다 — 데이터 없음을
 * 기록 갱신 실패로 세지 않고, 최고 기록 갱신에도 영향을 주지 않는다.
 *
 * 지표 방향(`PERSONAL_RECORD_METRIC_DIRECTION`)에 따라 "갱신"의 의미가 갈린다 — `higher`
 * 지표(거리·시간·고도)는 값이 커질 때, `lower` 지표(페이스)는 값이 작아질 때(더 빨라질 때)
 * 기록 갱신으로 센다.
 */
export function countPersonalRecordBreaks(
  metric: SupportedPersonalRecordMetric,
  activities: NormalizedActivity[]
): number {
  const direction = PERSONAL_RECORD_METRIC_DIRECTION[metric]
  const sorted = [...activities].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  let best = direction === 'higher' ? -Infinity : Infinity
  let count = 0
  for (const a of sorted) {
    const value = personalRecordMetricValue(metric, a)
    if (value === undefined) continue
    const isNewRecord = direction === 'higher' ? value > best : value < best
    if (isNewRecord) {
      best = value
      count++
    }
  }
  return count
}

// ── 전월 대비 배수 · 평소 평균 대비 배수 (티켓 20260908_1318) ────────────────
//
// 콘텐츠 실측(`seed_v5_activity_badges.sql` 주석 「지난달 거리의 120%」·「평소 평균 거리의
// 2배」)에 따라 두 필드 모두 **거리(distanceKm)** 를 지표로 고정한다. `personal_record_break`와
// 달리 지표를 고르는 짝 필드가 레지스트리에 없다 — 카탈로그가 거리 외 지표를 쓸 계획이 없다는 뜻이다.

function monthKeyOf(a: NormalizedActivity): string {
  const d = new Date(a.startDateLocal ?? a.startDate)
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

/** `monthKeyOf`가 만드는 「YYYY-M」 키의 바로 전월 키 */
function prevMonthKeyOf(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${m - 1}`
}

/**
 * 「전월 대비 N배 이상」 최고 달성 배수 — 이력 전체에서 **달력상 인접한 두 달**(어느 달과
 * 그 바로 전달)의 누적 거리 쌍을 전부 훑어 가장 높은 비율을 돌려준다. "이력 전반 독립
 * 평가"와 같은 태도로, 실행 시각(`now`)이 아니라 데이터에 있는 달만 본다 — 백필된 과거
 * 이력에도 동일하게 동작하고, 화면과 발급이 실행 시각에 따라 갈리지 않는다.
 *
 * **전월 실적이 0(또는 그 달에 활동이 아예 없음)이면 그 쌍은 판정에서 제외한다** — "0 대비
 * 몇 배"는 정의되지 않으므로, 분모 0을 자동 통과로 두지 않는다(스펙 요구사항).
 */
export function bestMonthOverMonthRatio(activities: NormalizedActivity[]): number {
  const monthKm = new Map<string, number>()
  for (const a of activities) {
    const key = monthKeyOf(a)
    monthKm.set(key, (monthKm.get(key) ?? 0) + a.distanceKm)
  }
  let best = 0
  for (const [key, km] of monthKm) {
    const prevKm = monthKm.get(prevMonthKeyOf(key))
    if (!prevKm || prevKm <= 0) continue
    best = Math.max(best, km / prevKm)
  }
  return best
}

/**
 * 「평소 평균 대비 N배 이상」 최고 달성 배수 — 활동을 시간순으로 훑으며, **그 활동 이전까지의
 * 평균 거리** 대비 그 활동의 거리 비율을 계산해 최댓값을 돌려준다.
 *
 * `countPersonalRecordBreaks`와 같은 원칙("직전까지의 이력만으로" 판정)이다 — 평균에 자기
 * 자신을 포함하면 활동이 1건뿐이어도 항상 「평균의 1배」로 통과해 버린다. 비교할 이전 활동이
 * 없는 최초 활동은 평균을 계산할 수 없으므로 건너뛴다(스펙의 "활동 이력 부족 시 처리 방침"
 * — 최소 2건의 활동이 있어야 판정 가능하다).
 */
export function bestVsPersonalAverage(activities: NormalizedActivity[]): number {
  const sorted = [...activities].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  let sum = 0
  let n = 0
  let best = 0
  for (const a of sorted) {
    if (n > 0) {
      const avg = sum / n
      if (avg > 0) best = Math.max(best, a.distanceKm / avg)
    }
    sum += a.distanceKm
    n++
  }
  return best
}

/** 미발급 사유의 `required` 문구 — 짝 필드까지 함께 읽어야 뜻이 완성된다 */
function describeRestRequirement(key: RestConditionKey, condition: BadgeCondition): string {
  switch (key) {
    case 'rest_after_streak':
      return `연속 ${condition.streak_days}일 뒤 휴식 ${condition.rest_after_streak}일`
    case 'rest_after_long': {
      const basis =
        condition.single_distance_km !== undefined && condition.duration_minutes !== undefined
          ? `${condition.single_distance_km}km 이상·${condition.duration_minutes}분 이상`
          : condition.single_distance_km !== undefined
            ? `${condition.single_distance_km}km 이상`
            : `${condition.duration_minutes}분 이상`
      return `${basis} 활동 뒤 휴식 ${condition.rest_after_long}일`
    }
    case 'return_gap_days':
      return `복귀 전 휴식 ${condition.return_gap_days}일`
    case 'interval_days':
      return `활동 간격 ${condition.interval_days}일`
  }
}
