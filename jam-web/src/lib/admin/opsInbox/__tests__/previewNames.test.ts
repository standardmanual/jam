import { describe, it, expect, vi, afterEach } from 'vitest'
import { EMPTY_PREVIEW_NAMES, collectPreviewIds, readOpsPreviewNames } from '@/lib/admin/opsInbox/previewNames'

const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const B3 = '33333333-3333-4333-8333-333333333333'

const recipe = {
  kind: 'recipe',
  original: { resource: { slots: [{ badge_type: 'item', allowed_badge_ids: [B1] }], reward_badge_ids: [B2] } } as never,
  edited: { resource: { reward_badge_ids: [B3] } } as never,
}
const drop = {
  kind: 'drop_schedule',
  original: { resource: { poi_ids: ['p-1'], poi_category: 'cafe', badge_ids: [B1], collection_ids: ['c-1'] } } as never,
  edited: null,
}
const other = { kind: 'mission', original: { resource: { badge_ids: ['ignored'] } } as never, edited: null }

describe('collectPreviewIds', () => {
  it('레시피·드랍만 보고 원본과 수정본의 ID를 중복 없이 모은다', () => {
    const ids = collectPreviewIds([recipe, drop, other])
    expect([...ids.badgeIds].sort()).toEqual([B1, B2, B3])
    expect(ids.poiIds).toEqual(['p-1'])
    expect(ids.collectionIds).toEqual(['c-1'])
    expect(ids.needsCategories).toBe(true)
  })
})

function fakeClient(rows: Record<string, unknown[]>, fail: string[] = []) {
  const reads: string[] = []
  const client = {
    from(table: string) {
      reads.push(table)
      const result = fail.includes(table) ? { data: null, error: { message: 'down' } } : { data: rows[table] ?? [], error: null }
      const builder = {
        select: () => builder,
        in: () => builder,
        order: () => builder,
        range: async () => result,
        then: (resolve: (value: unknown) => void) => resolve(result),
      }
      return builder
    },
  }
  return { client: client as never, reads }
}

describe('readOpsPreviewNames', () => {
  afterEach(() => vi.restoreAllMocks())

  it('대상 항목이 없으면 DB를 읽지 않는다', async () => {
    const { client, reads } = fakeClient({})
    expect(await readOpsPreviewNames(client, [other])).toEqual(EMPTY_PREVIEW_NAMES)
    expect(reads).toEqual([])
  })

  it('배지·지점·컬렉션·종류 이름을 맵으로 만든다', async () => {
    const { client } = fakeClient({
      badges: [{ id: B1, name: '비 맞은 러너', image_url: 'https://example.com/b.png', rarity: 'rare' }],
      poi: [{ id: 'p-1', name: '한강공원' }],
      item_books: [{ id: 'c-1', name: '비 컬렉션' }],
      poi_categories: [{ slug: 'cafe', label: '카페' }],
    })
    const names = await readOpsPreviewNames(client, [recipe, drop])
    expect(names.badges[B1]).toEqual({ id: B1, name: '비 맞은 러너', imageUrl: 'https://example.com/b.png', rarity: 'rare' })
    expect(names.pois).toEqual({ 'p-1': '한강공원' })
    expect(names.collections).toEqual({ 'c-1': '비 컬렉션' })
    expect(names.categories).toEqual({ cafe: '카페' })
  })

  it('읽기가 실패하면 던지지 않고 그 부분만 빈 맵이다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({ poi: [{ id: 'p-1', name: '한강공원' }] }, ['badges', 'item_books', 'poi_categories'])
    const names = await readOpsPreviewNames(client, [recipe, drop])
    expect(names.badges).toEqual({})
    expect(names.collections).toEqual({})
    expect(names.categories).toEqual({})
    expect(names.pois).toEqual({ 'p-1': '한강공원' })
  })
})
