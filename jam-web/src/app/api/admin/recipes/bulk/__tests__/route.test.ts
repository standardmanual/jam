/**
 * POST /api/admin/recipes/bulk — 삭제 미리보기(dry_run)가 가리키는 홈 카드 수를 `impact.cardCount`로 돌려준다
 * (티켓 20261006_1342). 카드가 가리켜도 삭제 대상에서 빼지 않고(안내만 한다, 티켓 20261006_1218 가정 B),
 * 참조를 읽지 못하면 "0장"으로 오판하지 않도록 미리보기를 500으로 막는다. 카드 수는 후보 조회
 * (`collectRecipeDeletionCandidates`)가 함께 돌려주는 값으로 만들고, 그 뒤 참조를 한 번 더 조회하지 않는다
 * (티켓 20261006_1406). DB는 모듈 단위 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/recipes/bulk/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const RECIPE_A = '00000000-0000-4000-8000-000000000001'
const RECIPE_B = '00000000-0000-4000-8000-000000000002'

const state = vi.hoisted(() => ({
  /** 이름 조회에서 존재하는 레시피 — `noticeTotal`은 그 레시피를 가리키는 홈 카드 수 */
  candidates: [] as { id: string; name: string | null; total: number; noticeTotal: number }[],
  /** 막힌 레시피가 없을 때 전체를 한 번에 센 홈 카드 수(막힌 레시피가 있으면 null) */
  allNoticeTotal: null as number | null,
  /** 값이 있으면 후보 조회가 이 오류를 돌려준다 */
  lookupError: null as string | null,
  /** 후보 조회 호출 횟수 */
  lookupCalls: 0,
  /** `combination_recipe_slots` 개수 */
  slotCount: 0,
  slotError: null as { message: string } | null,
  /** 라우트가 직접 부른 참조 집계의 대상 id들 — 미리보기에서는 비어 있어야 한다 */
  referenceCalls: [] as string[][],
  deleteCalls: 0,
}))

const fakeClient = {
  from: (table: string) => {
    if (table === 'combination_recipe_slots') {
      return {
        select: () => ({
          in: () =>
            Promise.resolve(
              state.slotError ? { count: null, error: state.slotError } : { count: state.slotCount, error: null }
            ),
        }),
      }
    }
    if (table === 'combination_recipes') {
      return {
        delete: () => ({
          in: () => {
            state.deleteCalls += 1
            return { select: () => Promise.resolve({ data: [], error: null }) }
          },
        }),
      }
    }
    throw new Error(`예상하지 못한 테이블: ${table}`)
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: 'admin-1', email: 'me@jam.app' }),
}))
vi.mock('@/lib/admin/recipe-references', () => ({
  collectRecipeDeletionCandidates: async () => {
    state.lookupCalls += 1
    return state.lookupError
      ? { candidates: new Map(), allNoticeTotal: null, error: state.lookupError }
      : { candidates: new Map(state.candidates.map((c) => [c.id, c])), allNoticeTotal: state.allNoticeTotal, error: null }
  },
  collectRecipeReferences: async (_client: unknown, ids: string[]) => {
    state.referenceCalls.push(ids)
    return { blockingTotal: 0, cascadeTotal: 0, total: 0, noticeTotal: 0, error: null }
  },
}))

const { POST } = await import('../route')

