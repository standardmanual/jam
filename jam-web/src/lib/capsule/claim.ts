/**
 * 보류 보상 받기 — 가득 차서 보류된 캡슐 보상을 인벤토리 빈칸이 생겼을 때 받는다 (티켓 20261028_1734 2회, 상위 20261028_1730 D9)
 *
 * 순서: 이용 정지 확인 → 보류를 오래된 순서(`reached_at`, `slot`)로 읽기 → 보류마다 추첨(`rollCapsuleItems`, 열기와 같은 추첨) →
 * RPC `capsule_claim_pending`(잠금·정지·빈칸 확인·지급·발급 기록·열기 기록·그 보류 줄 삭제가 한 트랜잭션) → 개체 응답과 후속 처리(`recordOpenedItems`, 열기와 같다).
 *
 * 규칙
 *  - 한 번에 받을 수 있는 만큼 받는다(전부 아니면 전무가 아니다). 빈칸이 모자라(`insufficient_slots`) 거절되면 **거기서 멈추고** 못 받은 보상은 보류로 남는다.
 *    DB는 아무것도 바꾸지 않고 돌려주므로 못 받은 보류와 그 뒤 보류는 그대로다. 오래된 보류를 건너뛰고 뒤 보류를 먼저 받지 않는다(순서를 지킨다).
 *  - 받을 때 추첨한다(공개 기간 규칙이 받는 시점에 적용된다). 추첨에 쓰는 보정 카운터는 보류마다 다시 읽는다 — 앞 보류를 받으면 바뀌기 때문이다.
 *  - 그 보류를 다른 요청이 먼저 받았으면(`pending_not_found`) 건너뛴다. 이용 정지는 `CapsuleError('user_suspended')`로 던진다.
 *  - 이미 받은 보류가 있는 뒤에 나는 예상 밖 실패는 던지지 않고 `stopped: 'error'`로 돌려준다 — 받은 개체를 응답에서 잃지 않게 한다. 받은 것이 없을 때는 던진다.
 *  - 받은 뒤 남은 칸 알림을 한 번 검사한다(`notifyInventorySlotsLow`, 던지지 않는다).
 *  - 챕터 횟수는 세지 않는다(보류가 만들어질 때, 즉 100%에 닿을 때 이미 셌다).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rand } from '@/lib/drop-engine/syncIssue'
import { logEngineDecision } from '@/lib/engine-log'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import { CapsuleError } from './capsule'
import { CAPSULE_OPEN_ERROR_CODES, type CapsuleOpenedItem } from './capsule-contract'
import { CAPSULE_ISSUE_ROUTE, recordOpenedItems, rollCapsuleItems, toRpcItems, type DbOpenedItem } from './open'
import { getCapsulePolicy } from './policy'

export interface ClaimPendingOptions {
  rand?: Rand
  now?: Date
}

/** 받은 보류 하나 */
export interface ClaimedCapsule {
  /** 지운 보류 줄의 id */
  pendingId: string
  /** 열기 기록 id(`capsule_opens.id`) */
  openId: string
  /** 보류가 만들어질 때의 챕터. 퀘스트 전 캡슐이면 null */
  chapterNo: number | null
  /** 나온 개체. 잠긴 개체는 이름·그림 없이 등급과 여는 데 필요한 양만 있다(열기 응답과 같다) */
  items: CapsuleOpenedItem[]
}

export type ClaimPendingStop =
  /** 받을 수 있는 보류를 모두 받았다(받을 보류가 처음부터 없었던 경우 포함) */
  | 'none'
  /** 인벤토리 빈칸이 모자라 멈췄다. 못 받은 보상은 보류로 남는다 */
  | 'insufficient_slots'
  /** 이미 받은 것이 있는 뒤에 예상 밖 실패가 났다(`error`) */
  | 'error'

export interface ClaimPendingResult {
  /** 이번 호출을 시작할 때의 보류 수 */
  pendingBefore: number
  /** 받은 것, 받은 순서대로(오래된 보류부터) */
  claimed: ClaimedCapsule[]
  /** 남은 보류 수 */
  remainingPending: number
  stopped: ClaimPendingStop
  /** `stopped`가 `insufficient_slots`일 때 지금 빈칸 수 */
  freeSlots?: number
  /** `stopped`가 `insufficient_slots`일 때 받으려면 필요한 빈칸 수 */
  neededSlots?: number
  /** `stopped`가 `error`일 때 그 오류 */
  error?: unknown
}

interface PendingRow {
  id: string
  slot: number
  chapter_no: number | null
  fill_amount: number
  reached_at: string
}

interface DbClaimResult {
  ok?: boolean
  error?: string
  free?: unknown
  needed?: unknown
  openId?: unknown
  items?: unknown
  pendingCount?: unknown
}

