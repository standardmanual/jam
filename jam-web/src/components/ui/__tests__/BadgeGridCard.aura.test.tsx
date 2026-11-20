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

const faceOf = (html: string, compact: boolean) => innerOf(html, compact ? 'rounded-xl overflow-hidden' : 'aspect-square rounded-2xl overflow-hidden flex')

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

describe('BadgeGridCard bgColors — 글로우 크기 비례', () => {
  it('일반 면은 카드 여백과 같은 두께의 안쪽 면이고, 배경은 파스텔 메시(그라데이션 한 장)다', () => {
    const html = render({ bgColors: COLORS })
    expect(html).toContain('data-variant="mesh"')
    expect(html).not.toContain('data-variant="glow"')
    // 메시는 블러 면·안쪽 빛·컨테이너 단위가 없다
    expect(html).not.toContain('filter:blur')
    expect(html).not.toContain('box-shadow:inset')
    expect(html).not.toContain('container-type')
    expect(html).not.toContain('cqw')
    // 폭은 칸 폭에서 좌우 여백을 뺀 값(90px 상한 없음)이고, 면 자신이 둥글다
    expect(html).toContain('<div class="relative w-full">')
    expect(html).not.toContain('max-w-[90px]')
    const face = faceOf(html, false)!
    expect(face).toContain('p-[4.4%]')
    expect(html).not.toContain('mix-blend-mode')
  })

  it('색이 없는 일반 면도 같은 크기다(한 그리드 안에서 어긋나지 않는다). 컨테이너 타입은 없다', () => {
    const html = render({})
    expect(html).toContain('<div class="relative w-full">')
    expect(html).not.toContain('max-w-[90px]')
    expect(html).toContain('rounded-2xl overflow-hidden flex')
    expect(html).not.toContain('container-type')
  })

  it('compact 면은 면이 컨테이너이고 블러·여유·안쪽 빛은 폭 비례(cqw)다', () => {
    const html = render({ compact: true, bgColors: COLORS })
    expect(html).toContain('container-type:inline-size')
    expect(html).toContain('data-variant="glow"')
    expect(html.match(/filter:blur\(7\.78cqw\)/g)).toHaveLength(1)
    expect(html).toContain('top:-15.56cqw')
    expect(html).toMatch(/box-shadow:inset 0 -[\d.]+cqw [\d.]+cqw [\d.]+cqw/)
  })

  it('earned=false면 그레이 배경이다(대표색이 없다) — 메시(일반)·글로우(compact) 모두', () => {
    const chromaOf = (html: string) => {
      const values = [...html.matchAll(/rgba\((\d+),(\d+),(\d+),|#([0-9a-f]{6})/g)].map((m) => {
        const rgb = m[4] ? [parseInt(m[4].slice(0, 2), 16), parseInt(m[4].slice(2, 4), 16), parseInt(m[4].slice(4), 16)] : [Number(m[1]), Number(m[2]), Number(m[3])]
        return Math.max(...rgb) - Math.min(...rgb)
      })
      return { count: values.length, max: Math.max(...values) }
    }
    for (const compact of [false, true]) {
      const earned = render({ compact, bgColors: COLORS })
      const unearned = render({ compact, earned: false, bgColors: COLORS })
      expect(unearned).not.toBe(earned)
      const start = unearned.indexOf('data-testid="badge-aura-background"')
      const end = unearned.indexOf('<img', start)
      const { count, max } = chromaOf(unearned.slice(start, end))
      expect(count).toBeGreaterThan(5)
      // 그레이 정지점은 모두 채도가 낮다(흰색 하이라이트 포함)
      expect(max).toBeLessThanOrEqual(12)
    }
  })
})
