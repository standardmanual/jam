/**
 * 캡슐 — 상태 조회와 채우기 (티켓 20261018_0052, 운영 로직 5.2절)
 *
 * 캡슐 상태는 DB 함수 `capsule_get_or_create`(없으면 그때의 챕터로 필요량을 정해 만든다), 채우기는 `capsule_fill`(잼 원장 한 줄과
 * 캡슐 갱신이 한 트랜잭션)이 한다. 열기(추첨·지급·기록)는 `open.ts`다. 상태의 `openable`은 다 채웠는지(`filled >= required`)와
 * 인벤토리 빈칸이 나올 수 있는 최대 개수(`guaranteed_count + bonus_count`) 이상인지를 함께 본다(2회).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 타입·상수는 `capsule-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import { CAPSULE_FILL_ERROR_CODES, type CapsuleErrorCode, type CapsuleFillPayload, type CapsuleStatus } from './capsule-contract'
import { getCapsulePolicy, type CapsulePolicy } from './policy'

/** DB 함수가 채우기·열기를 거절했을 때(또는 앱이 열기 전에 막았을 때) 던진다. API 라우트가 상태 코드와 문구로 바꾼다. */
export class CapsuleError extends Error {
  readonly code: CapsuleErrorCode
  /** `exceeds_remaining`일 때 채울 수 있는 남은 양 */
  readonly remaining?: number
  /** `insufficient_slots`일 때 지금 인벤토리 빈칸 수 */
  readonly freeSlots?: number
  /** `insufficient_slots`일 때 열려면 필요한 빈칸 수 */
  readonly neededSlots?: number

  constructor(code: CapsuleErrorCode, remaining?: number, slots?: { freeSlots: number; neededSlots: number }) {
    super(`캡슐 거절: ${code}`)
    this.name = 'CapsuleError'
    this.code = code
    this.remaining = remaining
    this.freeSlots = slots?.freeSlots
    this.neededSlots = slots?.neededSlots
  }
}

/** 인벤토리 빈칸 — 열려면 `needed` 이상의 `free`가 있어야 한다 */
interface SlotCheck {
  free: number
  needed: number
}

/** 열 때 나올 수 있는 최대 개수 = 필요한 빈칸 수. DB 함수 `capsule_open`이 같은 값으로 거절한다. */
export function neededSlotsOf(policy: Pick<CapsulePolicy, 'guaranteed_count' | 'bonus_count'>): number {
  return policy.guaranteed_count + policy.bonus_count
}

/** 필요량·채운 양·잔액·빈칸으로 응답 상태를 만든다. 못 여는 까닭은 «다 채우지 못함»이 먼저고 «빈칸 모자람»이 그 다음이다. */
function toStatus(required: number, filled: number, balance: number, slots?: SlotCheck): CapsuleStatus {
  const full = filled >= required
  const roomy = slots === undefined || slots.free >= slots.needed
  const notOpenableReason = !full ? 'not_full' : !roomy ? 'no_free_slots' : null
  return {
    required,
    filled,
    remaining: Math.max(0, required - filled),
    balance,
    openable: notOpenableReason === null,
    notOpenableReason,
    ...(slots ? { freeSlots: slots.free, neededSlots: slots.needed } : {}),
  }
}

/** 지금 인벤토리 빈칸(`max_slots - used_slots`, 0 미만은 0). 인벤토리 행이 없으면 0이다. 읽지 못하면 던진다. */
async function readFreeSlots(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from('inventory').select('used_slots, max_slots').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`inventory 조회 실패: ${error.message}`)
  const row = data as { used_slots?: number; max_slots?: number } | null
  if (!row || typeof row.used_slots !== 'number' || typeof row.max_slots !== 'number') return 0
  return Math.max(0, row.max_slots - row.used_slots)
}

/** 지금 캡슐 상태와 챕터. `chapterNo`가 null이면 퀘스트 전 캡슐이다. */
export interface CapsuleState {
  status: CapsuleStatus
  chapterNo: number | null
}

/**
 * 지금 캡슐 상태. 캡슐이 없으면 만든다. 읽지 못하면 던진다.
 * `policy`를 넘기면 다시 읽지 않는다(열기가 정책을 이미 읽은 경우).
 */
export async function getCapsuleState(supabase: SupabaseClient, userId: string, policy?: CapsulePolicy): Promise<CapsuleState> {
  const { data, error } = await supabase.rpc('capsule_get_or_create', { p_user_id: userId })
  if (error) throw new Error(`capsule_get_or_create RPC 오류: ${error.message}`)
  const capsule = (Array.isArray(data) ? data[0] : data) as { required?: number; filled?: number; chapter_no?: number | null } | null | undefined
  if (!capsule || typeof capsule.required !== 'number' || typeof capsule.filled !== 'number') {
    throw new Error('capsule_get_or_create가 해석할 수 없는 응답을 돌려줬다')
  }

  const { data: wallet, error: walletError } = await supabase.from('jam_wallets').select('balance').eq('user_id', userId).maybeSingle()
  if (walletError) throw new Error(`jam_wallets 조회 실패: ${walletError.message}`)
  const balance = (wallet as { balance?: number } | null)?.balance ?? 0

  const needed = neededSlotsOf(policy ?? (await getCapsulePolicy(supabase)))
  const free = await readFreeSlots(supabase, userId)

  return {
    status: toStatus(capsule.required, capsule.filled, balance, { free, needed }),
    chapterNo: typeof capsule.chapter_no === 'number' ? capsule.chapter_no : null,
  }
}

/** 지금 캡슐 상태. 캡슐이 없으면 만든다. 읽지 못하면 던진다. */
export async function getCapsuleStatus(supabase: SupabaseClient, userId: string): Promise<CapsuleStatus> {
  return (await getCapsuleState(supabase, userId)).status
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
    const code = (CAPSULE_FILL_ERROR_CODES as readonly string[]).includes(result.error ?? '') ? (result.error as CapsuleErrorCode) : null
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

  // 채우기는 이미 끝났다. 빈칸을 읽지 못해도 채우기를 실패로 돌려주지 않고, 빈칸 없이(다 채웠는지만 보는) 상태를 돌려준다.
  let slots: SlotCheck | undefined
  try {
    const needed = neededSlotsOf(await getCapsulePolicy(supabase))
    slots = { free: await readFreeSlots(supabase, userId), needed }
  } catch (e) {
    console.error(`[capsule] 채우기 뒤 빈칸 조회 실패 — 빈칸 없이 상태를 돌려준다 (userId: ${userId}):`, e)
  }
  return { applied: result.applied, ...toStatus(result.required, result.filled, result.balance, slots) }
}
