/**
 * GET /api/capsule/unseen — 보지 않은 캡슐 결과 조회 (티켓 20261028_1740 2회)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 읽지 않는다. 대상은 세션 유저뿐이다.
 * - 보지 않은 결과가 있으면 200과 `{ result }`, 없으면 `{ result: null }`.
 * - 이용 정지 여부는 보지 않는다(내 결과 보기).
 * - 읽기가 실패하면 500과 일반 문구이고 내부 오류 원문을 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/capsule/unseen/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({ authenticated: true }))
const readMock = vi.hoisted(() => vi.fn())
const serviceClient = vi.hoisted(() => ({ marker: 'service-role-client' }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => serviceClient,
}))
vi.mock('@/lib/capsule/unseen', () => ({ readUnseenCapsuleResult: (...args: unknown[]) => readMock(...args) }))

import { GET } from '../route'

const RESULT = {
  ids: ['row-1'],
  events: [{ openId: 'open-1', items: [], reachedChapters: [3] }],
  chapterBadges: [{ id: 'badge-3', name: '셋째', description: '챕터 3', imageUrl: null, rarity: 'common', level: 1 }],
}

beforeEach(() => {
  state.authenticated = true
  readMock.mockReset()
  readMock.mockResolvedValue(RESULT)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/capsule/unseen', () => {
  it('비로그인은 401이고 읽지 않는다', async () => {
    state.authenticated = false
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(readMock).not.toHaveBeenCalled()
  })

  it('보지 않은 결과가 있으면 200과 result이고, 세션 유저만 대상이다', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: RESULT })
    expect(readMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('보지 않은 결과가 없으면 200과 result null이다', async () => {
    readMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: null })
  })

  it('읽기가 실패하면 500과 일반 문구이고 내부 오류 원문을 싣지 않는다', async () => {
    readMock.mockRejectedValue(new Error('relation "capsule_unseen_results" secret detail'))
    const res = await GET()
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain(d.capsule.unseenFailed)
    expect(text).not.toContain('secret detail')
  })
})
