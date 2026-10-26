/**
 * 대시보드가 세는 유저(대상)와 기간 계산 (티켓 20261022_1136 1회 a, 「공통 규칙」)
 *
 * ## 대상
 *
 * 챕터 1에 오른 유저다(`chapter_ups`에 챕터 1이 있다). 아래는 뺀다.
 * - 시스템 계정: `TEST_ACCOUNT_USER_IDS`(dev-login 고정 유저와 QA용 계정 3개). 스테이징에서는 비어 있는 `excludedTestUserIds()`가 아니라 목록 전체를 쓴다.
 *   대시보드는 공용 DB 전체를 보므로 환경에 따라 대상이 달라지면 안 된다.
 * - `is_admin` 유저
 * - 지표가 보는 기간과 겹치는 이용 정지(`user_suspensions`, 마이그레이션 230)가 있는 유저. 정지 기간은 `suspended_at` 이상 `lifted_at` 미만이고, 풀리지 않았으면 끝이 없다.
 *   기간은 지표마다 다르므로 이 파일은 `isSuspendedDuring`만 제공하고 지표가 자기 기간을 넣어 부른다.
 *
 * ## 주
 *
 * 주는 KST 월요일 0시에 맞춘다. 가장 최근 «완결 주»의 끝은 지금이 속한 주의 월요일 0시 KST다(지금이 정확히 월요일 0시면 그 시각이다).
 * 시각 구간은 모두 «이상 ~ 미만»이라 일요일 23:59:59 KST는 그 주에 들고 월요일 00:00:00 KST는 다음 주에 든다.
 * KST는 서머타임이 없어 epoch에 9시간을 더한 뒤 UTC 필드로 요일을 읽으면 항상 맞다(`lib/notifications/kst.ts`와 같은 방식).
 *
 * 순수 모듈이다. 서버 모듈을 값으로 가져오지 않는다.
 */
import { TEST_ACCOUNT_USER_IDS } from '@/lib/env/test-accounts'
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import {
  CAPSULE_WINDOW_WEEKS,
  MONTHLY_WINDOW_DAYS,
  RARITY_WINDOW_WEEKS,
} from './targets'
import type { ChapterUpRow, SuspensionRow, UserRow } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

/** 시각 구간. `start` 이상 `end` 미만이다(ms) */
export interface TimeWindow {
  start: number
  end: number
}

/** `atMs`가 속한 주의 월요일 0시 KST(ms). 1970-01-01은 목요일이라 일 수에 3을 더해 월요일을 0으로 맞춘다 */
export function kstWeekStart(atMs: number): number {
  const shifted = atMs + KST_OFFSET_MS
  const day = Math.floor(shifted / DAY_MS)
  const daysSinceMonday = (((day + 3) % 7) + 7) % 7
  return (day - daysSinceMonday) * DAY_MS - KST_OFFSET_MS
}

/** 가장 최근 완결 주의 끝(= 지금이 속한 주의 월요일 0시 KST) */
export function lastCompleteWeekEnd(now: Date): number {
  return kstWeekStart(now.getTime())
}

/** 지표 1이 보는 구간: 완결 4주 */
export function capsuleWindow(now: Date): TimeWindow {
  const end = lastCompleteWeekEnd(now)
  return { start: end - CAPSULE_WINDOW_WEEKS * WEEK_MS, end }
}

/** 지표 3이 보는 구간: 지금까지 최근 30일(주에 맞추지 않는다) */
export function monthlyWindow(now: Date): TimeWindow {
  const end = now.getTime()
  return { start: end - MONTHLY_WINDOW_DAYS * DAY_MS, end }
}

/** 지표 4가 보는 구간: 완결 12주 */
export function rarityWindow(now: Date): TimeWindow {
  const end = lastCompleteWeekEnd(now)
  return { start: end - RARITY_WINDOW_WEEKS * WEEK_MS, end }
}

interface SuspensionInterval {
  from: number
  until: number
}

export interface CohortUser {
  id: string
  tribeId: string | null
  /** 챕터 1에 오른 시각(ms) */
  chapter1At: number
  /** 챕터 번호 → 오른 시각(ms) */
  reachedAt: ReadonlyMap<number, number>
  suspensions: readonly SuspensionInterval[]
}

export interface Cohort {
  users: readonly CohortUser[]
}

export interface BuildCohortInput {
  users: readonly UserRow[]
  chapterUps: readonly ChapterUpRow[]
  suspensions: readonly SuspensionRow[]
}

/** 대상 유저를 가린다. 시스템 계정, 어드민, 챕터 1에 오르지 않은 유저는 들어오지 않는다 */
export function buildCohort(input: BuildCohortInput): Cohort {
  const systemIds = new Set<string>(TEST_ACCOUNT_USER_IDS)

  const reachedByUser = new Map<string, Map<number, number>>()
  for (const row of input.chapterUps) {
    const at = Date.parse(row.reached_at)
    if (Number.isNaN(at)) continue
    const reached = reachedByUser.get(row.user_id) ?? new Map<number, number>()
    reached.set(row.chapter_no, at)
    reachedByUser.set(row.user_id, reached)
  }

  const suspensionsByUser = new Map<string, SuspensionInterval[]>()
  for (const row of input.suspensions) {
    const from = Date.parse(row.suspended_at)
    if (Number.isNaN(from)) continue
    const until = row.lifted_at === null ? Infinity : Date.parse(row.lifted_at)
    if (Number.isNaN(until)) continue
    const list = suspensionsByUser.get(row.user_id) ?? []
    list.push({ from, until })
    suspensionsByUser.set(row.user_id, list)
  }

  const users: CohortUser[] = []
  for (const row of input.users) {
    if (row.is_admin || systemIds.has(row.id)) continue
    const reachedAt = reachedByUser.get(row.id)
    const chapter1At = reachedAt?.get(1)
    if (reachedAt === undefined || chapter1At === undefined) continue
    users.push({
      id: row.id,
      tribeId: row.tribe_id,
      chapter1At,
      reachedAt,
      suspensions: suspensionsByUser.get(row.id) ?? [],
    })
  }
  return { users }
}

/** 구간 `from` 이상 `to` 미만과 겹치는 이용 정지가 있나 */
export function isSuspendedDuring(user: CohortUser, from: number, to: number): boolean {
  return user.suspensions.some((interval) => interval.from < to && interval.until > from)
}

/** `atMs` 직전까지(오른 시각이 `atMs` 미만) 오른 가장 높은 챕터. 하나도 오르지 않았으면 0 */
export function chapterAt(user: CohortUser, atMs: number): number {
  let highest = 0
  for (const [chapterNo, reachedAt] of user.reachedAt) {
    if (reachedAt < atMs && chapterNo > highest) highest = chapterNo
  }
  return highest
}
