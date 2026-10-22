/**
 * 컬렉션 4등급 켜기 전 점검 조회 (티켓 20261022_1139 1회)
 *
 * 고정하는 것
 *   - 소프트 삭제된 배지에 꽂힌 장착도 등급 분포에 센다(장착 표와 배지 등급 조회에 `deleted_at`을 걸지 않는다).
 *     이름 점검은 소프트 삭제된 배지를 뺀다.
 *   - 다른 컬렉션의 배지·장착·완성 기록은 세지 않는다.
 *   - 1000행을 넘는 장착과 200개를 넘는 배지 id를 쪼개 읽어도 빠지거나 겹치지 않는다.
 *   - 조회가 하나라도 실패하면 던진다(부분 결과로 «켜도 된다»고 하지 않는다).
 * DB는 `from().select().eq().is().in().order().range()` 체인만 흉내 내는 스텁이다.
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/itembookTier.test.ts
 */
import { describe, it, expect } from 'vitest'
import { loadTierCompletionCount, loadTierReadiness } from '../itembookTier'

type Row = Record<string, unknown>

interface StubOptions {
  failTable?: string
}

function createStubSupabase(tables: Record<string, Row[]>, options: StubOptions = {}) {
  const inChunkSizes: number[] = []
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let head = false
      const matched = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
      const builder = {
        select(_columns: string, opts?: { head?: boolean }) {
          head = Boolean(opts?.head)
          return builder
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value)
          return builder
        },
        is(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value)
          return builder
        },
        in(column: string, values: unknown[]) {
          inChunkSizes.push(values.length)
          filters.push((row) => values.includes(row[column]))
          return builder
        },
        order() {
          return builder
        },
        range(from: number, to: number) {
          if (table === options.failTable) return Promise.resolve({ data: null, error: { message: `${table} 실패` } })
          return Promise.resolve({ data: matched().slice(from, to + 1), error: null })
        },
        then(resolve: (value: unknown) => unknown) {
          if (table === options.failTable) return resolve({ count: null, error: { message: `${table} 실패` } })
          return resolve(head ? { count: matched().length, error: null } : { data: matched(), error: null })
        },
      }
      return builder
    },
  }
  return { client: client as unknown as Parameters<typeof loadTierReadiness>[0], inChunkSizes }
}

const BOOK = 'book-1'

function badge(id: string, name: string, rarity: string | null, extra: Row = {}): Row {
  return { id, name, rarity, type: 'item', item_book_id: BOOK, deleted_at: null, ...extra }
}

function slot(id: string, userId: string, badgeId: string, itemBookId = BOOK): Row {
  return { id, user_id: userId, badge_id: badgeId, item_book_id: itemBookId }
}

