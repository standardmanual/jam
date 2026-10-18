/**
 * placeAmbientDrops — 잠김으로 만든 배지를 잠긴 채 놓는 두 갈래 (티켓 20261018_1813)
 *
 * 놓기 직전에 배지의 `always_locked`를 읽어 `mint_and_place_ambient_drop_locked`(까닭 `badge_locked`, 필요한 양 고정)와
 * 옛 `mint_and_place_ambient_drop`으로 가른다. 필요한 양은 배지 값, 값이 없으면 등급 최소값이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/place-ambient-drops.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDb, type FakeDb } from './schedule-test-db'

vi.mock('@/lib/notifications/batch/shared', async () => (await import('./schedule-test-db')).sharedMock)
vi.mock('@/lib/jam/policy', () => ({
  getJamPolicy: async () => ({
    locked_min_common: 3,
    locked_min_rare: 5,
    locked_min_epic: 8,
    locked_min_mystic: 12,
    locked_roll_probability: 0,
  }),
}))

import { placeAmbientDrops } from '../placeAmbientDrops'

function client(db: FakeDb) {
  return db.client as Parameters<typeof placeAmbientDrops>[0]
}

function badge(id: string, overrides: Record<string, unknown> = {}) {
  return { id, always_locked: false, unlock_required: null, rarity: 'common', ...overrides }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('placeAmbientDrops — 잠김 두 갈래', () => {
  it('잠김으로 만든 배지는 locked 함수로, 아닌 배지는 옛 함수로 놓는다', async () => {
    const db = createFakeDb({
      badges: [badge('b-open'), badge('b-locked', { always_locked: true, unlock_required: 9 })],
    })
    const { spawned, failedCount } = await placeAmbientDrops(client(db), [
      { poi_id: 'p-1', badge_id: 'b-open' },
      { poi_id: 'p-2', badge_id: 'b-locked' },
    ])
    expect(db.rpcCalls).toEqual([
      { name: 'mint_and_place_ambient_drop', args: { p_poi_id: 'p-1', p_badge_id: 'b-open' } },
      {
        name: 'mint_and_place_ambient_drop_locked',
        args: { p_poi_id: 'p-2', p_badge_id: 'b-locked', p_lock_reason: 'badge_locked', p_unlock_required: 9 },
      },
    ])
    expect(spawned).toHaveLength(2)
    expect(failedCount).toBe(0)
  })

  it('필요한 양이 배지에 없거나 양의 정수가 아니면 등급 최소값으로 고정한다', async () => {
    const db = createFakeDb({
      badges: [
        badge('b-common', { always_locked: true }),
        badge('b-rare', { always_locked: true, rarity: 'rare', unlock_required: null }),
        badge('b-epic', { always_locked: true, rarity: 'epic', unlock_required: 0 }),
        badge('b-mystic', { always_locked: true, rarity: 'mystic', unlock_required: 2.5 }),
      ],
    })
    await placeAmbientDrops(
      client(db),
      ['b-common', 'b-rare', 'b-epic', 'b-mystic'].map((badge_id, i) => ({ poi_id: `p-${i}`, badge_id }))
    )
    expect(db.rpcCalls.map((c) => c.args.p_unlock_required)).toEqual([3, 5, 8, 12])
  })

  it('값도 등급도 없는 잠긴 배지는 열린 채 놓지 않고 건너뛴다', async () => {
    const db = createFakeDb({ badges: [badge('b-x', { always_locked: true, rarity: null }), badge('b-ok')] })
    const { spawned, failedCount } = await placeAmbientDrops(client(db), [
      { poi_id: 'p-1', badge_id: 'b-x' },
      { poi_id: 'p-2', badge_id: 'b-ok' },
    ])
    expect(db.rpcCalls.map((c) => c.args.p_badge_id)).toEqual(['b-ok'])
    expect(spawned).toHaveLength(1)
    expect(failedCount).toBe(1)
  })

  it('배지 조회가 실패하면 전부 실패로 세고 열린 채 놓지 않는다', async () => {
    const db = createFakeDb({ badges: [badge('b-locked', { always_locked: true })] })
    db.failReads.add('badges')
    const { spawned, failedCount } = await placeAmbientDrops(client(db), [
      { poi_id: 'p-1', badge_id: 'b-locked' },
      { poi_id: 'p-2', badge_id: 'b-locked' },
    ])
    expect(db.rpcCalls).toHaveLength(0)
    expect(spawned).toEqual([])
    expect(failedCount).toBe(2)
  })

  it('잠긴 함수의 ok:false도 실패로 세고 나머지는 계속 놓는다', async () => {
    const db = createFakeDb({ badges: [badge('b-locked', { always_locked: true, unlock_required: 4 })] })
    db.rpcResult = (_call, i) =>
      i === 0
        ? { data: { ok: false, error: 'invalid_lock_args' }, error: null }
        : { data: { ok: true, drop_id: 'd', inventory_item_id: 'i' }, error: null }
    const { spawned, failedCount } = await placeAmbientDrops(client(db), [
      { poi_id: 'p-1', badge_id: 'b-locked' },
      { poi_id: 'p-2', badge_id: 'b-locked' },
    ])
    expect(spawned).toEqual([{ id: 'd', inventory_item_id: 'i', poi_id: 'p-2' }])
    expect(failedCount).toBe(1)
  })
})
