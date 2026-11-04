/**
 * 캡슐 받기 막힘 판정 — DB 함수 `capsule_receive_blocked` 호출 래퍼 (티켓 20261105_0101, 상위 20261105_0100)
 *
 * 캡슐이 가득 차고 인벤토리 빈칸이 필요 칸수(확정 + 보너스)보다 적으면 동기화를 입구에서 멈춘다.
 * 판정은 DB 함수 하나가 단일 원천이다 — 여기서 같은 판정을 다시 구현하지 않는다.
 *
 * 서버 전용이다(service_role 클라이언트). 클라이언트가 쓸 상수·타입은 `receive-block-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CapsuleReceiveBlockedResult } from './receive-block-contract'

/** 캡슐이 가득 차 있고 빈칸이 모자라 동기화를 시작하지 않을 때 던진다. `/api/strava/sync`가 409(`code: 'capsule_inventory_blocked'`)로 바꾼다. */
export class CapsuleInventoryBlockedError extends Error {
  readonly free: number
  readonly needed: number

  constructor(free: number, needed: number) {
    super(`캡슐이 가득 차 있고 인벤토리 빈칸(${free})이 필요 칸수(${needed})보다 적어 동기화를 시작하지 않는다`)
    this.name = 'CapsuleInventoryBlockedError'
    this.free = free
    this.needed = needed
  }
}

function isResult(value: unknown): value is CapsuleReceiveBlockedResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.blocked === 'boolean' && typeof v.free === 'number' && typeof v.needed === 'number'
}

/** 막힘 판정을 읽는다. 읽지 못하거나 응답 모양이 다르면 던진다 — «막히지 않음»으로 보고 가져오면 안 되는 상태를 놓칠 수 있다. */
export async function readCapsuleReceiveBlocked(
  supabase: SupabaseClient,
  userId: string,
): Promise<CapsuleReceiveBlockedResult> {
  const { data, error } = await supabase.rpc('capsule_receive_blocked', { p_user_id: userId })
  if (error) throw new Error(`capsule_receive_blocked 호출 실패: ${error.message}`)
  if (!isResult(data)) throw new Error('capsule_receive_blocked 응답 모양이 올바르지 않다')
  return { blocked: data.blocked, free: data.free, needed: data.needed }
}
