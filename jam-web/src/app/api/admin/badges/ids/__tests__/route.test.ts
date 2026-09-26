/**
 * GET /api/admin/badges/ids — DB 오류를 "0건"으로 삼키지 않고 500과 한국어 안내로 알린다
 * (티켓 20260924_1405). DB는 체이닝 스텁으로 바꿔 오류·정상 응답만 갈아 끼운다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/ids/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const dbResult = vi.hoisted(() => ({
  current: { data: null, count: null, error: null } as {
    data: { id: string }[] | null
    count: number | null
    error: { message: string } | null
  },
}))

/** 어떤 필터 메서드를 이어 불러도 자기 자신을 돌려주고, `range`에서 준비된 결과로 끝난다 */
function chain(): unknown {
  const proxy: unknown = new Proxy(
    {},
    { get: (_target, prop) => (prop === 'range' ? () => Promise.resolve(dbResult.current) : () => proxy) }
  )
  return proxy
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: () => chain() }) }))
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: async () => null }))

const { GET } = await import('../route')

const get = () => GET(new NextRequest('https://j-a-m.app/api/admin/badges/ids'))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/admin/badges/ids', () => {
  it('DB 오류면 빈 목록이 아니라 500과 한국어 안내를 돌려준다', async () => {
    dbResult.current = { data: null, count: null, error: { message: 'connection reset' } }
    const res = await get()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ids).toBeUndefined()
    expect(body.error).toMatch(/^배지 목록을 불러오지 못했어요\./)
    expect(body.error).not.toContain('connection reset')
  })

  it('정상이면 ids를 돌려준다', async () => {
    dbResult.current = { data: [{ id: 'a' }, { id: 'b' }], count: 2, error: null }
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ids: ['a', 'b'] })
  })
})
