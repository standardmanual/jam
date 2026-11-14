/**
 * DELETE /api/admin/recipes/[id] — 레시피 공개 카드(`today_cards.recipe_id`)가 가리켜도 막지 않고 삭제 뒤에 알린다(티켓 20261006_1218).
 * 배지 조건 참조로 막던 가드는 «가장 먼저 성공» 조건과 함께 걷었다(티켓 20261114_1705 4회차). DB는 기록형 스텁이고 실제 조회는 하지 않는다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/recipes/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  recipeExists: true,
  /** 레시피를 가리키는 레시피 공개 카드 수 */
  cardCount: 0,
  /** 값이 있으면 카드 참조 조회가 이 오류를 돌려준다 */
  cardError: null as { message: string } | null,
  deletes: 0,
}))

const fakeClient = {
  from: (table: string) => {
    if (table === 'today_cards') {
      return {
        select: () => ({
          in: () => Promise.resolve(state.cardError ? { count: null, error: state.cardError } : { count: state.cardCount, error: null }),
        }),
      }
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
  state.cardCount = 0
  state.cardError = null
  state.deletes = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('DELETE /api/admin/recipes/[id]', () => {
  it('가리키는 카드가 없으면 삭제한다', async () => {
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

  it('참조 조회가 실패하면 500으로 막고 삭제하지 않는다(fail-closed)', async () => {
    state.cardError = { message: 'today_cards 조회 실패' }

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
