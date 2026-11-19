/**
 * BadgeGridCard `bgColors` — 썸네일 면 Aura 배경 (티켓 20261119_1654)
 *
 * 저장소에 jsdom이 없어 서버 렌더 마크업으로 본다. «면의 자손인가»는 면 div를 여닫는 태그 수로 잘라 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import BadgeGridCard from '../BadgeGridCard'
import { auraBlurContainerCss, auraBlurPx } from '@/lib/badgeAura'

const COLORS = ['#e0e8ff', '#7090e0', '#203a8a']
const IMAGE = 'https://example.com/badge.png'
const TESTID = 'data-testid="badge-aura-background"'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(<BadgeGridCard rarity="epic" name="한강 마스터" imageUrl={IMAGE} {...props} />)

/** `marker`를 class에 가진 div의 안쪽 마크업(여닫는 div 수로 닫힘을 찾는다). 없으면 null */
function innerOf(html: string, marker: string): string | null {
  const m = new RegExp(`<div[^>]*class="[^"]*${marker}[^"]*"[^>]*>`).exec(html)
  if (!m) return null
  const start = m.index + m[0].length
  let depth = 1
  const re = /<div\b|<\/div>/g
  re.lastIndex = start
  for (let t = re.exec(html); t; t = re.exec(html)) {
    depth += t[0] === '</div>' ? -1 : 1
    if (depth === 0) return html.slice(start, t.index)
  }
  return null
}

const faceOf = (html: string, compact: boolean) => innerOf(html, compact ? 'rounded-xl overflow-hidden' : 'rounded-2xl overflow-hidden flex')

describe.each([
  { label: '일반', compact: false },
  { label: 'compact', compact: true },
])('BadgeGridCard bgColors — $label', ({ compact }) => {
  it('bgColors가 없거나 null이면 마크업이 변경 전과 같다(Aura·컨테이너·z-10 없음)', () => {
    const base = render({ compact })
    expect(base).not.toContain(TESTID)
    expect(base).not.toContain('container-type')
    expect(base).not.toContain('z-10')
    expect(render({ compact, bgColors: null })).toBe(base)
    expect(render({ compact, bgColors: undefined })).toBe(base)
  })

  it('색이 있으면 면 안에 Aura가 있고 이미지는 그 위(z-10)다. 입자는 없다', () => {
    const html = render({ compact, bgColors: COLORS })
    const face = faceOf(html, compact)
    expect(face).not.toBeNull()
    expect(face).toContain(TESTID)
    expect(face!.indexOf(TESTID)).toBeLessThan(face!.indexOf('<img'))
    expect(face!.match(/<img[^>]*>/)![0]).toContain('relative z-10')
    expect(html).not.toContain('soft-light')
  })

  it('이름은 면 밖(흰 카드 위)에 있어 Aura는 한 장뿐이고 이름 앞에서 끝난다', () => {
    const html = render({ compact, bgColors: COLORS })
    expect(html.match(new RegExp(TESTID, 'g'))).toHaveLength(1)
    expect(html.lastIndexOf(TESTID)).toBeLessThan(html.indexOf('한강 마스터</p>'))
  })

  it('locked에는 깔지 않는다', () => {
    expect(render({ compact, locked: true, bgColors: COLORS })).not.toContain(TESTID)
  })

  it('earned=false면 Aura가 grayscale opacity-40 면의 자손이다', () => {
    const html = render({ compact, earned: false, bgColors: COLORS })
    const dimmed = innerOf(html, 'grayscale opacity-40')
    expect(dimmed).not.toBeNull()
    expect(dimmed).toContain(TESTID)
  })

  it('earned=true면 흐림 래퍼가 없다', () => {
    expect(render({ compact, bgColors: COLORS })).not.toContain('opacity-40')
  })

  it('[]이면 청회색 대체색으로 그리고, 1~2색도 그린다', () => {
    expect(render({ compact, bgColors: [] })).toContain(TESTID)
    expect(render({ compact, bgColors: ['#7090e0'] })).toContain(TESTID)
    expect(render({ compact, bgColors: ['#e0e8ff', '#7090e0'] })).toContain(TESTID)
  })

  it('hex가 아닌 값이 섞이면 Aura 없이 지금 모습 그대로다', () => {
    expect(render({ compact, bgColors: ['red', '#7090e0'] })).toBe(render({ compact }))
  })
})

describe('BadgeGridCard bgColors — 일반 면만의 규칙', () => {
  it('undiscovered에는 깔지 않는다', () => {
    expect(render({ undiscovered: true, earned: false, bgColors: COLORS })).not.toContain(TESTID)
  })

  it('outlined: Aura는 흐림 래퍼 안, 점선은 래퍼 밖(불투명)이다', () => {
    const html = render({ earned: false, outlined: true, bgColors: COLORS })
    const dimmed = innerOf(html, 'grayscale opacity-40')!
    expect(dimmed).toContain(TESTID)
    expect(dimmed).not.toContain('data-outline-state')
    expect(html).toContain('data-outline-state')
  })
})

describe('BadgeGridCard bgColors — 블러 비율', () => {
  it('일반 면은 면 90px의 비율 블러(약 28px)이고 컨테이너 타입은 없다', () => {
    const html = render({ bgColors: COLORS })
    const px = auraBlurPx(90)
    expect(px).toBeGreaterThan(27)
    expect(px).toBeLessThan(29)
    expect(html.match(new RegExp(`filter:blur\\(${px}px\\)`, 'g'))).toHaveLength(2)
    expect(html).not.toContain('container-type')
  })

  it('compact 면은 면이 컨테이너이고 블러는 폭 비례(cqw) 길이다', () => {
    const html = render({ compact: true, bgColors: COLORS })
    expect(html).toContain('container-type:inline-size')
    expect(auraBlurContainerCss()).toBe('calc(0.3125 * 100cqw)')
    expect(html.match(/filter:blur\(calc\(0\.3125 \* 100cqw\)\)/g)).toHaveLength(2)
  })
})
