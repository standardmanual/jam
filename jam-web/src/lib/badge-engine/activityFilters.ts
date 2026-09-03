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
 * 이 파일은 그래서 **NormalizedActivity/DayOfWeek 타입 외 어떤 것도 import하지 않는다** —
 * Supabase도, next/headers도, index.ts도. 두 타입 모두 순수 타입 정의 파일
 * (`@/types/strava`, `@/types/database`)에서 온 type-only import라 런타임 의존이 전혀 없다.
 *
 * 함수 본문은 index.ts에 있던 것을 그대로 옮긴 것이다 — 로직 변경 없음.
 */
import type { NormalizedActivity } from '@/types/strava'
import type { DayOfWeek } from '@/types/database'

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