/** 보류를 오래된 순서로 읽는다. 읽지 못하면 던진다. */
async function readPendings(supabase: SupabaseClient, userId: string): Promise<PendingRow[]> {
  const { data, error } = await supabase
    .from('capsule_pending_rewards')
    .select('id, slot, chapter_no, fill_amount, reached_at')
    .eq('user_id', userId)
    .order('reached_at', { ascending: true })
    .order('slot', { ascending: true })
  if (error) throw new Error(`capsule_pending_rewards 조회 실패: ${error.message}`)
  return (data ?? []) as PendingRow[]
}

/**
 * 보류 보상을 오래된 순서로 받을 수 있는 만큼 받는다. 던지는 것: `UserSuspendedError`(정지), `CapsuleError`(`user_suspended`·`no_tribe`·DB 거절 — 받은 것이 없을 때),
 * 그 밖의 일반 오류(받은 것이 없을 때). 받은 것이 있으면 던지지 않고 `stopped`로 알린다(파일 머리말).
 */
export async function claimPendingCapsules(
  supabase: SupabaseClient,
  userId: string,
  options: ClaimPendingOptions = {}
): Promise<ClaimPendingResult> {
  const rand = options.rand ?? Math.random
  const now = options.now ?? new Date()

  await assertNotSuspended(supabase, userId)

  const pendings = await readPendings(supabase, userId)
  const result: ClaimPendingResult = {
    pendingBefore: pendings.length,
    claimed: [],
    remainingPending: pendings.length,
    stopped: 'none',
  }
  if (pendings.length === 0) return result

  const capsulePolicy = await getCapsulePolicy(supabase)

  try {
    for (const pending of pendings) {
      const { data, rolled } = await rollCapsuleItems(supabase, userId, {
        capsulePolicy,
        // 퀘스트 전 캡슐(챕터 없음)의 보상은 열기와 같이 첫 개체가 잠긴다
        preQuest: pending.chapter_no === null,
        rand,
        now,
      })

      const { data: rpcData, error: rpcError } = await supabase.rpc('capsule_claim_pending', {
        p_user_id: userId,
        p_pending_id: pending.id,
        p_items: toRpcItems(rolled),
      })
      if (rpcError) throw new Error(`capsule_claim_pending RPC 오류: ${rpcError.message}`)
      const r = rpcData as DbClaimResult | null

      if (r?.ok === false) {
        if (r.error === 'insufficient_slots') {
          // 아무것도 바뀌지 않았다. 이 보류와 뒤 보류는 그대로 남는다
          result.stopped = 'insufficient_slots'
          result.freeSlots = typeof r.free === 'number' ? r.free : 0
          result.neededSlots = typeof r.needed === 'number' ? r.needed : 0
          break
        }
        // 다른 요청이 먼저 받았다 — 건너뛰고 다음 보류를 본다
        if (r.error === 'pending_not_found') {
          result.remainingPending = Math.max(0, result.remainingPending - 1)
          continue
        }
        const code = r.error ?? ''
        if ((CAPSULE_OPEN_ERROR_CODES as readonly string[]).includes(code)) throw new CapsuleError(code as (typeof CAPSULE_OPEN_ERROR_CODES)[number])
        throw new Error(`capsule_claim_pending이 알 수 없는 거절 코드를 돌려줬다: ${code}`)
      }
      if (r?.ok !== true || typeof r.openId !== 'string' || !Array.isArray(r.items) || typeof r.pendingCount !== 'number') {
        throw new Error('capsule_claim_pending이 해석할 수 없는 응답을 돌려줬다')
      }

      // 여기부터는 이 보류의 받기가 확정됐다. 어떤 실패도 되돌리지 않는다.
      const items = await recordOpenedItems(userId, data, rolled, r.items as DbOpenedItem[])
      result.claimed.push({ pendingId: pending.id, openId: r.openId, chapterNo: pending.chapter_no, items })
      result.remainingPending = r.pendingCount

      try {
        await logEngineDecision('drop', 'drop_attempt', userId, {
          path: CAPSULE_ISSUE_ROUTE,
          outcome: 'claimed_pending',
          openId: r.openId,
          count: items.length,
          preQuest: pending.chapter_no === null,
        })
      } catch (e) {
        console.error(`[capsule-claim] 판정 로그 실패 — 받기는 유지한다 (userId: ${userId}):`, e)
      }
    }
  } catch (e) {
    if (result.claimed.length === 0) throw e
    console.error(`[capsule-claim] 받기 중 실패 — 받은 ${result.claimed.length}개는 유지한다 (userId: ${userId}):`, e)
    result.stopped = 'error'
    result.error = e
  }

  // 받아서 칸이 찼으니 남은 칸 알림을 검사한다. 던지지 않는다.
  if (result.claimed.length > 0) await notifyInventorySlotsLow(userId, supabase)

  return result
}
