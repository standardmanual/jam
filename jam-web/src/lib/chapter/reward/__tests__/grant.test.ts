/**
 * lib/chapter/reward/grant — 챕터 오름 보상 지급 연결 (티켓 20261127_1732 C3b)
 *
 * 고정하는 것:
 * - 마친 챕터 번호 계산: 오른 챕터 K(2 이상)마다 K-1, K = 1은 보상 없음, 여러 챕터를 넘으면 각각 한 번씩.
 * - `issueChapterReward`: 지급 기록이 있으면 추첨·RPC를 부르지 않는다 / 추첨이 비었거나 소속 트라이브가 없으면 RPC 없이 `skipped` /
 *   `claimed`면 후속 처리(포인트, 칸 알림) / `pending`이면 후속 처리 없이 판정 로그만 / `duplicate`는 아무것도 안 함 /
 *   이용 정지는 조용히, 그 밖의 오류는 `chapter_reward_failed` 기록과 `failed`. 어떤 경우도 던지지 않는다.
 * - `claimPendingChapterRewards`: 오래된 순으로 받고 `insufficient_slots`에서 멈추며(뒤 행도 건너뜀) 저장된 항목으로 후속 처리한다.
 * - `findMissingRewardChapters`: 이관이 올린 챕터와 «도달 시각이 승급 적립 기록과 같은» 챕터만 고르고 옛 방식 챕터·이미 지급된 챕터·K가 2 미만은 뺀다.
 * - `settleChapterRewards`: 대기 받기 → 보충 순서, `scanMissing`에 따른 차이, 같은 프로세스 동시 호출 방지.
 * - `grantRewardsForReachedChapters`: 오른 챕터마다 마친 챕터를 지급한다.
 * 공용 DB는 호출하지 않는다 — 클라이언트·추첨·후속 처리·로그는 모두 가짜다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/reward/__tests__/grant.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const USER = '11111111-1111-4111-8111-111111111111'

const { drawMock, rebuildMock, recordItemsMock, notifyMock, logMock, createServiceClientMock } = vi.hoisted(() => ({
  drawMock: vi.fn(),
  rebuildMock: vi.fn(),
  recordItemsMock: vi.fn(),
  notifyMock: vi.fn(),
  logMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}))

vi.mock('../draw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../draw')>()
  return { ...actual, drawChapterReward: (...args: unknown[]) => drawMock(...args) }
})
vi.mock('../stored', () => ({ rebuildChapterRewardItems: (...args: unknown[]) => rebuildMock(...args) }))
vi.mock('../record', () => ({ recordChapterRewardItems: (...args: unknown[]) => recordItemsMock(...args) }))
vi.mock('@/lib/inventory/slotAlert', () => ({ notifyInventorySlotsLow: (...args: unknown[]) => notifyMock(...args) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => createServiceClientMock() }))

import { ChapterRewardError } from '../draw'
import {
  claimPendingChapterRewards,
  finishedChapterNosFor,
  findMissingRewardChapters,
  grantRewardsForReachedChapters,
  issueChapterReward,
  settleChapterRewards,
} from '../grant'

interface Result {
  data: unknown
  error: { message: string } | null
}
interface Ctx {
  table: string
  filters: Record<string, unknown>
  single: boolean
}
type TableHandler = (ctx: Ctx) => Result | Promise<Result>
type RpcHandler = (args: Record<string, unknown>) => Result | Promise<Result>

const ok = (data: unknown): Result => ({ data, error: null })

/** 테이블 읽기(`select → eq… → (order…) → maybeSingle | await`)와 RPC만 흉내 낸 가짜 클라이언트 */
function makeClient(tables: Record<string, TableHandler>, rpcs: Record<string, RpcHandler> = {}) {
  const log = { reads: [] as string[], rpcs: [] as { name: string; args: Record<string, unknown> }[] }
  const client = {
    from(table: string) {
      log.reads.push(table)
      const ctx: Ctx = { table, filters: {}, single: false }
      const resolve = async (): Promise<Result> => {
        const handler = tables[table]
        if (!handler) throw new Error(`가짜 클라이언트에 ${table} 처리기가 없다`)
        return handler(ctx)
      }
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          ctx.filters[column] = value
          return chain
        },
        order: () => chain,
        maybeSingle: async () => {
          ctx.single = true
          const r = await resolve()
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
        },
        then: (onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) => resolve().then(onFulfilled, onRejected),
      }
      return chain
    },
    async rpc(name: string, args: Record<string, unknown>) {
      log.rpcs.push({ name, args })
      const handler = rpcs[name]
      if (!handler) throw new Error(`가짜 클라이언트에 rpc ${name} 처리기가 없다`)
      return handler(args)
    },
  }
  return { client: client as unknown as SupabaseClient, log }
}

