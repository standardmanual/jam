/**
 * 컬렉션 등급별 보상 읽기·검증·저장 (티켓 20261022_1139 2회)
 *
 * 고정하는 것
 *   - 포인트 칸 글 읽기: 빈 칸은 기본값(null), 0 이상의 정수만 숫자, 소수·음수·글자는 거절.
 *   - 저장 본문 검사: 등급 네 개가 하나씩 있어야 한다, 포인트는 null 또는 0 이상 정수, 같은 배지를 두 등급에 고르면 거절,
 *     UUID가 아닌 배지 id는 DB에 넘기지 않고 «없는 배지»로 거절, 결과는 등급 순서.
 *   - 읽기: 저장된 행이 없는 등급도 빈 값으로 채운 네 행, 기본값, 소프트 삭제된 배지의 이름.
 *   - 쓸 수 없는 배지(없거나 소프트 삭제됨) 판정.
 *   - 저장: 값이 있는 등급은 upsert 한 번, 두 칸이 모두 빈 등급은 delete 한 번. 쓰기 실패는 던진다.
 * DB는 필요한 체인만 흉내 내는 스텁이다.
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/itembookTierRewards.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  findDuplicateRewardBadgeTiers,
  findUnavailableRewardBadgeTiers,
  loadTierRewards,
  parsePointsText,
  saveTierRewards,
  validateTierRewardsBody,
} from '../itembookTierRewards'

type Row = Record<string, unknown>
type Client = Parameters<typeof loadTierRewards>[0]

const BOOK = '11111111-1111-4111-8111-111111111111'
const BADGE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BADGE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BADGE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

interface Write {
  table: string
  op: 'upsert' | 'delete'
  payload?: unknown
  options?: unknown
  filters: Array<[string, unknown]>
}

function createStub(tables: Record<string, Row[]>, options: { failTable?: string; failOp?: 'upsert' | 'delete' } = {}) {
  const writes: Write[] = []
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      const log: Array<[string, unknown]> = []
      let mode: 'select' | 'upsert' | 'delete' = 'select'
      let payload: unknown
      let upsertOptions: unknown
      const fails = () => table === options.failTable && (options.failOp === undefined || options.failOp === mode)
      const builder = {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value)
          log.push([column, value])
          return builder
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]))
          log.push([column, values])
          return builder
        },
        is(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value)
          log.push([column, value])
          return builder
        },
        upsert(rows: unknown, opts: unknown) {
          mode = 'upsert'
          payload = rows
          upsertOptions = opts
          return builder
        },
        delete() {
          mode = 'delete'
          return builder
        },
        then(resolve: (value: unknown) => unknown) {
          if (mode !== 'select') writes.push({ table, op: mode, payload, options: upsertOptions, filters: log })
          if (fails()) return resolve({ data: null, error: { message: `${table} 실패 secret` } })
          if (mode !== 'select') return resolve({ data: null, error: null })
          return resolve({ data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null })
        },
      }
      return builder
    },
  }
  return { client: client as unknown as Client, writes }
}

const DEFAULTS: Row[] = [
  { tier: 'common', reward_points: 100 },
  { tier: 'rare', reward_points: 200 },
  { tier: 'epic', reward_points: 400 },
  { tier: 'mystic', reward_points: 800 },
]

describe('parsePointsText', () => {
  it('빈 칸은 기본값(null)이다', () => {
    expect(parsePointsText('')).toEqual({ ok: true, value: null })
    expect(parsePointsText('   ')).toEqual({ ok: true, value: null })
  })

  it('0 이상의 정수만 숫자로 읽는다. 0은 지급 없음이라 숫자다', () => {
    expect(parsePointsText('0')).toEqual({ ok: true, value: 0 })
    expect(parsePointsText(' 250 ')).toEqual({ ok: true, value: 250 })
  })

  it('소수·음수·글자·지수 표기는 거절한다', () => {
    for (const text of ['1.5', '-1', 'abc', '1e3', '10점', '１０']) {
      expect(parsePointsText(text), text).toEqual({ ok: false })
    }
  })

  it('안전한 정수 범위를 넘으면 거절한다', () => {
    expect(parsePointsText('9'.repeat(30))).toEqual({ ok: false })
  })
})

describe('findDuplicateRewardBadgeTiers', () => {
  it('같은 배지를 고른 등급 묶음을 등급 순서로 돌려준다', () => {
    const result = findDuplicateRewardBadgeTiers([
      { tier: 'mystic', rewardBadgeId: BADGE_A },
      { tier: 'common', rewardBadgeId: BADGE_A },
      { tier: 'rare', rewardBadgeId: BADGE_B },
      { tier: 'epic', rewardBadgeId: null },
    ])
    expect(result).toEqual([{ badgeId: BADGE_A, tiers: ['common', 'mystic'] }])
  })

  it('비어 있는 칸끼리는 겹치지 않는다', () => {
    expect(
      findDuplicateRewardBadgeTiers([
        { tier: 'common', rewardBadgeId: null },
        { tier: 'rare', rewardBadgeId: null },
      ])
    ).toEqual([])
  })
})

function body(overrides: Record<string, Row> = {}) {
  return {
    tiers: ['common', 'rare', 'epic', 'mystic'].map((tier) => ({
      tier,
      reward_points: null,
      reward_badge_id: null,
      ...overrides[tier],
    })),
  }
}

describe('validateTierRewardsBody', () => {
  it('등급 네 개를 등급 순서로 돌려준다. 입력 순서가 달라도 같다', () => {
    const shuffled = { tiers: [...body({ epic: { reward_points: 0 }, common: { reward_badge_id: BADGE_A } }).tiers].reverse() }
    const result = validateTierRewardsBody(shuffled)
    expect(result).toEqual({
      ok: true,
      tiers: [
        { tier: 'common', rewardPoints: null, rewardBadgeId: BADGE_A },
        { tier: 'rare', rewardPoints: null, rewardBadgeId: null },
        { tier: 'epic', rewardPoints: 0, rewardBadgeId: null },
        { tier: 'mystic', rewardPoints: null, rewardBadgeId: null },
      ],
    })
  })

  it('배지 id는 소문자로 맞추고 빈 문자열은 비운 것으로 본다', () => {
    const result = validateTierRewardsBody(body({ common: { reward_badge_id: BADGE_A.toUpperCase() }, rare: { reward_badge_id: '' } }))
    expect(result.ok && result.tiers[0].rewardBadgeId).toBe(BADGE_A)
    expect(result.ok && result.tiers[1].rewardBadgeId).toBeNull()
  })

  it('등급이 넷이 아니거나 겹치거나 모르는 등급이면 거절한다', () => {
    const three = { tiers: body().tiers.slice(0, 3) }
    const dup = { tiers: [...body().tiers.slice(0, 3), { tier: 'common', reward_points: null, reward_badge_id: null }] }
    const unknown = { tiers: [...body().tiers.slice(0, 3), { tier: 'legend', reward_points: null, reward_badge_id: null }] }
    for (const input of [three, dup, unknown, {}, null, { tiers: 'x' }]) {
      const result = validateTierRewardsBody(input)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.message).toContain('등급 네 개')
    }
  })

  it('포인트가 소수·음수·글자·큰 수면 그 등급 이름을 넣어 거절한다', () => {
    for (const bad of [1.5, -1, '100', Number.NaN, 2 ** 60]) {
      const result = validateTierRewardsBody(body({ epic: { reward_points: bad } }))
      expect(result.ok, String(bad)).toBe(false)
      expect(!result.ok && result.message).toContain('Epic')
      expect(!result.ok && result.message).toContain('0 이상의 정수')
    }
  })

  it('포인트 0은 허용한다(지급 없음)', () => {
    expect(validateTierRewardsBody(body({ common: { reward_points: 0 } })).ok).toBe(true)
  })

  it('같은 배지를 두 등급에 고르면 어느 등급인지 넣어 거절한다', () => {
    const result = validateTierRewardsBody(body({ rare: { reward_badge_id: BADGE_A }, mystic: { reward_badge_id: BADGE_A } }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain('Rare·Mystic')
  })

  it('UUID가 아닌 배지 id는 없는 배지로 거절한다', () => {
    const result = validateTierRewardsBody(body({ common: { reward_badge_id: 'not-a-uuid' } }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain('Common')
    expect(!result.ok && result.message).toContain('삭제됐거나 없는 배지')
  })

  it('배지 id가 문자열이 아니면 형식 오류다', () => {
    const result = validateTierRewardsBody(body({ common: { reward_badge_id: 5 } }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain('등급 네 개')
  })
})

describe('loadTierRewards', () => {
  it('저장된 행이 없는 등급도 기본값과 함께 네 행을 등급 순서로 돌려준다', async () => {
    const { client } = createStub({ item_book_tier_default_rewards: DEFAULTS, item_book_tier_rewards: [], badges: [] })
    const rows = await loadTierRewards(client, BOOK)
    expect(rows).toEqual([
      { tier: 'common', rewardPoints: null, defaultPoints: 100, rewardBadgeId: null, rewardBadgeName: null },
      { tier: 'rare', rewardPoints: null, defaultPoints: 200, rewardBadgeId: null, rewardBadgeName: null },
      { tier: 'epic', rewardPoints: null, defaultPoints: 400, rewardBadgeId: null, rewardBadgeName: null },
      { tier: 'mystic', rewardPoints: null, defaultPoints: 800, rewardBadgeId: null, rewardBadgeName: null },
    ])
  })

  it('이 컬렉션의 행만 읽고 포인트 0과 비운 포인트(null)를 구분한다. 소프트 삭제된 배지도 이름이 보인다', async () => {
    const { client } = createStub({
      item_book_tier_default_rewards: DEFAULTS,
      item_book_tier_rewards: [
        { item_book_id: BOOK, tier: 'rare', reward_points: 0, reward_badge_id: BADGE_A },
        { item_book_id: BOOK, tier: 'epic', reward_points: null, reward_badge_id: BADGE_B },
        { item_book_id: 'other-book', tier: 'common', reward_points: 999, reward_badge_id: BADGE_C },
      ],
      badges: [
        { id: BADGE_A, name: '레어 보상', deleted_at: null },
        { id: BADGE_B, name: '에픽 보상', deleted_at: '2026-10-01T00:00:00Z' },
        { id: BADGE_C, name: '다른 컬렉션 보상', deleted_at: null },
      ],
    })
    const rows = await loadTierRewards(client, BOOK)
    expect(rows[0]).toMatchObject({ tier: 'common', rewardPoints: null, rewardBadgeId: null })
    expect(rows[1]).toMatchObject({ tier: 'rare', rewardPoints: 0, rewardBadgeId: BADGE_A, rewardBadgeName: '레어 보상' })
    expect(rows[2]).toMatchObject({ tier: 'epic', rewardPoints: null, rewardBadgeId: BADGE_B, rewardBadgeName: '에픽 보상' })
  })

  it('기본값 행이 없으면 defaultPoints는 null이다', async () => {
    const { client } = createStub({ item_book_tier_default_rewards: [], item_book_tier_rewards: [], badges: [] })
    const rows = await loadTierRewards(client, BOOK)
    expect(rows.map((row) => row.defaultPoints)).toEqual([null, null, null, null])
  })

  it('어느 조회든 실패하면 던진다', async () => {
    for (const failTable of ['item_book_tier_rewards', 'item_book_tier_default_rewards']) {
      const { client } = createStub({ item_book_tier_default_rewards: DEFAULTS, item_book_tier_rewards: [] }, { failTable })
      await expect(loadTierRewards(client, BOOK), failTable).rejects.toThrow('[itembookTierRewards]')
    }
    const { client } = createStub(
      { item_book_tier_default_rewards: DEFAULTS, item_book_tier_rewards: [{ item_book_id: BOOK, tier: 'rare', reward_points: 1, reward_badge_id: BADGE_A }] },
      { failTable: 'badges' }
    )
    await expect(loadTierRewards(client, BOOK)).rejects.toThrow('[itembookTierRewards]')
  })
})

describe('findUnavailableRewardBadgeTiers', () => {
  const tiers = (ids: Array<string | null>) =>
    (['common', 'rare', 'epic', 'mystic'] as const).map((tier, i) => ({ tier, rewardPoints: null, rewardBadgeId: ids[i] ?? null }))

  it('배지를 하나도 고르지 않았으면 DB를 읽지 않는다', async () => {
    const { client } = createStub({}, { failTable: 'badges' })
    await expect(findUnavailableRewardBadgeTiers(client, tiers([]))).resolves.toEqual([])
  })

  it('없는 배지와 소프트 삭제된 배지를 고른 등급을 돌려준다', async () => {
    const { client } = createStub({
      badges: [
        { id: BADGE_A, deleted_at: null },
        { id: BADGE_B, deleted_at: '2026-10-01T00:00:00Z' },
      ],
    })
    await expect(findUnavailableRewardBadgeTiers(client, tiers([BADGE_A, BADGE_B, BADGE_C]))).resolves.toEqual(['rare', 'epic'])
  })

  it('조회가 실패하면 던진다', async () => {
    const { client } = createStub({}, { failTable: 'badges' })
    await expect(findUnavailableRewardBadgeTiers(client, tiers([BADGE_A]))).rejects.toThrow('[itembookTierRewards]')
  })
})

describe('saveTierRewards', () => {
  const rows = (spec: Array<[number | null, string | null]>) =>
    (['common', 'rare', 'epic', 'mystic'] as const).map((tier, i) => ({ tier, rewardPoints: spec[i][0], rewardBadgeId: spec[i][1] }))

  it('값이 있는 등급은 upsert 한 번, 두 칸이 모두 빈 등급은 delete 한 번이다', async () => {
    const { client, writes } = createStub({})
    await saveTierRewards(
      client,
      BOOK,
      rows([
        [null, null],
        [0, null],
        [null, BADGE_A],
        [900, BADGE_B],
      ])
    )
    expect(writes).toHaveLength(2)
    const upsert = writes[0]
    expect(upsert).toMatchObject({ table: 'item_book_tier_rewards', op: 'upsert', options: { onConflict: 'item_book_id,tier' } })
    expect((upsert.payload as Row[]).map((r) => [r.tier, r.reward_points, r.reward_badge_id, r.item_book_id])).toEqual([
      ['rare', 0, null, BOOK],
      ['epic', null, BADGE_A, BOOK],
      ['mystic', 900, BADGE_B, BOOK],
    ])
    expect((upsert.payload as Row[]).every((r) => typeof r.updated_at === 'string')).toBe(true)
    expect(writes[1]).toMatchObject({
      table: 'item_book_tier_rewards',
      op: 'delete',
      filters: [
        ['item_book_id', BOOK],
        ['tier', ['common']],
      ],
    })
  })

  it('네 등급 모두 값이 있으면 지우지 않고, 모두 비어 있으면 쓰지 않고 지우기만 한다', async () => {
    const full = createStub({})
    await saveTierRewards(full.client, BOOK, rows([[1, null], [2, null], [3, null], [4, null]]))
    expect(full.writes.map((w) => w.op)).toEqual(['upsert'])

    const empty = createStub({})
    await saveTierRewards(empty.client, BOOK, rows([[null, null], [null, null], [null, null], [null, null]]))
    expect(empty.writes.map((w) => w.op)).toEqual(['delete'])
    expect(empty.writes[0].filters[1]).toEqual(['tier', ['common', 'rare', 'epic', 'mystic']])
  })

  it('upsert가 실패하면 던지고 지우기는 하지 않는다', async () => {
    const { client, writes } = createStub({}, { failTable: 'item_book_tier_rewards', failOp: 'upsert' })
    await expect(saveTierRewards(client, BOOK, rows([[1, null], [null, null], [null, null], [null, null]]))).rejects.toThrow('[itembookTierRewards]')
    expect(writes.map((w) => w.op)).toEqual(['upsert'])
  })

  it('delete가 실패해도 던진다', async () => {
    const { client } = createStub({}, { failTable: 'item_book_tier_rewards', failOp: 'delete' })
    await expect(saveTierRewards(client, BOOK, rows([[null, null], [1, null], [2, null], [3, null]]))).rejects.toThrow('[itembookTierRewards]')
  })
})