describe('loadTierReadiness', () => {
  it('소프트 삭제된 배지에 꽂힌 장착도 여러 등급 유저로 센다', async () => {
    const { client } = createStubSupabase({
      badges: [
        badge('b-common', '가', 'common'),
        badge('b-rare-deleted', '가', 'rare', { deleted_at: '2026-10-01T00:00:00Z' }),
      ],
      user_item_book_slots: [slot('s1', 'u1', 'b-common'), slot('s2', 'u1', 'b-rare-deleted')],
      user_item_book_tier_completions: [],
    })

    const readiness = await loadTierReadiness(client, BOOK)

    expect(readiness.distribution.multiTierUserCount).toBe(1)
    expect(readiness.canEnable).toBe(false)
    // 이름 점검은 소프트 삭제된 배지를 뺀다
    expect(readiness.names.nameCount).toBe(1)
    expect(readiness.names.rows[0].counts).toEqual({ common: 1, rare: 0, epic: 0, mystic: 0 })
  })

  it('다른 컬렉션의 배지·장착·완성 기록은 세지 않는다', async () => {
    const { client } = createStubSupabase({
      badges: [
        badge('b1', '가', 'common'),
        badge('b-other', '다른', 'rare', { item_book_id: 'book-2' }),
        badge('b-checkin', '체크인', 'common', { type: 'checkin' }),
      ],
      user_item_book_slots: [slot('s1', 'u1', 'b1'), slot('s2', 'u1', 'b-other', 'book-2')],
      user_item_book_tier_completions: [
        { user_id: 'u1', item_book_id: BOOK, tier: 'common' },
        { user_id: 'u1', item_book_id: 'book-2', tier: 'rare' },
      ],
    })

    const readiness = await loadTierReadiness(client, BOOK)

    expect(readiness.names.nameCount).toBe(1)
    expect(readiness.distribution.slotCount).toBe(1)
    expect(readiness.distribution.multiTierUserCount).toBe(0)
    expect(readiness.tierCompletionCount).toBe(1)
    expect(readiness.canDisable).toBe(false)
  })

  it('1000행을 넘는 장착과 200개를 넘는 배지 id를 쪼개 읽어도 빠지거나 겹치지 않는다', async () => {
    const badgeCount = 450
    const rarities = ['common', 'rare', 'epic', 'mystic']
    const badges = Array.from({ length: badgeCount }, (_, i) => badge(`b${i}`, `이름${i % 90}`, rarities[i % 4]))
    // 장착 2,300행: 유저 2,300명이 배지를 한 개씩 장착(모두 한 등급)하고, 마지막 유저만 두 등급을 장착한다
    const slots = Array.from({ length: 2300 }, (_, i) => slot(`s${i}`, `u${i}`, `b${i % badgeCount}`))
    slots.push(slot('s-extra', 'u2299', 'b0'))
    const { client, inChunkSizes } = createStubSupabase({
      badges,
      user_item_book_slots: slots,
      user_item_book_tier_completions: [],
    })

    const readiness = await loadTierReadiness(client, BOOK)

    expect(readiness.distribution.slotCount).toBe(2301)
    expect(readiness.distribution.userCount).toBe(2300)
    // u2299의 첫 장착은 b49(rare), 추가 장착은 b0(common) → 두 등급이다
    expect(readiness.distribution.multiTierUserCount).toBe(1)
    expect(Math.max(...inChunkSizes)).toBeLessThanOrEqual(200)
    expect(inChunkSizes.length).toBeGreaterThanOrEqual(3)
    expect(readiness.names.nameCount).toBe(90)
  })

  it('장착이 가리키는 배지를 찾지 못하면 등급이 빈 장착으로 센다', async () => {
    const { client } = createStubSupabase({
      badges: [],
      user_item_book_slots: [slot('s1', 'u1', 'missing')],
      user_item_book_tier_completions: [],
    })

    const readiness = await loadTierReadiness(client, BOOK)

    expect(readiness.distribution.noTierSlotCount).toBe(1)
    expect(readiness.canEnable).toBe(true)
  })

  it.each(['badges', 'user_item_book_slots', 'user_item_book_tier_completions'])('%s 조회가 실패하면 던진다', async (failTable) => {
    const { client } = createStubSupabase({ badges: [badge('b1', '가', 'common')], user_item_book_slots: [slot('s1', 'u1', 'b1')] }, { failTable })

    await expect(loadTierReadiness(client, BOOK)).rejects.toThrow(failTable === 'user_item_book_tier_completions' ? '등급별 완성 기록' : failTable)
  })
})

describe('loadTierCompletionCount', () => {
  it('컬렉션의 등급별 완성 기록 행 수만 센다', async () => {
    const { client } = createStubSupabase({
      user_item_book_tier_completions: [
        { user_id: 'u1', item_book_id: BOOK, tier: 'common' },
        { user_id: 'u1', item_book_id: BOOK, tier: 'rare' },
        { user_id: 'u2', item_book_id: 'book-2', tier: 'common' },
      ],
    })

    expect(await loadTierCompletionCount(client, BOOK)).toBe(2)
    expect(await loadTierCompletionCount(client, 'book-3')).toBe(0)
  })
})