const STORED = [{ badge_id: 'badge-1', rarity: 'common' }]
const DRAW = { items: STORED, tribes: [{ id: 't1', name: '트라이브' }], count: 1, skippedCount: 0 }
const REBUILT = { tribes: [{ id: 't1', name: '트라이브' }], items: [{ marker: 'rebuilt' }] }
const GRANTED_ITEMS = [{ inventoryItemId: 'inv-1', badgeId: 'badge-1', rarity: 'common', locked: false, serialNumber: 3 }]
const CLAIMED = { ok: true, duplicate: false, status: 'claimed', chapterNo: 1, items: GRANTED_ITEMS }

/** 지급 기록이 없는 유저 */
const noGrantRow: TableHandler = () => ok(null)

beforeEach(() => {
  for (const m of [drawMock, rebuildMock, recordItemsMock, notifyMock, logMock, createServiceClientMock]) m.mockReset()
  drawMock.mockResolvedValue(DRAW)
  rebuildMock.mockResolvedValue(REBUILT)
  recordItemsMock.mockResolvedValue(undefined)
  notifyMock.mockResolvedValue(undefined)
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('finishedChapterNosFor — 마친 챕터 번호', () => {
  it('K = 2에서 챕터 1을 마친 것이고, K = 1(챕터 시작)은 보상이 없다', () => {
    expect(finishedChapterNosFor([2])).toEqual([1])
    expect(finishedChapterNosFor([1])).toEqual([])
  })

  it('여러 챕터를 한 번에 넘으면 단계마다 한 번씩이다(순서 무관, 중복 없음)', () => {
    expect(finishedChapterNosFor([1, 2, 3])).toEqual([1, 2])
    expect(finishedChapterNosFor([5, 3, 4, 4])).toEqual([2, 3, 4])
  })

  it('챕터 번호가 아닌 값은 뺀다', () => {
    expect(finishedChapterNosFor([0, -1, 1.5, Number.NaN, 2])).toEqual([1])
  })
})

describe('issueChapterReward', () => {
  it('지급 기록이 이미 있으면 추첨도 RPC도 부르지 않고 duplicate다', async () => {
    const { client, log } = makeClient({ chapter_reward_grants: () => ok({ chapter_no: 1 }) })

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'duplicate' })

    expect(drawMock).not.toHaveBeenCalled()
    expect(log.rpcs).toEqual([])
  })

  it('보상 없음(count가 null)이면 RPC 없이 skipped다', async () => {
    drawMock.mockResolvedValue({ items: [], tribes: [], count: null, skippedCount: 0 })
    const { client, log } = makeClient({ chapter_reward_grants: noGrantRow })

    expect(await issueChapterReward(client, USER, 9)).toEqual({ status: 'skipped' })
    expect(log.rpcs).toEqual([])
  })

  it('나올 개체가 없어 추첨 결과가 비었으면 RPC 없이 skipped다', async () => {
    drawMock.mockResolvedValue({ ...DRAW, items: [], skippedCount: 1 })
    const { client, log } = makeClient({ chapter_reward_grants: noGrantRow })

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'skipped' })
    expect(log.rpcs).toEqual([])
  })

  it('소속 트라이브가 없으면(no_tribe) RPC 없이 skipped이고 실패 기록도 없다', async () => {
    drawMock.mockRejectedValue(new ChapterRewardError('no_tribe'))
    const { client, log } = makeClient({ chapter_reward_grants: noGrantRow })

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'skipped' })
    expect(log.rpcs).toEqual([])
    expect(logMock).not.toHaveBeenCalled()
  })

  it('claimed면 추첨 저장 모양으로 RPC를 부르고, 되살려 후속 처리(포인트)와 칸 알림을 한다', async () => {
    const rand = () => 0.5
    const now = new Date('2026-11-27T00:00:00Z')
    const { client, log } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ok(CLAIMED) })

    expect(await issueChapterReward(client, USER, 1, { rand, now })).toEqual({ status: 'claimed' })

    expect(drawMock).toHaveBeenCalledWith(client, USER, { finishedChapterNo: 1, rand, now })
    expect(log.rpcs).toEqual([{ name: 'chapter_reward_issue', args: { p_user_id: USER, p_chapter_no: 1, p_items: STORED } }])
    expect(rebuildMock).toHaveBeenCalledWith(client, STORED)
    expect(recordItemsMock).toHaveBeenCalledWith(USER, REBUILT.tribes, REBUILT.items, GRANTED_ITEMS)
    expect(notifyMock).toHaveBeenCalledWith(USER, client)
    expect(logMock).not.toHaveBeenCalled()
  })

  it('claimed 뒤 후속 처리가 던져도 지급은 유지하고(claimed) 실패만 기록하며, 칸 알림은 이어서 한다', async () => {
    rebuildMock.mockRejectedValue(new Error('배지 읽기 장애'))
    const { client } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ok(CLAIMED) })

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'claimed' })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_reward_failed', USER, {
      step: 'follow_up',
      chapterNo: 1,
      error: '후속 처리 예외(지급은 유지): 배지 읽기 장애',
    })
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('칸 알림이 던져도 지급은 유지한다', async () => {
    notifyMock.mockRejectedValue(new Error('알림 장애'))
    const { client } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ok(CLAIMED) })

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'claimed' })
  })

  it('pending(칸 부족)이면 후속 처리 없이 판정 로그만 남긴다', async () => {
    const { client } = makeClient(
      { chapter_reward_grants: noGrantRow },
      { chapter_reward_issue: () => ok({ ok: true, duplicate: false, status: 'pending', chapterNo: 1, free: 1, needed: 3 }) }
    )

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'pending' })

    expect(rebuildMock).not.toHaveBeenCalled()
    expect(recordItemsMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith('drop', 'drop_attempt', USER, {
      path: 'chapter_reward',
      outcome: 'held',
      chapterNo: 1,
      free: 1,
      needed: 3,
    })
  })

  it('RPC가 duplicate를 돌려주면 아무것도 하지 않는다', async () => {
    const { client } = makeClient(
      { chapter_reward_grants: noGrantRow },
      { chapter_reward_issue: () => ok({ ok: true, duplicate: true, status: 'claimed', chapterNo: 1 }) }
    )

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'duplicate' })

    expect(rebuildMock).not.toHaveBeenCalled()
    expect(recordItemsMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('이용 정지(user_suspended)는 조용히 넘긴다 — 실패 기록도 후속 처리도 없다', async () => {
    const { client } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ok({ ok: false, error: 'user_suspended' }) })

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'suspended' })

    expect(logMock).not.toHaveBeenCalled()
    expect(recordItemsMock).not.toHaveBeenCalled()
  })

  it('그 밖의 거절은 chapter_reward_failed로 기록하고 failed를 돌려준다', async () => {
    const { client } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ok({ ok: false, error: 'invalid_items' }) })

    expect(await issueChapterReward(client, USER, 1)).toEqual({ status: 'failed' })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_reward_failed', USER, {
      step: 'issue',
      chapterNo: 1,
      error: 'chapter_reward_issue 거절: invalid_items',
    })
  })

  it('RPC 호출 오류·조회 오류·추첨 오류는 던지지 않고 failed로 기록한다', async () => {
    const rpcFail = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ({ data: null, error: { message: '연결 끊김' } }) })
    expect(await issueChapterReward(rpcFail.client, USER, 1)).toEqual({ status: 'failed' })

    const lookupFail = makeClient({ chapter_reward_grants: () => ({ data: null, error: { message: '읽기 실패' } }) })
    expect(await issueChapterReward(lookupFail.client, USER, 1)).toEqual({ status: 'failed' })
    expect(drawMock).toHaveBeenCalledTimes(1) // 조회 실패에서는 추첨하지 않는다(첫 케이스에서만 불림)

    drawMock.mockRejectedValue(new Error('정책 누락'))
    const drawFail = makeClient({ chapter_reward_grants: noGrantRow })
    expect(await issueChapterReward(drawFail.client, USER, 1)).toEqual({ status: 'failed' })

    const steps = logMock.mock.calls.map((c) => (c[3] as { step: string }).step)
    expect(steps).toEqual(['issue', 'lookup', 'draw'])
    expect(logMock.mock.calls.every((c) => c[1] === 'chapter_reward_failed')).toBe(true)
  })

  it('RPC가 예외를 던지고 로그마저 던져도 던지지 않는다', async () => {
    logMock.mockRejectedValue(new Error('로그 장애'))
    const { client } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => Promise.reject(new Error('예외')) })

    await expect(issueChapterReward(client, USER, 1)).resolves.toEqual({ status: 'failed' })
  })
})

