/**
 * 컬렉션 보상 배지 발급 — 동기화 보정(`checkItemBookCompletion`)과 장착 직후 발급(`runSlotRewardIssue`)이
 * 같은 발급 함수(`issueItemBookRewardBadges`)를 쓰는지 검증한다 (티켓 20261001_0635).
 *
 * 배경: 장착 RPC(마이그레이션 179)는 완성 기록과 포인트만 만들고 보상 배지(`reward_badge_id`)는 주지 않는다.
 * 동기화 보정은 완성 기록이 이미 있으면 건너뛰어서, 장착으로 완성한 유저는 보상 배지를 받지 못했다.
 *
 * 검증 대상:
 *  - 동기화 보정: 새로 완성하면 완성 기록과 보상 배지를 함께 만든다
 *  - 동기화 보정: 완성 기록은 있는데 보상 배지가 없으면(장착으로 완성한 경우) 배지만 따라잡아 발급한다. `completedIds`에는 넣지 않는다
 *  - 이미 보유했거나 `23505` 경합이면 다시 발급하지 않고 오류도 내지 않는다. 두 번 불러도 한 번만 발급된다
 *  - `reward_badge_id`가 비면 발급하지 않는다
 *  - 장착 직후 발급(`runSlotRewardIssue`): 완성 기록이 있으면 발급하고 `activity_recap` 결산으로 알린다. 완성이 아니거나
 *    이미 보유했거나 보상 배지가 없으면 발급·알림이 없다. 어떤 실패도 던지지 않는다
 *  - 장착 직후 발급 뒤 이어지는 동기화 보정은 같은 배지를 다시 발급하지 않는다
 *  - 등급별 구조(`tier_mode`) 컬렉션의 동기화 보정(티켓 20261016_2340): 등급 완성 기록이 있는 등급의 등급 보상 배지를 따라잡아
 *    발급하고 `completedIds`·옛 완성 기록 upsert에는 넣지 않는다. 같은 보정을 두 번 돌려도 한 번만 나가며, 등급 완성 기록이 없는 등급·
 *    보상 배지가 빈 등급은 주지 않는다. `tier_mode`가 꺼진 컬렉션의 결과는 달라지지 않고 새 테이블을 읽지도 않는다
 *
 *  - 보상 배지의 배지 포인트(티켓 20261019_1314 2회, 운영 로직 14.1절): `user_activity_badges`에 **새로 넣은 경우에만** 그 배지의 `point_reward`를
 *    `badge_point_reward`로 한 번 준다(`sourceBadgeId`). 이미 보유·`23505`·다른 insert 오류·포인트 0·`reward_badge_id` 없음은 지급 호출이 없고,
 *    보정분(완성 기록은 있으나 배지가 없던 북)·장착 직후 발급·등급별 보상 배지도 새로 넣을 때 준다. 지급이 실패하거나 던져도 발급 결과는 그대로다
 *
 *  - 보상 배지의 챕터 점수 «배지 받기»(티켓 20261019_1315 2a회, 운영 로직 12.2절): `user_activity_badges`에 **새로 넣은 경우에만** 공용 함수
 *    `awardBadgeReceiveScore`를 (보상 배지의 id·유형·숨김·조건, 출처 `itembook_complete:<컬렉션 id>`)로 한 번 부른다. 이미 보유·`23505`·다른 insert 오류·
 *    `reward_badge_id` 없음은 부르지 않고, 같은 보정을 두 번 돌려도 한 번만 부른다. 점수 쪽이 실패해도 발급 결과는 그대로다.
 *    숨김·팔로워·팔로잉·챕터 조건·아이템 유형을 거르는 규칙은 공용 함수 시험(`lib/chapter/__tests__/badge-receive.test.ts`)이 고정한다 — 여기서는 모킹한다
 *
 *  - 컬렉션 완성의 챕터 점수(티켓 20261019_1315 3회, 사용자 결정 4): 동기화 보정이 «이번에 새로» 완성한 옛 컬렉션(`completedIds`)마다 등급 common으로
 *    `awardCollectionCompleteScore`를 완성 기록 upsert 뒤에 한 번 부른다. 이미 완성 기록이 있는 컬렉션·등급형·미완성은 부르지 않고, 점수 실패는 반환값을 바꾸지 않는다.
 *    키(원천 id)와 등급 판정은 `lib/chapter/__tests__/collection.test.ts`가 고정한다 — 여기서는 모킹한다
 *
 * Supabase는 메모리 테이블로 흉내 낸다(필터 `eq`·`in`만 해석, 컬럼 선택은 무시).
 *
 * 실행: cd jam-web && npx vitest run src/lib/itembook/__tests__/reward-badges.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>

const USER_ID = 'user-1'
const BOOK_ID = 'book-1'
const REWARD_BADGE_ID = 'reward-1'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** user_activity_badges insert 호출 기록 */
  inserts: [] as Row[],
  /** 읽은 테이블 이름 기록 */
  reads: [] as string[],
  /** user_item_book_completions upsert 호출 기록 */
  upserts: [] as Row[][],
  /** 설정하면 user_activity_badges insert가 이 오류로 실패한다 */
  insertError: null as { code: string; message: string } | null,
}))

const notifyMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())
const awardPointsMock = vi.hoisted(() => vi.fn())
const awardBadgeReceiveScoreMock = vi.hoisted(() => vi.fn())
const awardCollectionCompleteScoreMock = vi.hoisted(() => vi.fn())

interface FakeBuilder extends PromiseLike<{ data: Row[]; error: null }> {
  select: (columns?: string) => FakeBuilder
  eq: (column: string, value: unknown) => FakeBuilder
  in: (column: string, values: unknown[]) => FakeBuilder
  or: (filters: string) => FakeBuilder
  order: (column: string) => FakeBuilder
  range: (from: number, to: number) => FakeBuilder
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
  insert: (payload: Row) => Promise<{ error: { code: string; message: string } | null }>
  upsert: (rows: Row[]) => Promise<{ error: null }>
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from(table: string): FakeBuilder {
      db.reads.push(table)
      const filters: ((row: Row) => boolean)[] = []
      let window: [number, number] | null = null
      const run = (): Row[] => {
        const rows = (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
        return window ? rows.slice(window[0], window[1] + 1) : rows
      }
      const builder: FakeBuilder = {
        select: () => builder,
        eq: (column, value) => {
          filters.push((row) => row[column] === value)
          return builder
        },
        in: (column, values) => {
          filters.push((row) => values.includes(row[column]))
          return builder
        },
        or: () => builder,
        order: () => builder,
        range: (from, to) => {
          window = [from, to]
          return builder
        },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        insert: async (payload) => {
          db.inserts.push(payload)
          if (db.insertError) return { error: db.insertError }
          db.tables[table] = [...(db.tables[table] ?? []), payload]
          return { error: null }
        },
        upsert: async (rows) => {
          db.upserts.push(rows)
          db.tables[table] = [...(db.tables[table] ?? []), ...rows]
          return { error: null }
        },
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: run(), error: null as null }).then(onfulfilled, onrejected),
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/points', () => ({
  awardPoints: (...args: unknown[]) => awardPointsMock(...args),
}))
vi.mock('@/lib/chapter/badgeReceive', () => ({
  awardBadgeReceiveScore: (...args: unknown[]) => awardBadgeReceiveScoreMock(...args),
}))
vi.mock('@/lib/chapter/collection', () => ({
  LEGACY_COLLECTION_TIER: 'common',
  awardCollectionCompleteScore: (...args: unknown[]) => awardCollectionCompleteScoreMock(...args),
}))
vi.mock('@/lib/strava/sync', () => ({
  notifyActivityBadgesEarned: (...args: unknown[]) => notifyMock(...args),
}))

import { checkItemBookCompletion, issueItemBookRewardBadges } from '../checker'
import { runSlotRewardIssue } from '../slotReward'
import { createServiceClient } from '@/lib/supabase/server'

