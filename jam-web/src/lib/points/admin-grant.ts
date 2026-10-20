/**
 * 어드민 포인트 지급/회수 공용 로직(티켓 20260924_0951) — 단건 라우트
 * (`api/admin/points/grant`)와 유저 일괄 라우트(`api/admin/users/bulk`)가 같은 검증·같은
 * 실행 함수를 쓰게 해서 두 경로의 규칙이 갈라지지 않게 한다.
 *
 * - `validateAdminGrantInput`: 금액·사유·메모·고액 확인 검증(순수 함수). 유저 ID 검증은
 *   호출부 몫이다 — 단건은 본문의 `userId`, 일괄은 `ids` 목록이라 형태가 다르다.
 * - `executeAdminGrant`: 유저 한 명에게 지급/회수를 실행하고 원장·잔액을 돌려준다.
 *   회수(음수)는 잔액이 0 아래로 내려가지 않게 `admin_deduct_points`를 쓰고, 잔액보다 큰
 *   회수는 거절(`AdminGrantRejected`)로 돌려준다(티켓 20261019_1314, 운영 로직 14.2절).
 */
import { awardPoints, deductPointsByAdmin, getWallet } from '@/lib/points'
import { isValidAdminReason, HIGH_VALUE_THRESHOLD, type AdminReasonValue } from '@/lib/points/reasons'
import type { PointTransactionRow } from '@/types/database'

export interface AdminGrantInput {
  amount?: unknown
  reasonLabel?: unknown
  note?: unknown
  confirmed?: unknown
}

export interface ValidAdminGrant {
  /** 부호 포함: 양수 지급, 음수 회수 */
  amount: number
  reasonLabel: AdminReasonValue
  /** `other` 사유일 때만 값이 있다 — 그 외에는 null로 저장한다 */
  note: string | null
}

export type ValidateAdminGrantResult =
  | { ok: true; grant: ValidAdminGrant }
  | { ok: false; status: 400 | 422; error: string; requiresConfirmation?: true }

/**
 * 금액은 0이 아닌 정수, 사유는 허용 목록, `other`는 메모 필수, |금액| ≥ 1,000P는
 * `confirmed === true`가 있어야 통과한다(프론트를 건너뛴 직접 호출·오탈자 방어선).
 */
export function validateAdminGrantInput(input: AdminGrantInput): ValidateAdminGrantResult {
  const { amount, reasonLabel, note, confirmed } = input

  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
    return { ok: false, status: 400, error: '금액은 0이 아닌 정수여야 합니다.' }
  }
  if (!isValidAdminReason(reasonLabel)) {
    return { ok: false, status: 400, error: '허용되지 않은 사유입니다.' }
  }
  const trimmedNote = typeof note === 'string' ? note.trim() : ''
  if (reasonLabel === 'other' && trimmedNote.length === 0) {
    return { ok: false, status: 400, error: '"기타" 사유는 내용을 입력해야 합니다.' }
  }

  if (Math.abs(amount) >= HIGH_VALUE_THRESHOLD && confirmed !== true) {
    return {
      ok: false,
      status: 422,
      error: `${Math.abs(amount).toLocaleString('ko-KR')}P는 기준액(${HIGH_VALUE_THRESHOLD.toLocaleString('ko-KR')}P) 이상입니다. 확인이 필요합니다.`,
      requiresConfirmation: true,
    }
  }

  return {
    ok: true,
    grant: { amount, reasonLabel, note: reasonLabel === 'other' ? trimmedNote : null },
  }
}

export interface ExecutedAdminGrant {
  /** 지급은 원장 행 전체, 회수는 RPC가 돌려주는 id만 담는다 */
  transaction: Pick<PointTransactionRow, 'id'>
  balance: number
}

/**
 * 잔액보다 큰 회수가 거절된 결과. 오류가 아니라 정상 응답이다 — 지갑·원장은 바뀌지 않았다.
 * 라우트가 단건은 HTTP 409, 일괄은 건너뛴 유저의 사유로 알린다.
 */
export interface AdminGrantRejected {
  rejected: true
  code: 'insufficient_balance'
  /** 거절 시점의 현재 잔액 */
  balance: number
  /** 요청한 회수 금액(양수) */
  requested: number
}

export function isAdminGrantRejected(
  result: ExecutedAdminGrant | AdminGrantRejected
): result is AdminGrantRejected {
  return 'rejected' in result && result.rejected === true
}

/**
 * 회수 거절 문구 — [현상] → [원인] → [해결책] (UX Writing 가이드 §4.1, 해요체).
 * 어드민이 현재 잔액과 요청 금액을 바로 볼 수 있게 두 수치를 모두 담는다.
 */
export function buildDeductRejectionMessage(rejected: Pick<AdminGrantRejected, 'balance' | 'requested'>): string {
  const requested = rejected.requested.toLocaleString('ko-KR')
  // 잔액이 0 이하(옛 경로로 음수가 된 지갑 포함)면 "0 포인트 이하로 줄여서"가 성립하지 않는다
  if (rejected.balance <= 0) {
    return `회수하지 못했어요. 이 유저의 잔액이 ${rejected.balance.toLocaleString('ko-KR')} 포인트라 ${requested} 포인트는 회수할 수 없어요. 회수할 포인트가 있는 유저인지 확인해 주세요.`
  }
  const balance = rejected.balance.toLocaleString('ko-KR')
  return `회수하지 못했어요. 이 유저의 잔액이 ${balance} 포인트라 ${requested} 포인트는 회수할 수 없어요. ${balance} 포인트 이하로 줄여서 다시 회수해 주세요.`
}

/**
 * 유저 한 명에게 검증을 통과한 지급/회수를 실행한다.
 * - 성공: 원장 기록과 잔액을 돌려준다. 회수의 잔액은 RPC가 돌려준 값이다(재조회하지 않아
 *   동시 실행과 어긋나지 않는다).
 * - 회수 거절(잔액 부족): `AdminGrantRejected`. 지갑·원장·알림은 그대로다.
 * - 그 밖의 실패: null(원장 미기록)
 */
export async function executeAdminGrant(
  userId: string,
  grant: ValidAdminGrant
): Promise<ExecutedAdminGrant | AdminGrantRejected | null> {
  if (grant.amount < 0) {
    const outcome = await deductPointsByAdmin(userId, -grant.amount, {
      label: grant.reasonLabel,
      note: grant.note,
    })
    if (!outcome) return null
    if (!outcome.ok) {
      return { rejected: true, code: outcome.error, balance: outcome.balance, requested: outcome.requested }
    }
    return { transaction: { id: outcome.transactionId }, balance: outcome.balance }
  }

  const transaction = await awardPoints(userId, grant.amount, 'admin_grant', {
    adminReasonLabel: grant.reasonLabel,
    adminReasonNote: grant.note,
  })
  if (!transaction) return null

  const balance = await getWallet(userId)
  return { transaction, balance }
}
