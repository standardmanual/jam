/**
 * 배지 상세 히어로 어댑터 — Aura 배경 적용 조건과 우선순위 (티켓 20261119_1653)
 *
 * 배경 테마가 있으면 `bg_colors`는 읽지도 않고, NULL이면 지금의 흰 카드와 DOM이 같다.
 * 저장소에 jsdom이 없어(vitest environment: node) 서버 렌더 마크업으로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/__tests__/BadgeHeroSectionAura.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => <i data-testid="blob" /> }))

import BadgeHeroSection from '@/components/BadgeHeroSection'

const BADGE = {
  image_url: '/badges/sample/s331.png',
  name: '한강 러너',
  rarity: 'rare' as const,
  description: '한강을 달렸어요.',
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
}
const COLORS = ['#e0e8ff', '#7090e0', '#203a8a']

type HeroProps = Parameters<typeof BadgeHeroSection>[0]
const render = (extra: Omit<Partial<HeroProps>, 'badge'> & { badge?: Record<string, unknown> } = {}) => {
  const { badge, ...rest } = extra
  return renderToStaticMarkup(<BadgeHeroSection hasEarned {...rest} badge={{ ...BADGE, ...badge } as HeroProps['badge']} />)
}

describe('Aura 적용 조건', () => {
  it('bg_colors 3색이면 Aura를 깔고, 카드 바탕은 #faf8f2, 설명은 text-foreground다', () => {
    const html = render({ badge: { bg_colors: COLORS } })
    expect(html).toContain('badge-aura-background')
    expect(html.toLowerCase()).toContain('background-color:#faf8f2')
    expect(html).toMatch(/text-wrap! text-foreground/)
    expect(html).not.toContain('text-muted')
    expect(html).not.toContain('bg-transparent')
  })

  it('bg_colors가 NULL이거나 필드가 없으면 지금의 흰 카드와 DOM이 같다', () => {
    const base = render()
    expect(render({ badge: { bg_colors: null } })).toBe(base)
    expect(base).not.toContain('badge-aura-background')
    expect(base).toContain('bg-card-bg')
    expect(base).toContain('text-wrap! text-muted')
  })

  it('[]이면 청회색 대체색 Aura, 1색·2색이면 채움 후 Aura다', () => {
    expect(render({ badge: { bg_colors: [] } })).toContain('badge-aura-background')
    expect(render({ badge: { bg_colors: ['#3366cc'] } })).toContain('badge-aura-background')
    expect(render({ badge: { bg_colors: ['#3366cc', '#112244'] } })).toContain('badge-aura-background')
  })

  it('hex가 아닌 값이 섞이면 Aura 없이 흰 카드로 되돌린다(예외 없음)', () => {
    const html = render({ badge: { bg_colors: ['#3366cc', 'xxx'] } })
    expect(html).not.toContain('badge-aura-background')
    expect(html).toBe(render())
  })
})

describe('배경 테마 우선순위 — bg_colors를 무시한다', () => {
  it.each([
    ['background_color', { background_color: '#112233' }],
    ['background_image_url', { background_image_url: 'https://example.com/bg.png' }],
    ['background_video_url', { background_video_url: 'https://example.com/bg.mp4' }],
  ])('%s가 있으면 Aura가 없다', (_name, extra) => {
    const html = render({ badge: { ...extra, bg_colors: COLORS } })
    expect(html).not.toContain('badge-aura-background')
    expect(html).toContain('bg-transparent')
    expect(html).toBe(render({ badge: extra }))
  })

  it('카드 안 블롭 애니메이션이 있으면 블롭만 그린다', () => {
    const blob = { bgColor: '#555555' } as unknown as NonNullable<Parameters<typeof BadgeHeroSection>[0]['backgroundAnimation']>
    const html = render({ badge: { bg_colors: COLORS }, backgroundAnimation: blob })
    expect(html).toContain('data-testid="blob"')
    expect(html).not.toContain('badge-aura-background')
    expect(html).toBe(render({ backgroundAnimation: blob }))
  })

  it('themedBackground가 true로 강제되면(어드민 미리보기) Aura가 없다', () => {
    const html = render({ badge: { bg_colors: COLORS }, themedBackground: true })
    expect(html).not.toContain('badge-aura-background')
    expect(html).toBe(render({ themedBackground: true }))
  })
})

describe('그림자·이미지', () => {
  it('이미지에 drop-shadow가 없다', () => {
    expect(render({ badge: { bg_colors: COLORS } })).not.toContain('drop-shadow')
  })

  it('미획득이면 이미지에만 grayscale이고 Aura는 그대로다', () => {
    const html = render({ badge: { bg_colors: COLORS }, hasEarned: false })
    expect(html).toContain('badge-aura-background')
    expect(html).toContain('grayscale opacity-50')
    expect(html).not.toMatch(/badge-aura-background[^>]*grayscale/)
  })

  it('size=sheet에서도 Aura 구조가 같다', () => {
    const html = render({ badge: { bg_colors: COLORS }, size: 'sheet' })
    expect(html).toContain('badge-aura-background')
    expect(html).toContain('py-6 px-4')
  })
})
