/**
 * capsule/receive-block — 캡슐 받기 막힘 판정 호출 래퍼 (티켓 20261105_0101)
 *
 * 고정하는 것:
 * - DB 함수 `capsule_receive_blocked`를 유저 id로 부르고 `{blocked, pending, free, needed, shortfall}`를 그대로 돌려준다(대기 보상이 있으면 막힘, 티켓 20261105_1437 R1)(판정은 DB가 단일 원천이다).
 * - RPC 오류와 모양이 다른 응답은 «막히지 않음»으로 보지 않고 던진다.
 * - `CapsuleInventoryBlockedError`는 빈칸·필요 칸수를 가진다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/receive-block.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CapsuleInventoryBlockedError, readCapsuleReceiveBlocked } from '../receive-block'
import { CAPSULE_INVENTORY_BLOCKED_CODE } from '../receive-block-contract'

function fakeRpc(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result)
  return { rpc, supabase: { rpc } as unknown as SupabaseClient }
}

describe('readCapsuleReceiveBlocked', () => {
  it('capsule_receive_blocked를 유저 id로 부르고 응답을 그대로 돌려준다', async () => {
    const { rpc, supabase } = fakeRpc({ data: { blocked: true, pending: 2, free: 1, needed: 2, shortfall: 1 }, error: null })

    await expect(readCapsuleReceiveBlocked(supabase, 'user-1')).resolves.toEqual({ blocked: true, pending: 2, free: 1, needed: 2, shortfall: 1 })
    expect(rpc).toHaveBeenCalledWith('capsule_receive_blocked', { p_user_id: 'user-1' })
  })

  it('막히지 않은 응답도 그대로 돌려준다', async () => {
    const { supabase } = fakeRpc({ data: { blocked: false, pending: 0, free: 5, needed: 0, shortfall: 0 }, error: null })

    await expect(readCapsuleReceiveBlocked(supabase, 'user-1')).resolves.toEqual({ blocked: false, pending: 0, free: 5, needed: 0, shortfall: 0 })
  })

  it('RPC 오류는 던진다', async () => {
    const { supabase } = fakeRpc({ data: null, error: { message: 'db down' } })

    await expect(readCapsuleReceiveBlocked(supabase, 'user-1')).rejects.toThrow('capsule_receive_blocked 호출 실패: db down')
  })

  it.each([
    ['null', null],
    ['문자열', 'blocked'],
    ['blocked 없음', { pending: 2, free: 1, needed: 2, shortfall: 1 }],
    ['free가 문자열', { blocked: false, pending: 0, free: '1', needed: 2, shortfall: 0 }],
    ['needed 없음', { blocked: false, pending: 0, free: 1, shortfall: 0 }],
    ['pending 없음(옛 함수 응답)', { blocked: false, free: 1, needed: 2 }],
    ['shortfall 없음', { blocked: true, pending: 2, free: 1, needed: 2 }],
  ])('응답 모양이 다르면(%s) 던진다', async (_label, data) => {
    const { supabase } = fakeRpc({ data, error: null })

    await expect(readCapsuleReceiveBlocked(supabase, 'user-1')).rejects.toThrow('응답 모양이 올바르지 않다')
  })
})

describe('CapsuleInventoryBlockedError', () => {
  it('빈칸과 필요 칸수를 가진다', () => {
    const err = new CapsuleInventoryBlockedError(1, 2)

    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({ name: 'CapsuleInventoryBlockedError', free: 1, needed: 2 })
  })

  it('응답 코드 상수는 capsule_inventory_blocked다', () => {
    expect(CAPSULE_INVENTORY_BLOCKED_CODE).toBe('capsule_inventory_blocked')
  })
})
