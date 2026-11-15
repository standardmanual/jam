/**
 * BadgeImageWarmup — 곧 열 화면의 배지 그림을 한가한 시점에 미리 받는다 (티켓 20261115_1344)
 *
 * 고정하는 것: 세션당 한 번 · saveData면 건너뜀 · 만든 주소가 화면(BadgeGridCard)이 요청하는 주소와 같음 ·
 * 실패해도 오류를 던지지 않음. 저장소에 jsdom이 없어 브라우저 전역을 가짜로 세워 실행 함수를 직접 부른다.
 *
 * 실행: cd jam-web && npx vitest run src/components/__tests__/BadgeImageWarmup.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import BadgeImageWarmup, { warmUpBadgeImages, WARMUP_SESSION_KEY } from '../BadgeImageWarmup'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { BADGE_CARD_DISPLAY_WIDTH, nextImageWidthFor, optimizedImageUrl } from '@/lib/imageSrc'

const STORE = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/badges/a.png'

let loaded: string[]
let store: Map<string, string>

function setup(opts: { dpr?: number; saveData?: boolean; fetchImpl?: () => Promise<unknown> } = {}) {
  loaded = []
  store = new Map()
  vi.stubGlobal('window', { devicePixelRatio: opts.dpr ?? 3 })
  vi.stubGlobal('navigator', { connection: { saveData: opts.saveData ?? false } })
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(
      opts.fetchImpl ??
        (async () => ({ ok: true, json: async () => ({ urls: [STORE, '/badges/poi/b.png', 42, null] }) })),
    ),
  )
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    fetchPriority = ''
    decoding = ''
    set src(v: string) {
      loaded.push(v)
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', FakeImage)
}

describe('warmUpBadgeImages', () => {
  beforeEach(() => setup())
  afterEach(() => vi.unstubAllGlobals())

  it('목록 주소를 화면과 같은 규칙의 주소로 바꿔 받는다(정적 파일 배지는 원래 주소)', async () => {
    await warmUpBadgeImages()
    expect(loaded).toEqual([optimizedImageUrl(STORE, 256), '/badges/poi/b.png'])
  })

  it('1배 화면은 w=96', async () => {
    setup({ dpr: 1 })
    await warmUpBadgeImages()
    expect(loaded[0]).toBe(optimizedImageUrl(STORE, 96))
  })

  it('세션당 한 번만 실행한다', async () => {
    await warmUpBadgeImages()
    await warmUpBadgeImages()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.get(WARMUP_SESSION_KEY)).toBe('1')
  })

  it('saveData가 켜져 있으면 요청도 하지 않는다', async () => {
    setup({ saveData: true })
    await warmUpBadgeImages()
    expect(fetch).not.toHaveBeenCalled()
    expect(loaded).toEqual([])
  })

  it('API가 실패하거나 던져도 오류를 던지지 않는다', async () => {
    setup({ fetchImpl: async () => ({ ok: false }) })
    await expect(warmUpBadgeImages()).resolves.toBeUndefined()
    setup({
      fetchImpl: async () => {
        throw new Error('network')
      },
    })
    await expect(warmUpBadgeImages()).resolves.toBeUndefined()
    expect(loaded).toEqual([])
  })

  it('첫 시도가 실패하면 세션 기록을 남기지 않아 다음 호출에서 다시 시도한다', async () => {
    setup({
      fetchImpl: async () => {
        throw new Error('network')
      },
    })
    await warmUpBadgeImages()
    expect(store.has(WARMUP_SESSION_KEY)).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ urls: [STORE] }) })))
    await warmUpBadgeImages()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.get(WARMUP_SESSION_KEY)).toBe('1')
    expect(loaded).toHaveLength(1)
  })

  it('실행 중에 다시 불려도 목록을 한 번만 요청한다', async () => {
    await Promise.all([warmUpBadgeImages(), warmUpBadgeImages()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('주소 일치 — BadgeGridCard(90px)의 srcset', () => {
  it.each([
    [1, 96],
    [2, 256],
    [3, 256],
  ])('dpr %i 배율의 미리 받기 주소가 srcset에 들어 있다', (dpr, w) => {
    const html = renderToStaticMarkup(<BadgeGridCard rarity="epic" name="배지" imageUrl={STORE} />)
    const srcset = /srcSet="([^"]+)"/i.exec(html)?.[1] ?? ''
    // renderToStaticMarkup은 &amp;로 내보낸다
    const candidates = srcset.replace(/&amp;/g, '&').split(',').map((s) => s.trim().split(' ')[0])
    const warm = optimizedImageUrl(STORE, nextImageWidthFor(BADGE_CARD_DISPLAY_WIDTH, dpr))!
    expect(w).toBe(nextImageWidthFor(BADGE_CARD_DISPLAY_WIDTH, dpr))
    expect(candidates).toContain(warm)
  })
})

describe('BadgeImageWarmup 컴포넌트', () => {
  it('아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<BadgeImageWarmup />)).toBe('')
  })
})
