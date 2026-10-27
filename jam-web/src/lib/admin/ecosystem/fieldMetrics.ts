/**
 * 필드 마디(활동 동기화·잼·드랍·픽업)의 값 계산 (티켓 20261026_2027 2회차, PRD admin-boards §7)
 *
 * 읽어 온 행에서 대표 지표를 센다. 읽기는 `load.ts`가 한다. 기간은 `start` 이상 `end` 미만(ms)의 롤링 구간이다
 * (`kpiWeekly.ts`의 `resolveKpiWeeklyRange`와 같은 정의: 지금부터 N×24시간 전까지).
 *
 * ## 대상 유저
 *
 * 개수를 세는 마디(활동 동기화·유저 드랍·픽업)는 대상 유저만 센다. 대상은 어드민과 `TEST_ACCOUNT_USER_IDS` 계정을 뺀 유저다(`countedUserIdsOf`).
 * 시스템 드랍은 유저가 없어 유저 조건을 걸지 않는다. 잼 합계는 유저 조건 없이 장부 그대로 합한다(운영자가 직접 지급한 행만 뺀다).
 *
 * 순수 모듈이다. 서버 모듈을 값으로 가져오지 않는다.
 */
import { TEST_ACCOUNT_USER_IDS } from '@/lib/env/test-accounts'

/** 시각 구간. `start` 이상 `end` 미만이다(ms) */
export interface CountWindow {
  start: number
  end: number
}

/** `kpiWeekly.ts`와 같은 정의: 동기화 중 드랍 시도가 실패한 행은 동기화 실패 건수에서 뺀다 */
export const DROP_ATTEMPT_FAILED = 'drop_attempt_failed'
/** 과거 활동을 한꺼번에 채워 넣은 행. 동기화된 활동 건수에서 뺀다 */
export const MANUAL_BACKFILL = 'manual_backfill'

export interface ActivityRow {
  user_id: string
  created_at: string
  processed_via: string
}

export interface SyncFailureRow {
  occurred_at: string
  failure_type: string
}

export interface JamRow {
  amount: number
  admin_user_id: string | null
  created_at: string
}

export interface DropRow {
  source: string
  dropper_user_id: string | null
  picked_up_by: string | null
  dropped_at: string
  picked_up_at: string | null
}

export interface CountedUserRow {
  id: string
  is_admin: boolean
}

/** 롤링 구간: `now`에서 `days`×24시간 전까지 */
export function rollingWindow(now: Date, days: number): CountWindow {
  const end = now.getTime()
  return { start: end - days * 24 * 60 * 60 * 1000, end }
}

function inWindow(iso: string | null, window: CountWindow): boolean {
  if (iso === null) return false
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return false
  return at >= window.start && at < window.end
}

/** 센 대상 유저: 어드민과 시스템·테스트 계정을 뺀다 */
export function countedUserIdsOf(users: readonly CountedUserRow[]): Set<string> {
  const systemIds = new Set<string>(TEST_ACCOUNT_USER_IDS)
  const ids = new Set<string>()
  for (const user of users) {
    if (user.is_admin || systemIds.has(user.id)) continue
    ids.add(user.id)
  }
  return ids
}

/** 동기화된 활동 건수: `created_at`이 기간 안이고 `manual_backfill`이 아닌 행. 대상 유저만 센다 */
export function countSyncedActivities(
  rows: readonly ActivityRow[],
  countedUserIds: ReadonlySet<string>,
  window: CountWindow
): number {
  return rows.filter(
    (row) =>
      row.processed_via !== MANUAL_BACKFILL && countedUserIds.has(row.user_id) && inWindow(row.created_at, window)
  ).length
}

/** 동기화 실패 건수(보조): `occurred_at`이 기간 안이고 드랍 시도 실패가 아닌 행 */
export function countSyncFailures(rows: readonly SyncFailureRow[], window: CountWindow): number {
  return rows.filter((row) => row.failure_type !== DROP_ATTEMPT_FAILED && inWindow(row.occurred_at, window)).length
}

/**
 * 잼 합계. `granted`는 `amount > 0`이고 운영자 지급(`admin_user_id`)이 아닌 행의 합,
 * `spent`는 `amount < 0`인 행의 합을 양수로 바꾼 값(쓴 잼)이다
 */
export function sumJam(rows: readonly JamRow[], window: CountWindow): { granted: number; spent: number } {
  let granted = 0
  let spent = 0
  for (const row of rows) {
    if (!inWindow(row.created_at, window)) continue
    if (row.amount > 0 && row.admin_user_id === null) granted += row.amount
    else if (row.amount < 0) spent += -row.amount
  }
  return { granted, spent }
}

/** 놓인 드랍 건수: `dropped_at`이 기간 안인 행. 유저 드랍은 대상 유저가 놓은 것만, 시스템 드랍은 유저 조건 없이 센다 */
export function countDrops(
  rows: readonly DropRow[],
  source: 'system' | 'user',
  window: CountWindow,
  countedUserIds: ReadonlySet<string>
): number {
  return rows.filter((row) => {
    if (row.source !== source || !inWindow(row.dropped_at, window)) return false
    if (source === 'system') return true
    return row.dropper_user_id !== null && countedUserIds.has(row.dropper_user_id)
  }).length
}

/** 주워 간 드랍 건수: `picked_up_at`이 기간 안이고 주운 유저가 대상 유저인 행 */
export function countPickups(
  rows: readonly DropRow[],
  window: CountWindow,
  countedUserIds: ReadonlySet<string>
): number {
  return rows.filter(
    (row) => row.picked_up_by !== null && countedUserIds.has(row.picked_up_by) && inWindow(row.picked_up_at, window)
  ).length
}
