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
  // `rest_after_long`의 짝은 **2종이다**(티켓 20260906_1423 §B). 조건에 실제로 든 쪽만
  // 흡수하는 게 아니라 **둘 다 흡수 목록에 올린다** — `evaluateRestConditions`가 「조건에
  // 있는 짝 필드는 전부 만족」으로 읽으므로, 어느 쪽이 와도 독립 축이 아니다.
  if (condition.rest_after_long !== undefined) keys.push('single_distance_km', 'duration_minutes')
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

/** 인접한 두 활동일 사이의 한 구간 */
type RestInterval = {
  /** 두 활동일의 날짜 차이(일). 연속한 날이면 1 */
  intervalDays: number
  /** 쉰 일수 = 날짜 차이 − 1. 연속한 날이면 0 */
  restDays: number
  /** 공백 직전 활동일에서 끝나는 연속 활동일 수 */
  streakBefore: number
  /** 공백 직전 활동일의 최장 단일 활동 거리(km) */
  maxDistanceKmBefore: number
  /**
   * 공백 직전 활동일의 최장 단일 활동 시간(분) — `rest_after_long`의 시간 축 짝
   * (티켓 20260906_1423 §B). 「장거리」를 거리로만 정의하던 것을 시간으로도 정의할 수 있게 한다.
   */
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
function restPool(
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
function buildRestIntervals(pool: NormalizedActivity[]): RestInterval[] {
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

/** 조건값이 「1 이상의 유한한 수」인지. `condition_json`은 jsonb라 형태 보장이 없다 */
function isPositiveDays(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
}

/**
 * `rest_after_long`의 «장거리» 정의가 조건에 들어 있는가 (티켓 20260906_1423 §B).
 *
 * 짝 필드가 `single_distance_km` 하나뿐이던 시절엔 그 키만 봤다. 그런데 그 키는 아직
 * `evaluation: 'pending'`이라, 시간으로 장거리를 정의한 카탈로그 7종(`walking:R2`·`hiking:X1`)이
 * 「짝 필드 없음」으로 영구 차단됐다. **둘 중 하나라도 있으면 뜻이 완성된다**(OR) —
 * `conditionRegistry`의 `pairedWith` 판정(하나라도 있으면 통과)과 같은 규칙이다.
 */
function hasRestLongPair(condition: BadgeCondition): boolean {
  return isPositiveDays(condition.single_distance_km) || isPositiveDays(condition.duration_minutes)
}

/** 휴식 조건 «값의 형태» 검사 — 발급 판정과 회차 수집이 **같은 검사**를 쓴다 */
function restConditionShapeError(
  condition: BadgeCondition
): { reason: string; actual: string; required: string } | null {
  for (const key of restConditionKeysIn(condition)) {
    // ① 값의 형태 — 깨진 값을 「검사할 게 없으니 통과」로 두면 조건이 조용히 사라진다
    if (!isPositiveDays(condition[key])) {
      return {
        reason: '휴식 조건 형태 오류',
        actual: `${restKeyLabel(key)}: ${String(condition[key])}`,
        required: '1 이상의 수',
      }
    }
  }
  // ② 짝 필드 — 없으면 「며칠 연속 뒤」·「무엇이 장거리인지」가 정의되지 않는다.
  //    레지스트리의 fail-closed(`findBlockingConditionKeys`)가 먼저 막지만, 이 헬퍼는
  //    순수 함수로 단독 호출될 수 있으므로 여기서도 방어한다.
  if (condition.rest_after_streak !== undefined && !isPositiveDays(condition.streak_days)) {
    return { reason: '휴식 조건 짝 필드 없음', actual: 'streak_days 없음', required: '연속 일수(streak_days)' }
  }
  if (condition.rest_after_long !== undefined && !hasRestLongPair(condition)) {
    return {
      reason: '휴식 조건 짝 필드 없음',
      actual: 'single_distance_km·duration_minutes 없음',
      required: '장거리 기준(single_distance_km 또는 duration_minutes)',
    }
  }
  return null
}

/**
 * 휴식 키가 «클수록 좋음」인지 판정 — **`conditionRegistry`의 `direction`이 단일 출처다.**
 *
 * 대부분(`rest_after_*`·`return_gap_days`)은 공백이 길수록 조건에 가까워지지만,
 * `interval_days`만 반대다 — 이름 그대로 «다음 활동까지의 간격»이고, 카탈로그(「격주의
 * 약속」·「산을 잊지 않는」)가 요구하는 뜻은 «간격이 이 값을 넘기지 않고 계속 돌아온다»다
 * (티켓 20260906_1423 방향 수정 — DB에 `interval_days`를 쓰는 배지는 이 12종뿐임을 실측
 * 확인했다). 여기서 다시 표를 만들지 않는 이유: 방향을 두 곳에 적으면 어긋날 수 있고,
 * 이 값은 이미 `badgeConditionText.ts`(「이상」/「이하」 문구)·`badge-families.ts`
 * (레벨 스텝 난이도)가 보는 필드 메타의 단일 출처다.
 */
export function isRestKeyLowerBetter(key: RestConditionKey): boolean {
  return getConditionField(key)?.direction === 'lower'
}

/**
 * 휴식 키 하나의 «구간 술어» — 「어떤 구간이 후보인가」(eligible)·「무엇을 재는가」(measured)·
 * 「임계값과 어떻게 비교하는가」(compare, `isRestKeyLowerBetter`가 방향의 단일 출처).
 *
 * **`evaluateRestConditions`(발급 판정)와 `collectRestOccurrences`(회차)가 이 함수 하나를
 * 공유한다.** 두 곳이 각자 구간을 고르면 「발급은 됐는데 진행률은 다르다」가 된다 —
 * 이 파일이 맨 위에서 이미 명시한 실패 모드다(티켓 20260906_1423 §A-1).
 */
function restKeyPredicate(
  key: RestConditionKey,
  condition: BadgeCondition
): {
  eligible: (i: RestInterval) => boolean
  measured: (i: RestInterval) => number
  compare: (measured: number, value: number) => boolean
} {
  const compare: (measured: number, value: number) => boolean = isRestKeyLowerBetter(key)
    ? (m, v) => m <= v
    : (m, v) => m >= v
  switch (key) {
    case 'rest_after_streak':
      return {
        eligible: (i) => i.streakBefore >= (condition.streak_days as number),
        measured: (i) => i.restDays,
        compare,
      }
    case 'rest_after_long':
      // 「장거리」의 정의는 **조건에 실제로 든 짝 필드 전부**를 만족해야 성립한다(AND).
      // 카탈로그에는 둘 중 하나만 쓰는 형태뿐이지만, 둘 다 들어와도 한쪽이 조용히
      // 무시되지 않게 한다(fail-closed와 같은 태도).
      return {
        eligible: (i) =>
          (condition.single_distance_km === undefined || i.maxDistanceKmBefore >= condition.single_distance_km) &&
          (condition.duration_minutes === undefined || i.maxDurationMinBefore >= condition.duration_minutes),
        measured: (i) => i.restDays,
        compare,
      }
    case 'return_gap_days':
      return { eligible: () => true, measured: (i) => i.restDays, compare }
    case 'interval_days':
      return { eligible: () => true, measured: (i) => i.intervalDays, compare }
  }
}

/**
 * 휴식 조건이 «성립한 구간»의 복귀 활동 전부 — 시간순 (티켓 20260906_1423 §A-1).
 *
 * ## 왜 이게 «회차»인가
 *
 * `repeat_count`는 원래 활동 1건 단위 술어(`collectRepeatOccurrences`)로 셌고, 휴식은
 * 이력 패턴 술어라 그 위에 얹을 수 없었다(`repeatOccurrences.ts`의 ⚠️ 주석 — **그 판단은
 * 지금도 옳다**). 이 함수는 그 판단을 뒤집지 않고 **층을 바꾼다**: 휴식 판정이 이미
 * 만드는 «구간 목록»이 별도의 회차 축이다. `evaluateRestConditions`가 `find`로 첫 성립
 * 구간을 찾는 자리에서 `filter`를 하면 「성립한 휴식 구간 수」가 그대로 회차가 된다.
 *
 * 반환 형태를 `NormalizedActivity[]`(각 구간의 복귀 활동)로 맞춘 이유는
 * `collectRepeatOccurrences`의 소비처(계기 활동 선정 `selectTriggerActivity` ·
 * `earn_history` 순서 규약 · 이번 배치 교집합)가 그대로 성립하게 하기 위해서다.
 *
 * ## fail-closed
 * - 휴식 키가 2개 이상이면 «한 구간이 두 조건을 동시에 만족»의 뜻이 정의된 바 없어 `[]`
 * - 값·짝 필드 형태 오류도 `[]` — 발급 판정이 같은 검사로 fail하는 자리와 짝을 이룬다
 * - 「휴식 술어가 보지 않는 축」은 여기서 보지 않는다. 그 가드는 `restRepeatBlockReason`이
 *   조건 «형태» 판정으로 상위에서 한 번에 막는다(회차·진행·어드민이 같은 함수를 본다)
 */
export function collectRestOccurrences(
  condition: BadgeCondition,
  activities: NormalizedActivity[],
  options?: { anchorDate?: string }
): NormalizedActivity[] {
  const keys = restConditionKeysIn(condition)
  if (keys.length !== 1) return []
  if (restConditionShapeError(condition)) return []

  const key = keys[0]
  const value = condition[key] as number
  const { eligible, measured, compare } = restKeyPredicate(key, condition)
  // 구간 생성은 `evaluateRestConditions`와 **같은 두 함수**(`restPool` → `buildRestIntervals`)를
  // 쓴다 — 앵커 하한·종목 필터·걷기 축1 게이트·날짜 정렬이 한 곳에만 정의돼 있다.
  const intervals = buildRestIntervals(restPool(condition, activities, options?.anchorDate))
  // 구간은 날짜 오름차순이라 복귀 활동도 시간순이다(earn_history 순서 규약).
  return intervals.filter((i) => eligible(i) && compare(measured(i), value)).map((i) => i.resume)
}

/**
 * 휴식 조건 + 회차(`repeat_count`) 조합 중 **여전히 막는 형태** (티켓 20260906_1423 §A-3).
 *
 * 배타 규칙(티켓 20260905_0030 B-10)은 조합 자체를 막았다. 이제 「휴식 구간 = 회차」로
 * 열되, 뜻이 정의되지 않는 두 형태는 계속 fail-closed로 남긴다.
 *
 *   ① 휴식 키 2개 이상 — 「한 구간이 두 휴식 조건을 동시에 만족」이 카탈로그에 정의된 바 없다
 *   ② 휴식 술어가 «보지 않는 축»이 남아 있음 — 그 축을 무시한 회차가 세어진다
 *      (`collectRepeatOccurrences`의 `unconsumedRepeatConditionKeys`와 같은 태도)
 *
 * **발급 판정·회차 카운터·진행 계산·어드민 저장 가드가 전부 이 함수 하나를 본다.**
 * 목록을 각자 들면 「어드민은 저장을 막는데 엔진은 발급한다」가 된다.
 */
export function restRepeatBlockReason(
  condition: BadgeCondition | null | undefined
): { reason: string; actual: string; required: string } | null {
  if (!condition || condition.repeat_count === undefined) return null
  const keys = restConditionKeysIn(condition)
  if (keys.length === 0) return null
  if (keys.length >= 2) {
    return {
      reason: '회차와 함께 쓸 수 없는 조건',
      actual: `휴식 조건 ${keys.length}개: ${keys.join(', ')}`,
      required: '휴식 조건 1개 + 회차',
    }
  }
  const unconsumed = unconsumedRestRepeatKeys(condition)
  if (unconsumed.length > 0) {
    return {
      reason: '회차와 함께 쓸 수 없는 조건',
      actual: `휴식 술어가 보지 않는 조건: ${unconsumed.join(', ')}`,
      required: '종목·휴식 조건·그 짝 필드·회차만 사용',
    }
  }
  return null
}

/**
 * 휴식 + 회차 조합에서 «휴식 구간 술어가 소비하지 않는» 조건 키.
 *
 * 짝 필드 목록을 **다시 적지 않는다** — `restConsumedPairKeys` 하나만 본다(§A-3).
 */
export function unconsumedRestRepeatKeys(condition: BadgeCondition): string[] {
  const allowed = new Set<string>([
    'activity_type',
    'repeat_count',
    ...restConditionKeysIn(condition),
    ...restConsumedPairKeys(condition),
  ])
  return Object.entries(condition)
    .filter(([k, v]) => v !== undefined && !allowed.has(k))
    .map(([k]) => k)
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
  // 「작을수록 좋음」 방향이라 실패 사유도 반대다 — 간격이 «모자란» 게 아니라 «넘친» 것이다
  // (티켓 20260906_1423 방향 수정, REST_KEY_DIRECTION 참고).
  interval_days: '활동 간격 초과',
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

  // ── ①③ 값의 형태 · 짝 필드 — `collectRestOccurrences`와 **같은 검사**를 쓴다
  //    (티켓 20260906_1423 §A-1: 발급 판정과 회차가 같은 함수를 봐야 한다).
  const shapeError = restConditionShapeError(condition)
  if (shapeError) return { kind: 'fail', ...shapeError }

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
    // 구간 술어는 `restKeyPredicate` 한 곳에만 있다 — 회차 수집(`collectRestOccurrences`)이
    // 같은 술어로 `find` 대신 `filter`를 한다(티켓 20260906_1423 §A).
    const predicate = restKeyPredicate(key, condition)
    const measured = predicate.measured
    const eligible = intervals.filter(predicate.eligible)

    const hit = eligible.find((i) => predicate.compare(measured(i), value))
    if (!hit) {
      // 「클수록 좋음」이면 실패해도 가장 근접한 값은 최댓값, 「작을수록 좋음」이면 최솟값이다
      // (interval_days만 후자 — isRestKeyLowerBetter).
      const best =
        eligible.length === 0
          ? 0
          : isRestKeyLowerBetter(key)
            ? Math.min(...eligible.map(measured))
            : Math.max(...eligible.map(measured))
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

/** 미발급 사유의 `required` 문구 — 짝 필드까지 함께 읽어야 뜻이 완성된다 */
function describeRestRequirement(key: RestConditionKey, condition: BadgeCondition): string {
  switch (key) {
    case 'rest_after_streak':
      return `연속 ${condition.streak_days}일 뒤 휴식 ${condition.rest_after_streak}일`
    case 'rest_after_long': {
      // 「장거리」의 정의가 거리·시간 두 축이 됐다(티켓 20260906_1423 §B) — 조건에 든 축만 적는다
      const long: string[] = []
      if (condition.single_distance_km !== undefined) long.push(`${condition.single_distance_km}km 이상`)
      if (condition.duration_minutes !== undefined) long.push(`${condition.duration_minutes}분 이상`)
      return `${long.join(' · ')} 활동 뒤 휴식 ${condition.rest_after_long}일`
    }
    case 'return_gap_days':
      return `복귀 전 휴식 ${condition.return_gap_days}일`
    case 'interval_days':
      return `활동 간격 ${condition.interval_days}일 이하`
  }
}
