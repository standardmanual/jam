/**
 * 어드민 포인트 회수 — DB 함수 반환 계약 (티켓 20261019_1314, 마이그레이션 252, 운영 로직 14.2절)
 *
 * `admin_deduct_points`가 돌려주는 JSON을 앱이 다루는 모양으로 읽는다. 모양이 계약과 다르면
 * `null`이다 — 호출한 쪽이 «성공으로 보지 않고» 기록한 뒤 멈춘다(fail-closed, 미션 보상의
 * `lib/missions/claim-contract.ts`와 같은 방식).
 *
 * 계약(마이그레이션 252 머리말):
 *   {ok:true, transactionId, balance}                              — balance는 회수 뒤 잔액
 *   {ok:false, error:'insufficient_balance', balance, requested}   — 잔액이 요청 금액보다 적음
 *   {ok:false, error:'invalid_amount'}                             — 금액이 비었거나 0 이하
 *
 * 서버 의존이 없는 순수 모듈이다.
 */

export type AdminDeductResult =
  | { ok: true; transactionId: string; balance: number }
  | { ok: false; error: 'insufficient_balance'; balance: number; requested: number }
  | { ok: false; error: 'invalid_amount' }

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/** `admin_deduct_points` 응답을 읽는다. 계약 밖의 모양이면 null. */
export function parseAdminDeductResult(raw: unknown): AdminDeductResult | null {
  const r = asRecord(raw)
  if (!r || typeof r.ok !== 'boolean') return null

  if (r.ok) {
    // 회수가 통과했다면 잔액은 0 이상이다 — 음수면 계약 위반이라 성공으로 보지 않는다
    if (typeof r.transactionId !== 'string' || r.transactionId.length === 0) return null
    if (!isInteger(r.balance) || r.balance < 0) return null
    return { ok: true, transactionId: r.transactionId, balance: r.balance }
  }

  if (r.error === 'invalid_amount') return { ok: false, error: 'invalid_amount' }

  if (r.error === 'insufficient_balance') {
    // 잔액은 옛 경로(award_points 직접 회수)로 이미 음수가 된 지갑일 수 있어 음수도 받는다
    if (!isInteger(r.balance)) return null
    if (!isInteger(r.requested) || r.requested <= 0) return null
    return { ok: false, error: 'insufficient_balance', balance: r.balance, requested: r.requested }
  }

  return null
}
