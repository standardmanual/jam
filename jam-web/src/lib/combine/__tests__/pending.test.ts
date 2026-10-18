/**
 * 받지 않은 믹스 결과 — 개수·목록·받기 (티켓 20261018_0055, 운영 로직 6.4·8.4절)
 *
 * 검증 대상:
 *  1) `getPendingCount` — 받지 않은(`pending`) 결과 개수. 읽지 못하면 던진다(없다고 보고 새 믹스를 시작하면 안 된다)
 *  2) `listPendingResults` — 잠긴 결과는 이름·그림·배지 id를 싣지 않는다(7.3절). 등급은 싣는다
 *  3) `claimPendingResults` — `combine_claim_pending` RPC 한 번으로 받는다. 거절 코드(`user_suspended`·`no_pending`·
 *     `insufficient_slots`(free·needed)·`inventory_not_found`)는 값으로, RPC 오류·알 수 없는 응답은 던진다
 *  4) **같은 결과를 두 번 지급하지 않는다** — 앱은 RPC를 한 번만 부르고 슬롯을 나눠 세지 않는다. DB 함수의 상태 전이
 *     (마이그레이션 236: 인벤토리 행 잠금 + `pending → claimed`)를 같은 모양으로 흉내낸 인메모리 DB에 순차·동시로 두 번 받아
 *     지급 개수가 결과 개수와 같음을 본다. 실제 DB 함수의 동시성은 이 시험이 아니라 마이그레이션 236의 롤백 실측이 증명한다
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/pending.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { claimPendingResults, getPendingCount, listPendingResults } from '../pending'

const USER = 'user-1'

interface PendingRowStub {
  id: string
  badge_id: string
  locked: boolean
  unlock_required: number | null
  created_at: string
  status: 'pending' | 'claimed'
}

/** 인메모리 DB — `combine_claim_pending`의 상태 전이를 마이그레이션 236과 같은 순서로 흉내낸다 */
function makeDb(options: { rows: PendingRowStub[]; used: number; max: number; suspended?: boolean }) {
  const db = {
    rows: options.rows,
    used: options.used,
    max: options.max,
    suspended: options.suspended ?? false,
    grantedItemIds: [] as string[],
    claimRpcCalls: 0,
    /** 인벤토리 행 잠금 — 같은 유저의 받기는 한 번에 하나씩만 본문을 실행한다 */
    lock: Promise.resolve(),
  }

  // combine_claim_pending 본문 — 동기 구간이라 한 번 들어가면 끝까지 실행된다(행 잠금과 같다)
  const claim = () => {
    if (db.suspended) return { ok: false, error: 'user_suspended' }
    const pending = db.rows.filter((r) => r.status === 'pending')
    if (pending.length === 0) return { ok: false, error: 'no_pending' }
    const free = Math.max(0, db.max - db.used)
    if (free < pending.length) return { ok: false, error: 'insufficient_slots', free, needed: pending.length }
    const itemIds: string[] = []
    for (const row of pending) {
      db.used += 1
      const itemId = `item-${db.grantedItemIds.length + 1}`
      db.grantedItemIds.push(itemId)
      itemIds.push(itemId)
      row.status = 'claimed'
    }
    return { ok: true, granted: itemIds.length, itemIds }
  }

  const client = {
    rpc: (fn: string) => {
      if (fn !== 'combine_claim_pending') throw new Error(`예상하지 못한 RPC: ${fn}`)
      db.claimRpcCalls += 1
      const run = db.lock.then(() => ({ data: claim(), error: null }))
      db.lock = run.then(() => undefined)
      return run
    },
  } as unknown as SupabaseClient
  return { db, client }
}

