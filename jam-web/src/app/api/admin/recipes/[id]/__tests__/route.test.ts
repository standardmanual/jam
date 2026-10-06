/**
 * DELETE /api/admin/recipes/[id] — 배지 조건 `recipe_first_success`가 가리키는 레시피는 삭제를 막는다
 * (티켓 20261001_1200). 레시피 공개 카드(`today_cards.recipe_id`)가 가리켜도 막지 않고 삭제 뒤에 알린다(티켓 20261006_1218). DB는 기록형 스텁이고 실제 조회는 하지 않는다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/recipes/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  recipeExists: true,
  /** 레시피를 가리키는 삭제되지 않은 배지 수 */
  badgeCount: 0,
  /** 값이 있으면 배지 참조 조회가 이 오류를 돌려준다 */
  badgeError: null as { message: string } | null,
  /** 레시피를 가리키는 레시피 공개 카드 수 */
  cardCount: 0,
  deletes: 0,
}))

const fakeClient = {
  from: (table: string) => {
    if (table === 'badges') {
      const builder = {
        is: () => builder,
        in: () =>
          Promise.resolve(
            state.badgeError
              ? { count: null, error: state.badgeError }
              : { count: state.badgeCount, error: null }
          ),
      }
      return { select: () => builder }
    }
    if (table === 'today_cards') {
      return { select: () => ({ in: () => Promise.resolve({ count: state.cardCount, error: null }) }) }
    }
    return {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve(
              state.recipeExists ? { data: { id: 'r1' }, error: null } : { data: null, error: { message: 'not found' } }
            ),
        }),
      }),
      delete: () => ({
        eq: () => {
          state.deletes += 1
          return Promise.resolve({ error: null })
        },
      }),
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { DELETE } = await import('../route')

const del = () =>
  DELETE(new NextRequest('https://j-a-m.app/api/admin/recipes/r1', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'r1' }),
  })

beforeEach(() => {
  state.recipeExists = true
  state.badgeCount = 0
  state.badgeError = null
  state.cardCount = 0
  state.deletes = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('DELETE /api/admin/recipes/[id]', () => {
  it('가리키는 배지가 없으면 삭제한다', async () => {
    const res = await del()

    expect(res.status).toBe(200)
    expect(state.deletes).toBe(1)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('레시피 공개 카드가 가리켜도 막지 않고 삭제한다. 삭제 뒤 카드 수를 알린다(카드는 레시피 줄 없이 남는다, 티켓 20261006_1218 가정 B)', async () => {
    state.cardCount = 2

    const res = await del()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(state.deletes).toBe(1)
    expect(body.ok).toBe(true)
    expect(body.notice).toContain('카드가 2장')
  })

  it('가리키는 배지가 있으면 409와 배지 수 문구로 막고 삭제하지 않는다', async () => {
    state.badgeCount = 2

    const res = await del()
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('이 레시피를 가리키는 배지가 2개 있어요')
    expect(state.deletes).toBe(0)
  })

  it('배지 참조 조회가 실패하면 500으로 막고 삭제하지 않는다(fail-closed)', async () => {
    state.badgeError = { message: 'badges 조회 실패' }

    const res = await del()

    expect(res.status).toBe(500)
    expect(state.deletes).toBe(0)
  })

  it('없는 레시피는 404다', async () => {
    state.recipeExists = false

    const res = await del()

    expect(res.status).toBe(404)
    expect(state.deletes).toBe(0)
  })
})
