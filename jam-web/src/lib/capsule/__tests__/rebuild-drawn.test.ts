/**
 * lib/capsule/open — rebuildRolledFromDrawn: 저장된 추첨 결과를 지급 후속 처리용 모양으로 되살린다 (티켓 20261105_1438 R2)
 *
 * 고정하는 것:
 * - 추첨을 다시 하지 않는다 — 저장된 badge_id로 배지를, 배지의 컬렉션으로 트라이브를 읽고 저장된 등급·처음 뽑힌 등급·잠금을 그대로 얹는다.
 * - 항목 순서가 보존된다(RPC가 돌려주는 개체 순서와 1:1 대응).
 * - 잠긴 항목은 lock_reason·unlock_required를 그대로, 열린 항목은 잠금 없음. rolled_rarity가 없으면 rarity와 같다.
 * - 배지를 찾지 못하거나 조회가 실패하면 던진다(지급 전이라 잃는 것이 없다).
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/rebuild-drawn.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

import { rebuildRolledFromDrawn, type StoredDrawnItem } from '../open'

type Result = { data: unknown; error: unknown }

/** 테이블별 결과를 돌려주고 `in()` 인자를 기록하는 가짜 클라이언트 */
function fakeClient(tables: Record<string, Result>) {
  const ins: Array<[string, string, unknown]> = []
  const client = {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = (column: string, values: unknown) => {
        ins.push([table, column, values])
        return Promise.resolve(tables[table] ?? { data: null, error: { message: `예상하지 못한 테이블 ${table}` } })
      }
      return q
    },
  } as unknown as SupabaseClient
  return { client, ins }
}

const BADGE_A = { id: 'badge-a', name: 'A', image_url: null, rarity: 'rare', item_book_id: 'book-1', point_reward: 5 }
const BADGE_B = { id: 'badge-b', name: 'B', image_url: 'https://cdn.example/b.png', rarity: 'common', item_book_id: 'book-2', point_reward: null }

const DRAWN: StoredDrawnItem[] = [
  { badge_id: 'badge-b', rarity: 'common', rolled_rarity: 'rare', locked: true, lock_reason: 'rolled', unlock_required: 30 },
  { badge_id: 'badge-a', rarity: 'rare', rolled_rarity: null, locked: false, lock_reason: null, unlock_required: null },
]

const TABLES: Record<string, Result> = {
  badges: { data: [BADGE_A, BADGE_B], error: null },
  item_books: {
    data: [
      { id: 'book-1', tribe_id: 'tribe-1' },
      { id: 'book-2', tribe_id: 'tribe-2' },
    ],
    error: null,
  },
  tribes: {
    data: [
      { id: 'tribe-1', name: '트라이브 하나' },
      { id: 'tribe-2', name: '트라이브 둘' },
    ],
    error: null,
  },
}

describe('rebuildRolledFromDrawn', () => {
  it('저장된 순서·등급·잠금을 그대로 되살리고 트라이브를 배지의 컬렉션에서 찾는다', async () => {
    const { client, ins } = fakeClient(TABLES)

    const { data, rolled } = await rebuildRolledFromDrawn(client, DRAWN)

    expect(rolled.items).toEqual([
      {
        badge: BADGE_B,
        tribeId: 'tribe-2',
        rarity: 'common',
        rolledRarity: 'rare',
        lock: { locked: true, lockReason: 'rolled', unlockRequired: 30 },
      },
      {
        badge: BADGE_A,
        tribeId: 'tribe-1',
        rarity: 'rare',
        // 처음 뽑힌 등급이 비어 있으면 받은 등급과 같다
        rolledRarity: 'rare',
        lock: { locked: false, lockReason: null, unlockRequired: null },
      },
    ])
    expect(data.tribes).toEqual([
      { id: 'tribe-1', name: '트라이브 하나' },
      { id: 'tribe-2', name: '트라이브 둘' },
    ])
    expect(ins).toEqual([
      ['badges', 'id', ['badge-b', 'badge-a']],
      ['item_books', 'id', ['book-1', 'book-2']],
      ['tribes', 'id', ['tribe-1', 'tribe-2']],
    ])
  })

  it('같은 배지가 두 번 저장돼 있어도 한 번만 읽고 두 항목을 모두 되살린다', async () => {
    const { client, ins } = fakeClient(TABLES)
    const twice: StoredDrawnItem[] = [
      { badge_id: 'badge-a', rarity: 'rare', locked: false },
      { badge_id: 'badge-a', rarity: 'rare', locked: false },
    ]

    const { rolled } = await rebuildRolledFromDrawn(client, twice)

    expect(rolled.items).toHaveLength(2)
    expect(ins[0]).toEqual(['badges', 'id', ['badge-a']])
  })

  it('저장된 배지를 찾지 못하면 던진다', async () => {
    const { client } = fakeClient({ ...TABLES, badges: { data: [BADGE_A], error: null } })

    await expect(rebuildRolledFromDrawn(client, DRAWN)).rejects.toThrow('배지를 찾지 못했다 (badge_id: badge-b)')
  })

  it('조회가 실패하면 던진다', async () => {
    const { client } = fakeClient({ ...TABLES, badges: { data: null, error: { message: 'down' } } })

    await expect(rebuildRolledFromDrawn(client, DRAWN)).rejects.toThrow('badges 조회 실패: down')
  })
})
