/**
 * 캡슐 — 상태 조회 (티켓 20261018_0052, 운영 로직 5.2절)
 *
 * 캡슐 상태는 DB 함수 `capsule_get_or_create`(없으면 그때의 챕터로 필요량을 정해 만든다)가 만든다. 채우기는 동기화 자동 채움(`auto-fill.ts`)이,
 * 열기(추첨·지급·기록)는 `open.ts`가 한다. 옛 수동 채우기(`fillCapsule`)는 티켓 20261028_1742 1회에서 걷었다. 상태의 `openable`은 다 채웠는지(`filled >= required`)와
 * 인벤토리 빈칸이 나올 수 있는 최대 개수(`guaranteed_count + bonus_count`) 이상인지를 함께 본다(2회).
 *
 * 상태 조회(`getCapsuleStatus`)는 화면이 쓸 보류·안내 값(`pendingCount`·`jamBlocked`·`claim`·`notice`)도 서버가 정해 싣는다(티켓 20261028_1739 1회).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 타입·상수는 `capsule-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveSuspension } from '@/lib/suspension/suspension'
import {
  type CapsuleBaseStatus,
  type CapsuleClaimBlockedReason,
  type CapsuleClaimState,
  type CapsuleErrorCode,
  type CapsuleNoticeKind,
  type CapsuleStatus,
} from './capsule-contract'
import { getCapsulePolicy, type CapsulePolicy } from './policy'
import { readCapsuleReceiveBlocked } from './receive-block'

/** DB 함수가 열기·받기를 거절했을 때(또는 앱이 열기 전에 막았을 때) 던진다. API 라우트가 상태 코드와 문구로 바꾼다. */
export class CapsuleError extends Error {
  readonly code: CapsuleErrorCode
  /** `insufficient_slots`일 때 지금 인벤토리 빈칸 수 */
  readonly freeSlots?: number
  /** `insufficient_slots`일 때 열려면 필요한 빈칸 수 */
  readonly neededSlots?: number

  constructor(code: CapsuleErrorCode, slots?: { freeSlots: number; neededSlots: number }) {
    super(`캡슐 거절: ${code}`)
    this.name = 'CapsuleError'
    this.code = code
    this.freeSlots = slots?.freeSlots
    this.neededSlots = slots?.neededSlots
  }
}

/** 인벤토리 빈칸 — 열려면 `needed` 이상의 `free`가 있어야 한다 */
interface SlotCheck {
  free: number
  needed: number
}

/** 열 때 나올 수 있는 최대 개수. DB 함수 `capsule_open`은 이제 뽑힌 개수로 거절하므로(323) 이 값은 화면 표시용이다. */
export function neededSlotsOf(policy: Pick<CapsulePolicy, 'guaranteed_count' | 'bonus_count'>): number {
  return policy.guaranteed_count + policy.bonus_count
}

