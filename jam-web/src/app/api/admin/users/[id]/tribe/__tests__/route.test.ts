/**
 * /api/admin/users/[id]/tribe (POST 변경, GET 이력·영향 미리 보기) — 티켓 20261021_1247 2회
 *
 * 고정하는 것:
 * - 어드민이 아니면 두 메서드 모두 403이고 변경·읽기 모듈을 부르지 않는다.
 * - POST: 유저 id·새 트라이브 id 형식이 틀리면 400(부르지 않음), 사유 문제 400(고정 문구), 없는 유저 404,
 *   트라이브 없는 유저·고를 수 없는 트라이브·같은 트라이브는 409로 서로 구분, 성공 200(바뀐 트라이브·취소된 미션).
 *   어드민 id가 변경 모듈로 넘어간다. 서버 오류는 DB 오류 원문 없이 고정 문구 500이다.
 * - GET: 이력과 미리 보기를 돌려준다. 새 트라이브를 주지 않으면 미리 보기는 null이다. 없는 유저 404, 읽기 실패는 고정 문구 500이다.
 *
 * 인증·서비스 클라이언트·변경 모듈을 모의한다. 실제 공용 DB는 호출하지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/users/[id]/tribe"
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  changeUserTribe: vi.fn(),
  previewTribeChange: vi.fn(),
  fetchTribeChangeHistory: vi.fn(),
  userRow: { data: { id: 'u' } as { id: string } | null, error: null as { message: string } | null },
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => h.admin }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    marker: 'service',
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => h.userRow }) }) }),
  }),
}))
vi.mock('@/lib/admin/user-tribe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/user-tribe')>('@/lib/admin/user-tribe')
  return {
    ...actual,
    changeUserTribe: h.changeUserTribe,
    previewTribeChange: h.previewTribeChange,
    fetchTribeChangeHistory: h.fetchTribeChangeHistory,
  }
})

import { GET, POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TRIBE_ID = '22222222-2222-4222-8222-222222222222'

const post = (body: unknown, id = USER_ID) =>
  POST(
    new NextRequest(`http://localhost/api/admin/users/${id}/tribe`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
const get = (query = '', id = USER_ID) =>
  GET(new NextRequest(`http://localhost/api/admin/users/${id}/tribe${query}`), { params: Promise.resolve({ id }) })

const OK = {
  ok: true,
  changeId: 'c1',
  fromTribeId: 'from',
  toTribeId: TRIBE_ID,
  toTribeName: '아스팔트 레인저',
  cancelledMissions: [{ id: 'm1', title: '한강 100km' }],
}

beforeEach(() => {
  h.admin = { id: 'admin-1', email: 'admin@jam.test' }
  h.changeUserTribe.mockReset()
  h.previewTribeChange.mockReset()
  h.fetchTribeChangeHistory.mockReset()
  h.userRow = { data: { id: USER_ID }, error: null }
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('어드민이 아니면 호출할 수 없다', () => {
  beforeEach(() => {
    h.admin = null
  })

  it('POST는 403이고 변경 모듈을 부르지 않는다', async () => {
    const res = await post({ newTribeId: TRIBE_ID, reasonCode: 'ops_fix' })
    expect(res.status).toBe(403)
    expect(h.changeUserTribe).not.toHaveBeenCalled()
  })

  it('GET은 403이고 이력·미리 보기를 읽지 않는다', async () => {
    const res = await get(`?newTribeId=${TRIBE_ID}`)
    expect(res.status).toBe(403)
    expect(h.fetchTribeChangeHistory).not.toHaveBeenCalled()
    expect(h.previewTribeChange).not.toHaveBeenCalled()
  })
})

describe('POST — 트라이브 변경', () => {
  it('성공하면 200과 바뀐 트라이브·취소된 미션을 돌려주고, 어드민 id와 본문 값을 변경 모듈에 넘긴다', async () => {
    h.changeUserTribe.mockResolvedValue(OK)

    const res = await post({ newTribeId: ` ${TRIBE_ID} `, reasonCode: 'other', memo: '이벤트 정정' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      changeId: 'c1',
      fromTribeId: 'from',
      toTribeId: TRIBE_ID,
      toTribeName: '아스팔트 레인저',
      cancelledMissions: [{ id: 'm1', title: '한강 100km' }],
    })
    expect(h.changeUserTribe).toHaveBeenCalledTimes(1)
    expect(h.changeUserTribe.mock.calls[0][1]).toEqual({
      adminId: 'admin-1',
      userId: USER_ID,
      newTribeId: TRIBE_ID,
      reasonCode: 'other',
      memo: '이벤트 정정',
    })
  })

  it('유저 id나 새 트라이브 id의 형식이 틀리면 400이고 변경 모듈을 부르지 않는다', async () => {
    const badUser = await post({ newTribeId: TRIBE_ID, reasonCode: 'ops_fix' }, 'not-a-uuid')
    expect(badUser.status).toBe(400)
    expect((await badUser.json()).code).toBe('invalid_user_id')

    for (const body of [{ reasonCode: 'ops_fix' }, { newTribeId: 'x', reasonCode: 'ops_fix' }, { newTribeId: 3, reasonCode: 'ops_fix' }, 'not json', null]) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('invalid_tribe_id')
    }
    expect(h.changeUserTribe).not.toHaveBeenCalled()
  })

  it('사유 문제는 400이고 고정 문구를 돌려준다', async () => {
    const cases = [
      ['invalid_reason', '사유를 목록에서 골라 주세요'],
      ['invalid_memo', '메모 형식이 올바르지 않아요'],
      ['memo_required', '사유가 "기타"일 때는 메모를 적어 주세요'],
      ['memo_too_long', '메모는 200자까지 적을 수 있어요'],
    ] as const
    for (const [code, message] of cases) {
      h.changeUserTribe.mockResolvedValueOnce({ ok: false, code })
      const res = await post({ newTribeId: TRIBE_ID, reasonCode: 'x' })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: message, code })
    }
  })

  it('없는 유저는 404다', async () => {
    h.changeUserTribe.mockResolvedValue({ ok: false, code: 'user_not_found' })

    const res = await post({ newTribeId: TRIBE_ID, reasonCode: 'ops_fix' })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('user_not_found')
  })

  it('트라이브 없는 유저·고를 수 없는 트라이브·같은 트라이브는 모두 409이고 서로 다른 코드와 문구다', async () => {
    const seen = new Map<string, string>()
    for (const code of ['no_tribe', 'invalid_tribe', 'same_tribe'] as const) {
      h.changeUserTribe.mockResolvedValueOnce({ ok: false, code })
      const res = await post({ newTribeId: TRIBE_ID, reasonCode: 'ops_fix' })
      const body = await res.json()
      expect(res.status).toBe(409)
      expect(body.code).toBe(code)
      seen.set(code, body.error)
    }
    expect(new Set(seen.values()).size).toBe(3)
  })

  it('서버 오류는 DB 오류 원문 없이 고정 문구 500이다 — 원인은 서버 로그에만 남는다', async () => {
    h.changeUserTribe.mockRejectedValue(new Error('admin_change_user_tribe RPC 실패: relation "user_tribe_changes" does not exist'))

    const res = await post({ newTribeId: TRIBE_ID, reasonCode: 'ops_fix' })
    const text = await res.text()

    expect(res.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ error: '트라이브를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.' })
    expect(text).not.toContain('user_tribe_changes')
    expect(text).not.toContain('RPC')
    expect(console.error).toHaveBeenCalled()
  })
})

describe('GET — 이력과 영향 미리 보기', () => {
  it('새 트라이브를 주면 이력과 미리 보기를 함께 돌려준다', async () => {
    h.fetchTribeChangeHistory.mockResolvedValue([{ id: 'c1' }])
    h.previewTribeChange.mockResolvedValue([{ id: 'm1', title: '한강 100km' }])

    const res = await get(`?newTribeId=${TRIBE_ID}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      history: [{ id: 'c1' }],
      preview: { newTribeId: TRIBE_ID, cancelledMissions: [{ id: 'm1', title: '한강 100km' }] },
    })
    expect(h.previewTribeChange.mock.calls[0].slice(1)).toEqual([USER_ID, TRIBE_ID])
  })

  it('새 트라이브를 주지 않으면 이력만 읽고 미리 보기는 null이다', async () => {
    h.fetchTribeChangeHistory.mockResolvedValue([])

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ history: [], preview: null })
    expect(h.previewTribeChange).not.toHaveBeenCalled()
  })

  it('형식이 틀린 id는 400이다', async () => {
    expect((await get('', 'nope')).status).toBe(400)
    const res = await get('?newTribeId=nope')
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_tribe_id')
    expect(h.fetchTribeChangeHistory).not.toHaveBeenCalled()
  })

  it('없는 유저는 404다', async () => {
    h.userRow = { data: null, error: null }

    const res = await get()
    expect(res.status).toBe(404)
    expect(h.fetchTribeChangeHistory).not.toHaveBeenCalled()
  })

  it('읽기가 실패하면 DB 오류 원문 없이 고정 문구 500이다 — 빈 이력으로 보이지 않는다', async () => {
    h.fetchTribeChangeHistory.mockRejectedValue(new Error('user_tribe_changes 조회 실패: permission denied'))

    const res = await get()
    const text = await res.text()

    expect(res.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ error: '트라이브 변경 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' })
    expect(text).not.toContain('permission denied')
  })

  it('미리 보기를 읽지 못해도 고정 문구 500이다', async () => {
    h.fetchTribeChangeHistory.mockResolvedValue([])
    h.previewTribeChange.mockRejectedValue(new Error('mission_allowed_tribes 조회 실패'))

    const res = await get(`?newTribeId=${TRIBE_ID}`)
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('mission_allowed_tribes')
  })
})
