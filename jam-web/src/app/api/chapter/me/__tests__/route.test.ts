/**
 * GET /api/chapter/me — 내 챕터 번호와 이름 (티켓 20261019_1317 1회)
 *
 * 고정하는 것: 비로그인은 401이고 아무것도 읽지 않는다 · 로그인하면 세션 유저의 챕터를 서비스 클라이언트로 읽어 `chapterNo`와 `name` 두 키만 돌려준다
 * (점수·다음 챕터·진행 비율은 싣지 않는다) · 읽지 못함은 500(`d.chapter.loadFailed`)이다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/chapter/me/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({ authenticated: true }))
const getMyChapterMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/chapter/read', () => ({
  getMyChapter: (...args: unknown[]) => getMyChapterMock(...args),
}))

import { GET } from '../route'

beforeEach(() => {
  state.authenticated = true
  getMyChapterMock.mockReset()
})

describe('GET /api/chapter/me', () => {
  it('비로그인은 401이고 챕터를 읽지 않는다', async () => {
    state.authenticated = false

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(getMyChapterMock).not.toHaveBeenCalled()
  })

  it('세션 유저의 챕터를 서비스 클라이언트로 읽어 번호와 이름만 돌려준다', async () => {
    getMyChapterMock.mockResolvedValue({ ok: true, chapterNo: 3, name: '단골', nextChapterNo: 4, progress: 0.4242 })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ chapterNo: 3, name: '단골' })
    expect(Object.keys(body).sort()).toEqual(['chapterNo', 'name'])
    expect(JSON.stringify(body)).not.toContain('0.4242')
    expect(getMyChapterMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('이름이 없거나 챕터가 없으면 null을 돌려준다', async () => {
    getMyChapterMock.mockResolvedValue({ ok: true, chapterNo: null, name: null, nextChapterNo: null, progress: null })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ chapterNo: null, name: null })
  })

  it('읽지 못하면 500이고 로그성 문자열을 내려보내지 않는다', async () => {
    getMyChapterMock.mockResolvedValue({ ok: false })

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.chapter.loadFailed })
  })
})
