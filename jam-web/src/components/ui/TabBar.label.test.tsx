/**
 * 탭바 활성 탭 이름표 (티켓 20261114_1418)
 *
 * 저장소에 jsdom이 없어 effect가 돌지 않는다. 그래서 서버 렌더 마크업으로 «어느 탭에 이름표가 붙는가»를 고정하고,
 * 슬롯 폭 계산(`computeSlotLayout`)은 순수 함수로 직접 돌린다. 슬롯과 필이 미끄러지는 모습·글자 세로 위치·Safari 눌림은 실렌더 몫이다.
 *
 * 고정하는 것
 *  - 활성 경로마다 그 탭 이름표만 마크업에 있고 나머지 4개는 없다. 활성이 없는 경로에는 이름표가 없다
 *  - 이름표는 aria-hidden이고 aria-label과 같은 글자다. 세 번째 탭 이름은 «체크인»이다
 *  - 파생 활성(?from=badges·?from=inventory)과 타인 열람(?u=)은 isActive 결과를 그대로 따른다
 *  - 슬롯 폭: 활성 = 여백 10 + 24 + 6 + 이름표 + 여백 10, 비활성 4개는 44px 아래로 줄지 않고, 합이 안쪽 폭과 같다
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/TabBar.label.test.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ pathname: '/', search: '' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/uiOverlay', () => ({ useTabBarHidden: () => false }))

import TabBar, { computeSlotLayout } from './TabBar'

const LABELS = ['투데이', '배지', '체크인', '미션', '인벤토리']

function render(pathname: string, search = '') {
  nav.pathname = pathname
  nav.search = search
  return renderToStaticMarkup(<TabBar username="jam" />)
}

/** 마크업에서 이름표 span이 담은 글자만 뽑는다 */
function visibleLabels(html: string): string[] {
  return [...html.matchAll(/<span[^>]*data-jam-tabbar-label[^>]*>([^<]*)<\/span>/g)].map((m) => m[1])
}

describe('활성 탭에만 이름표', () => {
  const cases: [string, string][] = [
    ['/', '투데이'],
    ['/badges', '배지'],
    ['/drops', '체크인'],
    ['/missions', '미션'],
    ['/inventory', '인벤토리'],
  ]

  it.each(cases)('%s 에서는 «%s» 이름표만 보인다', (pathname, label) => {
    const html = render(pathname)
    expect(visibleLabels(html)).toEqual([label])
    for (const other of LABELS.filter((l) => l !== label)) {
      expect(visibleLabels(html)).not.toContain(other)
    }
  })

  it.each(['/profile', '/search', '/notifications'])('활성 탭이 없는 %s 에는 이름표가 없다', (pathname) => {
    const html = render(pathname)
    expect(visibleLabels(html)).toEqual([])
    expect(html).not.toContain('aria-current="page"')
  })

  it('파생 활성은 isActive 결과를 따른다', () => {
    expect(visibleLabels(render('/collections/abc', 'from=badges'))).toEqual(['배지'])
    expect(visibleLabels(render('/badges/xyz', 'from=inventory'))).toEqual(['인벤토리'])
    expect(visibleLabels(render('/badges/xyz', 'u=other'))).toEqual([])
  })

  it('이름표는 보조기기에서 숨기고, aria-label은 보이는 글자와 같은 값이다', () => {
    const html = render('/drops')
    expect(html).toMatch(/<span aria-hidden="true" data-jam-tabbar-label[^>]*>체크인<\/span>/)
    expect(html).toContain('aria-label="체크인"')
    expect(html).not.toContain('aria-label="JAM"')
    for (const l of LABELS) expect(html).toContain(`aria-label="${l}"`)
  })
})

describe('슬롯 폭 계산', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

  it('360px(안쪽 310)에서 «인벤토리»(약 52px)가 활성이면 활성 102, 비활성 52', () => {
    const l = computeSlotLayout(310, 5, 4, 52)
    expect(l.widths[4]).toBe(102)
    expect(l.widths.slice(0, 4)).toEqual([52, 52, 52, 52])
    expect(l.pillWidth).toBe(102)
    expect(l.pillLeft).toBe(4 + 52 * 4)
    expect(sum(l.widths)).toBe(310)
  })

  it('320px(안쪽 270)에서는 활성 슬롯 여백이 줄어 94가 되고 비활성은 44px를 지킨다', () => {
    const l = computeSlotLayout(270, 5, 4, 52)
    expect(l.widths[4]).toBe(94)
    expect(l.widths.slice(0, 4)).toEqual([44, 44, 44, 44])
    expect(sum(l.widths)).toBe(270)
  })

  it('필의 왼쪽 끝은 앞쪽 슬롯 폭의 합 + nav 패딩이고 필 폭은 활성 슬롯 폭과 같다', () => {
    const l = computeSlotLayout(310, 5, 2, 39)
    expect(l.pillLeft).toBe(4 + l.widths[0] + l.widths[1])
    expect(l.pillWidth).toBe(l.widths[2])
  })

  it('활성이 없으면 균등 폭이고 필은 없다', () => {
    const l = computeSlotLayout(310, 5, -1, 0)
    expect(l.widths).toEqual([62, 62, 62, 62, 62])
    expect(l.pillLeft).toBeNull()
  })

  it('388px 고정폭(안쪽 380)에서도 합이 안쪽 폭과 같다', () => {
    const l = computeSlotLayout(380, 5, 0, 39)
    expect(sum(l.widths)).toBeCloseTo(380)
    expect(Math.min(...l.widths)).toBeGreaterThanOrEqual(44)
  })
})