/** 컬렉션 1개(배지 2종)를 둔다. 유저는 두 배지를 모두 장착했다 = 완성 조건 충족 */
function seed(
  opts: {
    rewardBadgeId?: string | null
    completionRecorded?: boolean
    alreadyHeld?: boolean
    pointReward?: number | null
    /** 보상 배지 행에 더 얹는 칸 — 챕터 점수의 유형·숨김·조건 판별 입력(`is_hidden`·`condition_json`) */
    rewardBadgeExtra?: Row
  } = {}
) {
  const rewardBadgeId = opts.rewardBadgeId === undefined ? REWARD_BADGE_ID : opts.rewardBadgeId
  db.tables = {
    item_books: [{ id: BOOK_ID, name: '테스트 컬렉션', reward_badge_id: rewardBadgeId, is_active: true }],
    badges: [
      { id: 'b1', item_book_id: BOOK_ID, type: 'item', drop_excluded: false },
      { id: 'b2', item_book_id: BOOK_ID, type: 'item', drop_excluded: false },
      // 보상 배지 자신은 컬렉션 소속이 아니다(item_book_id 없음)
      {
        id: REWARD_BADGE_ID,
        item_book_id: null,
        type: 'activity',
        drop_excluded: false,
        ...(opts.pointReward !== undefined ? { point_reward: opts.pointReward } : {}),
        ...(opts.rewardBadgeExtra ?? {}),
      },
    ],
    user_item_book_slots: [
      { user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'b1' },
      { user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'b2' },
    ],
    user_item_book_completions: opts.completionRecorded ? [{ user_id: USER_ID, item_book_id: BOOK_ID }] : [],
    user_activity_badges: opts.alreadyHeld ? [{ user_id: USER_ID, badge_id: REWARD_BADGE_ID }] : [],
  }
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  db.tables = {}
  db.inserts = []
  db.upserts = []
  db.reads = []
  db.insertError = null
  notifyMock.mockResolvedValue(undefined)
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue({ id: 'tx-1' })
  awardBadgeReceiveScoreMock.mockReset()
  awardBadgeReceiveScoreMock.mockResolvedValue({ status: 'scored' })
  awardCollectionCompleteScoreMock.mockReset()
  awardCollectionCompleteScoreMock.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('동기화 보정(checkItemBookCompletion) — 보상 배지 발급', () => {
  it('새로 완성하면 완성 기록과 보상 배지를 함께 만든다', async () => {
    seed()

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [BOOK_ID], rewardBadgesIssued: 1, rewardBadgeIds: [REWARD_BADGE_ID] })
    expect(db.upserts).toEqual([[{ user_id: USER_ID, item_book_id: BOOK_ID }]])
    expect(db.inserts).toEqual([
      { user_id: USER_ID, badge_id: REWARD_BADGE_ID, triggered_by: `itembook_complete:${BOOK_ID}` },
    ])
  })

  it('완성 기록은 있는데 보상 배지가 없으면(장착으로 완성한 경우) 배지만 따라잡아 발급한다', async () => {
    seed({ completionRecorded: true })

    const result = await checkItemBookCompletion(USER_ID)

    // 새로 완성한 컬렉션이 아니므로 completedIds·완성 기록 upsert에는 들지 않는다
    expect(result.completedIds).toEqual([])
    expect(db.upserts).toEqual([])
    // 보상 배지는 보정으로 발급되고, 반환(동기화 결산 입력)에도 담긴다
    expect(result.rewardBadgeIds).toEqual([REWARD_BADGE_ID])
    expect(result.rewardBadgesIssued).toBe(1)
    expect(db.inserts).toEqual([
      { user_id: USER_ID, badge_id: REWARD_BADGE_ID, triggered_by: `itembook_complete:${BOOK_ID}` },
    ])
  })

  it('이미 보유한 보상 배지는 다시 발급하지 않는다', async () => {
    seed({ completionRecorded: true, alreadyHeld: true })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })
    expect(db.inserts).toEqual([])
  })

  it('같은 보정을 두 번 돌려도 보상 배지는 한 번만 발급된다', async () => {
    seed({ completionRecorded: true })

    const first = await checkItemBookCompletion(USER_ID)
    const second = await checkItemBookCompletion(USER_ID)

    expect(first.rewardBadgeIds).toEqual([REWARD_BADGE_ID])
    expect(second.rewardBadgeIds).toEqual([])
    expect(db.inserts).toHaveLength(1)
  })

  it('동시 발급 경합(23505)은 오류 없이 건너뛰고 발급분에 넣지 않는다', async () => {
    seed({ completionRecorded: true })
    db.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })
    expect(db.inserts).toHaveLength(1)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('23505가 아닌 insert 오류는 로그를 남기고 발급분에 넣지 않는다', async () => {
    seed({ completionRecorded: true })
    db.insertError = { code: '08006', message: '연결 오류' }

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.rewardBadgeIds).toEqual([])
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it('reward_badge_id가 비면 새로 완성해도 발급하지 않는다(완성 기록은 만든다)', async () => {
    seed({ rewardBadgeId: null })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [BOOK_ID], rewardBadgesIssued: 0, rewardBadgeIds: [] })
    expect(db.upserts).toHaveLength(1)
    expect(db.inserts).toEqual([])
  })

  it('완성 조건을 채우지 못한 컬렉션은 완성 기록도 보상 배지도 만들지 않는다', async () => {
    seed()
    db.tables.user_item_book_slots = [{ user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'b1' }]

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })
    expect(db.upserts).toEqual([])
    expect(db.inserts).toEqual([])
  })
})

describe('issueItemBookRewardBadges — 발급 함수', () => {
  it('보상 배지가 activity 타입이 아니어도 동작은 같고 경고 로그만 남긴다', async () => {
    seed()
    db.tables.badges = [
      ...db.tables.badges.filter((b) => b.id !== REWARD_BADGE_ID),
      { id: REWARD_BADGE_ID, item_book_id: null, type: 'item', drop_excluded: false },
    ]

    const issued = await issueItemBookRewardBadges(createServiceClient(), USER_ID, [
      { id: BOOK_ID, name: '테스트 컬렉션', reward_badge_id: REWARD_BADGE_ID },
    ])

    expect(issued).toEqual([REWARD_BADGE_ID])
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(String(consoleError.mock.calls[0][0])).toContain('reward_badge type 불일치')
  })

  it('보상 배지가 없는 컬렉션만 넘기면 아무것도 읽거나 쓰지 않는다', async () => {
    seed({ rewardBadgeId: null })

    const issued = await issueItemBookRewardBadges(createServiceClient(), USER_ID, [
      { id: BOOK_ID, name: '테스트 컬렉션', reward_badge_id: null },
    ])

    expect(issued).toEqual([])
    expect(db.inserts).toEqual([])
  })
})

