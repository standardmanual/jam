/**
 * strava/pending-pick — 고르기 화면이 쓰는 순수 로직 (티켓 20261017_1425 2회)
 *
 * 고정하는 것:
 * - `toggleChoice`: 고르면 더하고 다시 누르면 해제한다. 정한 개수를 다 채웠으면 안 고른 것은 더해지지 않는다(해제는 된다).
 * - `submitChoice`: 고른 수가 정확히 맞을 때만 `POST /api/strava/pending-items`를 보낸다(덜·더 고르면 요청 0번). 빈칸 0이면
 *   `chosenIds: []`로 확정한다. 코드별 오류 처리(400 wrong_count·invalid_selection, 409 no_pending, 404, 500, 네트워크).
 * - `fetchPendingPayload`: 성공은 목록, 실패·타임아웃은 null이다(던지지 않는다).
 * - `createPickerSession`: 이미 열려 있으면 두 번 열지 않고 같은 결과를 기다린다. 끝나면 모두에게 같은 결과를 알린다.
 * - `shouldAutoOpen`: 보류가 없으면 하지 않고, `reveal=1`이면 연출이 끝난 뒤(탭바 숨김 → 다시 보임)나 시간 제한 뒤에 한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/pending-pick.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { d } from '@/lib/i18n'
import {
  createPickerSession,
  fetchPendingPayload,
  interpretSubmitError,
  isExactChoice,
  shouldAutoOpen,
  submitChoice,
  toggleChoice,
} from '../pending-pick'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('toggleChoice', () => {
  it('고르면 더하고 다시 누르면 해제한다', () => {
    expect(toggleChoice([], 'a', 2)).toEqual(['a'])
    expect(toggleChoice(['a'], 'b', 2)).toEqual(['a', 'b'])
    expect(toggleChoice(['a', 'b'], 'a', 2)).toEqual(['b'])
  })

  it('정한 개수를 다 채웠으면 안 고른 것은 더해지지 않는다', () => {
    expect(toggleChoice(['a', 'b'], 'c', 2)).toEqual(['a', 'b'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const selected = ['a']
    toggleChoice(selected, 'b', 3)
    expect(selected).toEqual(['a'])
  })

  it('고를 칸이 0이면 아무것도 더해지지 않는다', () => {
    expect(toggleChoice([], 'a', 0)).toEqual([])
  })
})

describe('isExactChoice', () => {
  it('정확히 같을 때만 true다', () => {
    expect(isExactChoice(2, 2)).toBe(true)
    expect(isExactChoice(1, 2)).toBe(false)
    expect(isExactChoice(3, 2)).toBe(false)
    expect(isExactChoice(0, 0)).toBe(true)
  })
})

describe('submitChoice — 요청 조건', () => {
  it('덜 고르면 요청을 보내지 않는다', async () => {
    const fetcher = vi.fn()

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, ['a'], 2)

    expect(outcome).toEqual({ kind: 'skipped' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('더 고르면 요청을 보내지 않는다', async () => {
    const fetcher = vi.fn()

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, ['a', 'b', 'c'], 2)

    expect(outcome).toEqual({ kind: 'skipped' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('정확히 맞으면 chosenIds를 담아 POST 한 번을 보낸다', async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { granted: 2, discarded: 1, itemIds: ['i1', 'i2'] }))

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, ['a', 'b'], 2)

    expect(outcome).toEqual({ kind: 'success', granted: 2 })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/strava/pending-items')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ chosenIds: ['a', 'b'] })
  })

  it('빈칸이 0이면 빈 선택(chosenIds: [])으로 확정한다', async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { granted: 0, discarded: 3, itemIds: [] }))

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, [], 0)

    expect(outcome).toEqual({ kind: 'success', granted: 0 })
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ chosenIds: [] })
  })

  it('성공 본문을 읽지 못하면 고른 개수를 받은 개수로 본다', async () => {
    const fetcher = vi.fn(async () => new Response('not json', { status: 200 }))

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, ['a', 'b'], 2)

    expect(outcome).toEqual({ kind: 'success', granted: 2 })
  })
})

describe('submitChoice — 코드별 오류 처리', () => {
  it.each([
    ['400 wrong_count는 선택을 유지하고(다시 읽지 않고) 안내한다', 400, { code: 'wrong_count', expected: 2 }, d.syncPending.wrongCount, false],
    ['400 invalid_selection은 다시 읽고 선택을 비운다', 400, { code: 'invalid_selection' }, d.syncPending.invalidSelection, true],
    ['404는 인벤토리를 찾지 못했다고 안내한다', 404, { error: 'x' }, d.syncPending.inventoryNotFound, false],
    ['500은 확정하지 못했다고 안내하고 재시도할 수 있다', 500, { error: 'x' }, d.syncPending.resolveFailed, false],
    ['본문 없는 400도 확정하지 못했다고 안내한다', 400, null, d.syncPending.resolveFailed, false],
  ])('%s', async (_name, status, body, message, reload) => {
    const fetcher = vi.fn(async () => jsonResponse(status, body))

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, ['a', 'b'], 2)

    expect(outcome).toEqual({ kind: 'error', message, reload })
  })

  it('409 no_pending은 이미 닫힌 것으로 본다', async () => {
    const fetcher = vi.fn(async () => jsonResponse(409, { code: 'no_pending', error: 'x' }))

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, ['a', 'b'], 2)

    expect(outcome).toEqual({ kind: 'already_resolved' })
  })

  it('네트워크 오류도 던지지 않고 재시도할 수 있는 오류로 돌려준다', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('network down')
    })

    const outcome = await submitChoice(fetcher as unknown as typeof fetch, ['a', 'b'], 2)

    expect(outcome).toEqual({ kind: 'error', message: d.syncPending.resolveFailed, reload: false })
  })

  it('다른 409(no_pending이 아님)는 확정하지 못한 오류다', () => {
    expect(interpretSubmitError(409, undefined)).toEqual({ kind: 'error', message: d.syncPending.resolveFailed, reload: false })
  })
})

describe('fetchPendingPayload', () => {
  const payload = { pendingCount: 3, freeSlots: 2, chooseCount: 2, items: [] }

  it('성공하면 목록을 돌려준다', async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, payload))

    await expect(fetchPendingPayload(fetcher as unknown as typeof fetch, 8000)).resolves.toEqual(payload)
    const [url] = fetcher.mock.calls[0] as unknown as [string]
    expect(url).toBe('/api/strava/pending-items')
  })

  it('실패 응답이면 null이다', async () => {
    const fetcher = vi.fn(async () => jsonResponse(500, { error: 'x' }))

    await expect(fetchPendingPayload(fetcher as unknown as typeof fetch, 8000)).resolves.toBeNull()
  })

  it('던지면(네트워크 오류·타임아웃) null이다', async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException('timeout', 'TimeoutError')
    })

    await expect(fetchPendingPayload(fetcher as unknown as typeof fetch, 8000)).resolves.toBeNull()
  })
})

describe('createPickerSession', () => {
  it('처음 요청은 새로 열고, 열려 있는 동안의 요청은 같은 promise를 돌려준다', () => {
    const session = createPickerSession()

    const first = session.request()
    const second = session.request()

    expect(first.started).toBe(true)
    expect(second.started).toBe(false)
    expect(second.promise).toBe(first.promise)
    expect(session.isOpen()).toBe(true)
  })

  it('끝나면 기다리던 모두에게 같은 결과를 알리고 비운다', async () => {
    const session = createPickerSession()
    const first = session.request()
    const second = session.request()

    session.finish('resolved')

    await expect(first.promise).resolves.toBe('resolved')
    await expect(second.promise).resolves.toBe('resolved')
    expect(session.isOpen()).toBe(false)
  })

  it('끝난 뒤의 새 요청은 새로 열린다', async () => {
    const session = createPickerSession()
    const first = session.request()
    session.finish('dismissed')
    await first.promise

    const again = session.request()

    expect(again.started).toBe(true)
    expect(again.promise).not.toBe(first.promise)
  })

  it('열려 있지 않을 때 끝내도 아무 일도 없다', () => {
    const session = createPickerSession()

    expect(() => session.finish('resolved')).not.toThrow()
  })
})

describe('shouldAutoOpen', () => {
  const base = { pendingCount: 2, revealPending: false, sawRevealOverlay: false, tabBarHidden: false, revealTimedOut: false }

  it('보류가 없으면 하지 않는다', () => {
    expect(shouldAutoOpen({ ...base, pendingCount: 0 })).toBe(false)
  })

  it('보류가 있고 reveal=1이 아니면 바로 한다', () => {
    expect(shouldAutoOpen(base)).toBe(true)
  })

  it('reveal=1이면 연출이 뜨기 전·떠 있는 동안에는 미룬다', () => {
    expect(shouldAutoOpen({ ...base, revealPending: true })).toBe(false)
    expect(shouldAutoOpen({ ...base, revealPending: true, sawRevealOverlay: true, tabBarHidden: true })).toBe(false)
  })

  it('reveal=1이면 연출이 끝난 뒤(탭바가 숨겨졌다가 다시 보임)에 한다', () => {
    expect(shouldAutoOpen({ ...base, revealPending: true, sawRevealOverlay: true, tabBarHidden: false })).toBe(true)
  })

  it('reveal=1인데 연출이 끝내 뜨지 않으면 시간 제한 뒤에 한다', () => {
    expect(shouldAutoOpen({ ...base, revealPending: true, revealTimedOut: true })).toBe(true)
  })
})
