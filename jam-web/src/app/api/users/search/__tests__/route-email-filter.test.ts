/**
 * 유저 검색 라우트가 이메일로 일치시키지 않음을 고정한다 (티켓 20261014_1624).
 *
 * 이메일 조각으로 검색해도 결과가 달라지면 로그인한 누구나 다른 유저의 이메일 조각이
 * 존재하는지 알아낼 수 있다. 그래서 DB에 보내는 or-필터에 `email`이 없어야 한다.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { buildUserSearchFilter } from '@/lib/users/search-filter'

const orMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
  }),
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        not: () => ({
          or: (filter: string) => {
            orMock(filter)
            return { limit: async () => ({ data: [], error: null }) }
          },
        }),
      }),
    }),
  }),
}))

import { GET } from '../route'

describe('유저 검색 필터에 email이 없다', () => {
  beforeEach(() => {
    orMock.mockClear()
  })

  it('buildUserSearchFilter는 username·display_name만 담는다', () => {
    const filter = buildUserSearchFilter('gmail')
    expect(filter).toBe('username.ilike.%gmail%,display_name.ilike.%gmail%')
    expect(filter).not.toMatch(/email/i)
  })

  it('GET 라우트가 DB에 보내는 or-필터에도 email이 없다', async () => {
    const req = new NextRequest('http://localhost/api/users/search?q=gmail')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(orMock).toHaveBeenCalledTimes(1)
    expect(orMock.mock.calls[0][0]).not.toMatch(/email/i)
  })
})
