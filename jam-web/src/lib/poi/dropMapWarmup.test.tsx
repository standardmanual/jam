/**
 * 드랍 지도 미리 받기 + 작은 칸(56px)의 변환 폭 통일 (티켓 20261115_1455)
 *
 * 실행: cd jam-web && npx vitest run src/lib/poi/dropMapWarmup.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { BADGE_CARD_DISPLAY_WIDTH, nextImageWidthFor, optimizedImageUrl } from '@/lib/imageSrc'
import type { NearbyPoi } from '@/types/drops'
import { pickWarmupPois, warmDropMapImages } from './dropMapWarmup'

const STORE = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/badges/a.png'

function srcsetOf(html: string): string[] {
  const srcset = /srcSet="([^"]+)"/i.exec(html)?.[1] ?? ''
  return srcset.replace(/&amp;/g, '&').split(',').map((s) => s.trim().split(' ')[0])
}

describe('56px 칸(compact)의 srcset', () => {
  it('90px 카드와 같은 변환 주소(96·256)를 요청한다', () => {
    const compact = srcsetOf(renderToStaticMarkup(<BadgeGridCard compact rarity="epic" name="배지" imageUrl={STORE} />))
    const card = srcsetOf(renderToStaticMarkup(<BadgeGridCard rarity="epic" name="배지" imageUrl={STORE} />))
    expect(compact).toContain(optimizedImageUrl(STORE, 96))
    expect(compact).toContain(optimizedImageUrl(STORE, 256))
    expect(compact).toEqual(card)
  })

  it('표시 크기는 56×56 그대로다', () => {
    const html = renderToStaticMarkup(<BadgeGridCard compact rarity="epic" name="배지" imageUrl={STORE} />)
    expect(html).toContain('width="56"')
    expect(html).toContain('height="56"')
  })

  it('정적 파일 배지는 변환 주소를 거치지 않는다', () => {
    const html = renderToStaticMarkup(<BadgeGridCard compact rarity="epic" name="배지" imageUrl="/badges/poi/b.png" />)
    expect(html).toContain('src="/badges/poi/b.png"')
    expect(html).not.toContain('/_next/image')
  })
})

function poi(id: string, distance: number, over: Partial<NearbyPoi> = {}): NearbyPoi {
  return { id, distance_meters: distance, available_drops_count: 1, in_drop_range: true, poi_tier: 1, ...over } as NearbyPoi
}

describe('pickWarmupPois', () => {
  it('거리 안·드랍 있는 지점만, 가까운 순 3곳', () => {
    const picked = pickWarmupPois(
      [poi('far', 90), poi('out', 5, { in_drop_range: false }), poi('empty', 6, { available_drops_count: 0 }), poi('a', 30), poi('b', 10), poi('c', 50)],
      new Set(),
    )
    expect(picked.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('이미 부른 지점은 제외하고 합계 9곳을 넘기지 않는다', () => {
    const pois = Array.from({ length: 12 }, (_, i) => poi(`p${i}`, i + 1))
    expect(pickWarmupPois(pois, new Set(['p0', 'p1'])).map((p) => p.id)).toEqual(['p2', 'p3', 'p4'])
    expect(pickWarmupPois(pois, new Set(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']))).toHaveLength(2)
    expect(pickWarmupPois(pois, new Set(Array.from({ length: 9 }, (_, i) => `x${i}`)))).toEqual([])
  })
})

describe('warmDropMapImages', () => {
  afterEach(() => vi.unstubAllGlobals())

  function setup(saveData = false) {
    const loaded: string[] = []
    vi.stubGlobal('window', { devicePixelRatio: 3 })
    vi.stubGlobal('navigator', { connection: { saveData } })
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ drops: [{ badge_image_url: STORE }, { badge_image_url: null }], url }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    class FakeImage {
      onload: (() => void) | null = null
      fetchPriority = ''
      decoding = ''
      set src(v: string) {
        loaded.push(v)
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', FakeImage)
    return { loaded, fetchMock }
  }

  it('지점 응답의 그림을 카드와 같은 주소로 받고, 같은 지점은 다시 부르지 않는다', async () => {
    const { loaded, fetchMock } = setup()
    const warmed = new Set<string>()
    await warmDropMapImages([poi('a', 1)], warmed)
    expect(fetchMock).toHaveBeenCalledWith('/api/drops/poi/a')
    expect(loaded).toEqual([optimizedImageUrl(STORE, nextImageWidthFor(BADGE_CARD_DISPLAY_WIDTH, 3))])
    await warmDropMapImages([poi('a', 1)], warmed)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('saveData가 켜져 있으면 요청하지 않는다', async () => {
    const { fetchMock } = setup(true)
    await warmDropMapImages([poi('a', 1)], new Set())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('조회가 던져도 오류를 던지지 않는다', async () => {
    setup()
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network')
    }))
    await expect(warmDropMapImages([poi('a', 1)], new Set())).resolves.toBeUndefined()
  })
})
