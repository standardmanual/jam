/**
 * 컬렉션 카드의 칩 자리 (티켓 20261102_2300 → 20261114_1502 → 20261125_1113)
 *
 * 썸네일 위에는 등급 칩을 얹지 않는다. 완성 카드는 면이 검정이고 «완성» 칩 없이 맨 아래 행에 등급 칩(`rarities`, Common 포함)을 낮은 등급부터 놓는다.
 * 완성하지 않은 카드는 맨 아래 행에 진행 바와 «수집/전체» 숫자만 있고 등급 칩이 없다.
 * 서비스 카드와 디자인시스템 사본이 같은 규칙이어야 한다. 저장소에 jsdom이 없어(`environment: 'node'`) 서버 렌더 문자열로 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import CollectionGridCard from '../CollectionGridCard'
import { CollectionGridCard as DsCollectionGridCard } from '@ds/components/patterns/CollectionGridCard'

const cases = [
  ['서비스', (p: Record<string, unknown>) => renderToStaticMarkup(<CollectionGridCard name="컬렉션" collected={9} total={9} {...p} />)],
  ['MODULAR', (p: Record<string, unknown>) => renderToStaticMarkup(<DsCollectionGridCard name="컬렉션" collected={9} total={9} {...p} />)],
] as const

describe.each(cases)('CollectionGridCard 칩 자리 (%s)', (_label, render) => {
  it('완성 카드에는 «완성» 칩이 없고, 등급 칩이 이름보다 뒤(맨 아래 행)에 낮은 등급부터 나열되며 Common도 그린다', () => {
    const html = render({ completed: true, rarities: ['common', 'rare', 'mystic'] })
    expect(html).not.toContain('>완성<')
    expect(html.indexOf('Common')).toBeGreaterThan(html.indexOf('컬렉션</p>'))
    expect(html.indexOf('Rare')).toBeGreaterThan(html.indexOf('Common'))
    expect(html.indexOf('Mystic')).toBeGreaterThan(html.indexOf('Rare'))
    expect(html).not.toContain('Epic')
  })

  it('완성 카드의 면은 검정(--accent)이고 이름 글자는 --accent-foreground다. 그린 면이 아니다', () => {
    const html = render({ completed: true, rarities: ['epic'] })
    expect(html).toMatch(/bg-accent|background:var\(--accent\)/)
    expect(html).not.toMatch(/bg-jam-green|var\(--jam-green\)/)
    expect(html).toMatch(/text-accent-foreground|color:var\(--accent-foreground\)/)
  })

  it('완성 카드에는 진행 바와 «수집/전체» 숫자가 없다', () => {
    const html = render({ completed: true, rarities: ['rare'] })
    expect(html).not.toContain('9/9')
    expect(html).not.toContain('--capsule-track')
  })

  it('완성했지만 등급이 없으면 맨 아래 행에 칩이 없다', () => {
    const html = render({ completed: true })
    expect(html).not.toMatch(/Common|Rare|Epic|Mystic/)
    expect(html).not.toContain('>완성<')
  })

  it('완성하지 않았으면 등급 칩을 그리지 않고 진행 바·숫자를 그린다. 썸네일 위에도 칩이 없다', () => {
    const html = render({ rarities: ['epic'], collected: 3, total: 9 })
    expect(html).not.toMatch(/Common|Rare|Epic|Mystic/)
    expect(html).toContain('3/9')
    expect(html).toContain('--capsule-track')
    expect(html).not.toMatch(/top-2 left-2|top:\s*8px/)
  })

  it('진행 바 채움색은 홈 캡슐 게이지와 같은 --capsule-fill이다(강조색 그린이 아니다)', () => {
    const html = render({ collected: 3, total: 9 })
    expect(html).toContain('var(--capsule-fill)')
    expect(html).not.toContain('var(--jam-green)')
  })

  it('맨 아래 행은 완성·미완성 모두 최소 높이 20px이라 카드 높이가 같다', () => {
    const rowMin = (html: string) => html.includes('min-h-5') || html.includes('min-height:20px')
    expect(rowMin(render({ completed: true, rarities: ['common'] }))).toBe(true)
    expect(rowMin(render({ collected: 3, total: 9 }))).toBe(true)
  })
})
