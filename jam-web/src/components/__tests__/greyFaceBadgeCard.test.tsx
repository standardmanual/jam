/**
 * 배지 카드 회색 단색 면 (티켓 20261125_1649) — Aura를 걷고 카드 면·이미지 면을 --background-secondary로 칠한다.
 * 저장소에 jsdom이 없어 서버 렌더 마크업으로 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => <i data-testid="blob" /> }))

import BadgeGridCard from '@/components/ui/BadgeGridCard'
import BadgeHeroSection from '@/components/BadgeHeroSection'
import VisitCountChip from '@/components/ui/VisitCountChip'

const COLORS = ['#e0e8ff', '#7090e0', '#203a8a']
const COMMON_BG = 'background:var(--rarity-common)'

describe('BadgeGridCard 회색 면', () => {
  it.each([false, true])('compact=%s: Aura 없이 카드 면·이미지 면이 회색이다', (compact) => {
    const html = renderToStaticMarkup(
      <BadgeGridCard name="한강" rarity="epic" imageUrl="https://example.com/b.png" compact={compact} bgColors={COLORS} />,
    )
    expect(html).not.toContain('badge-aura-background')
    expect(html).not.toContain('bg-card-bg')
    expect(html).not.toContain('bg-surface')
    expect((html.match(/bg-background-secondary/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('Lv 칩과 방문 ×N 칩은 Common 색이다', () => {
    const html = renderToStaticMarkup(<BadgeGridCard name="체크인" rarity={null} level={3} visitCount={4} imageUrl="https://example.com/b.png" />)
    expect(html.split(COMMON_BG).length - 1).toBe(2)
  })
})

describe('VisitCountChip tone', () => {
  it('기본은 default-soft, common이면 Common 색', () => {
    expect(renderToStaticMarkup(<VisitCountChip count={3} />)).toContain('var(--default-soft)')
    expect(renderToStaticMarkup(<VisitCountChip count={3} tone="common" />)).toContain(COMMON_BG)
  })
})

const BADGE = {
  image_url: '/badges/sample/s331.png',
  name: '한강 러너',
  rarity: 'rare' as const,
  description: '한강을 달렸어요.',
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
  level: 2,
  bg_colors: COLORS,
}
type HeroProps = Parameters<typeof BadgeHeroSection>[0]

describe('BadgeHeroSection 회색 면', () => {
  it('테마가 없으면 회색 단색이고 Aura가 없으며 Lv·×N 칩은 Common 색이다', () => {
    const html = renderToStaticMarkup(
      <BadgeHeroSection hasEarned badge={BADGE as HeroProps['badge']} chipExtra={<VisitCountChip count={4} />} />,
    )
    expect(html).not.toContain('badge-aura-background')
    expect(html).toContain('background-color:var(--background-secondary)')
    expect(html).toContain('Lv.2')
    expect(html.split(COMMON_BG).length - 1).toBe(2)
  })

  it('테마가 있으면 회색 면도 Common 칩도 쓰지 않는다', () => {
    const html = renderToStaticMarkup(
      <BadgeHeroSection hasEarned themedBackground badge={BADGE as HeroProps['badge']} />,
    )
    expect(html).not.toContain('--background-secondary')
    expect(html).not.toContain(COMMON_BG)
  })
})
