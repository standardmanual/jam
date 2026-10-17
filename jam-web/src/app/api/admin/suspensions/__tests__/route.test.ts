/**
 * /api/admin/suspensions (GET 목록·POST 걸기)와 /api/admin/suspensions/[id] (PATCH 풀기) — 티켓 20261017_1426 2회
 *
 * 고정하는 것:
 * - 어드민이 아니면 세 메서드 모두 403이고 정지 모듈·목록 조회를 부르지 않는다.
 * - POST: 유저 UUID 형식이 틀리면 400(부르지 않음), 까닭 없음 400, 없는 유저 404, 이미 정지 중 409, 성공 200(걸린 id).
 *   걸 때 운영자 이메일이 `adminEmail`로 넘어간다. 예상하지 못한 오류는 500에 원인을 싣는다.
 * - PATCH: id 형식이 틀리면 400, 이미 풀렸거나 없으면 409, 성공 200. 메모는 문자열일 때만 넘긴다.
 * - GET: 상태·검색어·쪽 번호를 목록 조회에 넘기고, 조회 실패는 500이다.
 * - 옛 `/api/admin/abusing/bans` 경로는 이 라우트가 가져오지 않는다.
 *
 * 인증·서비스 클라이언트·정지 모듈을 모의한다. 실제 공용 DB는 호출하지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/suspensions
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  suspendUser: vi.fn(),
  liftSuspension: vi.fn(),
  fetchSuspensionListPage: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => h.admin }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ marker: 'service' }) }))
vi.mock('@/lib/suspension/suspension-write', () => ({
  suspendUser: h.suspendUser,
  liftSuspension: h.liftSuspension,
}))
vi.mock('@/lib/admin/suspension-list', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/suspension-list')>('@/lib/admin/suspension-list')
  return { ...actual, fetchSuspensionListPage: h.fetchSuspensionListPage }
})

import { GET, POST } from '../route'
import { PATCH } from '../[id]/route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SUSPENSION_ID = '22222222-2222-4222-8222-222222222222'

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/admin/suspensions', { method: 'POST', body: JSON.stringify(body) }))
const patch = (id: string, body: unknown = {}) =>
  PATCH(new NextRequest(`http://localhost/api/admin/suspensions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })
const get = (query = '') => GET(new NextRequest(`http://localhost/api/admin/suspensions${query}`))

beforeEach(() => {
  h.admin = { id: 'admin-1', email: 'admin@jam.test' }
  h.suspendUser.mockReset()
  h.liftSuspension.mockReset()
  h.fetchSuspensionListPage.mockReset()
})

describe('어드민이 아니면 호출할 수 없다', () => {
  beforeEach(() => {
    h.admin = null
  })

  it('POST는 403이고 정지 모듈을 부르지 않는다', async () => {
    const res = await post({ user_id: USER_ID, reason: '사유' })
    expect(res.status).toBe(403)
    expect(h.suspendUser).not.toHaveBeenCalled()
  })

  it('PATCH는 403이고 정지 모듈을 부르지 않는다', async () => {
    const res = await patch(SUSPENSION_ID)
    expect(res.status).toBe(403)
    expect(h.liftSuspension).not.toHaveBeenCalled()
  })

  it('GET은 403이고 목록을 읽지 않는다', async () => {
    const res = await get()
    expect(res.status).toBe(403)
    expect(h.fetchSuspensionListPage).not.toHaveBeenCalled()
  })
})

describe('POST — 정지 걸기', () => {
  it('성공하면 200과 걸린 id를 돌려주고 운영자 이메일을 넘긴다', async () => {
    h.suspendUser.mockResolvedValue({ ok: true, id: 's1' })

    const res = await post({ user_id: ` ${USER_ID} `, reason: 'GPS 조작' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: 's1' })
    expect(h.suspendUser).toHaveBeenCalledWith(expect.anything(), { userId: USER_ID, reason: 'GPS 조작', adminEmail: 'admin@jam.test' })
  })

  it('유저 UUID 형식이 틀리면 400이고 정지 모듈을 부르지 않는다', async () => {
    const res = await post({ user_id: 'not-a-uuid', reason: '사유' })

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_user_id')
    expect(h.suspendUser).not.toHaveBeenCalled()
  })

  it('본문이 없어도 400이다', async () => {
    const res = await POST(new NextRequest('http://localhost/api/admin/suspensions', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(400)
  })

  it.each([
    ['reason_required', 400],
    ['user_not_found', 404],
    ['already_suspended', 409],
  ])('%s는 %i로 매핑한다', async (code, status) => {
    h.suspendUser.mockResolvedValue({ ok: false, code })

    const res = await post({ user_id: USER_ID, reason: ' ' })

    expect(res.status).toBe(status)
    const body = await res.json()
    expect(body.code).toBe(code)
    expect(typeof body.error).toBe('string')
  })

  it('예상하지 못한 오류는 500에 원인을 싣는다', async () => {
    h.suspendUser.mockRejectedValue(new Error('boom'))

    const res = await post({ user_id: USER_ID, reason: '사유' })

    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('boom')
  })
})

describe('PATCH — 정지 풀기', () => {
  it('성공하면 200이고 메모를 넘긴다', async () => {
    h.liftSuspension.mockResolvedValue({ ok: true })

    const res = await patch(SUSPENSION_ID, { note: '상담 후 해제' })

    expect(res.status).toBe(200)
    expect(h.liftSuspension).toHaveBeenCalledWith(expect.anything(), { suspensionId: SUSPENSION_ID, adminEmail: 'admin@jam.test', note: '상담 후 해제' })
  })

  it('메모가 문자열이 아니면 null로 넘긴다', async () => {
    h.liftSuspension.mockResolvedValue({ ok: true })

    await patch(SUSPENSION_ID, { note: 123 })

    expect(h.liftSuspension).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ note: null }))
  })

  it('id 형식이 틀리면 400이고 정지 모듈을 부르지 않는다', async () => {
    const res = await patch('nope')

    expect(res.status).toBe(400)
    expect(h.liftSuspension).not.toHaveBeenCalled()
  })

  it('이미 풀렸거나 없으면 409다', async () => {
    h.liftSuspension.mockResolvedValue({ ok: false, code: 'not_suspended' })

    const res = await patch(SUSPENSION_ID)

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('not_suspended')
  })

  it('예상하지 못한 오류는 500이다', async () => {
    h.liftSuspension.mockRejectedValue(new Error('boom'))

    expect((await patch(SUSPENSION_ID)).status).toBe(500)
  })
})

describe('GET — 목록', () => {
  it('상태·검색어·쪽을 목록 조회에 넘기고 행과 총 건수를 돌려준다', async () => {
    h.fetchSuspensionListPage.mockResolvedValue({ rows: [{ id: 's1' }], total: 51, error: null })

    const res = await get('?status=lifted&q=홍길동&page=2')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ suspensions: [{ id: 's1' }], total: 51 })
    expect(h.fetchSuspensionListPage).toHaveBeenCalledWith(expect.anything(), { q: '홍길동', status: 'lifted' }, 2)
  })

  it('조회가 실패하면 빈 목록 대신 500이다', async () => {
    h.fetchSuspensionListPage.mockResolvedValue({ rows: [], total: 0, error: 'boom' })

    expect((await get()).status).toBe(500)
  })
})

describe('옛 섀도우밴 경로와 분리돼 있다', () => {
  it.each(['../route.ts', '../[id]/route.ts'])('%s는 옛 abusing/bans 경로·shadow-ban 모듈을 가져오지 않는다', (file) => {
    // 주석에는 옛 경로 이름이 설명으로 나오므로 import 줄과 코드 부분만 본다
    const code = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/abusing\/shadow-ban|api\/admin\/abusing\/bans|user_shadow_bans/)
  })
})
