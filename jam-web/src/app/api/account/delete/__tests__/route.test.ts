/**
 * POST /api/account/delete — 유저 탈퇴 라우트 (티켓 20261021_1249 3회, 운영 로직 17장)
 * 계정을 지우는 함수(`deleteAccount`)는 가짜다 — 실제 계정·공용 DB·Auth를 부르지 않는다. 지우는 순서 자체는 `delete-account.test.ts`가 고정한다.
 *
 * 고정하는 것
 *  - 비로그인은 401이고 아무것도 부르지 않는다
 *  - 확인 문구가 없거나 어긋나면 400이고 아무것도 지우지 않는다(서버가 다시 검사한다). 앞뒤 공백과 NFD 입력은 일치로 본다
 *  - 지울 대상은 요청 본문이 아니라 세션의 유저 id다
 *  - 성공은 200 { success: true }, 어드민 계정은 403, 준비·삭제 실패와 예외는 500, 유저 행이 없으면 404
 *  - 이용 정지 중인 유저도 지나간다(정지 검사를 하지 않는다)
 *  - 실패 응답에는 DB·Auth 오류 원문이 없고 고정 문장만 나간다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/account/delete/__tests__/route.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d, t } from '@/lib/i18n'
import { WITHDRAW_CONFIRM_PHRASE } from '@/lib/account/withdraw-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  authenticated: true,
}))
const deleteAccountMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({ service: true }),
}))
vi.mock('@/lib/account/delete-account', () => ({
  deleteAccount: (...args: unknown[]) => deleteAccountMock(...args),
}))

import { POST } from '../route'

function post(body: unknown, raw?: string) {
  return POST(
    new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    })
  )
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    state.authenticated = true
    deleteAccountMock.mockReset().mockResolvedValue({
      ok: true,
      summary: { retained: {}, custodyRowsCleared: 0, vanishedItems: 0 },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('비로그인이면 401이고 아무것도 지우지 않는다', async () => {
    state.authenticated = false

    const res = await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE })

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: d.common.authRequired })
    expect(deleteAccountMock).not.toHaveBeenCalled()
  })

  it.each([
    ['본문에 확인 문구가 없다', { other: 1 }, undefined],
    ['확인 문구가 비었다', { confirmPhrase: '' }, undefined],
    ['확인 문구가 다르다', { confirmPhrase: '삭제합니다' }, undefined],
    ['확인 문구가 일부만이다', { confirmPhrase: '탈퇴합니' }, undefined],
    ['확인 문구가 문자열이 아니다', { confirmPhrase: 1 }, undefined],
    ['본문이 JSON이 아니다', null, '탈퇴합니다'],
    ['본문이 비었다', null, ''],
  ])('%s: 400이고 아무것도 지우지 않는다', async (_label, body, raw) => {
    const res = await post(body, raw)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: t(d.account.deleteConfirmMismatch, { phrase: WITHDRAW_CONFIRM_PHRASE }),
    })
    expect(deleteAccountMock).not.toHaveBeenCalled()
  })

  it('400 문구에 확인 문구가 한 글자도 어긋나지 않게 들어간다', async () => {
    const res = await post({ confirmPhrase: 'x' })
    const { error } = (await res.json()) as { error: string }

    expect(error).toContain(`"${WITHDRAW_CONFIRM_PHRASE}"`)
    expect(error).not.toContain('{phrase}')
  })

  it('확인 문구가 맞으면 세션의 유저 id로 계정을 지우고 200 { success: true }를 돌려준다', async () => {
    const res = await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(deleteAccountMock).toHaveBeenCalledTimes(1)
    expect(deleteAccountMock).toHaveBeenCalledWith({ service: true }, USER_ID)
  })

  it('본문이 다른 유저 id를 실어도 지우는 대상은 세션의 유저뿐이다', async () => {
    await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE, userId: 'someone-else', id: 'someone-else' })

    expect(deleteAccountMock).toHaveBeenCalledTimes(1)
    expect(deleteAccountMock.mock.calls[0][1]).toBe(USER_ID)
  })

  it('앞뒤 공백과 NFD로 들어온 확인 문구도 일치로 본다', async () => {
    expect((await post({ confirmPhrase: `  ${WITHDRAW_CONFIRM_PHRASE}\n` })).status).toBe(200)
    expect((await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE.normalize('NFD') })).status).toBe(200)
    expect(deleteAccountMock).toHaveBeenCalledTimes(2)
  })

  it('이용 정지 중인 유저도 탈퇴할 수 있다 — 라우트가 정지 검사를 가져오지도 부르지도 않는다', async () => {
    const source = readFileSync(path.resolve(__dirname, '../route.ts'), 'utf-8')
    // 주석이 아니라 코드가 정지 모듈을 쓰지 않는지 본다: import 줄과 호출을 확인한다
    expect(source).not.toMatch(/^import .*suspen/im)
    expect(source).not.toMatch(/assertNotSuspended\(/)

    const res = await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE })
    expect(res.status).toBe(200)
    expect(deleteAccountMock).toHaveBeenCalledTimes(1)
  })

  it('어드민 계정이면 403과 고정 문장이다', async () => {
    deleteAccountMock.mockResolvedValue({ ok: false, code: 'admin_account' })

    const res = await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: d.account.deleteAdminForbidden })
  })

  it.each([
    ['준비 실패', 'prepare_failed', 500],
    ['계정 삭제 실패', 'delete_failed', 500],
    ['유저 행 없음', 'not_found', 404],
  ])('%s(%s): %i와 고정 문장이고 내부 오류 코드가 새지 않는다', async (_label, code, status) => {
    deleteAccountMock.mockResolvedValue({ ok: false, code })

    const res = await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(status)
    expect(body).toEqual({ error: d.account.deleteFailed })
    expect(JSON.stringify(body)).not.toContain(code)
  })

  it('지우는 함수가 던져도 500과 고정 문장이고 예외 원문이 새지 않는다', async () => {
    deleteAccountMock.mockRejectedValue(new Error('duplicate key value violates unique constraint "secret_table_pkey"'))

    const res = await post({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE })
    const text = JSON.stringify(await res.json())

    expect(res.status).toBe(500)
    expect(text).toContain(d.account.deleteFailed)
    expect(text).not.toContain('secret_table_pkey')
    expect(text).not.toContain('constraint')
  })

  it('실패 문구는 [현상, 원인, 해결책] 세 문장이고 계정이 그대로라고 단정하지 않는다', () => {
    const sentences = d.account.deleteFailed.split(/(?<=\.)\s+/)
    expect(sentences).toHaveLength(3)
    expect(d.account.deleteFailed).not.toMatch(/그대로/)
  })
})
