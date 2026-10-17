/**
 * 장착 직후 보상 배지 발급(`runSlotRewardIssue`)의 등급 보상 경로 검증 (티켓 20261016_2340, 3회-가).
 *
 * 등급별 컬렉션(`tier_mode`)의 장착 RPC가 돌려준 `completed_tier`가 세 번째 인자로 오면 그 등급의 보상 배지
 * (`item_book_tier_rewards.reward_badge_id`)를 발급하고, 값이 없으면 지금 경로(컬렉션 단위 완성 기록과
 * `item_books.reward_badge_id`)가 그대로 동작하는지 고정한다.
 *
 * 검증 대상:
 *  - 등급 보상 배지가 있으면 발급하고 `activity_recap` 결산으로 알린다. 컬렉션 단위 완성 기록은 읽지 않는다
 *  - 그 등급의 보상 행이 없거나 보상 배지가 비면, 다른 등급의 보상이 있어도 발급하지 않는다
 *  - 컬렉션 단위 보상 배지(`item_books.reward_badge_id`)가 있어도 등급 경로에서는 쓰지 않는다
 *  - 이미 보유했거나 `23505` 경합이면 다시 발급·알림하지 않는다
 *  - 등급 값이 없으면(옛 컬렉션) 완성 기록을 보고 컬렉션 단위 보상 배지를 발급한다(회귀)
 *  - 조회 오류는 예외 없이 끝나고 발급하지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/itembook/__tests__/slot-reward.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>

const USER_ID = 'user-1'
const BOOK_ID = 'book-1'
const BOOK_REWARD_ID = 'book-reward'
const EPIC_REWARD_ID = 'epic-reward'
const COMMON_REWARD_ID = 'common-reward'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  inserts: [] as Row[],
  /** 읽은 테이블 이름 기록 */
  reads: [] as string[],
  insertError: null as { code: string; message: string } | null,
  /** 설정하면 해당 테이블 조회가 이 오류로 실패한다 */
  readErrorTable: null as string | null,
}))

const notifyMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from(table: string) {
      db.reads.push(table)
      const filters: ((row: Row) => boolean)[] = []
      const run = () => (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value)
          return builder
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]))
          return builder
        },
        maybeSingle: async () =>
          db.readErrorTable === table
            ? { data: null, error: { message: '조회 장애' } }
            : { data: run()[0] ?? null, error: null },
        insert: async (payload: Row) => {
          db.inserts.push(payload)
          if (db.insertError) return { error: db.insertError }
          db.tables[table] = [...(db.tables[table] ?? []), payload]
          return { error: null }
        },
        then: (onfulfilled: (v: unknown) => unknown, onrejected: (e: unknown) => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(onfulfilled, onrejected),
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/strava/sync', () => ({
  notifyActivityBadgesEarned: (...args: unknown[]) => notifyMock(...args),
}))

import { runSlotRewardIssue } from '../slotReward'

