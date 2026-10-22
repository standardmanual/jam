/**
 * GET·PUT /api/admin/itembooks/[id]/tier — 컬렉션 4등급 방식 켜기·끄기 (티켓 20261022_1139 1회)
 *
 * 고정하는 것
 *   - 어드민이 아니면 403이다.
 *   - 켜기는 점검을 서버에서 다시 돌려, 여러 등급을 장착한 유저가 있으면 409다. 응답에는 숫자만 있다. 이름 점검 경고는 막지 않는다.
 *   - 끄기는 등급별 완성 기록이 하나라도 있으면 409다.
 *   - 이미 요청한 상태면 쓰지 않고 200(changed: false)이다.
 *   - DB 오류 원문은 응답에 싣지 않는다.
 * 점검 조회(`lib/admin/itembookTier.ts`)는 별도 시험이 있어 여기서는 돌려주는 값을 고정해 쓴다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/itembooks/[id]/tier/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { TierReadiness } from '@/lib/itembook/tier-readiness'

const state = vi.hoisted(() => ({
  admin: true,
  book: { id: 'ib1', tier_mode: false } as { id: string; tier_mode: boolean } | null,
  bookError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  updates: [] as Record<string, unknown>[],
  readiness: null as unknown,
  readinessError: null as Error | null,
  completionCount: 0,
  completionError: null as Error | null,
  readinessCalls: 0,
  completionCalls: 0,
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: state.bookError ? null : state.book, error: state.bookError }),
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return { eq: () => Promise.resolve({ error: state.updateError }) }
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => (state.admin ? { id: 'admin-1', email: 'me@jam.app' } : null),
}))
vi.mock('@/lib/admin/itembookTier', () => ({
  loadTierReadiness: async () => {
    state.readinessCalls += 1
    if (state.readinessError) throw state.readinessError
    return state.readiness
  },
  loadTierCompletionCount: async () => {
    state.completionCalls += 1
    if (state.completionError) throw state.completionError
    return state.completionCount
  },
}))

const { GET, PUT } = await import('../route')

function readiness(overrides: Partial<TierReadiness> = {}): TierReadiness {
  return {
    names: {
      nameCount: 2,
      rows: [],
      duplicateTierNameCount: 0,
      tierCountGroups: [{ tierCount: 4, nameCount: 2 }],
      tierCountMismatch: false,
      noTierBadgeCount: 0,
    },
    distribution: {
      slotCount: 3,
      userCount: 2,
      userCountByTier: { common: 2, rare: 0, epic: 0, mystic: 0 },
      noTierSlotCount: 0,
      multiTierUserCount: 0,
      multiTierCombos: [],
    },
    tierCompletionCount: 0,
    canEnable: true,
    canDisable: true,
    ...overrides,
  }
}

const ctx = { params: Promise.resolve({ id: 'ib1' }) }
const url = 'http://localhost/api/admin/itembooks/ib1/tier'

const get = () => GET(new NextRequest(url), ctx)
const put = (body: unknown, raw = false) =>
  PUT(
    new NextRequest(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    ctx
  )

beforeEach(() => {
  state.admin = true
  state.book = { id: 'ib1', tier_mode: false }
  state.bookError = null
  state.updateError = null
  state.updates = []
  state.readiness = readiness()
  state.readinessError = null
  state.completionCount = 0
  state.completionError = null
  state.readinessCalls = 0
  state.completionCalls = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('인증', () => {
  it('어드민이 아니면 GET·PUT 모두 403이고 아무것도 읽거나 쓰지 않는다', async () => {
    state.admin = false
    expect((await get()).status).toBe(403)
    expect((await put({ tier_mode: true })).status).toBe(403)
    expect(state.readinessCalls).toBe(0)
    expect(state.updates).toEqual([])
  })
})

describe('GET — 현재 상태와 점검 결과', () => {
  it('켜짐 여부와 점검 결과를 돌려준다', async () => {
    state.book = { id: 'ib1', tier_mode: true }
    const res = await get()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.tierMode).toBe(true)
    expect(json.readiness).toEqual(readiness())
  })

  it('컬렉션이 없으면 404다', async () => {
    state.book = null
    const res = await get()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain('컬렉션을 찾지 못했어요')
  })

  it('컬렉션 조회가 실패하면 500이고 DB 오류 원문은 싣지 않는다', async () => {
    state.bookError = { message: 'connection refused to 10.0.0.1' }
    const res = await get()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.1')
  })

  it('점검 조회가 실패하면 500이고 오류 원문은 싣지 않는다', async () => {
    state.readinessError = new Error('relation "user_item_book_slots" does not exist')
    const res = await get()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('user_item_book_slots')
  })
})

describe('PUT — 본문 검사', () => {
  it.each([
    ['null 본문', null],
    ['빈 객체', {}],
    ['문자열 true', { tier_mode: 'true' }],
    ['숫자 1', { tier_mode: 1 }],
  ])('%s은 400이고 쓰지 않는다', async (_label, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(state.updates).toEqual([])
  })

  it('JSON이 아닌 본문도 400이다', async () => {
    const res = await put('{not json', true)
    expect(res.status).toBe(400)
  })

  it('컬렉션이 없으면 404다', async () => {
    state.book = null
    expect((await put({ tier_mode: true })).status).toBe(404)
    expect(state.updates).toEqual([])
  })
})

describe('PUT — 켜기', () => {
  it('점검에 막힘이 없으면 tier_mode만 true로 쓴다', async () => {
    const res = await put({ tier_mode: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tierMode: true, changed: true })
    expect(state.updates).toEqual([{ tier_mode: true }])
    expect(state.readinessCalls).toBe(1)
  })

  it('여러 등급을 장착한 유저가 있으면 409이고 숫자만 싣고 쓰지 않는다', async () => {
    state.readiness = readiness({
      canEnable: false,
      distribution: { ...readiness().distribution, multiTierUserCount: 2 },
    })
    const res = await put({ tier_mode: true })
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['error', 'multiTierUserCount'])
    expect(json.multiTierUserCount).toBe(2)
    expect(json.error).toContain('2명')
    expect(state.updates).toEqual([])
  })

  it('이름 점검 경고(같은 등급 중복·등급 수 불일치)는 켜기를 막지 않는다', async () => {
    state.readiness = readiness({
      names: { ...readiness().names, duplicateTierNameCount: 3, tierCountMismatch: true },
    })
    const res = await put({ tier_mode: true })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ tier_mode: true }])
  })

  it('이미 켜져 있으면 점검도 쓰기도 하지 않고 changed: false다', async () => {
    state.book = { id: 'ib1', tier_mode: true }
    const res = await put({ tier_mode: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tierMode: true, changed: false })
    expect(state.readinessCalls).toBe(0)
    expect(state.updates).toEqual([])
  })
})

describe('PUT — 끄기', () => {
  beforeEach(() => {
    state.book = { id: 'ib1', tier_mode: true }
  })

  it('등급별 완성 기록이 없으면 tier_mode만 false로 쓴다', async () => {
    const res = await put({ tier_mode: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tierMode: false, changed: true })
    expect(state.updates).toEqual([{ tier_mode: false }])
    expect(state.readinessCalls).toBe(0)
  })

  it('등급별 완성 기록이 하나라도 있으면 409이고 건수만 싣고 쓰지 않는다', async () => {
    state.completionCount = 1
    const res = await put({ tier_mode: false })
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['error', 'tierCompletionCount'])
    expect(json.tierCompletionCount).toBe(1)
    expect(state.updates).toEqual([])
  })

  it('이미 꺼져 있으면 changed: false다', async () => {
    state.book = { id: 'ib1', tier_mode: false }
    const res = await put({ tier_mode: false })
    expect(await res.json()).toEqual({ tierMode: false, changed: false })
    expect(state.completionCalls).toBe(0)
  })
})

describe('PUT — DB 오류', () => {
  it('점검 조회가 실패하면 500이고 쓰지 않는다', async () => {
    state.readinessError = new Error('permission denied for table user_item_book_slots')
    const res = await put({ tier_mode: true })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission denied')
    expect(state.updates).toEqual([])
  })

  it('끄기 점검 조회가 실패해도 500이고 쓰지 않는다', async () => {
    state.book = { id: 'ib1', tier_mode: true }
    state.completionError = new Error('timeout')
    const res = await put({ tier_mode: false })
    expect(res.status).toBe(500)
    expect(state.updates).toEqual([])
  })

  it('저장이 실패하면 500이고 오류 원문은 싣지 않는다', async () => {
    state.updateError = { message: 'duplicate key value violates unique constraint "x"' }
    const res = await put({ tier_mode: true })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain('4등급 방식을 바꾸지 못했어요')
    expect(JSON.stringify(json)).not.toContain('unique constraint')
  })
})
