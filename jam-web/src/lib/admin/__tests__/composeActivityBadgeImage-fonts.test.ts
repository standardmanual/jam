/**
 * 액티비티 배지 이미지 생성기의 자체 서체 로딩 — 티켓 20261015_2132
 *
 * 서비스 globals.css가 Pretendard CDN을 걷으면서, 생성기가 필요할 때 직접 Pretendard
 * 스타일시트를 한 번만 넣고 load를 기다린 뒤 `document.fonts.load`를 부른다. 이 순서가
 * 깨지면 캔버스가 조용히 폴백 글꼴로 이미지를 굽는다.
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/composeActivityBadgeImage-fonts.test.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeLink {
  id: string
  rel: string
  href: string
  onload: (() => void) | null
  onerror: (() => void) | null
  remove: ReturnType<typeof vi.fn>
}

function installFakeDocument() {
  const links: FakeLink[] = []
  const fontsLoad = vi.fn().mockResolvedValue([])
  const doc = {
    createElement: vi.fn((): FakeLink => ({
      id: '',
      rel: '',
      href: '',
      onload: null,
      onerror: null,
      remove: vi.fn(),
    })),
    head: {
      appendChild: vi.fn((link: FakeLink) => {
        links.push(link)
        return link
      }),
    },
    fonts: { load: fontsLoad, ready: Promise.resolve() },
  }
  vi.stubGlobal('document', doc)
  return { doc, links, fontsLoad }
}

async function importFresh() {
  vi.resetModules()
  return import('../composeActivityBadgeImage')
}

describe('ensureBadgeImageFonts', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Pretendard 스타일시트 <link>를 head에 넣고, load 전에는 document.fonts.load를 부르지 않는다', async () => {
    const { links, fontsLoad } = installFakeDocument()
    const { ensureBadgeImageFonts } = await importFresh()

    const pending = ensureBadgeImageFonts()

    expect(links).toHaveLength(1)
    expect(links[0].rel).toBe('stylesheet')
    expect(links[0].href).toContain('pretendard')
    expect(fontsLoad).not.toHaveBeenCalled()

    links[0].onload?.()
    await pending

    // 이름·설명·칩 세 크기 모두 700 굵기로 요청한다
    expect(fontsLoad).toHaveBeenCalledTimes(3)
    for (const call of fontsLoad.mock.calls) {
      expect(call[0]).toMatch(/^700 \d+px Pretendard$/)
    }
  })

  it('여러 번(동시 포함) 불러도 <link>는 한 번만 넣는다', async () => {
    const { doc, links } = installFakeDocument()
    const { ensureBadgeImageFonts } = await importFresh()

    const first = ensureBadgeImageFonts()
    const second = ensureBadgeImageFonts()
    links[0].onload?.()
    await Promise.all([first, second])
    await ensureBadgeImageFonts()

    expect(doc.head.appendChild).toHaveBeenCalledTimes(1)
    expect(links).toHaveLength(1)
  })

  it('스타일시트 로딩이 실패해도 reject하지 않고 진행하며, 다음 호출에서 다시 시도한다', async () => {
    const { links, fontsLoad } = installFakeDocument()
    const { ensureBadgeImageFonts } = await importFresh()

    const pending = ensureBadgeImageFonts()
    links[0].onerror?.()
    await expect(pending).resolves.toBeUndefined()

    expect(links[0].remove).toHaveBeenCalledTimes(1)
    expect(fontsLoad).toHaveBeenCalledTimes(3)

    const retry = ensureBadgeImageFonts()
    expect(links).toHaveLength(2)
    links[1].onload?.()
    await retry
  })

  it('document가 없는 환경에서는 아무것도 하지 않고 돌아온다', async () => {
    vi.stubGlobal('document', undefined)
    const { ensureBadgeImageFonts } = await importFresh()

    await expect(ensureBadgeImageFonts()).resolves.toBeUndefined()
  })
})