describe('장착 직후 발급(runSlotRewardIssue)', () => {
  it('완성 기록이 있으면 보상 배지를 발급하고 activity_recap 결산으로 알린다', async () => {
    seed({ completionRecorded: true })

    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(db.inserts).toEqual([
      { user_id: USER_ID, badge_id: REWARD_BADGE_ID, triggered_by: `itembook_complete:${BOOK_ID}` },
    ])
    expect(notifyMock).toHaveBeenCalledTimes(1)
    // (service, userId, 발급 배지 id, 활동 id 목록)
    expect(notifyMock.mock.calls[0].slice(1)).toEqual([USER_ID, [REWARD_BADGE_ID], []])
  })

  it('완성 기록이 없으면(이 장착으로 완성하지 않았으면) 발급도 알림도 없다', async () => {
    seed({ completionRecorded: false })

    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(db.inserts).toEqual([])
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('이미 보유한 보상 배지는 다시 발급하지 않고 알리지도 않는다', async () => {
    seed({ completionRecorded: true, alreadyHeld: true })

    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(db.inserts).toEqual([])
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('reward_badge_id가 비면 완성 기록을 읽지 않고 끝낸다', async () => {
    seed({ rewardBadgeId: null, completionRecorded: true })

    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(db.inserts).toEqual([])
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('동시 발급 경합(23505)이면 오류 없이 끝나고 알리지 않는다', async () => {
    seed({ completionRecorded: true })
    db.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }

    await expect(runSlotRewardIssue(USER_ID, BOOK_ID)).resolves.toBeUndefined()

    expect(notifyMock).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('알림이 실패해도 예외를 던지지 않고 로그만 남긴다', async () => {
    seed({ completionRecorded: true })
    notifyMock.mockRejectedValue(new Error('알림 장애'))

    await expect(runSlotRewardIssue(USER_ID, BOOK_ID)).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it('장착 직후 발급 뒤에 이어진 동기화 보정은 같은 보상 배지를 다시 발급하지 않는다', async () => {
    seed({ completionRecorded: true })

    await runSlotRewardIssue(USER_ID, BOOK_ID)
    const catchUp = await checkItemBookCompletion(USER_ID)

    expect(catchUp.rewardBadgeIds).toEqual([])
    expect(db.inserts).toHaveLength(1)
  })
})

describe('동기화 보정 — 등급별 구조(tier_mode) 컬렉션의 등급 보상 배지 (티켓 20261016_2340)', () => {
  const COMMON_REWARD = 'tier-reward-common'
  const EPIC_REWARD = 'tier-reward-epic'

  /** 등급별 컬렉션 1개. 옛 완성 기록과 컬렉션 단위 보상 배지는 두지 않는다(등급 완성은 새 테이블에 기록된다) */
  function seedTier(opts: { completedTiers?: string[]; rewards?: Row[] } = {}) {
    const completedTiers = opts.completedTiers ?? ['common']
    db.tables = {
      item_books: [{ id: BOOK_ID, name: '등급 컬렉션', reward_badge_id: null, is_active: true, tier_mode: true }],
      badges: [
        { id: 'c1', item_book_id: BOOK_ID, type: 'item', drop_excluded: false, name: 'A', rarity: 'common', deleted_at: null },
        { id: 'e1', item_book_id: BOOK_ID, type: 'item', drop_excluded: false, name: 'A', rarity: 'epic', deleted_at: null },
        { id: COMMON_REWARD, item_book_id: null, type: 'activity', drop_excluded: false },
        { id: EPIC_REWARD, item_book_id: null, type: 'activity', drop_excluded: false },
      ],
      user_item_book_slots: [{ user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'c1' }],
      user_item_book_completions: [],
      user_item_book_tier_completions: completedTiers.map((tier) => ({ user_id: USER_ID, item_book_id: BOOK_ID, tier })),
      item_book_tier_rewards: opts.rewards ?? [
        { item_book_id: BOOK_ID, tier: 'common', reward_badge_id: COMMON_REWARD },
        { item_book_id: BOOK_ID, tier: 'epic', reward_badge_id: EPIC_REWARD },
      ],
      user_activity_badges: [],
    }
  }

  it('등급 완성 기록이 있는 등급의 보상 배지만 따라잡아 발급하고 완성 기록 upsert·completedIds에는 넣지 않는다', async () => {
    seedTier({ completedTiers: ['common'] })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 1, rewardBadgeIds: [COMMON_REWARD] })
    expect(db.upserts).toEqual([])
    expect(db.inserts).toEqual([
      { user_id: USER_ID, badge_id: COMMON_REWARD, triggered_by: `itembook_complete:${BOOK_ID}` },
    ])
  })

  it('두 등급을 완성했으면 두 등급의 보상 배지를 모두 발급한다', async () => {
    seedTier({ completedTiers: ['common', 'epic'] })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.rewardBadgeIds).toEqual([COMMON_REWARD, EPIC_REWARD])
    expect(db.upserts).toEqual([])
  })

  it('같은 보정을 두 번 돌려도 등급 보상 배지는 한 번만 나간다', async () => {
    seedTier({ completedTiers: ['common'] })

    const first = await checkItemBookCompletion(USER_ID)
    const second = await checkItemBookCompletion(USER_ID)

    expect(first.rewardBadgeIds).toEqual([COMMON_REWARD])
    expect(second.rewardBadgeIds).toEqual([])
    expect(db.inserts).toHaveLength(1)
  })

  it('등급 완성 기록이 없으면 보상 배지도 없고 보상 표는 읽지 않는다', async () => {
    seedTier({ completedTiers: [] })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })
    expect(db.inserts).toEqual([])
    expect(db.reads).not.toContain('item_book_tier_rewards')
  })

  it('완성한 등급의 보상 배지가 비어 있거나 보상 행이 없으면 발급하지 않는다', async () => {
    seedTier({
      completedTiers: ['common', 'epic'],
      rewards: [{ item_book_id: BOOK_ID, tier: 'common', reward_badge_id: null }],
    })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })
    expect(db.inserts).toEqual([])
  })

  it('tier_mode 컬렉션은 옛 규칙으로 완성처럼 보여도 옛 완성 기록을 만들지 않는다', async () => {
    seedTier({ completedTiers: [] })
    // 꽂힌 등급의 이름 칸을 모두 채운 상태(옛 컬렉션이었다면 완성 기록 대상)
    db.tables.badges = db.tables.badges.filter((b) => b.id !== 'e1')

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.completedIds).toEqual([])
    expect(db.upserts).toEqual([])
  })

  it('tier_mode가 꺼진 컬렉션은 결과가 달라지지 않고 등급 테이블을 읽지 않는다(회귀)', async () => {
    seed({ completionRecorded: true })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.rewardBadgeIds).toEqual([REWARD_BADGE_ID])
    expect(db.reads).not.toContain('user_item_book_tier_completions')
    expect(db.reads).not.toContain('item_book_tier_rewards')
  })

  it('꺼진 컬렉션과 켜진 컬렉션이 함께 있어도 옛 컬렉션은 옛 경로로, 켜진 컬렉션은 등급 경로로 발급된다', async () => {
    seed({ completionRecorded: true })
    db.tables.item_books = [
      ...db.tables.item_books,
      { id: 'book-tier', name: '등급 컬렉션', reward_badge_id: null, is_active: true, tier_mode: true },
    ]
    db.tables.user_item_book_tier_completions = [{ user_id: USER_ID, item_book_id: 'book-tier', tier: 'rare' }]
    db.tables.item_book_tier_rewards = [{ item_book_id: 'book-tier', tier: 'rare', reward_badge_id: 'tier-reward-rare' }]
    db.tables.badges = [...db.tables.badges, { id: 'tier-reward-rare', item_book_id: null, type: 'activity', drop_excluded: false }]

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.rewardBadgeIds).toEqual([REWARD_BADGE_ID, 'tier-reward-rare'])
    expect(result.completedIds).toEqual([])
  })
})

