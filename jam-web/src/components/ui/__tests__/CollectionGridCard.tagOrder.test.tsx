/**
 * 컬렉션 카드의 태그 행 순서 (티켓 20261102_2300)
 *
 * 컬렉션은 처음 등록한 아이템 배지와 같은 등급만 담으므로 등급 칩은 하나다. 칩은 썸네일 왼쪽 위에 «완성 → 등급» 순서로 놓인다.
 * 서비스 카드와 디자인시스템 사본이 같은 순서여야 한다. 저장소에 jsdom이 없어(`environment: 'node'`) 서버 렌더 문자열로 확인한다.
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
  ['서비스', (p: Record<string, unknown>) => renderToStaticMarkup(<CollectionGridCard name="컬렉션" collected={9} total={9} {...p} />), '완성'],
  ['MODULAR', (p: Record<string, unknown>) => renderToStaticMarkup(<DsCollectionGridCard name="컬렉션" collected={9} total={9} {...p} />), '완성'],
] as const

describe.each(cases)('CollectionGridCard 태그 행 (%s)', (_label, render, completedText) => {
  it('완성 칩이 등급 칩보다 앞에 온다', () => {
    const html = render({ completed: true, rarity: 'rare' })
    expect(html.indexOf(completedText)).toBeGreaterThan(-1)
    expect(html.indexOf('Rare')).toBeGreaterThan(html.indexOf(completedText))
  })

  it('완성하지 않았으면 등급 칩만 그린다', () => {
    const html = render({ rarity: 'epic' })
    expect(html).toContain('Epic')
    expect(html).not.toContain(completedText)
  })

  it('Common이고 완성하지 않았으면 태그 행을 그리지 않는다', () => {
    const html = render({ rarity: 'common' })
    expect(html).not.toContain('Common')
    expect(html).not.toContain(completedText)
  })
})

describe('CollectionGridCard 완성 칩의 크기 (2026-11-11 사용자 지시, 이전 sm 8px에서 md로)', () => {
  it('서비스: 등급 칩(RarityBadge md: 글자 12px, 패딩 --chip-padding, 줄 높이 16px)과 같은 크기다', () => {
    const html = renderToStaticMarkup(<CollectionGridCard name="컬렉션" collected={9} total={9} completed rarity="rare" />)
    const chip = html.match(/<span[^>]*style="([^"]*)"[^>]*>완성<\/span>/)?.[1] ?? ''
    const rarity = html.match(/<span[^>]*style="([^"]*)"[^>]*>Rare<\/span>/)?.[1] ?? ''

    expect(rarity).toContain('font-size:var(--text-xs)')
    expect(rarity).toContain('padding:var(--chip-padding)')
    expect(rarity).toContain('line-height:var(--text-xs--line-height)')
    // 완성 칩은 ListRowChip이라 크기를 인라인 토큰으로 정한다(손으로 만든 Tailwind 클래스가 아니다)
    for (const part of ['font-size:var(--text-xs)', 'padding:var(--chip-padding)', 'line-height:var(--text-xs--line-height)']) expect(chip, part).toContain(part)
    expect(chip).not.toContain('text-[8px]')
  })

  it('MODULAR: 같은 크기다', () => {
    const html = renderToStaticMarkup(<DsCollectionGridCard name="컬렉션" collected={9} total={9} completed rarity="rare" />)
    const chip = html.match(/<span style="([^"]*)">완성<\/span>/)?.[1] ?? ''
    const rarity = html.match(/<span[^>]*style="([^"]*)"[^>]*>Rare<\/span>/)?.[1] ?? ''

    for (const part of ['font-size:var(--text-xs)', 'padding:var(--chip-padding)', 'line-height:var(--text-xs--line-height)']) {
      expect(chip, part).toContain(part)
      expect(rarity, part).toContain(part)
    }
  })
})