function post(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/recipes/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.candidates = [
    { id: RECIPE_A, name: '믹스 A', total: 0, noticeTotal: 0 },
    { id: RECIPE_B, name: '믹스 B', total: 0, noticeTotal: 0 },
  ]
  state.allNoticeTotal = 0
  state.lookupError = null
  state.lookupCalls = 0
  state.slotCount = 4
  state.slotError = null
  state.referenceCalls = []
  state.deleteCalls = 0
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('삭제 미리보기(dry_run) — impact.cardCount', () => {
  it('가리키는 카드가 없으면 0장이다', async () => {
    const res = await POST(post({ ids: [RECIPE_A, RECIPE_B], action: 'delete', dry_run: true }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dryRun).toBe(true)
    expect(data.impact).toEqual({ recipeCount: 2, slotCount: 4, cardCount: 0, blockedCount: 0 })
  })

  it('막힌 레시피가 없으면 전체를 한 번에 센 카드 수를 돌려주고 삭제 대상에서 빼지 않는다', async () => {
    state.allNoticeTotal = 3

    const res = await POST(post({ ids: [RECIPE_A, RECIPE_B], action: 'delete', dry_run: true }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.impact.cardCount).toBe(3)
    expect(data.processed).toEqual([RECIPE_A, RECIPE_B])
    expect(data.skipped).toEqual([])
    expect(data.requiredPhrase).toBe('삭제 2')
    expect(state.deleteCalls).toBe(0)
  })

  it('참조로 막혀 건너뛰는 레시피를 가리키는 카드는 세지 않는다', async () => {
    state.candidates = [
      { id: RECIPE_A, name: '믹스 A', total: 0, noticeTotal: 2 },
      { id: RECIPE_B, name: '믹스 B', total: 1, noticeTotal: 5 },
    ]
    state.allNoticeTotal = null

    const res = await POST(post({ ids: [RECIPE_A, RECIPE_B], action: 'delete', dry_run: true }))

    const data = await res.json()
    expect(data.processed).toEqual([RECIPE_A])
    expect(data.skipped).toHaveLength(1)
    expect(data.impact.cardCount).toBe(2)
    expect(data.impact.blockedCount).toBe(1)
  })

  it('막힌 레시피가 있어도 삭제 대상 여럿의 카드는 후보별 값을 더한다', async () => {
    const RECIPE_C = '00000000-0000-4000-8000-000000000003'
    state.candidates = [
      { id: RECIPE_A, name: '믹스 A', total: 0, noticeTotal: 2 },
      { id: RECIPE_B, name: '믹스 B', total: 1, noticeTotal: 5 },
      { id: RECIPE_C, name: '믹스 C', total: 0, noticeTotal: 4 },
    ]
    state.allNoticeTotal = null

    const res = await POST(post({ ids: [RECIPE_A, RECIPE_B, RECIPE_C], action: 'delete', dry_run: true }))

    const data = await res.json()
    expect(data.processed).toEqual([RECIPE_A, RECIPE_C])
    expect(data.impact.cardCount).toBe(6)
  })

  it('같은 id가 여러 번 들어와도 카드는 한 번만 센다', async () => {
    state.candidates = [
      { id: RECIPE_A, name: '믹스 A', total: 0, noticeTotal: 2 },
      { id: RECIPE_B, name: '믹스 B', total: 1, noticeTotal: 0 },
    ]
    state.allNoticeTotal = null

    const res = await POST(post({ ids: [RECIPE_A, RECIPE_A, RECIPE_B], action: 'delete', dry_run: true }))

    const data = await res.json()
    expect(data.impact.cardCount).toBe(2)
  })

  it('삭제할 레시피가 없으면 0장이다', async () => {
    state.candidates = []

    const res = await POST(post({ ids: [RECIPE_A], action: 'delete', dry_run: true }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.impact).toEqual({ recipeCount: 0, slotCount: 0, cardCount: 0, blockedCount: 1 })
  })

  it('미리보기 한 번에 참조 조회는 후보 조회 한 번뿐이고 카드 수를 위한 추가 조회는 없다', async () => {
    state.allNoticeTotal = 3

    await POST(post({ ids: [RECIPE_A, RECIPE_B], action: 'delete', dry_run: true }))

    expect(state.lookupCalls).toBe(1)
    expect(state.referenceCalls).toEqual([])
  })

  it('참조를 읽지 못하면 500으로 막는다(카드 0장이라 오판하지 않는다)', async () => {
    state.lookupError = 'connection reset'

    const res = await POST(post({ ids: [RECIPE_A, RECIPE_B], action: 'delete', dry_run: true }))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('이력 조회 중 오류가 발생했어요')
    expect(data.impact).toBeUndefined()
    expect(state.deleteCalls).toBe(0)
  })

  it('슬롯 수를 읽지 못해도 500이다', async () => {
    state.slotError = { message: 'slot read failed' }

    const res = await POST(post({ ids: [RECIPE_A], action: 'delete', dry_run: true }))

    expect(res.status).toBe(500)
    expect(state.referenceCalls).toEqual([])
  })
})