/** 필요량·채운 양·잔액·빈칸으로 응답 상태를 만든다. 못 여는 까닭은 «다 채우지 못함»이 먼저고 «빈칸 모자람»이 그 다음이다. */
function toStatus(required: number, filled: number, balance: number, slots?: SlotCheck): CapsuleBaseStatus {
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

/** 지금 캡슐 상태와 챕터. `chapterNo`가 null이면 퀘스트 전 캡슐이다. 열기가 쓰는 옛 필드만 싣는다(보류·안내는 `getCapsuleStatus`). */
export interface CapsuleState {
  status: CapsuleBaseStatus
  chapterNo: number | null
}

/** 옛 필드 + 보류·안내를 정하는 데 필요한 빈칸 */
interface CapsuleBase extends CapsuleState {
  slots: SlotCheck
}

/**
 * 캡슐 행(없으면 만든다)·잼 잔액·정책·인벤토리 빈칸을 **함께** 읽는다(서로 기다릴 필요가 없다). 하나라도 읽지 못하면 던진다.
 * `policy`를 넘기면 정책을 다시 읽지 않는다(열기가 정책을 이미 읽은 경우).
 */
async function readCapsuleBase(supabase: SupabaseClient, userId: string, policy?: CapsulePolicy): Promise<CapsuleBase> {
  const readCapsule = async () => {
    const { data, error } = await supabase.rpc('capsule_get_or_create', { p_user_id: userId })
    if (error) throw new Error(`capsule_get_or_create RPC 오류: ${error.message}`)
    const capsule = (Array.isArray(data) ? data[0] : data) as
      | { required?: number; filled?: number; chapter_no?: number | null }
      | null
      | undefined
    if (!capsule || typeof capsule.required !== 'number' || typeof capsule.filled !== 'number') {
      throw new Error('capsule_get_or_create가 해석할 수 없는 응답을 돌려줬다')
    }
    return capsule as { required: number; filled: number; chapter_no?: number | null }
  }
  const readBalance = async () => {
    const { data: wallet, error: walletError } = await supabase.from('jam_wallets').select('balance').eq('user_id', userId).maybeSingle()
    if (walletError) throw new Error(`jam_wallets 조회 실패: ${walletError.message}`)
    return (wallet as { balance?: number } | null)?.balance ?? 0
  }

  const [capsule, balance, capsulePolicy, free] = await Promise.all([
    readCapsule(),
    readBalance(),
    policy ? Promise.resolve(policy) : getCapsulePolicy(supabase),
    readFreeSlots(supabase, userId),
  ])
  const slots: SlotCheck = { free, needed: neededSlotsOf(capsulePolicy) }

  return {
    status: toStatus(capsule.required, capsule.filled, balance, slots),
    chapterNo: typeof capsule.chapter_no === 'number' ? capsule.chapter_no : null,
    slots,
  }
}

/**
 * 지금 캡슐 상태와 챕터. 캡슐이 없으면 만든다. 읽지 못하면 던진다.
 * `policy`를 넘기면 다시 읽지 않는다(열기가 정책을 이미 읽은 경우).
 */
export async function getCapsuleState(supabase: SupabaseClient, userId: string, policy?: CapsulePolicy): Promise<CapsuleState> {
  const { status, chapterNo } = await readCapsuleBase(supabase, userId, policy)
  return { status, chapterNo }
}

/** 못 받은 보상 수. 한 유저가 쌓을 수 있는 보류는 2개까지라(DB가 지킨다) 0·1·2로 접는다. 읽지 못하면 던진다 — 틀린 «보류 없음»을 만들지 않는다. */
async function readPendingCount(supabase: SupabaseClient, userId: string): Promise<0 | 1 | 2> {
  const { data, error } = await supabase.from('capsule_pending_rewards').select('id').eq('user_id', userId)
  if (error) throw new Error(`capsule_pending_rewards 조회 실패: ${error.message}`)
  const count = Array.isArray(data) ? data.length : 0
  return count >= 2 ? 2 : count === 1 ? 1 : 0
}

/** 소속 트라이브가 있는가. 보류 받기는 받을 때 추첨하므로 트라이브가 없으면 받을 수 없다(`claim.ts`·`open.ts`의 `no_tribe`와 같다). 읽지 못하면 던진다. */
async function readHasTribe(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
  if (error) throw new Error(`users 조회 실패: ${error.message}`)
  return Boolean((data as { tribe_id?: string | null } | null)?.tribe_id)
}

/** 보류 보상이 지급되지 못하는 까닭과 빈칸 줄. 까닭은 이용 정지, 소속 트라이브 없음, 빈칸 모자람 순이다(`claim.ts`가 거절하는 순서와 같다). */
function toClaimState(pendingCount: 0 | 1 | 2, suspended: boolean, hasTribe: boolean, slots: SlotCheck): CapsuleClaimState {
  let blockedReason: CapsuleClaimBlockedReason | null = null
  if (pendingCount > 0) {
    if (suspended) blockedReason = 'suspended'
    else if (!hasTribe) blockedReason = 'no_tribe'
    else if (slots.free < slots.needed) blockedReason = 'no_slots'
  }
  return {
    blockedReason,
    freeSlots: slots.free,
    neededSlots: slots.needed,
  }
}

/**
 * 안내 영역이 고를 문구. 막힘 판정은 `capsule_receive_blocked`(단일 원천)가 정하고 여기서 다시 따지지 않는다(티켓 20261105_0104 T4).
 * 이용 정지 중에는 안내를 띄우지 않는다(홈은 정지 배너가 알린다).
 */
function toNotice(suspended: boolean, receiveBlocked: boolean): CapsuleNoticeKind {
  if (suspended) return 'none'
  return receiveBlocked ? 'blocked' : 'none'
}

/**
 * 지금 캡슐 상태(`GET /api/capsule`). 캡슐이 없으면 만든다. 보류·안내 값은 서버가 정해 싣는다. 읽지 못하면 던진다.
 * 캡슐·잔액·정책·빈칸·보류 수·이용 정지·막힘 판정은 함께 읽고, 소속 트라이브는 보류가 있고 정지가 아닐 때만 더 읽는다.
 */
export async function getCapsuleStatus(supabase: SupabaseClient, userId: string): Promise<CapsuleStatus> {
  const [base, pendingCount, suspension, receiveBlock] = await Promise.all([
    readCapsuleBase(supabase, userId),
    readPendingCount(supabase, userId),
    getActiveSuspension(supabase, userId),
    readCapsuleReceiveBlocked(supabase, userId),
  ])
  const suspended = suspension !== null
  const hasTribe = pendingCount > 0 && !suspended ? await readHasTribe(supabase, userId) : true

  return {
    ...base.status,
    pendingCount,
    jamBlocked: pendingCount === 2,
    claim: toClaimState(pendingCount, suspended, hasTribe, base.slots),
    notice: toNotice(suspended, receiveBlock.blocked),
    pendingItemCount: receiveBlock.pending,
    shortfall: receiveBlock.shortfall,
  }
}