function row(id: string, overrides: Partial<PendingRowStub> = {}): PendingRowStub {
  return {
    id,
    badge_id: `badge-${id}`,
    locked: false,
    unlock_required: null,
    created_at: '2026-10-18T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  }
}

describe('claimPendingResults — 같은 결과를 두 번 지급하지 않는다', () => {
  it('받기는 RPC 한 번이고 받은 개수만큼만 지급된다', async () => {
    const { db, client } = makeDb({ rows: [row('a'), row('b'), row('c')], used: 5, max: 10 })

    const result = await claimPendingResults(client, USER)

    expect(result).toEqual({ ok: true, granted: 3, itemIds: ['item-1', 'item-2', 'item-3'] })
    expect(db.claimRpcCalls).toBe(1)
    expect(db.used).toBe(8)
    expect(db.rows.every((r) => r.status === 'claimed')).toBe(true)
  })

  it('이미 받은 뒤에 다시 받으면 no_pending이고 추가 지급이 없다', async () => {
    const { db, client } = makeDb({ rows: [row('a'), row('b')], used: 0, max: 10 })

    const first = await claimPendingResults(client, USER)
    const second = await claimPendingResults(client, USER)

    expect(first).toMatchObject({ ok: true, granted: 2 })
    expect(second).toEqual({ ok: false, error: 'no_pending' })
    expect(db.grantedItemIds).toHaveLength(2)
    expect(db.used).toBe(2)
  })

  it('동시에 두 번 받아도 지급은 결과 개수만큼 한 번뿐이다(중복 클릭·다른 기기)', async () => {
    const { db, client } = makeDb({ rows: [row('a'), row('b'), row('c')], used: 0, max: 10 })

    const [r1, r2] = await Promise.all([claimPendingResults(client, USER), claimPendingResults(client, USER)])

    const oks = [r1, r2].filter((r) => r.ok)
    const rejected = [r1, r2].filter((r) => !r.ok)
    expect(oks).toHaveLength(1)
    expect(rejected).toEqual([{ ok: false, error: 'no_pending' }])
    expect(db.grantedItemIds).toHaveLength(3)
    expect(new Set(db.grantedItemIds).size).toBe(3)
    expect(db.used).toBe(3)
  })

  it('빈칸이 모자라면 일부만 받지 않고 free·needed를 돌려주며 결과는 그대로 받지 않은 상태다', async () => {
    const { db, client } = makeDb({ rows: [row('a'), row('b'), row('c')], used: 8, max: 10 })

    const result = await claimPendingResults(client, USER)

    expect(result).toEqual({ ok: false, error: 'insufficient_slots', free: 2, needed: 3 })
    expect(db.grantedItemIds).toHaveLength(0)
    expect(db.rows.every((r) => r.status === 'pending')).toBe(true)

    // 빈칸을 만든 뒤에는 받을 수 있고, 그 뒤 또 받아도 중복 지급은 없다
    db.used = 5
    const retry = await claimPendingResults(client, USER)
    expect(retry).toMatchObject({ ok: true, granted: 3 })
    expect(await claimPendingResults(client, USER)).toEqual({ ok: false, error: 'no_pending' })
    expect(db.grantedItemIds).toHaveLength(3)
  })

  it('이용 정지 중이면 user_suspended로 거절하고 지급하지 않는다', async () => {
    const { db, client } = makeDb({ rows: [row('a')], used: 0, max: 10, suspended: true })

    expect(await claimPendingResults(client, USER)).toEqual({ ok: false, error: 'user_suspended' })
    expect(db.grantedItemIds).toHaveLength(0)
  })
})

describe('claimPendingResults — 응답 해석', () => {
  const clientWith = (data: unknown, error: { message: string } | null = null) =>
    ({ rpc: vi.fn().mockResolvedValue({ data, error }) }) as unknown as SupabaseClient

  it('RPC에 유저 id만 넘긴다', async () => {
    const client = clientWith({ ok: true, granted: 1, itemIds: ['i1'] })
    await claimPendingResults(client, USER)
    expect(client.rpc).toHaveBeenCalledWith('combine_claim_pending', { p_user_id: USER })
  })

  it('inventory_not_found는 값으로 돌려준다', async () => {
    expect(await claimPendingResults(clientWith({ ok: false, error: 'inventory_not_found' }), USER)).toEqual({
      ok: false,
      error: 'inventory_not_found',
    })
  })

  it('RPC 오류, 해석할 수 없는 응답, 알 수 없는 오류 코드는 던진다', async () => {
    await expect(claimPendingResults(clientWith(null, { message: 'boom' }), USER)).rejects.toThrow('combine_claim_pending RPC 오류')
    await expect(claimPendingResults(clientWith(null), USER)).rejects.toThrow('해석할 수 없다')
    await expect(claimPendingResults(clientWith({ ok: false, error: 'mystery' }), USER)).rejects.toThrow('알 수 없는 오류 코드')
  })
})

/** `.from(t).select().eq()...` 체인을 테이블별 고정 결과로 풀어 주는 스텁 */
function fromStub(results: Record<string, { data?: unknown; count?: number | null; error?: { message: string } | null }>) {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      for (const m of ['select', 'eq', 'in', 'order']) builder[m] = chain
      const resolve = () => Promise.resolve({ data: null, count: null, error: null, ...results[table] })
      builder.maybeSingle = resolve
      builder.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => resolve().then(f, r)
      return builder
    },
  } as unknown as SupabaseClient
}

