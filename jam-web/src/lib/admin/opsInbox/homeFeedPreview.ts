/**
 * 기획 상세의 [홈피드로 보기]가 쓰는 값 계산 (티켓 20261026_2025 2회차, 어드민 상황판 PRD §6.3). 순수 함수라 클라이언트에서 쓴다.
 */
import { todayKstDateString } from '@/lib/admin/today-calendar'
import { kstDateKey } from './labels'

/** 항목들 중 가장 이른 공개 시각(ISO). 읽을 수 있는 시각이 하나도 없으면 null이다. */
export function earliestStartsAt(items: readonly { startsAt: string | null }[]): string | null {
  let best: { time: number; iso: string } | null = null
  for (const { startsAt } of items) {
    if (!startsAt) continue
    const time = Date.parse(startsAt)
    if (Number.isNaN(time)) continue
    if (!best || time < best.time) best = { time, iso: startsAt }
  }
  return best?.iso ?? null
}

/** 미리보기가 처음 보여줄 날짜 'YYYY-MM-DD'(KST): 가장 이른 공개일, 없으면 묶음 주 월요일, 그것도 없으면 오늘. */
export function homeFeedInitialDate(startsAt: string | null, weekMonday: string | null, now: Date = new Date()): string {
  return kstDateKey(startsAt) ?? weekMonday ?? todayKstDateString(now)
}