function seed(opts: { tierRewards?: Row[]; legacyCompletion?: boolean; alreadyHeld?: string } = {}) {
  db.tables = {
    item_books: [{ id: BOOK_ID, name: '테스트 컬렉션', reward_badge_id: BOOK_REWARD_ID }],
    item_book_tier_rewards: opts.tierRewards ?? [
      { item_book_id: BOOK_ID, tier: 'common', reward_badge_id: COMMON_REWARD_ID },
      { item_book_id: BOOK_ID, tier: 'epic', reward_badge_id: EPIC_REWARD_ID },
    ],
    badges: [
      { id: BOOK_REWARD_ID, type: 'activity' },
      { id: COMMON_REWARD_ID, type: 'activity' },
      { id: EPIC_REWARD_ID, type: 'activity' },
    ],
    user_item_book_completions: opts.legacyCompletion ? [{ user_id: USER_ID, item_book_id: BOOK_ID }] : [],
    user_activity_badges: opts.alreadyHeld ? [{ user_id: USER_ID, badge_id: opts.alreadyHeld }] : [],
  }
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  db.tables = {}
  db.inserts = []
  db.reads = []
  db.insertError = null
  db.readErrorTable = null
  notifyMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('등급 보상 경로 (completedTier가 있을 때)', () => {
  it('그 등급의 보상 배지를 발급하고 activity_recap 결산으로 알린다 — 컬렉션 단위 완성 기록은 읽지 않는다', async () => {
    seed()

    await runSlotRewardIssue(USER_ID, BOOK_ID, 'epic')

    expect(db.inserts).toEqual([
      { user_id: USER_ID, badge_id: EPIC_REWARD_ID, triggered_by: `itembook_complete:${BOOK_ID}` },
    ])
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0].slice(1)).toEqual([USER_ID, [EPIC_REWARD_ID], []])
    expect(db.reads).not.toContain('user_item_book_completions')
  })

  it('컬렉션 단위 보상 배지(item_books.reward_badge_id)는 등급 경로에서 발급하지 않는다', async () => {
    seed()

    await runSlotRewardIssue(USER_ID, BOOK_ID, 'common')

    expect(db.inserts.map((r) => r.badge_id)).toEqual([COMMON_REWARD_ID])
  })

  it('그 등급의 보상 행이 없으면 다른 등급의 보상이 있어도 발급하지 않는다', async () => {
    seed({ tierRewards: [{ item_book_id: BOOK_ID, tier: 'common', reward_badge_id: COMMON_REWARD_ID }] })

    await runSlotRewardIssue(USER_ID, BOOK_ID, 'epic')

    expect(db.inserts).toEqual([])
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('그 등급의 보상 배지가 비어 있으면 발급하지 않는다', async () => {
    seed({ tierRewards: [{ item_book_id: BOOK_ID, tier: 'epic', reward_badge_id: null }] })

    await runSlotRewardIssue(USER_ID, BOOK_ID, 'epic')

    expect(db.inserts).toEqual([])
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('이미 보유한 보상 배지는 다시 발급하지 않고 알리지도 않는다', async () => {
    seed({ alreadyHeld: EPIC_REWARD_ID })

    await runSlotRewardIssue(USER_ID, BOOK_ID, 'epic')

    expect(db.inserts).toEqual([])
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('동시 발급 경합(23505)이면 오류 없이 끝나고 알리지 않는다', async () => {
    seed()
    db.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }

    await expect(runSlotRewardIssue(USER_ID, BOOK_ID, 'epic')).resolves.toBeUndefined()

    expect(notifyMock).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('등급 보상 조회가 실패하면 예외 없이 로그만 남기고 발급하지 않는다', async () => {
    seed()
    db.readErrorTable = 'item_book_tier_rewards'

    await expect(runSlotRewardIssue(USER_ID, BOOK_ID, 'epic')).resolves.toBeUndefined()

    expect(db.inserts).toEqual([])
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it('컬렉션이 없으면 아무것도 발급하지 않는다', async () => {
    seed()
    db.tables.item_books = []

    await runSlotRewardIssue(USER_ID, BOOK_ID, 'epic')

    expect(db.inserts).toEqual([])
  })
})

describe('옛 경로 유지 (completedTier가 없을 때)', () => {
  it.each([[undefined], [null]])('등급 값이 %s이면 완성 기록을 보고 컬렉션 단위 보상 배지를 발급한다', async (tier) => {
    seed({ legacyCompletion: true })

    await runSlotRewardIssue(USER_ID, BOOK_ID, tier)

    expect(db.inserts).toEqual([
      { user_id: USER_ID, badge_id: BOOK_REWARD_ID, triggered_by: `itembook_complete:${BOOK_ID}` },
    ])
    expect(db.reads).not.toContain('item_book_tier_rewards')
    expect(notifyMock.mock.calls[0].slice(1)).toEqual([USER_ID, [BOOK_REWARD_ID], []])
  })

  it('완성 기록이 없으면 발급도 알림도 없다', async () => {
    seed({ legacyCompletion: false })

    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(db.inserts).toEqual([])
    expect(notifyMock).not.toHaveBeenCalled()
  })
})