describe('claimPendingChapterRewards', () => {
  const pendingRows = [
    { chapter_no: 2, drawn_items: [{ badge_id: 'b2', rarity: 'rare' }], created_at: '2026-11-01T00:00:00Z' },
    { chapter_no: 3, drawn_items: [{ badge_id: 'b3', rarity: 'common' }], created_at: '2026-11-02T00:00:00Z' },
  ]

  it('대기 행을 읽은 순서(오래된 순)로 받고, 저장된 항목으로 후속 처리를 한 뒤 칸 알림은 한 번 한다', async () => {
    const { client, log } = makeClient(
      { chapter_reward_grants: (ctx) => (ctx.filters.status === 'pending' ? ok(pendingRows) : ok([])) },
      { chapter_reward_claim: (args) => ok({ ok: true, duplicate: false, chapterNo: args.p_chapter_no, items: GRANTED_ITEMS, pendingCount: 0 }) }
    )

    expect(await claimPendingChapterRewards(client, USER)).toBe(2)

    expect(log.rpcs.map((r) => r.args.p_chapter_no)).toEqual([2, 3])
    expect(rebuildMock.mock.calls.map((c) => c[1])).toEqual([pendingRows[0].drawn_items, pendingRows[1].drawn_items])
    expect(recordItemsMock).toHaveBeenCalledTimes(2)
    expect(recordItemsMock).toHaveBeenCalledWith(USER, REBUILT.tribes, REBUILT.items, GRANTED_ITEMS)
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('insufficient_slots에서 멈춘다 — 뒤 행은 부르지 않고, 받은 것이 없으면 칸 알림도 없다', async () => {
    const { client, log } = makeClient(
      { chapter_reward_grants: () => ok(pendingRows) },
      { chapter_reward_claim: () => ok({ ok: false, error: 'insufficient_slots', free: 0, needed: 1 }) }
    )

    expect(await claimPendingChapterRewards(client, USER)).toBe(0)

    expect(log.rpcs).toHaveLength(1)
    expect(recordItemsMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('앞 행을 받고 다음 행에서 칸이 모자라면 거기서 멈추고, 받은 만큼만 후속 처리한다', async () => {
    const { client, log } = makeClient(
      { chapter_reward_grants: () => ok(pendingRows) },
      {
        chapter_reward_claim: (args) =>
          args.p_chapter_no === 2
            ? ok({ ok: true, duplicate: false, chapterNo: 2, items: GRANTED_ITEMS, pendingCount: 1 })
            : ok({ ok: false, error: 'insufficient_slots', free: 0, needed: 1 }),
      }
    )

    expect(await claimPendingChapterRewards(client, USER)).toBe(1)

    expect(log.rpcs).toHaveLength(2)
    expect(recordItemsMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('이용 정지는 조용히 멈추고, 그 밖의 거절은 기록한 뒤 다음 행으로 넘어간다', async () => {
    const suspended = makeClient({ chapter_reward_grants: () => ok(pendingRows) }, { chapter_reward_claim: () => ok({ ok: false, error: 'user_suspended' }) })
    expect(await claimPendingChapterRewards(suspended.client, USER)).toBe(0)
    expect(suspended.log.rpcs).toHaveLength(1)
    expect(logMock).not.toHaveBeenCalled()

    const broken = makeClient(
      { chapter_reward_grants: () => ok(pendingRows) },
      {
        chapter_reward_claim: (args) =>
          args.p_chapter_no === 2 ? ok({ ok: false, error: 'invalid_items' }) : ok({ ok: true, duplicate: false, chapterNo: 3, items: GRANTED_ITEMS, pendingCount: 0 }),
      }
    )
    expect(await claimPendingChapterRewards(broken.client, USER)).toBe(1)
    expect(broken.log.rpcs).toHaveLength(2)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_reward_failed', USER, {
      step: 'claim',
      chapterNo: 2,
      error: 'chapter_reward_claim 거절: invalid_items',
    })
  })

  it('이미 받은 행(duplicate)은 후속 처리를 하지 않는다', async () => {
    const { client } = makeClient(
      { chapter_reward_grants: () => ok([pendingRows[0]]) },
      { chapter_reward_claim: () => ok({ ok: true, duplicate: true, status: 'claimed', chapterNo: 2 }) }
    )

    expect(await claimPendingChapterRewards(client, USER)).toBe(0)
    expect(recordItemsMock).not.toHaveBeenCalled()
  })

  it('대기 조회 오류와 RPC 예외는 던지지 않고 기록한다', async () => {
    const readFail = makeClient({ chapter_reward_grants: () => ({ data: null, error: { message: '읽기 실패' } }) })
    expect(await claimPendingChapterRewards(readFail.client, USER)).toBe(0)

    const rpcThrow = makeClient({ chapter_reward_grants: () => ok(pendingRows) }, { chapter_reward_claim: () => Promise.reject(new Error('예외')) })
    await expect(claimPendingChapterRewards(rpcThrow.client, USER)).resolves.toBe(0)

    expect(logMock).toHaveBeenCalledTimes(2)
    expect(logMock.mock.calls.every((c) => c[1] === 'chapter_reward_failed')).toBe(true)
  })

  it('후속 처리가 던져도 받은 것으로 센다(되돌리지 않는다)', async () => {
    recordItemsMock.mockRejectedValue(new Error('포인트 장애'))
    const { client } = makeClient(
      { chapter_reward_grants: () => ok([pendingRows[0]]) },
      { chapter_reward_claim: () => ok({ ok: true, duplicate: false, chapterNo: 2, items: GRANTED_ITEMS, pendingCount: 0 }) }
    )

    expect(await claimPendingChapterRewards(client, USER)).toBe(1)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_reward_failed', USER, expect.objectContaining({ step: 'follow_up', chapterNo: 2 }))
  })
})

describe('findMissingRewardChapters', () => {
  function scanClient(opts: {
    backfill?: unknown[]
    ups?: unknown[]
    events?: unknown[]
    grants?: unknown[]
  }) {
    return makeClient({
      chapter_jam_backfill: () => ok(opts.backfill ?? []),
      chapter_ups: () => ok(opts.ups ?? []),
      chapter_jam_events: (ctx) => {
        expect(ctx.filters.promoted).toBe(true)
        return ok(opts.events ?? [])
      },
      chapter_reward_grants: () => ok(opts.grants ?? []),
    })
  }

  it('(a) 이관이 올린 챕터 K는 마친 챕터 K-1이다 — K = 1은 뺀다', async () => {
    const { client } = scanClient({ backfill: [{ promoted_chapters: [1, 3, 4] }] })

    expect(await findMissingRewardChapters(client, USER)).toEqual([2, 3])
  })

  it('(b) 도달 시각이 승급 적립 기록의 시각과 같은 챕터만 고른다 — 표기 형식이 달라도 같은 순간이면 같다', async () => {
    const { client } = scanClient({
      ups: [
        { chapter_no: 4, reached_at: '2026-11-27T10:00:00+00:00' },
        { chapter_no: 5, reached_at: '2026-10-01T00:00:00+00:00' }, // 옛 방식으로 오른 챕터(승급 적립 기록과 시각이 다름)
        { chapter_no: 1, reached_at: '2026-11-27T11:00:00+00:00' }, // K가 2 미만
      ],
      events: [{ created_at: '2026-11-27T10:00:00Z' }, { created_at: '2026-11-27T11:00:00Z' }],
    })

    expect(await findMissingRewardChapters(client, USER)).toEqual([3])
  })

  it('이미 지급 기록이 있는 챕터는 뺀다 — (a)와 (b)가 겹쳐도 한 번만 나온다', async () => {
    const { client } = scanClient({
      backfill: [{ promoted_chapters: [2, 3] }],
      ups: [{ chapter_no: 3, reached_at: '2026-11-27T10:00:00Z' }, { chapter_no: 5, reached_at: '2026-11-27T12:00:00Z' }],
      events: [{ created_at: '2026-11-27T10:00:00Z' }, { created_at: '2026-11-27T12:00:00Z' }],
      grants: [{ chapter_no: 1 }],
    })

    expect(await findMissingRewardChapters(client, USER)).toEqual([2, 4])
  })

  it('이관도 새 승급도 없으면 지급 기록을 읽지 않고 빈 목록이다', async () => {
    const { client, log } = scanClient({ ups: [{ chapter_no: 4, reached_at: '2026-10-01T00:00:00Z' }], events: [] })

    expect(await findMissingRewardChapters(client, USER)).toEqual([])
    expect(log.reads).not.toContain('chapter_reward_grants')
  })

  it('읽기 오류는 던지지 않고 빈 목록과 실패 기록(step scan)이다', async () => {
    const { client } = makeClient({
      chapter_jam_backfill: () => ({ data: null, error: { message: '읽기 실패' } }),
    })

    expect(await findMissingRewardChapters(client, USER)).toEqual([])
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_reward_failed', USER, {
      step: 'scan',
      chapterNo: null,
      error: 'chapter_jam_backfill 조회 실패: 읽기 실패',
    })
  })
})

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('settleChapterRewards', () => {
  /** 대기 1행(챕터 7), 이관이 올린 챕터 [3, 4](마친 챕터 2, 3), 지급 기록 없음 */
  function settleClient(order: string[], overrides: { claim?: RpcHandler } = {}) {
    return makeClient(
      {
        chapter_reward_grants: (ctx) => {
          if (ctx.filters.status === 'pending') return ok([{ chapter_no: 7, drawn_items: STORED, created_at: '2026-11-01T00:00:00Z' }])
          if (ctx.single) return ok(null)
          return ok([])
        },
        chapter_jam_backfill: () => {
          order.push('scan:backfill')
          return ok([{ promoted_chapters: [3, 4] }])
        },
        chapter_ups: () => ok([]),
      },
      {
        chapter_reward_claim:
          overrides.claim ??
          ((args) => {
            order.push(`claim:${String(args.p_chapter_no)}`)
            return ok({ ok: true, duplicate: false, chapterNo: args.p_chapter_no, items: GRANTED_ITEMS, pendingCount: 0 })
          }),
        chapter_reward_issue: (args) => {
          order.push(`issue:${String(args.p_chapter_no)}`)
          return ok({ ok: true, duplicate: false, status: 'claimed', chapterNo: args.p_chapter_no, items: GRANTED_ITEMS })
        },
      }
    )
  }

  it('대기 받기를 먼저 하고, scanMissing이면 보충 지급을 오래된 챕터부터 한다', async () => {
    const order: string[] = []
    const { client } = settleClient(order)

    await settleChapterRewards(client, USER, { scanMissing: true })

    expect(order).toEqual(['claim:7', 'scan:backfill', 'issue:2', 'issue:3'])
  })

  it('scanMissing이 거짓이면 대기 받기만 하고 보충 조회·지급은 하지 않는다', async () => {
    const order: string[] = []
    const { client } = settleClient(order)

    await settleChapterRewards(client, USER, { scanMissing: false })

    expect(order).toEqual(['claim:7'])
    expect(drawMock).not.toHaveBeenCalled()
  })

  it('같은 프로세스에서 같은 유저의 동시 호출은 한 번만 돈다 — 끝난 뒤에는 다시 돈다', async () => {
    let release: (value: Result) => void = () => {}
    const gate = new Promise<Result>((resolve) => {
      release = resolve
    })
    let claimCalls = 0
    const order: string[] = []
    const { client } = settleClient(order, {
      claim: () => {
        claimCalls += 1
        return claimCalls === 1 ? gate : ok({ ok: false, error: 'insufficient_slots' })
      },
    })

    const first = settleChapterRewards(client, USER, { scanMissing: false })
    await flush() // 첫 호출이 대기 받기 호출(게이트)에 닿을 때까지
    await settleChapterRewards(client, USER, { scanMissing: false }) // 첫 호출이 진행 중이라 바로 끝난다
    expect(claimCalls).toBe(1)

    release(ok({ ok: false, error: 'insufficient_slots' }))
    await first

    await settleChapterRewards(client, USER, { scanMissing: false })
    expect(claimCalls).toBe(2)
  })

  it('다른 유저의 호출은 막지 않는다', async () => {
    let release: (value: Result) => void = () => {}
    const gate = new Promise<Result>((resolve) => {
      release = resolve
    })
    let claimCalls = 0
    const order: string[] = []
    const { client } = settleClient(order, {
      claim: () => {
        claimCalls += 1
        return claimCalls === 1 ? gate : ok({ ok: false, error: 'insufficient_slots' })
      },
    })

    const first = settleChapterRewards(client, USER, { scanMissing: false })
    await flush() // 첫 호출이 대기 받기 호출(게이트)에 닿을 때까지
    await settleChapterRewards(client, 'other-user', { scanMissing: false })
    expect(claimCalls).toBe(2)

    release(ok({ ok: false, error: 'insufficient_slots' }))
    await first
  })

  it('던지지 않는다 — 안쪽이 모두 실패해도 끝난다', async () => {
    const { client } = makeClient({ chapter_reward_grants: () => Promise.reject(new Error('연결 끊김')) })

    await expect(settleChapterRewards(client, USER, { scanMissing: true })).resolves.toBeUndefined()
  })
})

describe('grantRewardsForReachedChapters', () => {
  it('오른 챕터마다 마친 챕터(K-1)를 한 번씩 지급한다 — 클라이언트는 서비스 클라이언트다', async () => {
    const { client, log } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ok(CLAIMED) })
    createServiceClientMock.mockReturnValue(client)

    await grantRewardsForReachedChapters(USER, [3, 2, 1])

    expect(drawMock.mock.calls.map((c) => (c[2] as { finishedChapterNo: number }).finishedChapterNo)).toEqual([1, 2])
    expect(log.rpcs.map((r) => r.args.p_chapter_no)).toEqual([1, 2])
  })

  it('챕터 1 시작만 오른 경우에는 클라이언트도 만들지 않고 지급하지 않는다', async () => {
    await grantRewardsForReachedChapters(USER, [1])

    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(drawMock).not.toHaveBeenCalled()
  })

  it('앞 챕터 지급이 실패해도 다음 챕터를 이어서 하고, 던지지 않는다', async () => {
    drawMock.mockRejectedValueOnce(new Error('정책 누락'))
    const { client, log } = makeClient({ chapter_reward_grants: noGrantRow }, { chapter_reward_issue: () => ok(CLAIMED) })
    createServiceClientMock.mockReturnValue(client)

    await expect(grantRewardsForReachedChapters(USER, [2, 3])).resolves.toBeUndefined()

    expect(log.rpcs.map((r) => r.args.p_chapter_no)).toEqual([2])
  })

  it('서비스 클라이언트를 만들지 못해도 던지지 않고 기록한다', async () => {
    createServiceClientMock.mockImplementation(() => {
      throw new Error('환경 변수 없음')
    })

    await expect(grantRewardsForReachedChapters(USER, [2])).resolves.toBeUndefined()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_reward_failed', USER, expect.objectContaining({ step: 'issue', error: '환경 변수 없음' }))
  })
})
