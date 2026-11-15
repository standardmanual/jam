import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextImageWidthFor, optimizedImageUrl } from '@/lib/imageSrc'
import { WARM_IMAGE_WIDTHS, warmImageVariants } from '../warmImageVariants'

const SRC =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/item/a.webp?v=1'
const ORIGIN = 'https://stage.j-a-m.app'

function okResponse(cache: string) {
  return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'x-vercel-cache': cache } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('warmImageVariants', () => {
  it('폭 네 개의 변환 주소를 optimizedImageUrl과 같은 형식으로 Accept: image/webp와 함께 요청한다', async () => {
    const fetchMock = vi.fn(async () => okResponse('MISS'))
    vi.stubGlobal('fetch', fetchMock)

    const results = await warmImageVariants(SRC, ORIGIN)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    const urls = fetchMock.mock.calls.map((c) => (c as unknown as [string])[0]).sort()
    const expected = WARM_IMAGE_WIDTHS.map((w) => `${ORIGIN}${optimizedImageUrl(SRC, w)}`).sort()
    expect(urls).toEqual(expected)
    for (const call of fetchMock.mock.calls) {
      const init = (call as unknown as [string, RequestInit])[1]
      expect((init.headers as Record<string, string>).Accept).toBe('image/webp')
    }
    expect(results.map((r) => r.width).sort((a, b) => a - b)).toEqual([96, 256, 384, 640])
    expect(results.every((r) => r.status === 200 && r.cache === 'MISS')).toBe(true)
  })

  it('화면이 쓰는 폭이 목록에 모두 들어 있다', () => {
    const widths: readonly number[] = WARM_IMAGE_WIDTHS
    for (const [display, dpr] of [[90, 1], [90, 2], [176, 2], [200, 2]] as const) {
      expect(widths).toContain(nextImageWidthFor(display, dpr))
    }
  })

  it('정적 파일 배지·빈 값·최적화할 수 없는 주소는 요청하지 않는다', async () => {
    const fetchMock = vi.fn(async () => okResponse('HIT'))
    vi.stubGlobal('fetch', fetchMock)

    expect(await warmImageVariants('/badges/a.png', ORIGIN)).toEqual([])
    expect(await warmImageVariants('', ORIGIN)).toEqual([])
    expect(await warmImageVariants(null, ORIGIN)).toEqual([])
    expect(await warmImageVariants('https://example.com/a.png', ORIGIN)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('요청이 실패해도 던지지 않고 상태를 null로 돌려준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      })
    )

    const results = await warmImageVariants(SRC, ORIGIN)

    expect(results).toHaveLength(4)
    expect(results.every((r) => r.status === null && r.cache === null)).toBe(true)
  })
})
