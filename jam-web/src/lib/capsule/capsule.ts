/**
 * 캡슐 — 상태 조회와 채우기 (티켓 20261018_0052 1회, 운영 로직 5.2절)
 *
 * 캡슐 상태는 DB 함수 `capsule_get_or_create`(없으면 그때의 챕터로 필요량을 정해 만든다), 채우기는 `capsule_fill`(잼 원장 한 줄과
 * 캡슐 갱신이 한 트랜잭션)이 한다. 열기(추첨·지급·기록)는 2회다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 타입·상수는 `capsule-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import { CAPSULE_ERROR_CODES, type CapsuleErrorCode, type CapsuleFillPayload, type CapsuleStatus } from './capsule-contract'

/** DB 함수가 채우기를 거절했을 때 던진다. API 라우트가 상태 코드와 문구로 바꾼다. */
export class CapsuleError extends Error {
  readonly code: CapsuleErrorCode
  /** `exceeds_remaining`일 때 채울 수 있는 남은 양 */
  readonly remaining?: number

  constructor(code: CapsuleErrorCode, remaining?: number) {
    super(`캡슐 채우기 거절: ${code}`)
    this.name = 'CapsuleError'
    this.code = code
    this.remaining = remaining
  }
}

interface CapsuleRow {
  required: number
  filled: number
}

/** 필요량·채운 양·잔액으로 응답 상태를 만든다. 1회의 `openable`은 `filled >= required` 여부만이다(빈칸 검사는 2회). */
function toStatus(required: number, filled: number, balance: number): CapsuleStatus {
  const openable = filled >= required
  return {
    required,
    filled,
    remaining: Math.max(0, required - filled),
    balance,
    openable,
    notOpenableReason: openable ? null : 'not_full',
  }
}

/** 지금 캡슐 상태. 캡슐이 없으면 만든다. 읽지 못하면 던진다. */
export async function getCapsuleStatus(supabase: SupabaseClient, userId: string): Promise<CapsuleStatus> {
  const { data, error } = await supabase.rpc('capsule_get_or_create', { p_user_id: userId })
  if (error) throw new Error(`capsule_get_or_create RPC 오류: ${error.message}`)
  const capsule = (Array.isArray(data) ? data[0] : data) as Partial<CapsuleRow> | null | undefined
  if (!capsule || typeof capsule.required !== 'number' || typeof capsule.filled !== 'number') {
    throw new Error('capsule_get_or_create가 해석할 수 없는 응답을 돌려줬다')
  }

  const { data: wallet, error: walletError } = await supabase.from('jam_wallets').select('balance').eq('user_id', userId).maybeSingle()
  if (walletError) throw new Error(`jam_wallets 조회 실패: ${walletError.message}`)
  const balance = (wallet as { balance?: number } | null)?.balance ?? 0

  return toStatus(capsule.required, capsule.filled, balance)
}

/**
 * 캡슐을 채운다. `amount`를 생략하면 남은 양이고, 가진 잼이 모자라면 가진 만큼 채운다.
 * 이용 정지 중이면 RPC를 부르기 전에 `UserSuspendedError`를 던진다. DB 함수의 거절은 `CapsuleError`로 바꿔 던진다.
 * RPC 오류나 해석할 수 없는 응답은 일반 `Error`다.
 */
export async function fillCapsule(supabase: SupabaseClient, userId: string, amount?: number): Promise<CapsuleFillPayload> {
  await assertNotSuspended(supabase, userId)

  const { data, error } = await supabase.rpc('capsule_fill', { p_user_id: userId, p_amount: amount ?? null })
  if (error) throw new Error(`capsule_fill RPC 오류: ${error.message}`)

  const result = data as {
    ok?: boolean
    error?: string
    remaining?: number
    applied?: number
    required?: number
    filled?: number
    balance?: number
  } | null

  if (result?.ok === false) {
    const code = (CAPSULE_ERROR_CODES as readonly string[]).includes(result.error ?? '') ? (result.error as CapsuleErrorCode) : null
    if (!code) throw new Error(`capsule_fill이 알 수 없는 거절 코드를 돌려줬다: ${String(result.error)}`)
    throw new CapsuleError(code, code === 'exceeds_remaining' ? result.remaining : undefined)
  }
  if (
    result?.ok !== true ||
    typeof result.applied !== 'number' ||
    typeof result.required !== 'number' ||
    typeof result.filled !== 'number' ||
    typeof result.balance !== 'number'
  ) {
    throw new Error('capsule_fill이 해석할 수 없는 응답을 돌려줬다')
  }

  return { applied: result.applied, ...toStatus(result.required, result.filled, result.balance) }
}
