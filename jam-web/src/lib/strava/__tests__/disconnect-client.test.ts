/**
 * 프로필 «동기화 끊기» 흐름의 브라우저 쪽 로직 (티켓 20261017_1422 2회)
 *
 * 고정하는 것:
 * - 200과 404(연결 없음, 이미 끊김)는 성공, 그 밖의 상태·네트워크 오류는 실패다
 * - 성공: onSuccess 한 번, 실패: onError 한 번(시트는 유지) — 제출 중 표시는 어느 쪽이든 풀린다
 * - 제출 중에 다시 눌러도 서버 호출은 한 번뿐이다(중복 클릭 방지)
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/disconnect-client.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { requestStravaDisconnect, runStravaDisconnect, type DisconnectOutcome } from '../disconnect-client'

const response = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response

describe('requestStravaDisconnect', () => {
  it('POST /api/strava/disconnect를 부른다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200))
    await requestStravaDisconnect(fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledWith('/api/strava/disconnect', { method: 'POST' })
  })

  it('200은 성공이다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200))
    await expect(requestStravaDisconnect(fetchImpl as unknown as typeof fetch)).resolves.toBe('ok')
  })

  it('404(연결 없음)는 이미 끊긴 것으로 보고 성공과 같게 처리한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(404))
    await expect(requestStravaDisconnect(fetchImpl as unknown as typeof fetch)).resolves.toBe('ok')
  })

  it.each([401, 500, 503])('%i는 실패다', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status))
    await expect(requestStravaDisconnect(fetchImpl as unknown as typeof fetch)).resolves.toBe('error')
  })

  it('네트워크 오류는 던지지 않고 실패로 돌려준다', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(requestStravaDisconnect(fetchImpl as unknown as typeof fetch)).resolves.toBe('error')
  })
})

function makeDeps(outcome: DisconnectOutcome | Promise<DisconnectOutcome>) {
  return {
    inFlight: { current: false },
    request: vi.fn(() => Promise.resolve(outcome)),
    setSubmitting: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
  }
}

describe('runStravaDisconnect', () => {
  it('성공이면 onSuccess를 한 번 부르고 제출 중 표시를 켰다 끈다', async () => {
    const deps = makeDeps('ok')
    await runStravaDisconnect(deps)
    expect(deps.onSuccess).toHaveBeenCalledTimes(1)
    expect(deps.onError).not.toHaveBeenCalled()
    expect(deps.setSubmitting.mock.calls).toEqual([[true], [false]])
    expect(deps.inFlight.current).toBe(false)
  })

  it('실패면 onError만 부르고(시트 유지) 제출 중 표시를 푼다 — 다시 시도할 수 있다', async () => {
    const deps = makeDeps('error')
    await runStravaDisconnect(deps)
    expect(deps.onError).toHaveBeenCalledTimes(1)
    expect(deps.onSuccess).not.toHaveBeenCalled()
    expect(deps.setSubmitting.mock.calls).toEqual([[true], [false]])

    await runStravaDisconnect(deps)
    expect(deps.request).toHaveBeenCalledTimes(2)
  })

  it('제출 중에 다시 눌러도 서버 호출은 한 번뿐이다', async () => {
    let resolveRequest: (outcome: DisconnectOutcome) => void = () => {}
    const pending = new Promise<DisconnectOutcome>((resolve) => {
      resolveRequest = resolve
    })
    const deps = makeDeps(pending)

    const first = runStravaDisconnect(deps)
    const second = runStravaDisconnect(deps)
    const third = runStravaDisconnect(deps)
    resolveRequest('ok')
    await Promise.all([first, second, third])

    expect(deps.request).toHaveBeenCalledTimes(1)
    expect(deps.onSuccess).toHaveBeenCalledTimes(1)
  })

  it('요청이 예기치 않게 던져도 제출 중 표시가 풀린다', async () => {
    const deps = makeDeps('ok')
    deps.request.mockRejectedValue(new Error('boom'))
    await expect(runStravaDisconnect(deps)).rejects.toThrow('boom')
    expect(deps.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(deps.inFlight.current).toBe(false)
  })
})
