/**
 * POST /api/admin/recipes/[id]/cancel-release — 공개 전(예약 중) 레시피 취소 = 삭제 (티켓 20261001_1158)
 * 삭제 가드·«공개 전에만» 조건은 `cancelScheduledRecipe()`가 단일 출처라 실제 함수를 거치고, DB는 메모리 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/recipes/[id]/cancel-release/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const ID = '11111111-1111-4111-8111-111111111111'
const HOUR = 60 * 60 * 1000

const state = vi.hoisted(() => ({
  /** null이면 인증을 통과한다. 값이 있으면 requireAdmin이 이 응답을 돌려준다 */
  authResponse: null as { status: number } | null,
  /** 레시피 한 건의 공개 시각 — undefined면 행이 없다 */
  validFrom: undefined as string | null | undefined,
  /** 레시피를 가리키는 삭제되지 않은 배지 수 */
  badgeCount: 0,
  /** 레시피를 가리키는 레시피 공개 카드 수 */
  cardCount: 0,
  deleteCalls: 0,
}))

const fakeClient = {
  from: (table: string) => {
    if (table === 'badges') {
      const builder = {
        is: () => builder,
        in: () => Promise.resolve({ count: state.badgeCount, error: null }),
      }
      return { select: () => builder }
    }
    if (table === 'today_cards') {
      return { select: () => ({ in: () => Promise.resolve({ count: state.cardCount, error: null }) }) }
    }
    return {
      delete: () => {
        state.deleteCalls += 1
        return {
          eq: () => ({
            gt: (_column: string, threshold: string) => ({
              select: () => {
                const matches =
                  state.validFrom != null && Date.parse(state.validFrom) > Date.parse(threshold)
                if (matches) state.validFrom = undefined
                return Promise.resolve({ data: matches ? [{ id: ID }] : [], error: null })
              },
            }),
          }),
        }
      },
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: state.validFrom === undefined ? null : { id: ID }, error: null }),
        }),
      }),
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () =>
    state.authResponse ? NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: state.authResponse.status }) : null,
}))

const { POST } = await import('../route')

const cancel = (id = ID) =>
  POST(new NextRequest(`https://j-a-m.app/api/admin/recipes/${id}/cancel-release`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  })

beforeEach(() => {
  state.authResponse = null
  state.validFrom = undefined
  state.badgeCount = 0
  state.cardCount = 0
  state.deleteCalls = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/admin/recipes/[id]/cancel-release', () => {
  it('공개 전 레시피는 지우고 200이다', async () => {
    state.validFrom = new Date(Date.now() + 24 * HOUR).toISOString()

    const res = await cancel()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(state.validFrom).toBeUndefined()
  })

  it('이미 공개된 레시피(공개 시각이 지남)는 409이고 지우지 않는다', async () => {
    const validFrom = new Date(Date.now() - 24 * HOUR).toISOString()
    state.validFrom = validFrom

    const res = await cancel()
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('이미 공개된')
    expect(state.validFrom).toBe(validFrom)
  })

  it('처음부터 공개된 레시피(valid_from 없음)는 409이고 지우지 않는다', async () => {
    state.validFrom = null

    const res = await cancel()

    expect(res.status).toBe(409)
    expect(state.validFrom).toBeNull()
  })

  it('없는 레시피는 404다', async () => {
    const res = await cancel()

    expect(res.status).toBe(404)
  })

  it('uuid가 아닌 id는 404이고 삭제를 시도하지 않는다', async () => {
    const res = await cancel('not-a-uuid')

    expect(res.status).toBe(404)
    expect(state.deleteCalls).toBe(0)
  })

  it('배지 조건이 가리키는 레시피는 예약 중이어도 409로 막고 지우지 않는다(삭제 가드)', async () => {
    const validFrom = new Date(Date.now() + 24 * HOUR).toISOString()
    state.validFrom = validFrom
    state.badgeCount = 1

    const res = await cancel()
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('이 레시피를 가리키는 배지가 1개 있어요')
    expect(state.deleteCalls).toBe(0)
    expect(state.validFrom).toBe(validFrom)
  })

  it('레시피 공개 카드가 가리켜도 어드민의 예약 취소는 막지 않는다. 카드는 레시피 줄만 비운다(운영툴의 공개 전 취소만 카드를 막는다, 티켓 20261006_1218)', async () => {
    state.validFrom = new Date(Date.now() + 24 * HOUR).toISOString()
    state.cardCount = 2

    const res = await cancel()

    expect(res.status).toBe(200)
    expect(state.validFrom).toBeUndefined()
  })

  it.each([401, 403])('어드민이 아니면(%i) 그대로 돌려주고 아무것도 지우지 않는다', async (status) => {
    state.authResponse = { status }
    state.validFrom = new Date(Date.now() + 24 * HOUR).toISOString()

    const res = await cancel()

    expect(res.status).toBe(status)
    expect(state.deleteCalls).toBe(0)
    expect(state.validFrom).not.toBeUndefined()
  })
})
