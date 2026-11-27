/**
 * lib/chapter/reward/stored — 추첨 결과의 저장 모양 변환과 복원 (티켓 20261127_1731 C3a)
 *
 * 고정하는 것:
 * - `toStoredItems`: 개체마다 badge_id·등급·처음 뽑힌 등급·잠김 여부·까닭·필요한 양을 저장 모양으로 옮긴다(열린 개체는 까닭·필요한 양이 null).
 * - `rebuildChapterRewardItems`: 저장된 항목을 **다시 추첨하지 않고** 배지·트라이브를 읽어 되살린다. 순서·등급·잠금을 보존하고,
 *   저장→되살리기 왕복이 원래 개체와 같다. 배지를 찾지 못하거나 조회가 실패하면 던진다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/reward/__tests__/stored.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rebuildChapterRewardItems, toStoredItems, type ChapterRewardBadge, type StoredChapterRewardItem } from '../stored'
import type { RolledChapterRewardItem } from '../roll'

type Result = { data: unknown; error: unknown }

/** 테이블별 결과를 돌려주고 `in()` 인자를 기록하는 가짜 클라이언트. `select()`가 불린 테이블도 센다 */
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

const badgeRow = (id: string, book: string, over: Partial<ChapterRewardBadge> = {}): ChapterRewardBadge => ({
  id,
  name: id,
  image_url: null,
  rarity: 'rare',
  item_book_id: book,
  drop_excluded: false,
  valid_from: null,
  valid_until: null,
  deleted_at: null,
  point_reward: null,
  ...over,
})

const BADGE_A = badgeRow('badge-a', 'book-1', { point_reward: 5 })
const BADGE_B = badgeRow('badge-b', 'book-2', { rarity: 'common' })

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

const ROLLED: RolledChapterRewardItem<ChapterRewardBadge>[] = [
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
    rolledRarity: 'rare',
    lock: { locked: false, lockReason: null, unlockRequired: null },
  },
]

describe('toStoredItems', () => {
  it('개체마다 저장 모양으로 옮긴다(순서 유지, 열린 개체는 까닭·필요한 양이 null)', () => {
    expect(toStoredItems({ items: ROLLED })).toEqual([
      { badge_id: 'badge-b', rarity: 'common', rolled_rarity: 'rare', locked: true, lock_reason: 'rolled', unlock_required: 30 },
      { badge_id: 'badge-a', rarity: 'rare', rolled_rarity: 'rare', locked: false, lock_reason: null, unlock_required: null },
    ])
  })

  it('잠김으로 만든 배지의 까닭(badge_locked)도 그대로 옮긴다', () => {
    const [stored] = toStoredItems({
      items: [{ ...ROLLED[0], lock: { locked: true, lockReason: 'badge_locked', unlockRequired: 77 } }],
    })
    expect(stored).toMatchObject({ locked: true, lock_reason: 'badge_locked', unlock_required: 77 })
  })

  it('개체가 없으면 빈 목록이다', () => {
    expect(toStoredItems({ items: [] })).toEqual([])
  })
})

describe('rebuildChapterRewardItems', () => {
  it('저장→되살리기 왕복이 원래 개체의 배지·트라이브·등급·잠금과 같다', async () => {
    const { client } = fakeClient(TABLES)
    const rebuilt = await rebuildChapterRewardItems(client, toStoredItems({ items: ROLLED }))
    expect(rebuilt.items).toEqual(ROLLED)
    expect(rebuilt.tribes).toEqual([
      { id: 'tribe-1', name: '트라이브 하나' },
      { id: 'tribe-2', name: '트라이브 둘' },
    ])
  })

  it('다시 추첨하지 않는다 — 저장된 badge_id를 한 번에 읽고, 같은 배지가 두 번 저장돼도 한 번만 묻는다', async () => {
    const { client, ins } = fakeClient(TABLES)
    const stored: StoredChapterRewardItem[] = [
      { badge_id: 'badge-a', rarity: 'rare' },
      { badge_id: 'badge-a', rarity: 'rare' },
    ]
    const rebuilt = await rebuildChapterRewardItems(client, stored)
    expect(rebuilt.items).toHaveLength(2)
    expect(ins[0]).toEqual(['badges', 'id', ['badge-a']])
  })

  it('처음 뽑힌 등급이 비어 있으면 받은 등급과 같고, 잠금 칸이 없으면 열린 채다', async () => {
    const { client } = fakeClient(TABLES)
    const { items } = await rebuildChapterRewardItems(client, [{ badge_id: 'badge-a', rarity: 'rare', rolled_rarity: null }])
    expect(items[0]).toMatchObject({ rolledRarity: 'rare', lock: { locked: false, lockReason: null, unlockRequired: null } })
  })

  it('잠긴 항목의 까닭이 비어 있으면 rolled로 본다', async () => {
    const { client } = fakeClient(TABLES)
    const { items } = await rebuildChapterRewardItems(client, [{ badge_id: 'badge-a', rarity: 'rare', locked: true, unlock_required: 12 }])
    expect(items[0].lock).toEqual({ locked: true, lockReason: 'rolled', unlockRequired: 12 })
  })

  it('저장된 항목이 없으면 DB를 부르지 않고 빈 결과다', async () => {
    const { client, ins } = fakeClient({})
    await expect(rebuildChapterRewardItems(client, [])).resolves.toEqual({ tribes: [], items: [] })
    expect(ins).toEqual([])
  })

  it('배지를 찾지 못하면 던진다', async () => {
    const { client } = fakeClient({ ...TABLES, badges: { data: [BADGE_A], error: null } })
    await expect(rebuildChapterRewardItems(client, [{ badge_id: 'badge-a', rarity: 'rare' }, { badge_id: 'gone', rarity: 'common' }])).rejects.toThrow(
      '배지를 찾지 못했다 (badge_id: gone)'
    )
  })

  it.each(['badges', 'item_books', 'tribes'])('%s 조회가 실패하면 던진다', async (table) => {
    const { client } = fakeClient({ ...TABLES, [table]: { data: null, error: { message: 'boom' } } })
    await expect(rebuildChapterRewardItems(client, toStoredItems({ items: ROLLED }))).rejects.toThrow(`${table} 조회 실패: boom`)
  })
})
