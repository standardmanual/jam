/**
 * 탈퇴 흐름의 브라우저 쪽 로직 (티켓 20261021_1249 3회)
 * 서버·로그아웃·이동은 모두 가짜다 — 실제 계정을 지우는 호출이 없다.
 *
 * 고정하는 것
 *  - 요약: 성공만 값을 돌려주고 실패·계약 밖 모양·네트워크 오류는 모두 {ok:false}
 *  - 탈퇴 요청: 본문은 { confirmPhrase }, 실패 문구는 서버가 보낸 error 그대로, 읽을 수 없는 응답과 네트워크는 고정 문장
 *  - 흐름: 문구가 맞지 않으면 요청하지 않는다 · 연타해도 요청은 한 번 · 실패하면 안내를 띄우고 제출 중을 푼다 ·
 *    성공하면 signOut이 끝난 뒤에 이동하고 제출 중을 풀지 않는다 · signOut이 던져도 이동한다 · 요청이 던져도 고정 문장으로 실패 처리
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/withdraw-client.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import {
  requestAccountDeletion,
  requestAccountSummary,
  runWithdraw,
  type WithdrawFlowDeps,
  type WithdrawOutcome,
} from '../withdraw-client'
import { WITHDRAW_CONFIRM_PHRASE, WITHDRAWN_LOGIN_PATH } from '../withdraw-contract'

const SUMMARY = {
  activityBadgeCount: 12,
  checkinBadgeCount: 7,
  itemCount: 20,
  jamBalance: 340,
  pointBalance: 1200,
  stravaConnected: true,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('requestAccountSummary', () => {
  it('성공 응답을 요약으로 읽는다', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ summary: SUMMARY }))
    const outcome = await requestAccountSummary(fetchMock as unknown as typeof fetch)
    expect(outcome).toEqual({ ok: true, summary: SUMMARY })
    expect(fetchMock).toHaveBeenCalledWith('/api/account/delete-summary', { signal: undefined })
  })

  it.each([
    ['401', () => jsonResponse({ error: d.common.authRequired }, 401)],
    ['500', () => jsonResponse({ error: d.auth.errorGeneric }, 500)],
    ['계약 밖 모양', () => jsonResponse({ summary: { ...SUMMARY, itemCount: 'many' } })],
    ['JSON이 아닌 본문', () => new Response('<html>bad gateway</html>', { status: 200 })],
  ])('%s는 {ok:false}다 — 오류 문구를 싣지 않는다', async (_label, make) => {
    const outcome = await requestAccountSummary((async () => make()) as unknown as typeof fetch)
    expect(outcome).toEqual({ ok: false })
  })

  it('네트워크 오류도 {ok:false}다', async () => {
    const outcome = await requestAccountSummary((async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch)
    expect(outcome).toEqual({ ok: false })
  })
})

describe('requestAccountDeletion', () => {
  it('POST로 { confirmPhrase }를 보내고 200이면 성공이다', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true }))
    const outcome = await requestAccountDeletion(WITHDRAW_CONFIRM_PHRASE, fetchMock as unknown as typeof fetch)

    expect(outcome).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/account/delete')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ confirmPhrase: WITHDRAW_CONFIRM_PHRASE })
  })

  it.each([
    [401, d.common.authRequired],
    [403, d.account.deleteAdminForbidden],
    [400, '확인 문구가 맞지 않아요. "탈퇴합니다"를 다시 입력해 주세요.'],
    [500, d.account.deleteFailed],
  ])('%i 응답은 서버가 보낸 error 문구를 그대로 쓴다', async (status, error) => {
    const outcome = await requestAccountDeletion(
      WITHDRAW_CONFIRM_PHRASE,
      (async () => jsonResponse({ error }, status)) as unknown as typeof fetch
    )
    expect(outcome).toEqual({ ok: false, message: error })
  })

  it('읽을 수 없는 응답(JSON이 아님, error 없음, 빈 문자열)은 고정 문장이다', async () => {
    const make = (response: () => Response) => (async () => response()) as unknown as typeof fetch
    for (const response of [
      () => new Response('<html>502</html>', { status: 502 }),
      () => jsonResponse({}, 500),
      () => jsonResponse({ error: '   ' }, 500),
      () => jsonResponse({ error: 5 }, 500),
    ]) {
      expect(await requestAccountDeletion(WITHDRAW_CONFIRM_PHRASE, make(response))).toEqual({
        ok: false,
        message: d.account.deleteFailed,
      })
    }
  })

  it('네트워크 오류는 고정 문장이다 — 예외 원문이 새지 않는다', async () => {
    const outcome = await requestAccountDeletion(WITHDRAW_CONFIRM_PHRASE, (async () => {
      throw new TypeError('Failed to fetch https://secret.supabase.co')
    }) as unknown as typeof fetch)
    expect(outcome).toEqual({ ok: false, message: d.account.deleteFailed })
  })
})

describe('runWithdraw', () => {
  let order: string[]
  let deps: WithdrawFlowDeps
  let request: ReturnType<typeof vi.fn<(phrase: string) => Promise<WithdrawOutcome>>>

  beforeEach(() => {
    order = []
    request = vi.fn(async () => {
      order.push('request')
      return { ok: true } as WithdrawOutcome
    })
    deps = {
      inFlight: { current: false },
      phrase: WITHDRAW_CONFIRM_PHRASE,
      request,
      setSubmitting: vi.fn((v: boolean) => order.push(`submitting:${v}`)),
      setError: vi.fn((m: string | null) => order.push(`error:${m}`)),
      signOut: vi.fn(async () => {
        order.push('signOut')
      }),
      redirect: vi.fn(() => order.push('redirect')),
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('성공하면 요청 → signOut → 이동 순서이고 제출 중을 풀지 않는다', async () => {
    await runWithdraw(deps)

    expect(order).toEqual(['submitting:true', 'error:null', 'request', 'signOut', 'redirect'])
    expect(request).toHaveBeenCalledWith(WITHDRAW_CONFIRM_PHRASE)
    expect(deps.setSubmitting).not.toHaveBeenCalledWith(false)
    // 이동 뒤에도 inFlight를 풀지 않아 같은 화면에서 한 번 더 요청이 나가지 않는다
    expect(deps.inFlight.current).toBe(true)
  })

  it('이동 대상은 /login?withdrawn=1이다', () => {
    expect(WITHDRAWN_LOGIN_PATH).toBe('/login?withdrawn=1')
  })

  it('앞뒤 공백이 붙은 문구도 일치로 보고, 서버에는 입력 그대로 보낸다(서버가 같은 규칙으로 다시 본다)', async () => {
    deps.phrase = `  ${WITHDRAW_CONFIRM_PHRASE} `
    await runWithdraw(deps)
    expect(request).toHaveBeenCalledWith(`  ${WITHDRAW_CONFIRM_PHRASE} `)
  })

  it('확인 문구가 맞지 않으면 요청도 제출 중 표시도 없다', async () => {
    deps.phrase = '탈퇴합니'
    await runWithdraw(deps)

    expect(request).not.toHaveBeenCalled()
    expect(deps.setSubmitting).not.toHaveBeenCalled()
    expect(deps.redirect).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
  })

  it('이미 진행 중이면 아무것도 하지 않는다 — 연타해도 요청은 한 번이다', async () => {
    let release: (o: WithdrawOutcome) => void = () => {}
    request.mockImplementation(
      () =>
        new Promise<WithdrawOutcome>((resolve) => {
          release = resolve
        })
    )

    const first = runWithdraw(deps)
    await runWithdraw(deps)
    await runWithdraw(deps)
    expect(request).toHaveBeenCalledTimes(1)

    release({ ok: true })
    await first
    expect(request).toHaveBeenCalledTimes(1)
    expect(deps.redirect).toHaveBeenCalledTimes(1)
  })

  it('실패하면 서버 문구를 안내로 띄우고 제출 중을 풀며 이동하지 않는다 — 다시 시도할 수 있다', async () => {
    request.mockResolvedValueOnce({ ok: false, message: d.account.deleteAdminForbidden })

    await runWithdraw(deps)

    expect(order).toEqual(['submitting:true', 'error:null', `error:${d.account.deleteAdminForbidden}`, 'submitting:false'])
    expect(deps.signOut).not.toHaveBeenCalled()
    expect(deps.redirect).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)

    // 실패 뒤에는 같은 입력으로 다시 보낼 수 있다
    await runWithdraw(deps)
    expect(request).toHaveBeenCalledTimes(2)
    expect(deps.redirect).toHaveBeenCalledTimes(1)
  })

  it('요청이 예상 밖으로 던져도 고정 문장으로 실패 처리하고 제출 중을 푼다', async () => {
    request.mockRejectedValueOnce(new Error('boom'))

    await runWithdraw(deps)

    expect(deps.setError).toHaveBeenLastCalledWith(d.account.deleteFailed)
    expect(deps.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(deps.redirect).not.toHaveBeenCalled()
  })

  it('signOut이 오류를 내도 이동한다 — 계정은 이미 지워졌다', async () => {
    deps.signOut = vi.fn(async () => {
      throw new Error('signOut failed')
    })

    await runWithdraw(deps)

    expect(deps.redirect).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('signOut이 끝나기 전에는 이동하지 않는다', async () => {
    let finishSignOut: () => void = () => {}
    deps.signOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSignOut = resolve
        })
    )

    const run = runWithdraw(deps)
    await vi.waitFor(() => expect(deps.signOut).toHaveBeenCalled())
    expect(deps.redirect).not.toHaveBeenCalled()

    finishSignOut()
    await run
    expect(deps.redirect).toHaveBeenCalledTimes(1)
  })
})
