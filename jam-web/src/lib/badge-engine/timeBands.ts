/**
 * 시간대 구간 상수와 KST 변환 — 단일 출처 (티켓 20261018_1815 1회)
 *
 * 스펙(`docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md` 10장)의 시간대 6구간을 한 곳에 둔다.
 * 배지 조건 판정(`activityFilters.ts`)·조건 문구(`badgeConditionText.ts`)와, 옛 드랍 엔진
 * (`drop-engine/context.ts`, 티켓 20261022_0938에서 삭제)이 이 상수를 읽었다 — 여러 곳이 각자 경계를 들고 있으면
 * 같은 활동이 «새벽»이기도 «아침»이기도 하다(이전 상태: 판정 4~8시, 드랍 5~7시).
 *
 * 판정은 활동 시작 시각(UTC `startDate`)을 한국 시각(KST, UTC+09:00 고정)으로 바꿔 읽는다.
 * `startDateLocal`(현지 벽시계에 Z를 붙인 값)은 쓰지 않는다 — 해외 활동도 한국 시각으로
 * 같은 구간에 든다(사용자 결정 1).
 *
 * 순수 모듈이다 — `badgeProgress.ts`가 클라이언트에서도 import하므로 서버 전용 모듈을
 * 끌어오지 않는다(`activityFilters.ts` 머리 주석 참조).
 */
import { KST_OFFSET_MS } from '@/lib/notifications/kst'

export interface TimeBandDef {
  name: TimeBand
  /** 시작 시(포함, 0~23) */
  startHour: number
  /** 끝 시(미포함). 밤만 자정을 걸쳐 startHour > endHour */
  endHour: number
}

export const TIME_BANDS = ['새벽', '오전', '점심', '오후', '저녁', '밤'] as const
export type TimeBand = (typeof TIME_BANDS)[number]

/** 새벽 5~7, 오전 7~11, 점심 11~14, 오후 14~18, 저녁 18~22, 밤 22~5시 — 시작 포함·끝 미포함 */
export const TIME_BAND_DEFS: readonly TimeBandDef[] = [
  { name: '새벽', startHour: 5, endHour: 7 },
  { name: '오전', startHour: 7, endHour: 11 },
  { name: '점심', startHour: 11, endHour: 14 },
  { name: '오후', startHour: 14, endHour: 18 },
  { name: '저녁', startHour: 18, endHour: 22 },
  { name: '밤', startHour: 22, endHour: 5 },
]

/** 시(0~23)가 속하는 시간대. 구간은 시작 포함·끝 미포함, 밤만 자정을 걸친다 */
export function timeBandOfHour(hour: number): TimeBand {
  if (hour >= 5 && hour < 7) return '새벽'
  if (hour >= 7 && hour < 11) return '오전'
  if (hour >= 11 && hour < 14) return '점심'
  if (hour >= 14 && hour < 18) return '오후'
  if (hour >= 18 && hour < 22) return '저녁'
  return '밤'
}

/**
 * `HH:MM` 문자열 → 하루 중 분. `:`로 나눠 앞 두 칸(시·분)만 읽는다 — `HH:MM:SS`(초는 버림)와
 * `24:00`(= 1440분)도 받는다. 읽을 수 없는 값은 NaN이라 어떤 분과도 맞지 않는다.
 *
 * 시간대 조건 `{start,end}`를 해석하는 곳은 이 함수 하나다 — 배지 엔진의 `inTimeRange`와 순위형
 * 미션의 밤 조건 검사(`missions/condition-keys.ts`)가 따로 읽으면 «저장 검사는 통과시켰는데 엔진은
 * 그 시각을 센다»가 생긴다(티켓 20261019_1312 2회).
 */
export function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * 하루 중 분(0~1439)이 `{start,end}` 시간대 범위에 드는가 — 자정 걸침 지원(`start > end`면 다음 날까지),
 * **양 끝 포함**. 활동이 «22:00»에 시작하면 `18:00~22:00`에도 든다.
 */
export function isMinuteInTimeRange(minuteOfDay: number, range: { start: string; end: string }): boolean {
  const s = clockToMinutes(range.start)
  const e = clockToMinutes(range.end)
  return s > e ? (minuteOfDay >= s || minuteOfDay <= e) : (minuteOfDay >= s && minuteOfDay <= e)
}

/** UTC 시각 문자열을 KST 벽시계로 옮긴 Date — UTC 게터로 읽어야 KST 값이 나온다 */
function shiftToKst(startDate: string): Date {
  return new Date(new Date(startDate).getTime() + KST_OFFSET_MS)
}

/** KST 기준 날짜 `YYYY-MM-DD` */
export function kstDateKeyOfStart(startDate: string): string {
  return shiftToKst(startDate).toISOString().slice(0, 10)
}

/** KST 기준 시(0~23) */
export function kstHourOfStart(startDate: string): number {
  return shiftToKst(startDate).getUTCHours()
}

/** KST 기준 하루 중 분(0~1439) */
export function kstMinuteOfDayOfStart(startDate: string): number {
  const k = shiftToKst(startDate)
  return k.getUTCHours() * 60 + k.getUTCMinutes()
}

/** KST 기준 `HH:MM` */
export function kstClockOfStart(startDate: string): string {
  return shiftToKst(startDate).toISOString().slice(11, 16)
}

/** KST 기준 요일(0=일 ~ 6=토) */
export function kstDayOfWeekOfStart(startDate: string): number {
  return shiftToKst(startDate).getUTCDay()
}

/** KST 기준 월(1~12) */
export function kstMonthOfStart(startDate: string): number {
  return shiftToKst(startDate).getUTCMonth() + 1
}

/** KST 기준 연-월 키 `YYYY-M` (월은 0 채움 없음 — 기존 `monthKeyOf` 규약) */
export function kstYearMonthKeyOfStart(startDate: string): string {
  const k = shiftToKst(startDate)
  return `${k.getUTCFullYear()}-${k.getUTCMonth() + 1}`
}

/** KST 기준 주(월~일)의 월요일 날짜 `YYYY-MM-DD` */
export function kstMondayKeyOfStart(startDate: string): string {
  const k = shiftToKst(startDate)
  const day = k.getUTCDay()
  const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - (day === 0 ? 6 : day - 1)))
  return monday.toISOString().slice(0, 10)
}