describe('컬렉션 보상 배지의 배지 포인트 (티켓 20261019_1314 2회, 운영 로직 14.1절)', () => {
  const POINT = 10

  it('동기화 보정으로 보상 배지를 새로 넣으면 그 배지의 point_reward를 badge_point_reward로 한 번 준다', async () => {
    seed({ pointReward: POINT })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.rewardBadgeIds).toEqual([REWARD_BADGE_ID])
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, POINT, 'badge_point_reward', { sourceBadgeId: REWARD_BADGE_ID })
  })

  it('보정분(완성 기록은 있으나 배지가 없던 북)도 새로 넣을 때는 준다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.completedIds).toEqual([])
    expect(result.rewardBadgeIds).toEqual([REWARD_BADGE_ID])
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, POINT, 'badge_point_reward', { sourceBadgeId: REWARD_BADGE_ID })
  })

  it('이미 보유한 보상 배지는 지급이 없다', async () => {
    seed({ completionRecorded: true, alreadyHeld: true, pointReward: POINT })

    await checkItemBookCompletion(USER_ID)

    expect(db.inserts).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('동시 발급 경합(23505)이면 지급이 없다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })
    db.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }

    await checkItemBookCompletion(USER_ID)

    expect(db.inserts).toHaveLength(1)
    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('23505가 아닌 insert 오류로 배지를 못 넣었으면 지급이 없다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })
    db.insertError = { code: '08006', message: '연결 오류' }

    await checkItemBookCompletion(USER_ID)

    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('포인트가 0이거나 비어 있는 배지는 지급을 부르지 않고 배지는 그대로 발급한다', async () => {
    seed({ completionRecorded: true, pointReward: 0 })
    const zero = await checkItemBookCompletion(USER_ID)

    seed({ completionRecorded: true })
    const unset = await checkItemBookCompletion(USER_ID)

    seed({ completionRecorded: true, pointReward: null })
    const empty = await checkItemBookCompletion(USER_ID)

    expect([zero.rewardBadgeIds, unset.rewardBadgeIds, empty.rewardBadgeIds]).toEqual([
      [REWARD_BADGE_ID],
      [REWARD_BADGE_ID],
      [REWARD_BADGE_ID],
    ])
    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('reward_badge_id가 비면 지급이 없다', async () => {
    seed({ rewardBadgeId: null, pointReward: POINT })

    await checkItemBookCompletion(USER_ID)

    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('같은 보정을 두 번 돌려도 포인트는 한 번만 나간다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })

    await checkItemBookCompletion(USER_ID)
    await checkItemBookCompletion(USER_ID)

    expect(db.inserts).toHaveLength(1)
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
  })

  it('포인트 지급이 실패해도(null) 보상 배지 발급 결과는 그대로다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })
    awardPointsMock.mockResolvedValue(null)

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 1, rewardBadgeIds: [REWARD_BADGE_ID] })
    expect(db.inserts).toHaveLength(1)
  })

  it('포인트 지급이 던져도 삼키고 로그만 남기며 보상 배지 발급 결과는 그대로다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })
    awardPointsMock.mockRejectedValue(new Error('포인트 장애'))

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.rewardBadgeIds).toEqual([REWARD_BADGE_ID])
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it('장착 직후 발급(runSlotRewardIssue)도 새로 넣으면 포인트를 주고 알림도 그대로 보낸다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })

    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, POINT, 'badge_point_reward', { sourceBadgeId: REWARD_BADGE_ID })
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('장착 직후 발급이 이미 준 뒤의 동기화 보정은 포인트를 다시 주지 않는다', async () => {
    seed({ completionRecorded: true, pointReward: POINT })

    await runSlotRewardIssue(USER_ID, BOOK_ID)
    await checkItemBookCompletion(USER_ID)

    expect(awardPointsMock).toHaveBeenCalledTimes(1)
  })

  it('이미 보유했거나 완성이 아닌 장착 직후 발급은 포인트를 주지 않는다', async () => {
    seed({ completionRecorded: true, alreadyHeld: true, pointReward: POINT })
    await runSlotRewardIssue(USER_ID, BOOK_ID)

    seed({ completionRecorded: false, pointReward: POINT })
    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('issueItemBookRewardBadges를 직접 불러도 새로 넣은 컬렉션의 배지 포인트만 준다', async () => {
    seed({ pointReward: POINT })

    const issued = await issueItemBookRewardBadges(createServiceClient(), USER_ID, [
      { id: BOOK_ID, name: '테스트 컬렉션', reward_badge_id: REWARD_BADGE_ID },
    ])
    const again = await issueItemBookRewardBadges(createServiceClient(), USER_ID, [
      { id: BOOK_ID, name: '테스트 컬렉션', reward_badge_id: REWARD_BADGE_ID },
    ])

    expect(issued).toEqual([REWARD_BADGE_ID])
    expect(again).toEqual([])
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
  })

  it('등급별(tier_mode) 컬렉션의 등급 보상 배지도 새로 넣을 때 그 배지의 포인트를 준다', async () => {
    const TIER_REWARD = 'tier-reward-common'
    db.tables = {
      item_books: [{ id: BOOK_ID, name: '등급 컬렉션', reward_badge_id: null, is_active: true, tier_mode: true }],
      badges: [
        { id: 'c1', item_book_id: BOOK_ID, type: 'item', drop_excluded: false, name: 'A', rarity: 'common', deleted_at: null },
        { id: TIER_REWARD, item_book_id: null, type: 'activity', drop_excluded: false, point_reward: 20 },
      ],
      user_item_book_slots: [{ user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'c1' }],
      user_item_book_completions: [],
      user_item_book_tier_completions: [{ user_id: USER_ID, item_book_id: BOOK_ID, tier: 'common' }],
      item_book_tier_rewards: [{ item_book_id: BOOK_ID, tier: 'common', reward_badge_id: TIER_REWARD }],
      user_activity_badges: [],
    }

    const first = await checkItemBookCompletion(USER_ID)
    const second = await checkItemBookCompletion(USER_ID)

    expect(first.rewardBadgeIds).toEqual([TIER_REWARD])
    expect(second.rewardBadgeIds).toEqual([])
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, 20, 'badge_point_reward', { sourceBadgeId: TIER_REWARD })
  })
})

describe('컬렉션 보상 배지의 챕터 점수 «배지 받기» (티켓 20261019_1315 2a회, 운영 로직 12.2절)', () => {
  const REWARD_BADGE_FIELDS = { is_hidden: false, condition_json: { total_count: 3 } }

  it('보상 배지를 새로 넣으면 그 배지의 id·유형·숨김·조건과 출처를 넘겨 점수 함수를 한 번 부른다', async () => {
    seed({ completionRecorded: true, rewardBadgeExtra: REWARD_BADGE_FIELDS })

    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
      badge: { id: REWARD_BADGE_ID, type: 'activity', is_hidden: false, condition_json: { total_count: 3 } },
      origin: { triggeredBy: `itembook_complete:${BOOK_ID}` },
    })
  })

  it('숨김·제외 조건 배지의 판별 입력을 그대로 넘긴다(거르는 일은 공용 함수가 한다)', async () => {
    seed({ completionRecorded: true, rewardBadgeExtra: { is_hidden: true, condition_json: { follower_count: 10 } } })

    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ badge: expect.objectContaining({ is_hidden: true, condition_json: { follower_count: 10 } }) })
    )
  })

  it('새로 완성한 컬렉션의 보상 배지도 센다 (완성 기록과 함께 만든 경우)', async () => {
    seed({ rewardBadgeExtra: REWARD_BADGE_FIELDS })

    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
  })

  it('이미 보유한 보상 배지는 점수를 부르지 않는다', async () => {
    seed({ completionRecorded: true, alreadyHeld: true, rewardBadgeExtra: REWARD_BADGE_FIELDS })

    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()
  })

  it('동시 발급 경합(23505)이면 점수를 부르지 않는다', async () => {
    seed({ completionRecorded: true, rewardBadgeExtra: REWARD_BADGE_FIELDS })
    db.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }

    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()
  })

  it('23505가 아닌 insert 오류로 배지를 못 넣었으면 점수를 부르지 않는다', async () => {
    seed({ completionRecorded: true, rewardBadgeExtra: REWARD_BADGE_FIELDS })
    db.insertError = { code: '08006', message: '연결 오류' }

    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()
  })

  it('reward_badge_id가 비면 점수를 부르지 않는다', async () => {
    seed({ rewardBadgeId: null })

    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()
  })

  it('같은 보정을 두 번 돌려도 점수는 한 번만 부른다', async () => {
    seed({ completionRecorded: true, rewardBadgeExtra: REWARD_BADGE_FIELDS })

    await checkItemBookCompletion(USER_ID)
    await checkItemBookCompletion(USER_ID)

    expect(db.inserts).toHaveLength(1)
    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
  })

  it('점수 호출이 실패(failed)여도 보상 배지 발급 결과와 포인트 지급은 그대로다', async () => {
    seed({ completionRecorded: true, pointReward: 30, rewardBadgeExtra: REWARD_BADGE_FIELDS })
    awardBadgeReceiveScoreMock.mockResolvedValue({ status: 'failed' })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [], rewardBadgesIssued: 1, rewardBadgeIds: [REWARD_BADGE_ID] })
    expect(db.inserts).toHaveLength(1)
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
  })

  it('장착 직후 발급(runSlotRewardIssue)도 새로 넣으면 센다', async () => {
    seed({ completionRecorded: true, rewardBadgeExtra: REWARD_BADGE_FIELDS })

    await runSlotRewardIssue(USER_ID, BOOK_ID)

    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ badge: expect.objectContaining({ id: REWARD_BADGE_ID }) })
    )
  })

  it('등급별(tier_mode) 컬렉션의 등급 보상 배지도 새로 넣을 때 센다', async () => {
    const TIER_REWARD = 'tier-reward-common'
    db.tables = {
      item_books: [{ id: BOOK_ID, name: '등급 컬렉션', reward_badge_id: null, is_active: true, tier_mode: true }],
      badges: [
        { id: 'c1', item_book_id: BOOK_ID, type: 'item', drop_excluded: false, name: 'A', rarity: 'common', deleted_at: null },
        { id: TIER_REWARD, item_book_id: null, type: 'activity', drop_excluded: false, is_hidden: false, condition_json: null },
      ],
      user_item_book_slots: [{ user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'c1' }],
      user_item_book_completions: [],
      user_item_book_tier_completions: [{ user_id: USER_ID, item_book_id: BOOK_ID, tier: 'common' }],
      item_book_tier_rewards: [{ item_book_id: BOOK_ID, tier: 'common', reward_badge_id: TIER_REWARD }],
      user_activity_badges: [],
    }

    await checkItemBookCompletion(USER_ID)
    await checkItemBookCompletion(USER_ID)

    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ badge: { id: TIER_REWARD, type: 'activity', is_hidden: false, condition_json: null } })
    )
  })
})

