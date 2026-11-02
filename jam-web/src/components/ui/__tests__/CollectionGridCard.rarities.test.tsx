/**
 * 컬렉션 카드의 칩 행 (티켓 20261102_2300)
 *
 * 확인하는 것: ① 완성 칩이 먼저, 등급 칩이 그 뒤 순서로 그려진다 ② Common은 그려지지 않고, 칩이 하나도
 * 없으면 빈 행 div도 남지 않는다 ③ 좁은 폭에서 줄바꿈되도록 right-2 + flex-wrap이다 ④ 서비스·MODULAR가 같다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ServiceCollectionGridCard from '../CollectionGridCard'
import { CollectionGridCard as DsCollectionGridCard } from '@ds/components/patterns/CollectionGridCard'

const props = { name: '컬렉션', collected: 3, total: 10 }

const cases = [
  { label: '서비스', Card: ServiceCollectionGridCard, completedMark: 'bg-accent text-accent-foreground', rowMark: 'absolute top-2 left-2 right-2 flex flex-wrap' },
  { label: 'MODULAR', Card: DsCollectionGridCard, completedMark: 'background:var(--accent)', rowMark: 'flex-wrap:wrap' },
] as const

describe.each(cases)('CollectionGridCard 칩 행 — $label', ({ Card, completedMark, rowMark }) => {
  it('완성 칩이 등급 칩보다 앞에 오고, 등급은 주어진 순서대로 나온다', () => {
    const html = renderToStaticMarkup(<Card {...props} completed rarities={['rare', 'epic', 'mystic']} />)
    const completed = html.indexOf('완성')
    const rare = html.indexOf('Rare')
    const epic = html.indexOf('Epic')
    const mystic = html.indexOf('Mystic')
    expect(completed).toBeGreaterThan(-1)
    expect(completed).toBeLessThan(rare)
    expect(rare).toBeLessThan(epic)
    expect(epic).toBeLessThan(mystic)
    expect(html).toContain(completedMark)
  })

  it('완성하지 않으면 등급 칩만 나온다', () => {
    const html = renderToStaticMarkup(<Card {...props} rarities={['rare', 'epic']} />)
    expect(html).not.toContain('완성')
    expect(html).toContain('Rare')
    expect(html).toContain('Epic')
  })

  it('완성만 있고 등급이 없으면 완성 칩만 나온다', () => {
    const html = renderToStaticMarkup(<Card {...props} completed />)
    expect(html).toContain('완성')
    expect(html).not.toContain('Rare')
  })

  it('Common만 있으면 칩도 빈 행도 그리지 않는다', () => {
    const html = renderToStaticMarkup(<Card {...props} rarities={['common']} />)
    expect(html).not.toContain('Common')
    expect(html).not.toContain(rowMark)
  })

  it('등급이 undefined이거나 빈 배열이면 행을 그리지 않는다', () => {
    expect(renderToStaticMarkup(<Card {...props} />)).not.toContain(rowMark)
    expect(renderToStaticMarkup(<Card {...props} rarities={[]} />)).not.toContain(rowMark)
  })

  it('칩이 있으면 줄바꿈되는 행이다', () => {
    expect(renderToStaticMarkup(<Card {...props} rarities={['mystic']} />)).toContain(rowMark)
  })
})
