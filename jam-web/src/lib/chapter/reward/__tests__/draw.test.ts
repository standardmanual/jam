/**
 * lib/chapter/reward/draw — 챕터 오름 보상 추첨 실행 (티켓 20261127_1731 C3a)
 *
 * 고정하는 것:
 * - 개수는 마친 챕터의 `reward_count`다. NULL이면 아무것도 읽지 않고 `count: null`과 빈 목록이다.
 * - 소속 트라이브가 없으면 `ChapterRewardError('no_tribe')`를 던지고 난수를 쓰지 않는다.
 * - 정상 추첨은 저장 모양(`StoredChapterRewardItem`)과 트라이브 이름표를 돌려준다. 저장·지급은 하지 않는다(RPC·쓰기 호출이 없다).
 * - 정책 두 곳을 쓴다: 등급 확률은 `chapter_reward_policy`, 같은 등급 연속 임계값과 잠김 확률은 `jam_policy`(`getJamPolicy`).
 * - 모든 등급에 후보가 없는 개체는 `engine_decision_log`(`drop`/`drop_attempt`, path `chapter_reward`, outcome `no_candidate`)에 남기고, 개체가 하나도 없으면 던지지 않고 빈 목록이다.
 * - 읽기 오류는 던진다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트·결정적 난수만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/reward/__tests__/draw.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_JAM_POLICY, type JamPolicy } from '@/lib/jam/policy'
import type { ChapterRewardBadge } from '../stored'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const logMock = vi.hoisted(() => vi.fn())
const jamPolicyRef = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }))
const badgesRef = vi.hoisted(() => ({ rows: [] as unknown[] }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/jam/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/jam/policy')>()
  return { ...actual, getJamPolicy: async () => ({ ...actual.DEFAULT_JAM_POLICY, ...jamPolicyRef.value }) }
})
vi.mock('@/lib/db/fetchAllRows', () => ({ fetchAllRowsIn: async () => badgesRef.rows }))

import { ChapterRewardError, drawChapterReward } from '../draw'

type Result = { data: unknown; error: unknown }

/** select·eq·is·in 어느 쪽으로 끝나도(maybeSingle 또는 바로 await) 같은 결과를 돌려주는 가짜 조회. 읽은 테이블을 기록한다 */
function fakeClient(tables: Record<string, Result>) {
  const reads: string[] = []
  const client = {
    from: (table: string) => {
      reads.push(table)
      const result = tables[table] ?? { data: null, error: { message: `예상하지 못한 테이블 ${table}` } }
      const q: Record<string, unknown> = {}
      const self = () => q
      q.select = self
      q.eq = self
      q.is = self
      q.in = self
      q.maybeSingle = async () => result
      q.then = (resolve: (r: Result) => unknown) => resolve(result)
      return q
    },
    rpc: () => {
      throw new Error('추첨은 RPC를 부르지 않는다 — 저장·지급은 B5·C3b의 일이다')
    },
  } as unknown as SupabaseClient
  return { client, reads }
}

const TRIBE_ROWS = ['A', 'B'].map((id) => ({ id, name: `트라이브 ${id}` }))

const badge = (tribe: string, rarity: ChapterRewardBadge['rarity']): ChapterRewardBadge => ({
  id: `${tribe}-${rarity}`,
  name: `${tribe}-${rarity}`,
  image_url: null,
  rarity,
  item_book_id: `book-${tribe}`,
  drop_excluded: false,
  valid_from: null,
  valid_until: null,
  deleted_at: null,
  point_reward: null,
})

const POLICY_ROW = {
  other_tribe_probability: 0.2,
  rarity_common: 30,
  rarity_rare: 40,
  rarity_epic: 22,
  rarity_mystic: 8,
  pity_epic_threshold: 15,
}

function tables(over: Record<string, Result> = {}): Record<string, Result> {
  return {
    chapter_definitions: { data: { reward_count: 3 }, error: null },
    users: { data: { tribe_id: 'A' }, error: null },
    tribes: { data: TRIBE_ROWS, error: null },
    item_books: {
      data: ['A', 'B'].map((t) => ({
        id: `book-${t}`,
        tribe_id: t,
        is_active: true,
        drop_excluded: false,
        valid_from: null,
        valid_until: null,
      })),
      error: null,
    },
    user_drop_state: { data: { common_streak: 0, capsule_epic_miss: 0 }, error: null },
    chapter_reward_policy: { data: POLICY_ROW, error: null },
    ...over,
  }
}

const NOW = new Date('2026-11-27T00:00:00Z')

/** 고정 난수 — 늘 같은 값. 0.5는 내 트라이브(0.2 이상), 열린 채(0.25 이상)다 */
const constant = (v: number) => () => v

beforeEach(() => {
  logMock.mockReset()
  jamPolicyRef.value = null
  badgesRef.rows = ['A', 'B'].flatMap((t) => (['common', 'rare', 'epic', 'mystic'] as const).map((r) => badge(t, r)))
})