describe('getPendingCount', () => {
  it('받지 않은 결과 개수를 돌려주고, 없으면 0이다', async () => {
    expect(await getPendingCount(fromStub({ combine_pending_results: { count: 2 } }), USER)).toBe(2)
    expect(await getPendingCount(fromStub({ combine_pending_results: { count: null } }), USER)).toBe(0)
  })

  it('읽지 못하면 던진다 — 없다고 보고 새 믹스를 시작하지 않는다', async () => {
    await expect(getPendingCount(fromStub({ combine_pending_results: { error: { message: 'down' } } }), USER)).rejects.toThrow(
      'combine_pending_results 개수 조회 실패'
    )
  })
})

describe('listPendingResults', () => {
  it('받지 않은 결과가 없으면 빈 목록이다', async () => {
    expect(await listPendingResults(fromStub({ combine_pending_results: { data: [] } }), USER)).toEqual({
      pendingCount: 0,
      freeSlots: 0,
      items: [],
    })
  })

  it('잠긴 결과는 배지 id·이름·그림을 가리고 등급과 필요한 양만 싣는다(7.3절), 열린 결과는 그대로 싣는다', async () => {
    const client = fromStub({
      combine_pending_results: {
        data: [
          row('a', { locked: true, unlock_required: 30 }),
          row('b', { created_at: '2026-10-18T01:00:00.000Z' }),
        ],
      },
      badges: {
        data: [
          { id: 'badge-a', name: '비밀 이름', image_url: 'https://img/a.png', rarity: 'epic' },
          { id: 'badge-b', name: '열린 배지', image_url: 'https://img/b.png', rarity: 'rare' },
        ],
      },
      inventory: { data: { used_slots: 8, max_slots: 10 } },
    })

    const payload = await listPendingResults(client, USER)

    expect(payload.pendingCount).toBe(2)
    expect(payload.freeSlots).toBe(2)
    expect(payload.items[0]).toEqual({
      id: 'a',
      badgeId: '',
      name: '',
      imageUrl: null,
      rarity: 'epic',
      locked: true,
      unlockRequired: 30,
      createdAt: '2026-10-18T00:00:00.000Z',
    })
    expect(payload.items[1]).toEqual({
      id: 'b',
      badgeId: 'badge-b',
      name: '열린 배지',
      imageUrl: 'https://img/b.png',
      rarity: 'rare',
      locked: false,
      unlockRequired: null,
      createdAt: '2026-10-18T01:00:00.000Z',
    })
    expect(JSON.stringify(payload.items[0])).not.toContain('비밀 이름')
  })

  it('조회가 실패하면 던진다', async () => {
    await expect(listPendingResults(fromStub({ combine_pending_results: { error: { message: 'down' } } }), USER)).rejects.toThrow(
      'combine_pending_results 조회 실패'
    )
  })
})