describe('동기화 보정의 챕터 점수 «컬렉션 완성» (티켓 20261019_1315 3회, 사용자 결정 4)', () => {
  it('새로 완성한 옛 컬렉션은 등급 common으로 컬렉션 완성 점수를 한 번 부른다', async () => {
    seed()

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.completedIds).toEqual([BOOK_ID])
    expect(awardCollectionCompleteScoreMock).toHaveBeenCalledTimes(1)
    expect(awardCollectionCompleteScoreMock).toHaveBeenCalledWith(expect.anything(), { userId: USER_ID, itemBookId: BOOK_ID, tier: 'common' })
  })

  it('점수는 완성 기록을 남긴 뒤에 부른다', async () => {
    seed()
    awardCollectionCompleteScoreMock.mockImplementation(async () => {
      // 이 시점에 완성 기록 upsert가 끝나 있어야 한다
      expect(db.upserts).toEqual([[{ user_id: USER_ID, item_book_id: BOOK_ID }]])
      return { ok: true }
    })

    await checkItemBookCompletion(USER_ID)

    expect(awardCollectionCompleteScoreMock).toHaveBeenCalledTimes(1)
  })

  it('완성 기록이 이미 있는 컬렉션(장착으로 완성하고 보상 배지만 따라잡는 경우)은 부르지 않는다 — 장착 라우트가 이미 셌다', async () => {
    seed({ completionRecorded: true })

    await checkItemBookCompletion(USER_ID)

    expect(awardCollectionCompleteScoreMock).not.toHaveBeenCalled()
  })

  it('같은 보정을 두 번 돌려도 한 번만 부른다(두 번째는 완성 기록이 있어 새 완성이 아니다)', async () => {
    seed()

    await checkItemBookCompletion(USER_ID)
    await checkItemBookCompletion(USER_ID)

    expect(awardCollectionCompleteScoreMock).toHaveBeenCalledTimes(1)
  })

  it('컬렉션이 아직 완성되지 않았으면 부르지 않는다', async () => {
    seed()
    db.tables.user_item_book_slots = [{ user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'b1' }]

    await checkItemBookCompletion(USER_ID)

    expect(awardCollectionCompleteScoreMock).not.toHaveBeenCalled()
  })

  it('등급별(tier_mode) 컬렉션은 보정이 완성을 만들지 않으므로 부르지 않는다 — 등급 완성은 장착 라우트가 센다', async () => {
    db.tables = {
      item_books: [{ id: BOOK_ID, name: '등급 컬렉션', reward_badge_id: null, is_active: true, tier_mode: true }],
      badges: [{ id: 'c1', item_book_id: BOOK_ID, type: 'item', drop_excluded: false, name: 'A', rarity: 'common', deleted_at: null }],
      user_item_book_slots: [{ user_id: USER_ID, item_book_id: BOOK_ID, badge_id: 'c1' }],
      user_item_book_completions: [],
      user_item_book_tier_completions: [{ user_id: USER_ID, item_book_id: BOOK_ID, tier: 'common' }],
      item_book_tier_rewards: [],
      user_activity_badges: [],
    }

    const result = await checkItemBookCompletion(USER_ID)

    expect(result.completedIds).toEqual([])
    expect(awardCollectionCompleteScoreMock).not.toHaveBeenCalled()
  })

  it('점수가 실패(ok: false)해도 완성 기록·보상 배지 발급·반환값은 그대로다', async () => {
    seed({ rewardBadgeExtra: { is_hidden: false, condition_json: null } })
    awardCollectionCompleteScoreMock.mockResolvedValue({ ok: false })

    const result = await checkItemBookCompletion(USER_ID)

    expect(result).toEqual({ completedIds: [BOOK_ID], rewardBadgesIssued: 1, rewardBadgeIds: [REWARD_BADGE_ID] })
    expect(db.upserts).toEqual([[{ user_id: USER_ID, item_book_id: BOOK_ID }]])
    expect(db.inserts).toHaveLength(1)
  })
})