describe('drawChapterReward', () => {
  it('reward_count만큼 저장 모양의 개체와 트라이브 이름표를 돌려준다(저장·지급은 하지 않는다)', async () => {
    const { client } = fakeClient(tables())
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })

    expect(draw.count).toBe(3)
    expect(draw.skippedCount).toBe(0)
    expect(draw.tribes).toEqual(TRIBE_ROWS)
    expect(draw.items).toHaveLength(3)
    // rand 0.5 → 내 트라이브, 등급 rare(0.3~0.7), 열린 채
    expect(draw.items[0]).toEqual({
      badge_id: expect.stringMatching(/^A-rare$/),
      rarity: 'rare',
      rolled_rarity: 'rare',
      locked: false,
      lock_reason: null,
      unlock_required: null,
    })
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each([3, 4, 5])('reward_count %i이면 개체가 %i개다', async (n) => {
    const { client } = fakeClient(tables({ chapter_definitions: { data: { reward_count: n }, error: null } }))
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })
    expect(draw.count).toBe(n)
    expect(draw.items).toHaveLength(n)
  })

  it('등급 확률은 chapter_reward_policy 값을 쓴다(Epic 100%이면 모두 Epic)', async () => {
    const policy = { ...POLICY_ROW, rarity_common: 0, rarity_rare: 0, rarity_epic: 100, rarity_mystic: 0 }
    const { client } = fakeClient(tables({ chapter_reward_policy: { data: policy, error: null } }))
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })
    expect(draw.items.map((i) => i.rarity)).toEqual(['epic', 'epic', 'epic'])
  })

  it('잠김 확률은 jam_policy 값을 쓴다(1이면 모두 잠긴 채, 필요한 양은 등급 최소값)', async () => {
    jamPolicyRef.value = { locked_roll_probability: 1 }
    const { client } = fakeClient(tables())
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })
    expect(draw.items.every((i) => i.locked && i.lock_reason === 'rolled')).toBe(true)
    expect(draw.items[0].unlock_required).toBe(DEFAULT_JAM_POLICY.locked_min_rare)
  })

  it('같은 등급 연속 임계값은 jam_policy 값을 쓴다(3으로 낮추고 common_streak 3이면 첫 개체가 Rare 이상)', async () => {
    jamPolicyRef.value = { common_streak_threshold: 3 } satisfies Partial<JamPolicy>
    const { client } = fakeClient(tables({ user_drop_state: { data: { common_streak: 3, capsule_epic_miss: 0 }, error: null } }))
    // 난수 0: 내려 가는 일 없이 등급 추첨의 맨 앞 칸 — 보정이 없으면 common, 있으면 rare
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0), now: NOW })
    expect(draw.items[0].rolled_rarity).toBe('rare')
  })

  it('user_drop_state 행이 없으면 보정 카운터는 0이다', async () => {
    const { client } = fakeClient(tables({ user_drop_state: { data: null, error: null } }))
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })
    expect(draw.items).toHaveLength(3)
  })

  it('소속 트라이브가 없으면 no_tribe를 던지고 난수를 쓰지 않는다', async () => {
    const { client } = fakeClient(tables({ users: { data: { tribe_id: null }, error: null } }))
    const rand = vi.fn(() => 0.5)
    const error = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand, now: NOW }).catch((e) => e)
    expect(error).toBeInstanceOf(ChapterRewardError)
    expect(error.code).toBe('no_tribe')
    expect(rand).not.toHaveBeenCalled()
  })

  it('reward_count가 NULL이면 사용자·정책을 읽지 않고 count null과 빈 목록이다', async () => {
    const { client, reads } = fakeClient(tables({ chapter_definitions: { data: { reward_count: null }, error: null } }))
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 10, rand: constant(0.5), now: NOW })
    expect(draw).toEqual({ items: [], tribes: [], count: null, skippedCount: 0 })
    expect(reads).toEqual(['chapter_definitions'])
  })

  it('모든 등급에 후보가 없으면 던지지 않고 빈 목록을 돌려주며, 개체마다 후보 없음 로그를 남긴다', async () => {
    badgesRef.rows = []
    const { client } = fakeClient(tables())
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })

    expect(draw.items).toEqual([])
    expect(draw.count).toBe(3)
    expect(draw.skippedCount).toBe(3)
    expect(logMock).toHaveBeenCalledTimes(3)
    expect(logMock).toHaveBeenCalledWith('drop', 'drop_attempt', USER_ID, {
      path: 'chapter_reward',
      outcome: 'no_candidate',
      tribeId: 'A',
      rolledRarity: 'rare',
    })
  })

  it('뽑힌 등급에 후보가 없으면 한 등급 내려가 받고, 건너뛴 것으로 세지 않는다', async () => {
    // 내 트라이브(A)에는 common만 있다 — rand 0.5는 rare를 뽑는데 common으로 내려간다
    badgesRef.rows = [badge('A', 'common')]
    const { client } = fakeClient(tables())
    const draw = await drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })
    expect(draw.items.map((i) => [i.rolled_rarity, i.rarity])).toEqual([
      ['rare', 'common'],
      ['rare', 'common'],
      ['rare', 'common'],
    ])
    expect(draw.skippedCount).toBe(0)
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each([
    ['chapter_definitions'],
    ['users'],
    ['tribes'],
    ['item_books'],
    ['user_drop_state'],
    ['chapter_reward_policy'],
  ])('%s 읽기가 실패하면 던진다', async (table) => {
    const { client } = fakeClient(tables({ [table]: { data: null, error: { message: 'boom' } } }))
    await expect(drawChapterReward(client, USER_ID, { finishedChapterNo: 1, rand: constant(0.5), now: NOW })).rejects.toThrow('boom')
  })
})
