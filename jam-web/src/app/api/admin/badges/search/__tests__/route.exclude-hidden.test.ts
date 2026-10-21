/**
 * 어드민 배지 검색 API — 숨김 배지 제외 파라미터 (티켓 20261019_1313 2회, 티켓 20261019_0012)
 *
 * 고정하는 것
 *  - `excludeHidden=1`이면 숨김 배지를 거르는 필터(`is_hidden = false`)를 건다. 미션 보상·게이트 배지 선택이 이 값을 보낸다.
 *  - 파라미터를 보내지 않는 기존 호출부는 숨김 배지도 그대로 검색된다(필터를 걸지 않는다).
 *  - 응답에 `is_hidden`을 싣는다(select에 포함).
 * 실제 DB를 부르지 않는다: Supabase 클라이언트는 기록형 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/search/__tests__/route.exclude-hidden.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  filters: [] as unknown[][],
  selected: '',
  rows: [] as Record<string, unknown>[],
}))

function builder(): unknown {
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') return (resolve: (value: unknown) => unknown) => resolve({ data: state.rows, error: null })
        return (...args: unknown[]) => {
          if (method === 'select') state.selected = String(args[0])
          else state.filters.push([method, ...args])
          return builder()
        }
      },
    }
  )
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: () => builder() }) }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: 'admin-1', email: 'me@jam.app' }),
}))

const { GET } = await import('../route')

const search = (query: string) => GET(new NextRequest(`https://j-a-m.app/api/admin/badges/search?${query}`))

beforeEach(() => {
  state.filters = []
  state.selected = ''
  state.rows = [{ id: 'b1', name: '주말 러너', is_hidden: false }]
})

describe('GET /api/admin/badges/search — excludeHidden', () => {
  it('excludeHidden=1이면 숨김 배지를 거르는 필터를 건다', async () => {
    const res = await search('query=러너&excludeHidden=1')

    expect(res.status).toBe(200)
    expect(state.filters).toContainEqual(['eq', 'is_hidden', false])
  })

  it('파라미터를 보내지 않으면 숨김 배지도 검색된다(필터를 걸지 않는다)', async () => {
    await search('query=러너')

    expect(state.filters.some((filter) => filter[1] === 'is_hidden')).toBe(false)
  })

  it('1이 아닌 값은 필터를 걸지 않는다', async () => {
    await search('query=러너&excludeHidden=0')
    await search('query=러너&excludeHidden=true')

    expect(state.filters.some((filter) => filter[1] === 'is_hidden')).toBe(false)
  })

  it('삭제된 배지는 항상 거른다. 다른 필터와 함께 걸린다', async () => {
    await search('query=러너&type=activity&excludeHidden=1')

    expect(state.filters).toContainEqual(['is', 'deleted_at', null])
    expect(state.filters).toContainEqual(['eq', 'type', 'activity'])
    expect(state.filters).toContainEqual(['eq', 'is_hidden', false])
  })

  it('응답에 always_locked를 싣는다(미션 양식이 잠김으로 만든 아이템 배지를 읽기 전용으로 표시한다, 티켓 20261019_1318)', async () => {
    state.rows = [{ id: 'b2', name: '비밀 장갑', is_hidden: false, always_locked: true }]
    const res = await search('query=장갑')

    expect(state.selected).toContain('always_locked')
    expect((await res.json()).badges).toEqual([{ id: 'b2', name: '비밀 장갑', is_hidden: false, always_locked: true }])
  })

  it('응답에 is_hidden을 싣는다', async () => {
    const res = await search('query=러너')

    expect(state.selected).toContain('is_hidden')
    expect((await res.json()).badges).toEqual([{ id: 'b1', name: '주말 러너', is_hidden: false }])
  })
})
