/**
 * GET·PUT /api/admin/itembooks/[id]/tier-rewards — 컬렉션 등급별 보상 (티켓 20261022_1139 2회)
 *
 * 고정하는 것
 *   - 어드민이 아니면 403이고 아무것도 읽거나 쓰지 않는다.
 *   - 4등급 방식이 꺼진 컬렉션이면 GET·PUT 모두 409이고 쓰지 않는다. 컬렉션이 없거나 id가 UUID가 아니면 404다.
 *   - PUT 본문 검사: 같은 배지를 두 등급에 고르면 400, 포인트는 null 또는 0 이상 정수, 등급 네 개가 하나씩.
 *   - 없거나 소프트 삭제된 배지를 고르면 400이고 쓰지 않는다.
 *   - 성공하면 검증된 값(등급 순서)을 저장 함수에 넘긴다. DB 오류 원문은 응답에 싣지 않는다.
 * 읽기·쓰기 함수(`lib/admin/itembookTierRewards.ts`의 DB 부분)는 별도 시험이 있어 여기서는 돌려주는 값을 고정해 쓴다. 본문 검사는 실제 함수를 쓴다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/itembooks/[id]/tier-rewards/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { TierRewardInput, TierRewardRow } from '@/lib/admin/itembookTierRewards'

const BOOK = '11111111-1111-4111-8111-111111111111'
const BADGE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BADGE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const state = vi.hoisted(() => ({
  admin: true,
  book: { id: '11111111-1111-4111-8111-111111111111', tier_mode: true } as { id: string; tier_mode: boolean } | null,
  bookError: null as { message: string } | null,
  rows: [] as unknown[],
  loadError: null as Error | null,
  unavailable: [] as string[],
  unavailableError: null as Error | null,
  saveError: null as Error | null,
  loadCalls: 0,
  unavailableCalls: 0,
  saves: [] as unknown[],
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: state.bookError ? null : state.book, error: state.bookError }),
      }),
    }),
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => (state.admin ? { id: 'admin-1', email: 'me@jam.app' } : null),
}))
vi.mock('@/lib/admin/itembookTierRewards', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/itembookTierRewards')>()),
  loadTierRewards: async () => {
    state.loadCalls += 1
    if (state.loadError) throw state.loadError
    return state.rows
  },
  findUnavailableRewardBadgeTiers: async () => {
    state.unavailableCalls += 1
    if (state.unavailableError) throw state.unavailableError
    return state.unavailable
  },
  saveTierRewards: async (_client: unknown, itemBookId: string, tiers: TierRewardInput[]) => {
    if (state.saveError) throw state.saveError
    state.saves.push({ itemBookId, tiers })
  },
}))

const { GET, PUT } = await import('../route')

const ctx = { params: Promise.resolve({ id: BOOK }) }
const url = `http://localhost/api/admin/itembooks/${BOOK}/tier-rewards`

const get = (context = ctx) => GET(new NextRequest(url), context)
const put = (body: unknown, raw = false, context = ctx) =>
  PUT(
    new NextRequest(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    context
  )

function body(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    tiers: ['common', 'rare', 'epic', 'mystic'].map((tier) => ({ tier, reward_points: null, reward_badge_id: null, ...overrides[tier] })),
  }
}

const rows: TierRewardRow[] = [
  { tier: 'common', rewardPoints: null, defaultPoints: 100, rewardBadgeId: null, rewardBadgeName: null },
  { tier: 'rare', rewardPoints: 0, defaultPoints: 200, rewardBadgeId: BADGE_A, rewardBadgeName: '레어 보상' },
  { tier: 'epic', rewardPoints: null, defaultPoints: 400, rewardBadgeId: null, rewardBadgeName: null },
  { tier: 'mystic', rewardPoints: 900, defaultPoints: 800, rewardBadgeId: null, rewardBadgeName: null },
]

beforeEach(() => {
  state.admin = true
  state.book = { id: BOOK, tier_mode: true }
  state.bookError = null
  state.rows = rows
  state.loadError = null
  state.unavailable = []
  state.unavailableError = null
  state.saveError = null
  state.loadCalls = 0
  state.unavailableCalls = 0
  state.saves = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('인증', () => {
  it('어드민이 아니면 GET·PUT 모두 403이고 아무것도 읽거나 쓰지 않는다', async () => {
    state.admin = false
    expect((await get()).status).toBe(403)
    expect((await put(body())).status).toBe(403)
    expect(state.loadCalls).toBe(0)
    expect(state.unavailableCalls).toBe(0)
    expect(state.saves).toEqual([])
  })
})

describe('GET — 등급 네 개의 보상', () => {
  it('켜진 컬렉션이면 등급 네 행을 돌려준다', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tiers: rows })
  })

  it('4등급 방식이 꺼져 있으면 409이고 읽지 않는다', async () => {
    state.book = { id: BOOK, tier_mode: false }
    const res = await get()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('4등급 방식이 꺼져 있어요')
    expect(state.loadCalls).toBe(0)
  })

  it('컬렉션이 없으면 404, id가 UUID가 아니면 404이고 DB를 읽지 않는다', async () => {
    state.book = null
    expect((await get()).status).toBe(404)
    state.book = { id: BOOK, tier_mode: true }
    const res = await get({ params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(404)
    expect(state.loadCalls).toBe(0)
  })

  it('컬렉션 조회가 실패하면 500이고 DB 오류 원문은 싣지 않는다', async () => {
    state.bookError = { message: 'connection refused to 10.0.0.1' }
    const res = await get()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.1')
  })

  it('보상 조회가 실패하면 500이고 오류 원문은 싣지 않는다', async () => {
    state.loadError = new Error('relation "item_book_tier_rewards" does not exist')
    const res = await get()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('item_book_tier_rewards')
  })
})

describe('PUT — 본문 검사', () => {
  it.each([
    ['null 본문', null],
    ['빈 객체', {}],
    ['등급 세 개', { tiers: body().tiers.slice(0, 3) }],
    ['모르는 등급', { tiers: [...body().tiers.slice(0, 3), { tier: 'legend', reward_points: null, reward_badge_id: null }] }],
  ])('%s은 400이고 쓰지 않는다', async (_label, input) => {
    const res = await put(input)
    expect(res.status).toBe(400)
    expect(state.saves).toEqual([])
    expect(state.unavailableCalls).toBe(0)
  })

  it('JSON이 아닌 본문도 400이다', async () => {
    expect((await put('{not json', true)).status).toBe(400)
  })

  it.each([[1.5], [-1], ['100']])('포인트 %s은 400이고 어느 등급인지 알려 주며 쓰지 않는다', async (points) => {
    const res = await put(body({ rare: { reward_points: points } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Rare')
    expect(state.saves).toEqual([])
  })

  it('같은 배지를 두 등급에 고르면 400이고 쓰지 않는다', async () => {
    const res = await put(body({ common: { reward_badge_id: BADGE_A }, epic: { reward_badge_id: BADGE_A } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Common·Epic')
    expect(state.saves).toEqual([])
    expect(state.unavailableCalls).toBe(0)
  })

  it('컬렉션이 없으면 404, 꺼져 있으면 409이고 쓰지 않는다', async () => {
    state.book = null
    expect((await put(body())).status).toBe(404)
    state.book = { id: BOOK, tier_mode: false }
    const res = await put(body())
    expect(res.status).toBe(409)
    expect(state.saves).toEqual([])
    expect(state.unavailableCalls).toBe(0)
  })

  it('id가 UUID가 아니면 404다', async () => {
    const res = await put(body(), false, { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(404)
    expect(state.saves).toEqual([])
  })
})

describe('PUT — 보상 배지 확인', () => {
  it('없거나 소프트 삭제된 배지를 고르면 400이고 그 등급을 알리며 쓰지 않는다', async () => {
    state.unavailable = ['rare', 'mystic']
    const res = await put(body({ rare: { reward_badge_id: BADGE_A }, mystic: { reward_badge_id: BADGE_B } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Rare·Mystic')
    expect(json.error).toContain('삭제됐거나 없는 배지')
    expect(json.tiers).toEqual(['rare', 'mystic'])
    expect(state.saves).toEqual([])
  })

  it('배지 확인 조회가 실패하면 500이고 쓰지 않는다. 원문은 싣지 않는다', async () => {
    state.unavailableError = new Error('permission denied for table badges')
    const res = await put(body({ rare: { reward_badge_id: BADGE_A } }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission denied')
    expect(state.saves).toEqual([])
  })
})

describe('PUT — 저장', () => {
  it('검증한 값을 등급 순서로 저장 함수에 넘기고 ok를 돌려준다', async () => {
    const res = await put(body({ mystic: { reward_points: 900 }, rare: { reward_points: 0, reward_badge_id: BADGE_A.toUpperCase() } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(state.saves).toEqual([
      {
        itemBookId: BOOK,
        tiers: [
          { tier: 'common', rewardPoints: null, rewardBadgeId: null },
          { tier: 'rare', rewardPoints: 0, rewardBadgeId: BADGE_A },
          { tier: 'epic', rewardPoints: null, rewardBadgeId: null },
          { tier: 'mystic', rewardPoints: 900, rewardBadgeId: null },
        ],
      },
    ])
  })

  it('배지를 하나도 고르지 않아도 저장한다(두 칸이 모두 빈 등급은 저장 함수가 행을 지운다)', async () => {
    const res = await put(body())
    expect(res.status).toBe(200)
    expect(state.saves).toHaveLength(1)
  })

  it('저장이 실패하면 500이고 오류 원문은 싣지 않는다', async () => {
    state.saveError = new Error('duplicate key value violates unique constraint "item_book_tier_rewards_pkey"')
    const res = await put(body({ common: { reward_points: 10 } }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain('등급별 보상을 저장하지 못했어요')
    expect(JSON.stringify(json)).not.toContain('unique constraint')
  })
})
