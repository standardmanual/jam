/**
 * 이용 정지 걸기·풀기 — 서버 전용 (티켓 20261017_1426 2회, 운영 로직 16.1·16.4·16.7절)
 *
 * 어드민 API(`/api/admin/suspensions`)만 쓴다. 서비스 클라이언트(service_role)를 인자로 받는다.
 * 정지는 운영자만 걸고 푼다. 걸 때 까닭이 필수이고, 정지를 걸 때마다 한 줄이 생기며 풀면 그 줄의 `lifted_at`을 채운다(줄은 지우지 않는다).
 * 유저당 진행 중 정지는 하나뿐이다(부분 유니크 인덱스 `uq_user_suspensions_active`).
 *
 * 서버 전용이다. 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 *
 * 예상한 거절은 던지지 않고 `{ ok: false, code }`로 돌려준다(라우트가 400·404·409로 바꾼다).
 * 예상하지 못한 DB 오류는 던진다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type SuspendFailure = 'reason_required' | 'user_not_found' | 'already_suspended'
export type LiftFailure = 'not_suspended'

export type SuspendResult = { ok: true; id: string } | { ok: false; code: SuspendFailure }
export type LiftResult = { ok: true } | { ok: false; code: LiftFailure }

/** Postgres unique_violation — 유저당 진행 중 정지 하나(부분 유니크 인덱스) 위반 */
const UNIQUE_VIOLATION = '23505'

interface DbError {
  code?: string
  message: string
}

/**
 * 정지를 건다. 까닭은 앞뒤 공백을 지운 뒤 비어 있으면 거부한다(DB에도 `length(btrim(reason)) > 0` 제약이 있다).
 * 이미 진행 중인 정지가 있으면 `already_suspended`, 없는 유저면 `user_not_found`.
 */
export async function suspendUser(
  supabase: SupabaseClient,
  input: { userId: string; reason: string; adminEmail: string }
): Promise<SuspendResult> {
  const reason = input.reason.trim()
  if (!reason) return { ok: false, code: 'reason_required' }

  const found = await supabase.from('users').select('id').eq('id', input.userId).maybeSingle()
  if (found.error) throw new Error(`users 조회 실패: ${found.error.message}`)
  if (!found.data) return { ok: false, code: 'user_not_found' }

  const inserted = await supabase
    .from('user_suspensions')
    .insert({ user_id: input.userId, reason, suspended_by: input.adminEmail })
    .select('id')
    .single()
  if (inserted.error) {
    const error = inserted.error as DbError
    if (error.code === UNIQUE_VIOLATION) return { ok: false, code: 'already_suspended' }
    throw new Error(`user_suspensions 삽입 실패: ${error.message}`)
  }
  return { ok: true, id: (inserted.data as { id: string }).id }
}

/**
 * 진행 중인 정지를 푼다. 푼 시각·푼 사람·메모를 채운다. 이미 풀렸거나 없는 정지면 `not_suspended`.
 * 푼 시각은 건 시각보다 앞서지 않게 한다(DB 제약 `lifted_at >= suspended_at` — 서버 시계가 DB 시계보다 조금 앞서 있어도 깨지지 않는다).
 */
export async function liftSuspension(
  supabase: SupabaseClient,
  input: { suspensionId: string; adminEmail: string; note?: string | null; now?: Date }
): Promise<LiftResult> {
  const read = await supabase
    .from('user_suspensions')
    .select('id, suspended_at, lifted_at')
    .eq('id', input.suspensionId)
    .maybeSingle()
  if (read.error) throw new Error(`user_suspensions 조회 실패: ${read.error.message}`)
  const row = read.data as { id: string; suspended_at: string; lifted_at: string | null } | null
  if (!row || row.lifted_at !== null) return { ok: false, code: 'not_suspended' }

  const nowMs = (input.now ?? new Date()).getTime()
  const liftedAt = new Date(Math.max(nowMs, Date.parse(row.suspended_at))).toISOString()
  const note = input.note?.trim() ? input.note.trim() : null

  // 읽은 뒤 다른 운영자가 먼저 풀었을 수 있다 — 진행 중인 줄만 갱신하고, 갱신된 줄이 없으면 이미 풀린 것이다
  const updated = await supabase
    .from('user_suspensions')
    .update({ lifted_at: liftedAt, lifted_by: input.adminEmail, lift_note: note })
    .eq('id', input.suspensionId)
    .is('lifted_at', null)
    .select('id')
  if (updated.error) throw new Error(`user_suspensions 갱신 실패: ${updated.error.message}`)
  if (!updated.data || updated.data.length === 0) return { ok: false, code: 'not_suspended' }
  return { ok: true }
}
