/**
 * «그래도 연결하기» 흐름의 브라우저 쪽 로직 (티켓 20261021_1249 4회)
 *
 * 고정하는 것:
 * - `POST /api/strava/replace`를 본문 없이 부른다. 200은 성공이고, 실패는 서버가 내려준 `error`·`next`를 그대로 쓴다
 * - 읽을 수 없는 응답과 네트워크 오류는 retry와 고정 문장이다(오류 원문·토큰이 없다)
 * - 성공: 도착 화면으로 이동하고 제출 중 표시를 풀지 않는다 / 실패: retry·restart는 안내를 띄우고, blocked는 시트 모양을 바꾸며,
 *   어느 쪽이든 제출 중 표시를 푼다
 * - 제출 중에 다시 눌러도 서버 호출은 한 번뿐이다(중복 탭 방지). 성공 뒤에도 다시 부르지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/replace-client.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { d } from '@/lib/i18n'
import {
  STRAVA_REPLACE_DONE_PATH,
  STRAVA_REPLACE_ENDPOINT,
  STRAVA_RESTART_PATH,
  requestStravaReplace,
  runStravaReplace,
  type StravaReplaceOutcome,
} from '../replace-client'

const copy = d.stravaConnection.replaceResult

function response(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected token < in JSON')
      return body
    },
  } as Response
}

describe('경로 상수', () => {
  it('성공 뒤에는 콜백이 연결을 마쳤을 때와 같은 도착 화면으로 가고, 다시 동기화는 인증 시작 경로로 간다', () => {
    expect(STRAVA_REPLACE_DONE_PATH).toBe('/profile?strava=connected&reveal=1')
    expect(STRAVA_RESTART_PATH).toBe('/api/strava/auth')
    expect(STRAVA_REPLACE_ENDPOINT).toBe('/api/strava/replace')
  })
})

describe('requestStravaReplace', () => {
  it('POST /api/strava/replace를 본문 없이 부른다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { success: true }))
    await requestStravaReplace(fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledWith('/api/strava/replace', { method: 'POST' })
  })

  it('200은 성공이다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { success: true }))
    await expect(requestStravaReplace(fetchImpl as unknown as typeof fetch)).resolves.toEqual({ ok: true })
  })

  it.each([
    [500, 'retry', copy.retry],
    [400, 'restart', copy.restart],
    [401, 'restart', copy.restart],
    [500, 'restart', copy.afterDeleteFailed],
    [403, 'blocked', copy.blocked],
  ] as const)('%i 실패는 서버가 내려준 error와 next(%s)를 그대로 쓴다', async (status, next, error) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status, { error, next }))
    await expect(requestStravaReplace(fetchImpl as unknown as typeof fetch)).resolves.toEqual({ ok: false, next, message: error })
  })

  it('JSON이 아닌 응답(게이트웨이 오류 등)은 retry와 고정 문장이다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(502))
    await expect(requestStravaReplace(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      next: 'retry',
      message: copy.retry,
    })
  })

  it('next가 계약 밖이거나 error가 비어 있으면 retry와 고정 문장이다 (blocked·restart는 자기 고정 문장)', async () => {
    const outOfContract = vi.fn().mockResolvedValue(response(500, { error: '', next: 'explode' }))
    await expect(requestStravaReplace(outOfContract as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      next: 'retry',
      message: copy.retry,
    })

    const emptyRestart = vi.fn().mockResolvedValue(response(400, { error: '   ', next: 'restart' }))
    await expect(requestStravaReplace(emptyRestart as unknown as typeof fetch)).resolves.toMatchObject({ next: 'restart', message: copy.restart })

    const emptyBlocked = vi.fn().mockResolvedValue(response(403, { next: 'blocked' }))
    await expect(requestStravaReplace(emptyBlocked as unknown as typeof fetch)).resolves.toMatchObject({ next: 'blocked', message: copy.blocked })
  })

  it('네트워크 오류는 던지지 않고 retry와 고정 문장으로 돌려준다 (오류 원문이 없다)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNRESET'))
    const outcome = await requestStravaReplace(fetchImpl as unknown as typeof fetch)
    expect(outcome).toEqual({ ok: false, next: 'retry', message: copy.retry })
    expect(JSON.stringify(outcome)).not.toContain('ECONNRESET')
  })
})

describe('runStravaReplace', () => {
  function makeDeps(request: () => Promise<StravaReplaceOutcome>) {
    const calls: string[] = []
    const deps = {
      inFlight: { current: false },
      request: vi.fn(request),
      setSubmitting: vi.fn((v: boolean) => void calls.push(`submitting:${v}`)),
      setNotice: vi.fn((n: unknown) => void calls.push(`notice:${n === null ? 'null' : JSON.stringify(n)}`)),
      onBlocked: vi.fn(() => void calls.push('blocked')),
      redirect: vi.fn(() => void calls.push('redirect')),
    }
    return { deps, calls }
  }

  it('성공이면 안내를 비우고 도착 화면으로 이동하며 제출 중 표시를 풀지 않는다', async () => {
    const { deps, calls } = makeDeps(async () => ({ ok: true }))

    await runStravaReplace(deps)

    expect(calls).toEqual(['submitting:true', 'notice:null', 'redirect'])
    expect(deps.onBlocked).not.toHaveBeenCalled()
    // 이동하는 동안 시트가 «연결하는 중» 그대로이고 다시 눌러도 서버를 부르지 않는다
    expect(deps.inFlight.current).toBe(true)
    await runStravaReplace(deps)
    expect(deps.request).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['retry', copy.retry],
    ['restart', copy.restart],
  ] as const)('%s 실패는 안내를 띄우고 시트를 유지하며 제출 중 표시를 푼다', async (next, message) => {
    const { deps, calls } = makeDeps(async () => ({ ok: false, next, message }))

    await runStravaReplace(deps)

    expect(calls).toEqual(['submitting:true', 'notice:null', `notice:${JSON.stringify({ message, next })}`, 'submitting:false'])
    expect(deps.redirect).not.toHaveBeenCalled()
    expect(deps.onBlocked).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
  })

  it('retry 실패 뒤에는 다시 누를 수 있다', async () => {
    const { deps } = makeDeps(async () => ({ ok: false, next: 'retry', message: copy.retry }))
    await runStravaReplace(deps)
    await runStravaReplace(deps)
    expect(deps.request).toHaveBeenCalledTimes(2)
  })

  it('blocked 실패는 안내를 띄우지 않고 시트 모양을 바꾸며 제출 중 표시를 푼다', async () => {
    const { deps, calls } = makeDeps(async () => ({ ok: false, next: 'blocked', message: copy.blocked }))

    await runStravaReplace(deps)

    expect(calls).toEqual(['submitting:true', 'notice:null', 'blocked', 'submitting:false'])
    expect(deps.redirect).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
  })

  it('요청이 던져도 retry 안내로 닫히고 제출 중 표시가 풀린다', async () => {
    const { deps, calls } = makeDeps(async () => {
      throw new Error('예상 밖 예외')
    })

    await runStravaReplace(deps)

    expect(calls).toEqual(['submitting:true', 'notice:null', `notice:${JSON.stringify({ message: copy.retry, next: 'retry' })}`, 'submitting:false'])
    expect(deps.inFlight.current).toBe(false)
  })

  it('제출 중에 다시 눌러도 서버 호출은 한 번뿐이다', async () => {
    let finish: (outcome: StravaReplaceOutcome) => void = () => {}
    const { deps } = makeDeps(() => new Promise<StravaReplaceOutcome>((resolve) => (finish = resolve)))

    const first = runStravaReplace(deps)
    await runStravaReplace(deps)
    await runStravaReplace(deps)
    expect(deps.request).toHaveBeenCalledTimes(1)

    finish({ ok: true })
    await first
    expect(deps.redirect).toHaveBeenCalledTimes(1)
  })
})
