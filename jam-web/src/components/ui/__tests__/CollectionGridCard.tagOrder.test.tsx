/**
 * 컬렉션 카드의 칩 자리 (티켓 20261102_2300 → 20261114_1502)
 *
 * 컬렉션은 처음 등록한 아이템 배지와 같은 등급만 담으므로 등급 칩은 하나다. 등급 칩은 썸네일 왼쪽 위에 놓인다.
 * «완성» 칩은 좌상단이 아니라 카드 맨 아래 행(진행 바·숫자가 있던 자리)에 놓이고, 완성 카드에는 바와 숫자가 없다.
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
  ['서비스', (p: Record<string, unknown>) => renderToStaticMarkup(<CollectionGridCard name="컬렉션" collected={9} total={9} {...p} />), '완성'],
  ['MODULAR', (p: Record<string, unknown>) => renderToStaticMarkup(<DsCollectionGridCard name="컬렉션" collected={9} total={9} {...p} />), '완성'],
] as const

describe.each(cases)('CollectionGridCard 칩 자리 (%s)', (_label, render, completedText) => {
  it('완성 칩은 등급 칩보다 뒤(맨 아래 행)에 오고, 이름보다도 뒤다', () => {
    const html = render({ completed: true, rarity: 'rare' })
    expect(html.indexOf(completedText)).toBeGreaterThan(-1)
    expect(html.indexOf('Rare')).toBeGreaterThan(-1)
    expect(html.indexOf(completedText)).toBeGreaterThan(html.indexOf('Rare'))
    expect(html.indexOf(completedText)).toBeGreaterThan(html.indexOf('컬렉션</p>'))
  })

  it('완성 칩은 한 번만 그린다', () => {
    const html = render({ completed: true, rarity: 'rare' })
    expect(html.split(completedText).length - 1).toBe(1)
  })

  it('완성 카드에는 진행 바와 «수집/전체» 숫자가 없다', () => {
    const html = render({ completed: true, rarity: 'rare' })
    expect(html).not.toContain('9/9')
    expect(html).not.toContain('--capsule-track')
  })

  it('완성했지만 등급이 없으면 맨 아래 칩만 그린다', () => {
    const html = render({ completed: true })
    expect(html).toContain(completedText)
    expect(html).not.toContain('Common')
  })

  it('완성하지 않았으면 등급 칩과 진행 바·숫자를 그리고 완성 칩은 없다', () => {
    const html = render({ rarity: 'epic', collected: 3, total: 9 })
    expect(html).toContain('Epic')
    expect(html).not.toContain(completedText)
    expect(html).toContain('3/9')
    expect(html).toContain('--capsule-track')
  })

  it('Common이고 완성하지 않았으면 등급·완성 칩을 그리지 않는다', () => {
    const html = render({ rarity: 'common' })
    expect(html).not.toContain('Common')
    expect(html).not.toContain(completedText)
  })

  it('맨 아래 행은 완성·미완성 모두 최소 높이 20px이라 카드 높이가 같다', () => {
    const rowMin = (html: string) => html.includes('min-h-5') || html.includes('min-height:20px')
    expect(rowMin(render({ completed: true }))).toBe(true)
    expect(rowMin(render({ collected: 3, total: 9 }))).toBe(true)
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
    // 색은 accent 검정 면(초록과 어울리게 바꾸지 않는다)
    expect(chip).toContain('background:var(--accent)')
    expect(chip).toContain('color:var(--accent-foreground)')
  })

  it('MODULAR: 같은 크기다', () => {
    const html = renderToStaticMarkup(<DsCollectionGridCard name="컬렉션" collected={9} total={9} completed rarity="rare" />)
    const chip = html.match(/<span style="([^"]*)">완성<\/span>/)?.[1] ?? ''
    const rarity = html.match(/<span[^>]*style="([^"]*)"[^>]*>Rare<\/span>/)?.[1] ?? ''

    for (const part of ['font-size:var(--text-xs)', 'padding:var(--chip-padding)', 'line-height:var(--text-xs--line-height)']) {
      expect(chip, part).toContain(part)
      expect(rarity, part).toContain(part)
    }
    expect(chip).toContain('background:var(--accent)')
    expect(chip).toContain('color:var(--accent-foreground)')
  })
})
