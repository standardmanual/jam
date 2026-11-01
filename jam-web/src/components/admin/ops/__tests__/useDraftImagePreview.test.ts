/**
 * 승인 전 이미지 바로 그리기의 상태 관리 (티켓 20261101_2149)
 *
 * 지키는 것: 한 번에 한 장씩 / 같은 입력은 다시 그리지 않음(캐시) / 아는 항목의 입력이 바뀌면 400ms 뒤 다시 / 쓰지 않는 blob 주소는 해제 /
 * 렌더 실패는 `failed`로 남고 던지지 않음 / 저장 API(`postItemImage`)와 네트워크를 부르지 않음.
 * 저장소에 jsdom이 없어(`environment: 'node'`) 훅이 아닌 `DraftImagePreviewController`를 가짜 렌더·타이머로 시험한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderPresetToPngArgs } from '@/lib/admin/opsInbox/imageRender.client'

const post = vi.fn()
vi.mock('../imageClient', () => ({ postItemImage: (...a: unknown[]) => post(...a) }))
vi.mock('@/lib/admin/opsInbox/imageRender.client', () => ({ renderPresetToPngBlob: vi.fn() }))

import { DRAFT_IMAGE_DEBOUNCE_MS, DraftImagePreviewController, draftImageKey, type DraftImageRequest } from '../useDraftImagePreview'

const args = (over: Partial<RenderPresetToPngArgs> = {}): RenderPresetToPngArgs => ({
  presetId: 'p1',
  bg: '#111111',
  end: '#222222',
  values: { title: '제목' },
  seed: 7,
  ...over,
})
const req = (id: string, over: Partial<RenderPresetToPngArgs> = {}, tempColor = false): DraftImageRequest => ({ id, args: args(over), tempColor })

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

function setup(render?: (a: RenderPresetToPngArgs) => Promise<Blob>) {
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = []
  let counter = 0
  const revoked: string[] = []
  const renderFn = vi.fn(render ?? (async () => new Blob(['x'])))
  const controller = new DraftImagePreviewController({
    render: renderFn,
    createUrl: () => {
      counter += 1
      return `blob:${counter}`
    },
    revokeUrl: (url) => revoked.push(url),
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false }
      timers.push(t)
      return t
    },
    clearTimer: (h) => {
      ;(h as { cleared: boolean }).cleared = true
    },
  })
  const fire = async () => {
    const t = [...timers].reverse().find((x) => !x.cleared)
    if (t) {
      t.cleared = true
      t.fn()
    }
    await flush()
  }
  return { controller, renderFn, revoked, timers, fire }
}

beforeEach(() => {
  post.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe('draftImageKey', () => {
  it('같은 입력은 같은 키, 값 순서가 달라도 같다. 문구나 시드가 다르면 다르다', () => {
    expect(draftImageKey(args({ values: { a: '1', b: '2' } }))).toBe(draftImageKey(args({ values: { b: '2', a: '1' } })))
    expect(draftImageKey(args())).not.toBe(draftImageKey(args({ values: { title: '바뀜' } })))
    expect(draftImageKey(args())).not.toBe(draftImageKey(args({ seed: 8 })))
  })
})

describe('DraftImagePreviewController', () => {
  it('요청이 없으면 렌더를 부르지 않는다', async () => {
    const { controller, renderFn } = setup()
    controller.update([])
    await flush()
    expect(renderFn).not.toHaveBeenCalled()
    expect(controller.getSnapshot().size).toBe(0)
  })

  it('그리는 동안은 rendering, 끝나면 ready와 blob 주소다', async () => {
    const { controller } = setup()
    controller.update([req('a')])
    expect(controller.getSnapshot().get('a')).toEqual({ status: 'rendering', url: null, tempColor: false })
    await flush()
    expect(controller.getSnapshot().get('a')).toEqual({ status: 'ready', url: 'blob:1', tempColor: false })
  })

  it('임시 색 표시를 상태에 그대로 싣는다', async () => {
    const { controller } = setup()
    controller.update([req('a', {}, true)])
    await flush()
    expect(controller.getSnapshot().get('a')?.tempColor).toBe(true)
  })

  it('여러 장은 한 번에 한 장씩 순서대로 그린다', async () => {
    let active = 0
    let maxActive = 0
    const order: string[] = []
    const { controller } = setup(async (a) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      order.push(a.presetId)
      await Promise.resolve()
      active -= 1
      return new Blob(['x'])
    })
    controller.update([req('a', { presetId: 'p1' }), req('b', { presetId: 'p2' }), req('c', { presetId: 'p3' })])
    await flush()
    expect(order).toEqual(['p1', 'p2', 'p3'])
    expect(maxActive).toBe(1)
  })

  it('같은 입력으로 다시 알려도 다시 그리지 않는다', async () => {
    const { controller, renderFn } = setup()
    controller.update([req('a')])
    await flush()
    controller.update([req('a')])
    await flush()
    expect(renderFn).toHaveBeenCalledTimes(1)
  })

  it('아는 항목의 문구가 바뀌면 400ms 뒤에 다시 그리고 이전 주소를 해제한다', async () => {
    const { controller, renderFn, timers, fire, revoked } = setup()
    controller.update([req('a')])
    await flush()
    controller.update([req('a', { values: { title: '바뀐 제목' } })])
    await flush()
    expect(renderFn).toHaveBeenCalledTimes(1)
    expect(timers.at(-1)?.ms).toBe(DRAFT_IMAGE_DEBOUNCE_MS)
    expect(revoked).toEqual(['blob:1'])
    expect(controller.getSnapshot().get('a')?.status).toBe('rendering')
    await fire()
    expect(renderFn).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().get('a')).toEqual({ status: 'ready', url: 'blob:2', tempColor: false })
  })

  it('입력이 연달아 바뀌면 마지막 것만 그린다', async () => {
    const { controller, renderFn, timers, fire } = setup()
    controller.update([req('a')])
    await flush()
    controller.update([req('a', { values: { title: '1' } })])
    controller.update([req('a', { values: { title: '12' } })])
    expect(timers.filter((t) => !t.cleared)).toHaveLength(1)
    await fire()
    expect(renderFn).toHaveBeenCalledTimes(2)
    expect(renderFn.mock.calls[1][0].values).toEqual({ title: '12' })
  })

  it('목록에서 빠진 항목의 주소는 해제하고, reset은 남은 주소를 모두 해제한다', async () => {
    const { controller, revoked } = setup()
    controller.update([req('a'), req('b', { presetId: 'p2' })])
    await flush()
    controller.update([req('a')])
    expect(revoked).toEqual(['blob:2'])
    controller.reset()
    expect(revoked).toEqual(['blob:2', 'blob:1'])
    expect(controller.getSnapshot().size).toBe(0)
  })

  it('그리는 사이 reset되면 만든 주소를 바로 해제하고 상태에 넣지 않는다', async () => {
    let release: () => void = () => {}
    const { controller, revoked } = setup(
      () =>
        new Promise<Blob>((resolve) => {
          release = () => resolve(new Blob(['x']))
        }),
    )
    controller.update([req('a')])
    await flush()
    controller.reset()
    release()
    await flush()
    expect(revoked).toEqual(['blob:1'])
    expect(controller.getSnapshot().size).toBe(0)
  })

  it('렌더가 실패하면 failed로 남고 다시 시도하지 않는다. 다른 장은 계속 그린다', async () => {
    const { controller, renderFn } = setup(async (a) => {
      if (a.presetId === 'bad') throw new Error('폰트')
      return new Blob(['x'])
    })
    controller.update([req('a', { presetId: 'bad' }), req('b', { presetId: 'ok' })])
    await flush()
    expect(controller.getSnapshot().get('a')).toEqual({ status: 'failed', url: null, tempColor: false })
    expect(controller.getSnapshot().get('b')?.status).toBe('ready')
    controller.update([req('a', { presetId: 'bad' }), req('b', { presetId: 'ok' })])
    await flush()
    expect(renderFn).toHaveBeenCalledTimes(2)
  })

  it('저장 API와 네트워크를 부르지 않는다(렌더는 주입한 함수뿐)', async () => {
    const { controller } = setup()
    controller.update([req('a')])
    await flush()
    expect(post).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('구독자에게 상태가 바뀔 때 알리고, 구독을 풀면 알리지 않는다', async () => {
    const { controller } = setup()
    const listener = vi.fn()
    const off = controller.subscribe(listener)
    controller.update([req('a')])
    await flush()
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2)
    off()
    const count = listener.mock.calls.length
    controller.reset()
    expect(listener).toHaveBeenCalledTimes(count)
  })
})
