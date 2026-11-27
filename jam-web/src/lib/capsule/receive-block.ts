/**
 * 캡슐 받기 막힘 판정 — DB 함수 `capsule_receive_blocked` 호출 래퍼 (티켓 20261105_0101, 상위 20261105_0100)
 *
 * 대기 보상(빈칸이 모자라 먼저 뽑아 저장한 캡슐 결과)이 있으면 동기화를 입구에서 멈춘다(티켓 20261105_1437 R1).
 * 판정은 DB 함수 하나가 단일 원천이다 — 여기서 같은 판정을 다시 구현하지 않는다.
 * 챕터 보상 대기도 본다(C2a, Q-c, 티켓 20261127_1729): `chapter_reward_grants`의 `pending` 행 개수를 옛 대기 보상 결과에 합친다.
 * 옛 대기 보상은 비워질 때까지 유지한다.
 *
 * 서버 전용이다(service_role 클라이언트). 클라이언트가 쓸 상수·타입은 `receive-block-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CapsuleReceiveBlockedResult } from './receive-block-contract'

/** 대기 보상이 있어 동기화를 시작하지 않을 때 던진다. `/api/strava/sync`가 409(`code: 'capsule_inventory_blocked'`)로 바꾼다. */
export class CapsuleInventoryBlockedError extends Error {
  readonly free: number
  readonly needed: number

  constructor(free: number, needed: number) {
    super(`대기 보상이 있고 인벤토리 빈칸(${free})이 필요 칸수(${needed})보다 적어 동기화를 시작하지 않는다`)
    this.name = 'CapsuleInventoryBlockedError'
    this.free = free
    this.needed = needed
  }
}

function isResult(value: unknown): value is CapsuleReceiveBlockedResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.blocked === 'boolean' &&
    typeof v.pending === 'number' &&
    typeof v.free === 'number' &&
    typeof v.needed === 'number' &&
    typeof v.shortfall === 'number'
  )
}

/** 챕터 보상 대기 개수 — 행마다 `drawn_items`가 배열이면 그 길이, 아니면 `reward_count`를 센다. 읽지 못하면 던진다 */
async function readPendingChapterRewardCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('chapter_reward_grants')
    .select('drawn_items, reward_count')
    .eq('user_id', userId)
    .eq('status', 'pending')
  if (error) throw new Error(`chapter_reward_grants 대기 조회 실패: ${error.message}`)
  const rows = (data ?? []) as { drawn_items: unknown; reward_count: unknown }[]
  let count = 0
  for (const row of rows) {
    if (Array.isArray(row.drawn_items)) count += row.drawn_items.length
    else if (typeof row.reward_count === 'number' && Number.isFinite(row.reward_count)) count += row.reward_count
  }
  return count
}

/**
 * 막힘 판정을 읽는다. 읽지 못하거나 응답 모양이 다르면 던진다 — «막히지 않음»으로 보고 가져오면 안 되는 상태를 놓칠 수 있다.
 * 옛 대기 보상(RPC)과 챕터 보상 대기를 합친다: `pending`은 둘의 합, `needed = pending`, `blocked`는 둘 중 하나라도 대기가 있을 때,
 * `shortfall = max(0, pending - free)`이고 `free`는 RPC가 돌려준 값이다.
 */
export async function readCapsuleReceiveBlocked(
  supabase: SupabaseClient,
  userId: string,
): Promise<CapsuleReceiveBlockedResult> {
  const { data, error } = await supabase.rpc('capsule_receive_blocked', { p_user_id: userId })
  if (error) throw new Error(`capsule_receive_blocked 호출 실패: ${error.message}`)
  if (!isResult(data)) throw new Error('capsule_receive_blocked 응답 모양이 올바르지 않다')
  const chapterPending = await readPendingChapterRewardCount(supabase, userId)
  const pending = data.pending + chapterPending
  return {
    blocked: data.blocked || chapterPending > 0,
    pending,
    free: data.free,
    needed: pending,
    shortfall: Math.max(0, pending - data.free),
  }
}
