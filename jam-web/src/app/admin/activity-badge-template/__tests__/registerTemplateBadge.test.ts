/**
 * registerTemplateBadge 시험 (티켓 20261116_0748): 1280px로 그리고, 그리지 못한 자리가 있으면 보내지 않는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_TEMPLATE_BADGE_PARAMS } from '@/lib/admin/activityBadgeTemplate/templateParams'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import type { StudioSearchBadge } from '../BadgePicker'

const render = vi.fn()
vi.mock('../renderTemplateBadge', () => ({ renderTemplateBadge: (...a: unknown[]) => render(...a) }))
vi.mock('@/app/admin/badges/bakePreviewToBlob', () => ({
  canvasToBlob: async () => new Blob(['x'], { type: 'image/png' }),
}))

import { registerTemplateBadge } from '../registerTemplateBadge'

const badge = { id: 'b1', name: '새벽 러너', templateValue: '5km' } as StudioSearchBadge
const template = { classKey: 'metric', svg: '<svg/>', slots: {} } as unknown as TemplateItem
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
  render.mockReset()
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('registerTemplateBadge', () => {
  it('긴 변 1280px로 그려 등록 API에 보낸다', async () => {
    render.mockResolvedValue({ fontFallbacks: [], shrunk: [], skipped: [] })
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ imageUrl: 'https://x/y.webp' }) })
    const r = await registerTemplateBadge({ badge, template, params: DEFAULT_TEMPLATE_BADGE_PARAMS })
    expect(render.mock.calls[0][1].longSidePx).toBe(1280)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ ok: true, imageUrl: 'https://x/y.webp' })
  })

  it('그리지 못한 자리가 있으면 보내지 않는다', async () => {
    render.mockResolvedValue({ fontFallbacks: [], shrunk: [], skipped: ['value'] })
    const r = await registerTemplateBadge({ badge, template, params: DEFAULT_TEMPLATE_BADGE_PARAMS })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: false, error: '값 자리를 그리지 못해 등록할 수 없어요. 잠시 후 다시 시도해 주세요.' })
  })

  it('서버 오류는 문구를 돌려주고 예외를 던지지 않는다', async () => {
    render.mockResolvedValue({ fontFallbacks: [], shrunk: [], skipped: [] })
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: '권한이 없습니다.' }) })
    expect(await registerTemplateBadge({ badge, template, params: DEFAULT_TEMPLATE_BADGE_PARAMS })).toEqual({
      ok: false,
      error: '권한이 없습니다.',
    })
    fetchMock.mockRejectedValue(new Error('net'))
    const r = await registerTemplateBadge({ badge, template, params: DEFAULT_TEMPLATE_BADGE_PARAMS })
    expect(r.ok).toBe(false)
  })
})
