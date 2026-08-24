/**
 * 알림함 시간 구간 헤더 — 오늘 / 이번 주 / 이번 달 / 이전 (티켓 20260824_021)
 * 스펙: Specs/PRD/Notification/PRD.md §6-1
 *
 * **KST 기준**이다. 서버(Vercel)는 UTC로 돌고 개발 머신은 KST라 로컬 벽시계 API
 * (`getDate()`·`toLocaleDateString`)에 의존하면 환경마다 구간이 갈린다 — `kst.ts`와 같은
 * 이유로 epoch에 9시간을 더한 뒤 UTC 필드를 읽는다.
 */
import { KST_OFFSET_MS, toValidDate } from './kst'

export type NotificationSection = 'today' | 'week' | 'month' | 'earlier'

interface KstParts {
  year: number
  month: number
  day: number
  /** 0=일 … 6=토 */
  weekday: number
}

function kstParts(at: Date | string | number): KstParts {
  const k = new Date(toValidDate(at).getTime() + KST_OFFSET_MS)
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth(),
    day: k.getUTCDate(),
    weekday: k.getUTCDay(),
  }
}

/** KST 벽시계 자정의 epoch(ms) */
function kstMidnightMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) - KST_OFFSET_MS
}

/**
 * 이 소식이 속한 시간 구간.
 *
 * "이번 주"는 **월요일 시작**이다(한국에서 통용되는 주 경계).
 */
export function notificationSection(
  at: Date | string | number,
  now: Date | string | number = new Date()
): NotificationSection {
  const nowParts = kstParts(now)
  const itemParts = kstParts(at)
  const itemMs = toValidDate(at).getTime()

  if (
    itemParts.year === nowParts.year &&
    itemParts.month === nowParts.month &&
    itemParts.day === nowParts.day
  ) {
    return 'today'
  }

  // 월요일 시작 — getUTCDay()가 0(일)일 때 6일을 되감아야 한다
  const daysFromMonday = (nowParts.weekday + 6) % 7
  const weekStartMs = kstMidnightMs(nowParts.year, nowParts.month, nowParts.day - daysFromMonday)
  if (itemMs >= weekStartMs) return 'week'

  const monthStartMs = kstMidnightMs(nowParts.year, nowParts.month, 1)
  if (itemMs >= monthStartMs) return 'month'

  return 'earlier'
}
