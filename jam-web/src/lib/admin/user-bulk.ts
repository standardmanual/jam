/**
 * 유저 일괄 처리 순수 판정(티켓 20260924_0951, 상위 티켓 §4.4·결정 3) —
 * `api/admin/users/bulk/route.ts`가 그대로 쓴다. DB를 읽는 영향 집계는
 * `user-bulk-impact.ts`가 따로 갖는다.
 */
import { isAdminAccount } from './auth'
import type { BulkSkip } from './bulk/shared'

/** 유저 일괄 처리 동작 이름 — 라우트·확인창·토스트가 같은 값을 쓴다.
 *  ⚠️ 이 파일은 `./auth`(서버 전용)를 import한다 — 클라이언트 컴포넌트는 `import type`만 쓴다. */
export type UserBulkAction = 'grant_points' | 'reset' | 'delete'

/** 유저 초기화·삭제의 한 번 처리 상한(상위 티켓 §2) */
export const USER_BULK_HEAVY_MAX_IDS = 50

/** 포인트 일괄 지급·회수의 한 번 처리 상한 — 유저마다 RPC·잔액 조회·알림이 나가고 동시 5건이라 60초 안에 끝나는 규모로 제한한다 */
export const USER_BULK_GRANT_MAX_IDS = 200

export const SKIP_REASON_ADMIN = '어드민 계정'
export const SKIP_REASON_SELF = '본인 계정'
export const SKIP_REASON_NOT_FOUND = '유저를 찾을 수 없습니다.'

export interface UserTarget {
  id: string
  email: string | null | undefined
  is_admin: boolean | null | undefined
}

export interface UserTargetPartition {
  /** 실제로 처리할 유저 id(요청 순서 유지) */
  eligible: string[]
  skipped: BulkSkip[]
  excludedAdminCount: number
  excludedSelfCount: number
}

/**
 * 일괄 대상에서 어드민·본인 계정을 자동으로 뺀다(상위 티켓 결정 3).
 *
 * - 실행 어드민 본인은 그 자신도 어드민이므로 **본인 판정을 먼저** 한다 — 그래야 "본인
 *   계정"과 "어드민 계정" 제외 수가 각각 의미를 갖는다.
 * - 어드민 판정은 `isAdminAccount`(화이트리스트 이메일 또는 `users.is_admin`)를 그대로 쓴다.
 * - 조회되지 않은 id(이미 삭제됐거나 잘못된 값)는 "유저를 찾을 수 없습니다"로 건너뛴다.
 */
export function partitionUserTargets(
  ids: string[],
  targets: UserTarget[],
  adminId: string
): UserTargetPartition {
  const byId = new Map(targets.map((t) => [t.id, t]))
  const eligible: string[] = []
  const skipped: BulkSkip[] = []
  let excludedAdminCount = 0
  let excludedSelfCount = 0

  for (const id of ids) {
    const target = byId.get(id)
    // 건너뜀 안내에 UUID 대신 이메일을 보여 주려고 알고 있는 경우에만 label을 붙인다
    const label = target?.email || undefined
    if (id === adminId) {
      skipped.push({ id, reason: SKIP_REASON_SELF, label })
      excludedSelfCount++
      continue
    }
    if (!target) {
      skipped.push({ id, reason: SKIP_REASON_NOT_FOUND })
      continue
    }
    if (isAdminAccount(target)) {
      skipped.push({ id, reason: SKIP_REASON_ADMIN, label })
      excludedAdminCount++
      continue
    }
    eligible.push(id)
  }

  return { eligible, skipped, excludedAdminCount, excludedSelfCount }
}

/** `payload`에서 유저별 지급 입력을 꺼낸다 — 형식이 다르면 빈 객체(검증기가 400으로 거른다) */
export function readGrantPayload(payload: unknown): {
  amount?: unknown
  reasonLabel?: unknown
  note?: unknown
  confirmed?: unknown
} {
  if (typeof payload !== 'object' || payload === null) return {}
  const p = payload as Record<string, unknown>
  return { amount: p.amount, reasonLabel: p.reasonLabel, note: p.note, confirmed: p.confirmed }
}

/** 등급 3 확인 문구에 쓰는 동작 이름 — 부호가 있는 포인트는 방향까지 적어 지급·회수를 혼동하지 않게 한다 */
export function userBulkPhraseAction(action: UserBulkAction, amount?: number): string {
  if (action === 'grant_points') return amount !== undefined && amount < 0 ? '회수' : '지급'
  return action === 'reset' ? '초기화' : '삭제'
}

/** 미리보기 `impact` 값 — 화면(`UsersTable` 확인창)이 같은 키를 읽는다 */
export interface UserBulkImpact {
  targetCount: number
  excludedAdminCount: number
  excludedSelfCount: number
  // 포인트
  totalAmount?: number
  /**
   * 회수하지 못하고 건너뛰는 유저 수 — 잔액이 요청 금액보다 적은 유저(티켓 20261019_1314: 잔액보다 큰 회수는 마이너스가 아니라 거절된다).
   * 지급이거나 회수 대상이 없으면 0이다.
   */
  revokeSkippedCount?: number
  notificationCount?: number
  // 초기화·삭제
  badgeCount?: number
  itemCount?: number
  missionCompletionCount?: number
  pointBalanceTotal?: number
  stravaConnectionCount?: number
}

/** `{ 유저id: 건수 }` 맵의 합 */
export function sumCounts(counts: Record<string, number>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}
