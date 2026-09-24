/**
 * 어드민 포인트 지급/회수 공용 로직(티켓 20260924_0951) — 단건 라우트
 * (`api/admin/points/grant`)와 유저 일괄 라우트(`api/admin/users/bulk`)가 같은 검증·같은
 * 실행 함수를 쓰게 해서 두 경로의 규칙이 갈라지지 않게 한다.
 *
 * - `validateAdminGrantInput`: 금액·사유·메모·고액 확인 검증(순수 함수). 유저 ID 검증은
 *   호출부 몫이다 — 단건은 본문의 `userId`, 일괄은 `ids` 목록이라 형태가 다르다.
 * - `executeAdminGrant`: 유저 한 명에게 지급/회수를 실행하고 원장·잔액을 돌려준다.
 */
import { awardPoints, getWallet } from '@/lib/points'
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
  transaction: PointTransactionRow
  balance: number
}

/** 유저 한 명에게 검증을 통과한 지급/회수를 실행한다. 실패하면 null(원장 미기록) */
export async function executeAdminGrant(
  userId: string,
  grant: ValidAdminGrant
): Promise<ExecutedAdminGrant | null> {
  const reason = grant.amount > 0 ? 'admin_grant' : 'admin_deduct'
  const transaction = await awardPoints(userId, grant.amount, reason, {
    adminReasonLabel: grant.reasonLabel,
    adminReasonNote: grant.note,
  })
  if (!transaction) return null

  const balance = await getWallet(userId)
  return { transaction, balance }
}
