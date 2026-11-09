/**
 * 탭바 반전의 푸터 감지 (티켓 20261109_1240, 상위 20261109_1143 «시점 = 탭바 세로 중간선»)
 *
 * 저장소에 jsdom이 없어 effect가 돌지 않는다. 그래서 감지 본체인 `watchFooterContact`를 가짜 관찰자·가짜 문서로 직접 돌리고,
 * 컴포넌트는 서버 렌더 마크업과 소스 배선으로 본다. 스크롤·실제 경계 깜빡임·푸터 로고 겹침은 실렌더(카리나) 몫이다.
 *
 * 고정하는 것
 *  - 푸터가 탭바 중간선에 닿으면 켜고 벗어나면 끈다. 켜는 경계와 끄는 경계 사이(12px)에서는 값을 지킨다
 *  - rootMargin 아래쪽은 getBoundingClientRect로 잰 «뷰포트 하단 → 중간선» 거리다(상수가 아니다)
 *  - 푸터가 없으면(/drops, /philosophy) false를 알리고 관찰자를 만들지 않는다
 *  - 다시 부르면(pathname 변경·숨김 복귀) 이전 관찰자는 해제되고 새로 만들어 현재 값을 다시 계산한다
 *  - 리사이즈는 거리가 달라졌을 때만 관찰자를 새로 만든다. 스크롤 핸들러는 없다
 *  - 1회차 구조: inverted로 data-inverted·필 색·아이콘 색이 바뀌고, prop이 감지 값보다 우선한다
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/TabBar.inverse.test.tsx
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ pathname: '/', hidden: false }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/uiOverlay', () => ({ useTabBarHidden: () => nav.hidden }))

import TabBar, { FOOTER_RELEASE_GAP, FOOTER_SELECTOR, footerRootMargin, measureMidlineDistance, watchFooterContact } from './TabBar'

class FakeIO {
  static all: FakeIO[] = []
  targets: unknown[] = []
  disconnected = false
  constructor(
    readonly cb: IntersectionObserverCallback,
    readonly init: IntersectionObserverInit,
  ) {
    FakeIO.all.push(this)
  }
  observe(t: unknown) {
    this.targets.push(t)
  }
  disconnect() {
    this.disconnected = true
  }
  fire(isIntersecting: boolean) {
    this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

// 뷰포트 높이 800, 탭바 49px가 top 741 → 중간선 y=765.5 → 하단에서 34.5 → 35px(반올림)
function setup({ footer = true, innerHeight = 800 }: { footer?: boolean; innerHeight?: number } = {}) {
  FakeIO.all = []
  const footerEl = { tag: 'footer' }
  const navEl = { getBoundingClientRect: vi.fn(() => ({ top: 741, height: 49 })) }
  const listeners = new Map<string, () => void>()
  const resizeCbs: (() => void)[] = []
  const resizeObserver = { observe: vi.fn(), disconnect: vi.fn() }
  const win = {
    innerHeight,
    addEventListener: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  }
  const querySelector = vi.fn((sel: string) => (footer && sel === FOOTER_SELECTOR ? footerEl : null))
  const onChange = vi.fn()
  const stop = watchFooterContact(navEl as unknown as Element, onChange, {
    doc: { querySelector } as unknown as Document,
    win: win as unknown as Window,
    createIntersectionObserver: (cb, init) => new FakeIO(cb, init) as unknown as IntersectionObserver,
    createResizeObserver: (cb) => {
      resizeCbs.push(cb)
      return resizeObserver
    },
  })
  return { footerEl, navEl, win, listeners, resizeCbs, resizeObserver, querySelector, onChange, stop }
}

const calls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => c[0])
const last = (fn: ReturnType<typeof vi.fn>) => calls(fn)[calls(fn).length - 1]

describe('기준선 실측', () => {
  it('뷰포트 하단에서 탭바 세로 중간선까지 거리를 잰다', () => {
    expect(measureMidlineDistance({ getBoundingClientRect: () => ({ top: 741, height: 49 }) } as unknown as Element, 800)).toBe(35)
    // safe-area가 커져 탭바가 위로 올라가면 거리도 달라진다
    expect(measureMidlineDistance({ getBoundingClientRect: () => ({ top: 717, height: 49 }) } as unknown as Element, 800)).toBe(59)
  })

  it('rootMargin 아래쪽은 그 거리를 음수로 준다', () => {
    expect(footerRootMargin(35)).toBe('0px 0px -35px 0px')
  })
})

describe('watchFooterContact 판정', () => {
  it('[data-jam-footer]를 관찰하고, 켜는 관찰자는 실측 거리, 끄는 관찰자는 12px 덜 줄인 거리를 쓴다', () => {
    const { footerEl, navEl } = setup()
    expect(navEl.getBoundingClientRect).toHaveBeenCalledTimes(1)
    expect(FakeIO.all).toHaveLength(2)
    expect(FakeIO.all[0].init.rootMargin).toBe('0px 0px -35px 0px')
    expect(FakeIO.all[1].init.rootMargin).toBe(`0px 0px -${35 - FOOTER_RELEASE_GAP}px 0px`)
    expect(FakeIO.all.every((o) => o.targets[0] === footerEl)).toBe(true)
  })

  it('중간선에 닿으면 켜고 벗어나면 끈다', () => {
    const { onChange } = setup()
    const [engage, release] = FakeIO.all
    engage.fire(false)
    release.fire(false)
    expect(last(onChange)).toBe(false)
    release.fire(true)
    engage.fire(true)
    expect(last(onChange)).toBe(true)
    engage.fire(false)
    release.fire(false)
    expect(last(onChange)).toBe(false)
  })

  it('켜는 경계와 끄는 경계 사이에서는 값을 지키고 같은 값을 다시 알리지 않는다', () => {
    const { onChange } = setup()
    const [engage, release] = FakeIO.all
    engage.fire(true) // 켜짐
    release.fire(true)
    expect(calls(onChange)).toEqual([true])
    engage.fire(false) // 켜는 경계는 벗어났지만 끄는 경계 안 — 유지
    expect(calls(onChange)).toEqual([true])
    release.fire(false) // 끄는 경계까지 벗어남
    expect(calls(onChange)).toEqual([true, false])
  })

  it('끄는 경계 안에서 시작하면(켜는 경계 밖) 꺼진 채로 둔다', () => {
    const { onChange } = setup()
    const [engage, release] = FakeIO.all
    release.fire(true)
    engage.fire(false)
    expect(last(onChange)).toBe(false)
  })

  it('푸터가 없으면 false를 알리고 관찰자도 리사이즈 감시도 만들지 않는다', () => {
    const { onChange, resizeCbs, win, stop } = setup({ footer: false })
    expect(calls(onChange)).toEqual([false])
    expect(FakeIO.all).toHaveLength(0)
    expect(resizeCbs).toHaveLength(0)
    expect(win.addEventListener).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })
})

describe('다시 걸기와 해제', () => {
  it('해제하면 관찰자·ResizeObserver·resize 리스너를 모두 거둔다', () => {
    const { stop, resizeObserver, win } = setup()
    stop()
    expect(FakeIO.all.every((o) => o.disconnected)).toBe(true)
    expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1)
    expect(win.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('다시 부르면(pathname 변경·숨김 복귀) 이전 관찰자는 해제되고 새 관찰자가 현재 값을 다시 알린다', () => {
    const first = setup()
    const oldObservers = [...FakeIO.all]
    first.stop()
    expect(oldObservers.every((o) => o.disconnected)).toBe(true)

    const second = setup() // setup이 FakeIO.all을 비우고 새로 만든다
    expect(FakeIO.all).toHaveLength(2)
    expect(FakeIO.all.some((o) => oldObservers.includes(o))).toBe(false)
    const [engage, release] = FakeIO.all
    release.fire(true)
    engage.fire(true)
    expect(last(second.onChange)).toBe(true)
  })

  it('리사이즈는 거리가 달라졌을 때만 관찰자를 새로 만들고, 스크롤 리스너는 걸지 않는다', () => {
    const { resizeCbs, listeners, navEl, win } = setup()
    resizeCbs[0]() // 같은 거리 — 그대로
    expect(FakeIO.all).toHaveLength(2)
    navEl.getBoundingClientRect.mockReturnValue({ top: 717, height: 49 })
    listeners.get('resize')?.()
    expect(FakeIO.all).toHaveLength(4)
    expect(FakeIO.all[0].disconnected && FakeIO.all[1].disconnected).toBe(true)
    expect(FakeIO.all[2].init.rootMargin).toBe('0px 0px -59px 0px')
    expect(win.addEventListener.mock.calls.map((c) => c[0])).toEqual(['resize'])
  })
})

describe('TabBar 배선과 1회차 구조', () => {
  const html = (props: { inverted?: boolean }) => renderToStaticMarkup(<TabBar username="jam" {...props} />)

  it('inverted로 data-inverted·필 색·아이콘 색이 바뀐다', () => {
    const off = html({ inverted: false })
    const on = html({ inverted: true })
    expect(off).toContain('data-inverted="false"')
    expect(on).toContain('data-inverted="true"')
    expect(off).toContain('var(--tabbar-selection)')
    expect(on).toContain('var(--tabbar-selection-inverse)')
    expect(off).toContain('var(--tabbar-icon)')
    expect(on).toContain('var(--tabbar-icon-inverse)')
    expect(on).toContain('jam-tabbar-chrome-inverse')
  })

  it('prop이 없으면 감지 전 첫 값은 false다(이전 페이지 값이 남지 않는 시작점)', () => {
    expect(html({})).toContain('data-inverted="false"')
  })

  it('감지 이펙트는 pathname과 숨김 상태가 바뀔 때 다시 걸리고, prop이 감지 값보다 우선하며, 스크롤 핸들러는 없다', () => {
    const src = readFileSync(path.join(__dirname, 'TabBar.tsx'), 'utf8')
    expect(src).toMatch(/return watchFooterContact\(nav, \(value\) => setDetected\(\{ pathname, value \}\)\)\s*\}, \[pathname, hidden\]\)/)
    expect(src).toContain('invertedProp ?? (detected.pathname === pathname && detected.value)')
    expect(src).not.toMatch(/addEventListener\('scroll'/)
  })

  it('숨김이면 아무것도 그리지 않는다', () => {
    nav.hidden = true
    try {
      expect(html({ inverted: true })).toBe('')
    } finally {
      nav.hidden = false
    }
  })

  it('Footer가 감지용 속성을 달고 있다', () => {
    const footer = readFileSync(path.join(__dirname, 'Footer.tsx'), 'utf8')
    expect(footer).toContain('<footer data-jam-footer ')
  })
})
