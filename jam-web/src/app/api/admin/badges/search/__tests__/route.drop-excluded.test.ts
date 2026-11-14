/**
 * 어드민 배지 검색 API — 드랍 제외 파라미터 (티켓 20261114_1705 2회차)
 *
 * 고정하는 것
 *  - `dropExcluded=1`이면 드랍 제외가 켜진 배지만 남기는 필터(`drop_excluded = true`)를 건다. 레시피의 첫 성공자 보상 배지 선택이 이 값을 보낸다.
 *  - 파라미터를 보내지 않거나 1이 아닌 값이면 필터를 걸지 않는다(기존 호출부 그대로).
 * 실제 DB를 부르지 않는다: Supabase 클라이언트는 기록형 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/search/__tests__/route.drop-excluded.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  filters: [] as unknown[][],
}))

function builder(): unknown {
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') return (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null })
        return (...args: unknown[]) => {
          if (method !== 'select') state.filters.push([method, ...args])
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
})

describe('GET /api/admin/badges/search — dropExcluded', () => {
  it('dropExcluded=1이면 드랍 제외가 켜진 배지만 남기는 필터를 건다', async () => {
    const res = await search('query=기념&type=item&dropExcluded=1')

    expect(res.status).toBe(200)
    expect(state.filters).toContainEqual(['eq', 'drop_excluded', true])
    expect(state.filters).toContainEqual(['eq', 'type', 'item'])
  })

  it('파라미터를 보내지 않거나 1이 아니면 필터를 걸지 않는다', async () => {
    await search('query=기념')
    await search('query=기념&dropExcluded=0')
    await search('query=기념&dropExcluded=true')

    expect(state.filters.some((filter) => filter[1] === 'drop_excluded')).toBe(false)
  })
})
