import { describe, expect, it, vi } from 'vitest'
import { createAssetLoadTracker } from '../assetLoadTracker'

/** 밖에서 resolve/reject를 직접 제어하는 프로미스. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 마이크로태스크를 충분히 흘려 보낸다. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('createAssetLoadTracker (티켓 20260925_0149)', () => {
  it('로드가 없으면 idle이고 waitUntilIdle은 즉시 끝난다', async () => {
    const tracker = createAssetLoadTracker<string>()
    expect(tracker.isIdle()).toBe(true)
    await expect(tracker.waitUntilIdle()).resolves.toBeUndefined()
  })

  it('로드 중에는 idle이 아니고, 끝나면 대기자가 깨어나며 값이 남는다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const a = deferred<string>()
    const done = tracker.loadMissing(['a'], () => a.promise)
    expect(tracker.isIdle()).toBe(false)

    const onIdle = vi.fn()
    void tracker.waitUntilIdle().then(onIdle)
    await flush()
    expect(onIdle).not.toHaveBeenCalled()

    a.resolve('A')
    await done
    await flush()
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(tracker.isIdle()).toBe(true)
    expect(tracker.has('a')).toBe(true)
    expect(tracker.getValues()).toEqual({ a: 'A' })
  })

  it('동시 로드 2건 중 1건이 실패해도 대기가 풀리고, 실패 키만 값이 없으며 onError가 불린다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const ok = deferred<string>()
    const bad = deferred<string>()
    const onError = vi.fn()
    const done = tracker.loadMissing(['ok', 'bad'], (key) => (key === 'ok' ? ok.promise : bad.promise), { onError })
    const idle = vi.fn()
    void tracker.waitUntilIdle().then(idle)

    ok.resolve('OK')
    await flush()
    expect(idle).not.toHaveBeenCalled() // 실패 쪽이 아직 진행 중

    const failure = new Error('네트워크 오류')
    bad.reject(failure)
    await done
    await flush()

    expect(idle).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('bad', failure)
    expect(tracker.has('ok')).toBe(true)
    expect(tracker.has('bad')).toBe(false)
  })

  it('실패한 키는 다음 loadMissing에서 다시 시도되고, 성공한 키는 다시 불러오지 않는다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const load = vi.fn(async (key: string) => {
      if (key === 'bad' && load.mock.calls.filter(([k]) => k === 'bad').length === 1) throw new Error('1차 실패')
      return key.toUpperCase()
    })
    await tracker.loadMissing(['ok', 'bad'], load)
    expect(load).toHaveBeenCalledTimes(2)

    await tracker.loadMissing(['ok', 'bad'], load)
    // 두 번째 호출에서는 실패했던 bad만 다시 불러온다
    expect(load).toHaveBeenCalledTimes(3)
    expect(load).toHaveBeenLastCalledWith('bad')
    expect(tracker.getValues()).toEqual({ ok: 'OK', bad: 'BAD' })
  })

  it('불러올 키가 없거나 이미 불러온 키뿐이면 로드하지 않고 idle을 유지한다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const load = vi.fn(async (key: string) => key)
    await tracker.loadMissing([], load)
    await tracker.loadMissing(['a', 'a'], load) // 같은 키 중복은 한 번만
    expect(load).toHaveBeenCalledTimes(1)
    expect(tracker.isIdle()).toBe(true)
    await tracker.loadMissing(['a'], load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('진행 중인 로드가 겹치면 모두 끝난 뒤에야 대기자가 깨어난다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const first = deferred<string>()
    const second = deferred<string>()
    const firstDone = tracker.loadMissing(['a'], () => first.promise)
    const secondDone = tracker.loadMissing(['b'], () => second.promise)
    const idle = vi.fn()
    void tracker.waitUntilIdle().then(idle)

    first.resolve('A')
    await firstDone
    await flush()
    expect(idle).not.toHaveBeenCalled()
    expect(tracker.isIdle()).toBe(false)

    second.resolve('B')
    await secondDone
    await flush()
    expect(idle).toHaveBeenCalledTimes(1)
  })

  it('대기자가 여러 명이어도 모두 깨어난다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const a = deferred<string>()
    const done = tracker.loadMissing(['a'], () => a.promise)
    const idleA = vi.fn()
    const idleB = vi.fn()
    void tracker.waitUntilIdle().then(idleA)
    void tracker.waitUntilIdle().then(idleB)
    a.resolve('A')
    await done
    await flush()
    expect(idleA).toHaveBeenCalledTimes(1)
    expect(idleB).toHaveBeenCalledTimes(1)
  })

  it('취소되면 대기는 풀리지만 결과는 캐시에 반영하지 않는다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const a = deferred<string>()
    let cancelled = false
    const done = tracker.loadMissing(['a'], () => a.promise, { isCancelled: () => cancelled })
    const idle = vi.fn()
    void tracker.waitUntilIdle().then(idle)

    cancelled = true
    a.resolve('A')
    await done
    await flush()

    expect(idle).toHaveBeenCalledTimes(1)
    expect(tracker.has('a')).toBe(false)
    expect(tracker.getValues()).toEqual({})
  })

  it('prune은 더 이상 쓰이지 않는 키의 값과 불러온 표시를 지우고, 쓰이는 키는 남긴다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const load = vi.fn(async (key: string) => key.toUpperCase())
    await tracker.loadMissing(['keep', 'drop'], load)
    expect(load).toHaveBeenCalledTimes(2)

    tracker.prune(new Set(['keep']))
    expect(tracker.getValues()).toEqual({ keep: 'KEEP' })
    expect(tracker.has('drop')).toBe(false)

    // 지워진 키는 다시 쓰이면 새로 불러온다
    await tracker.loadMissing(['keep', 'drop'], load)
    expect(load).toHaveBeenCalledTimes(3)
    expect(load).toHaveBeenLastCalledWith('drop')
  })

  it('prune은 바뀐 것이 없으면 값 객체를 그대로 두고, 바뀌면 새 객체로 교체한다', async () => {
    const tracker = createAssetLoadTracker<string>()
    await tracker.loadMissing(['a', 'b'], async (key) => key)
    const before = tracker.getValues()
    tracker.prune(new Set(['a', 'b']))
    expect(tracker.getValues()).toBe(before)
    tracker.prune(new Set(['a']))
    expect(tracker.getValues()).not.toBe(before)
    expect(before).toEqual({ a: 'a', b: 'b' }) // 이전 참조는 그대로(불변 교체)
  })

  it('로드 도중 prune으로 항목이 제거돼도 대기는 끝까지 정상적으로 풀린다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const a = deferred<string>()
    const done = tracker.loadMissing(['a'], () => a.promise)
    const idle = vi.fn()
    void tracker.waitUntilIdle().then(idle)

    tracker.prune(new Set())
    a.resolve('A')
    await done
    await flush()
    expect(idle).toHaveBeenCalledTimes(1)
  })

  it('dispose는 진행 중인 로드가 있어도 대기자를 모두 깨우고 idle로 되돌리며 불러온 표시를 비운다', async () => {
    const tracker = createAssetLoadTracker<string>()
    const a = deferred<string>()
    void tracker.loadMissing(['a'], () => a.promise)
    const idle = vi.fn()
    void tracker.waitUntilIdle().then(idle)
    expect(tracker.isIdle()).toBe(false)

    tracker.dispose()
    await flush()
    expect(idle).toHaveBeenCalledTimes(1)
    expect(tracker.isIdle()).toBe(true)

    // 표시를 비웠으므로 같은 키를 다시 불러올 수 있다
    const load = vi.fn(async () => 'A2')
    await tracker.loadMissing(['a'], load)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
