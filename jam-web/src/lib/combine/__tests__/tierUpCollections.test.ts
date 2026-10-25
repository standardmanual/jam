/**
 * 등급 올리기에서 고를 수 있는 컬렉션 목록 (티켓 20261023_1648 3회, 운영 로직 8.4절)
 *
 * 순수 변환은 서버 굴림의 후보 판정(`listIssueCandidates`)과 어긋나지 않는지를 고정하고, 읽기는 가짜 Supabase로 «읽지 못했다(null)»와
 * «읽었더니 없다(빈 배열)»를 가른다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listIssueCandidates, type IssueBadge } from '@/lib/drop-engine/syncIssue'
import { buildTierUpCollectionOptions, loadTierUpCollections, type TierUpCollectionBook } from '../tierUpCollections'

const NOW = new Date('2026-10-23T03:00:00.000Z')
const TRIBE = 'tribe-run'
const PAST = '2026-01-01T00:00:00.000Z'
const FUTURE = '2027-01-01T00:00:00.000Z'

function book(id: string, overrides: Partial<TierUpCollectionBook> = {}): TierUpCollectionBook {
  return {
    id,
    name: `컬렉션 ${id}`,
    image_url: null,
    tribe_id: TRIBE,
    is_active: true,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    ...overrides,
  }
}

let badgeSeq = 0
function badge(bookId: string | null, rarity: IssueBadge['rarity'], overrides: Partial<IssueBadge> = {}): IssueBadge {
  badgeSeq += 1
  return {
    id: `badge-${badgeSeq}`,
    rarity,
    item_book_id: bookId,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    deleted_at: null,
    ...overrides,
  }
}

describe('buildTierUpCollectionOptions', () => {
  it('컬렉션마다 지금 나올 수 있는 등급을 낮은 등급부터 담고, 이름·이미지를 싣는다', () => {
    const books = [book('a', { name: '가을 컬렉션', image_url: 'https://example.com/a.png' }), book('b')]
    const badges = [badge('a', 'epic'), badge('a', 'common'), badge('a', 'common'), badge('a', 'rare'), badge('b', 'mystic')]
    expect(buildTierUpCollectionOptions({ tribeId: TRIBE, books, badges, now: NOW })).toEqual([
      { id: 'a', name: '가을 컬렉션', imageUrl: 'https://example.com/a.png', rarities: ['common', 'rare', 'epic'] },
      { id: 'b', name: '컬렉션 b', imageUrl: null, rarities: ['mystic'] },
    ])
  })

  it('나올 수 있는 아이템 배지가 하나도 없는 컬렉션은 목록에 없다', () => {
    const books = [book('empty'), book('has')]
    const badges = [badge('has', 'rare')]
    expect(buildTierUpCollectionOptions({ tribeId: TRIBE, books, badges, now: NOW }).map((option) => option.id)).toEqual(['has'])
  })

  it('다른 트라이브·비활성·드랍 제외·공개 기간 밖 컬렉션은 빠진다', () => {
    const books = [
      book('ok'),
      book('other-tribe', { tribe_id: 'tribe-other' }),
      book('inactive', { is_active: false }),
      book('excluded', { drop_excluded: true }),
      book('not-yet', { valid_from: FUTURE }),
      book('ended', { valid_until: PAST }),
    ]
    const badges = books.map((b) => badge(b.id, 'rare'))
    expect(buildTierUpCollectionOptions({ tribeId: TRIBE, books, badges, now: NOW }).map((option) => option.id)).toEqual(['ok'])
  })

  it('드랍 제외·삭제·공개 기간 밖·컬렉션 없는 아이템 배지의 등급은 세지 않는다', () => {
    const books = [book('a')]
    const badges = [
      badge('a', 'common'),
      badge('a', 'rare', { drop_excluded: true }),
      badge('a', 'epic', { deleted_at: PAST }),
      badge('a', 'mystic', { valid_from: FUTURE }),
      badge('a', 'rare', { valid_until: PAST }),
      badge(null, 'rare'),
      badge('a', null),
    ]
    expect(buildTierUpCollectionOptions({ tribeId: TRIBE, books, badges, now: NOW })).toEqual([
      { id: 'a', name: '컬렉션 a', imageUrl: null, rarities: ['common'] },
    ])
  })

  it('서버 굴림의 후보 판정(listIssueCandidates)과 등급마다 같은 답을 낸다 - 조건을 따로 쓰지 않았다는 증거', () => {
    const books = [
      book('a'),
      book('b', { valid_until: PAST }),
      book('c', { is_active: false }),
      book('d', { tribe_id: 'tribe-other' }),
      book('e', { valid_from: PAST, valid_until: FUTURE }),
    ]
    const badges: IssueBadge[] = []
    for (const b of books) {
      badges.push(badge(b.id, 'common'), badge(b.id, 'rare', { drop_excluded: true }), badge(b.id, 'epic'), badge(b.id, 'mystic', { valid_until: PAST }))
    }
    const options = buildTierUpCollectionOptions({ tribeId: TRIBE, books, badges, now: NOW })
    for (const b of books) {
      const option = options.find((candidate) => candidate.id === b.id)
      for (const rarity of ['common', 'rare', 'epic', 'mystic'] as const) {
        const serverHasCandidate = listIssueCandidates({ tribeId: TRIBE, rarity, books, badges, now: NOW }).some((c) => c.item_book_id === b.id)
        expect(option?.rarities.includes(rarity) ?? false, `${b.id}/${rarity}`).toBe(serverHasCandidate)
      }
    }
  })
})

describe('loadTierUpCollections', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  type Result = { data: unknown; error: { message: string } | null }
  interface Recorded {
    table: string
    eq: [string, unknown][]
    inFilter: [string, unknown[]][]
  }

  /** 테이블마다 정해 둔 결과를 돌려주는 가짜 쿼리 빌더 - 어떤 조건으로 읽었는지 기록한다 */
  function fakeSupabase(results: Record<string, Result>) {
    const recorded: Recorded[] = []
    const client = {
      from(table: string) {
        const record: Recorded = { table, eq: [], inFilter: [] }
        recorded.push(record)
        const result = results[table] ?? { data: [], error: null }
        const query: Record<string, unknown> = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            record.eq.push([column, value])
            return query
          },
          is: () => query,
          in: (column: string, values: unknown[]) => {
            record.inFilter.push([column, values])
            return query
          },
          order: () => query,
          maybeSingle: async () => result,
          range: async () => result,
          then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
        }
        return query
      },
    }
    return { client: client as unknown as SupabaseClient, recorded }
  }

  const ok = (data: unknown): Result => ({ data, error: null })
  const failed = (message: string): Result => ({ data: null, error: { message } })

  it('소속 트라이브의 열린 컬렉션과 거기서 나올 수 있는 등급을 돌려준다', async () => {
    const { client, recorded } = fakeSupabase({
      users: ok({ tribe_id: TRIBE }),
      item_books: ok([book('a', { name: '가을 컬렉션' }), book('b')]),
      badges: ok([badge('a', 'common'), badge('a', 'rare'), badge('b', 'epic')]),
    })
    const options = await loadTierUpCollections(client, 'user-1', NOW)
    expect(options).toEqual([
      { id: 'a', name: '가을 컬렉션', imageUrl: null, rarities: ['common', 'rare'] },
      { id: 'b', name: '컬렉션 b', imageUrl: null, rarities: ['epic'] },
    ])
    // 소속 트라이브·활성·드랍 제외 아님으로 읽는 양을 줄이고, 배지는 읽어 온 컬렉션 것만 읽는다
    const books = recorded.find((r) => r.table === 'item_books')!
    expect(books.eq).toEqual([
      ['tribe_id', TRIBE],
      ['is_active', true],
      ['drop_excluded', false],
    ])
    const badges = recorded.find((r) => r.table === 'badges')!
    expect(badges.eq).toContainEqual(['type', 'item'])
    expect(badges.inFilter).toEqual([['item_book_id', ['a', 'b']]])
    expect(recorded.find((r) => r.table === 'users')!.eq).toEqual([['id', 'user-1']])
  })

  it('소속 트라이브가 없으면 빈 배열이다 - 고를 컬렉션이 없고 컬렉션은 읽지 않는다', async () => {
    for (const userRow of [{ tribe_id: null }, null]) {
      const { client, recorded } = fakeSupabase({ users: ok(userRow) })
      expect(await loadTierUpCollections(client, 'user-1', NOW)).toEqual([])
      expect(recorded.map((r) => r.table)).toEqual(['users'])
    }
  })

  it('열린 컬렉션이 0개여도 빈 배열이다 - 배지는 읽지 않는다', async () => {
    const { client, recorded } = fakeSupabase({ users: ok({ tribe_id: TRIBE }), item_books: ok([]) })
    expect(await loadTierUpCollections(client, 'user-1', NOW)).toEqual([])
    expect(recorded.map((r) => r.table)).toEqual(['users', 'item_books'])
  })

  it.each([
    ['users', { users: failed('boom') }],
    ['item_books', { users: ok({ tribe_id: TRIBE }), item_books: failed('boom') }],
    ['badges', { users: ok({ tribe_id: TRIBE }), item_books: ok([book('a')]), badges: failed('boom') }],
  ] as [string, Record<string, Result>][])('%s 읽기에 실패하면 빈 배열이 아니라 null이다 - «없다»와 «못 읽었다»를 가른다', async (_name, results) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeSupabase(results)
    expect(await loadTierUpCollections(client, 'user-1', NOW)).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
