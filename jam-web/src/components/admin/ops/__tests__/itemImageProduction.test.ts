/**
 * 승인 직후 이미지 자동 제작 (티켓 20261007_1031)
 *
 * 지키는 것: 시험 묶음·이미지 칸 없는 종류·`preset_id` 없음은 렌더도 저장도 하지 않는다 / 있으면 렌더 → 저장을 부르고 시드는 호출마다 다르다 /
 * 렌더·저장이 실패해도 던지지 않고 `failed` / 일괄 승인 부품은 이 제작을 부르지 않는다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'

const render = vi.fn()
const post = vi.fn()
vi.mock('@/lib/admin/opsInbox/imageRender.client', () => ({ renderPresetToPngBlob: (...a: unknown[]) => render(...a) }))
vi.mock('../imageClient', () => ({ postItemImage: (...a: unknown[]) => post(...a) }))
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

import { produceItemImage } from '../useItemImageProduction'

function makeItem(overrides: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: null,
    endsAt: null,
    status: 'approved',
    original: { image_spec: { preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' } } },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  render.mockReset().mockResolvedValue(new Blob(['x']))
  post.mockReset().mockResolvedValue({ ok: true, url: 'https://x/y.png' })
})

describe('produceItemImage', () => {
  it('image_spec이 있으면 렌더하고 저장한다', async () => {
    expect(await produceItemImage('b1', makeItem(), false, 7)).toBe('done')
    expect(render).toHaveBeenCalledWith({ presetId: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' }, seed: 7 })
    expect(post).toHaveBeenCalledWith('b1', 'item-1', expect.any(Blob))
  })

  it('시험 묶음은 렌더도 저장도 하지 않는다', async () => {
    expect(await produceItemImage('b1', makeItem(), true)).toBe('skipped')
    expect(render).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('image_spec이 없거나 preset_id가 없거나 이미지 칸이 없는 종류면 건너뛴다', async () => {
    expect(await produceItemImage('b1', makeItem({ original: {} }), false)).toBe('skipped')
    expect(await produceItemImage('b1', makeItem({ original: { image_spec: { bg: '#111111' } } }), false)).toBe('skipped')
    expect(await produceItemImage('b1', makeItem({ kind: 'notice' }), false)).toBe('skipped')
    expect(render).not.toHaveBeenCalled()
  })

  it('렌더가 던지거나 저장이 실패해도 던지지 않고 failed다', async () => {
    render.mockRejectedValueOnce(new Error('폰트'))
    expect(await produceItemImage('b1', makeItem(), false)).toBe('failed')
    post.mockResolvedValueOnce({ ok: false, status: 409, message: 'x' })
    expect(await produceItemImage('b1', makeItem(), false)).toBe('failed')
  })

  it('시드를 정하지 않으면 호출마다 새로 뽑는다', async () => {
    await produceItemImage('b1', makeItem(), false)
    await produceItemImage('b1', makeItem(), false)
    const seeds = render.mock.calls.map((c) => (c[0] as { seed: number }).seed)
    expect(seeds[0]).not.toBe(seeds[1])
  })
})

describe('일괄 승인 제외', () => {
  it('OpsBulkApprove는 이미지 제작을 부르지 않는다', () => {
    const src = readFileSync(join(__dirname, '..', 'OpsBulkApprove.tsx'), 'utf8')
    expect(src).not.toMatch(/useItemImageProduction|produceItemImage|imageProduction/)
  })
})
