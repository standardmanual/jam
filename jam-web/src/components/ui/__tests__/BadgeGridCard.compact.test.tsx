/** BadgeGridCard compact 변형(티켓 20261114_2352) — 기본값 마크업 불변과 compact 규격, 잠긴 개체 가림을 서버 렌더로 고정한다. */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BadgeGridCard from '../BadgeGridCard'
import { d } from '@/lib/i18n'

describe('BadgeGridCard compact', () => {
  it('compact를 주지 않으면 기본 마크업 그대로다(p-3, bg-card-bg, 썸네일 90, text-sm)', () => {
    const html = renderToStaticMarkup(<BadgeGridCard name="이름" rarity="rare" onClick={() => {}} />)
    expect(html).toContain('p-3')
    expect(html).toContain('bg-card-bg')
    expect(html).toContain('max-w-[90px]')
    expect(html).toContain('text-sm font-bold')
    expect(html).not.toContain('bg-background-secondary')
    expect(renderToStaticMarkup(<BadgeGridCard name="이름" rarity="rare" onClick={() => {}} compact={false} />)).toBe(html)
  })

  it('compact는 여백 4·면 background-secondary·썸네일은 칸 폭에서 좌우 여백을 뺀 정사각형(모서리 12)·이름 12px 2줄·칩 줄 24다', () => {
    const html = renderToStaticMarkup(<BadgeGridCard compact name="이름" rarity="rare" count={3} countAriaText="3개" onClick={() => {}} />)
    expect(html).toContain('rounded-2xl p-1 overflow-hidden')
    expect(html).not.toMatch(/\sp-2[\s"]/)
    expect(html).not.toContain('p-3')
    expect(html).toContain('bg-background-secondary')
    expect(html).not.toContain('bg-card-bg')
    // 썸네일은 고정 56이 아니라 칸 폭을 채우는 정사각형이고 모서리는 카드 반경 16 − 여백 4 = 12(rounded-xl)이다 (티켓 20261115_2045)
    expect(html).not.toContain('w-14 h-14')
    expect(html).toContain('w-full aspect-square rounded-xl')
    expect(html).not.toContain('rounded-2xl overflow-hidden flex items-center justify-center bg-surface')
    expect(html).toContain('bg-surface')
    expect(html).toContain('text-xs font-bold')
    expect(html).toContain('line-clamp-2')
    expect(html).toContain('h-6')
    expect(html).toMatch(/aria-hidden="true">×3<\/span>/)
    expect(html).toContain('sr-only">3개')
    expect(html).toContain('>Rare<')
  })

  it('compact Common은 칩이 없어도 칩 줄이 남는다', () => {
    const html = renderToStaticMarkup(<BadgeGridCard compact name="이름" rarity="common" />)
    expect(html).not.toContain('>Common<')
    expect(html).toContain('h-6 flex')
  })

  it('compact 잠긴 개체는 이름·그림 주소가 DOM에 없다', () => {
    const html = renderToStaticMarkup(<BadgeGridCard compact locked name="비밀이름" imageUrl="https://example.com/secret.png" rarity="epic" />)
    expect(html).toContain(d.lockedItem.card.name)
    expect(html).not.toContain('비밀이름')
    expect(html).not.toContain('secret')
  })
})
