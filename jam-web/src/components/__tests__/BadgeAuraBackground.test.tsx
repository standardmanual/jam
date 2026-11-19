/**
 * BadgeAuraBackground — 레이어 두 장 + 입자, 격리 루트 (티켓 20261119_1653)
 *
 * 저장소에 jsdom이 없어(vitest environment: node) 서버 렌더 마크업으로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/__tests__/BadgeAuraBackground.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BadgeAuraBackground from '@/components/BadgeAuraBackground'
import { AURA_BASE_COLOR, AURA_BLUR_DETAIL_PX, AURA_GLOW_BASE_COLOR, AURA_GLOW_GRAY_COLORS, AURA_GLOW_TUNING, auraGlowInsetShadow, auraGlowLayers, auraLayers, tuneAuraColors } from '@/lib/badgeAura'

const COLORS = ['#e0e8ff', '#7090e0', '#203a8a']

describe('BadgeAuraBackground', () => {
  it('루트는 카드 안에 갇히는 장식 면이다 — 격리·라운드 상속·aria-hidden·터치 통과', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)
    const root = /<div[^>]*data-testid="badge-aura-background"[^>]*>/.exec(html)?.[0] ?? ''
    expect(root).toContain('aria-hidden="true"')
    expect(root).toContain('absolute inset-0')
    expect(root).toContain('isolate')
    expect(root).toContain('overflow-hidden')
    expect(root).toContain('rounded-[inherit]')
    expect(root).toContain('pointer-events-none')
    expect(root.toLowerCase()).toContain(`background-color:${AURA_BASE_COLOR}`)
  })

  it('레이어 두 장은 multiply·blur 100px, 입자는 soft-light 불투명도 .55다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)
    expect(html.match(/mix-blend-mode:multiply/g)).toHaveLength(2)
    expect(html.match(new RegExp(`filter:blur\\(${AURA_BLUR_DETAIL_PX}px\\)`, 'g'))).toHaveLength(2)
    expect(html).toContain('mix-blend-mode:soft-light')
    expect(html).toContain('opacity:0.55')
    expect(html).toContain('feTurbulence'.replace(/./g, (c) => encodeURIComponent(c)))
  })

  it('레이어는 auraLayers의 두 그라데이션 그대로다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)
    const [l1, l2] = auraLayers(COLORS)
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    expect(html).toContain(esc(l1))
    expect(html).toContain(esc(l2))
  })

  it('blurPx로 블러 반경을 바꾼다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} blurPx={24} />)
    expect(html.match(/filter:blur\(24px\)/g)).toHaveLength(2)
    expect(html).not.toContain('blur(100px)')
  })

  it('grain=false면 입자 겹이 없다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} grain={false} />)
    expect(html).not.toContain('soft-light')
  })

  it('[]이면 대체색으로 그리고, hex가 아닌 값이 섞였으면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<BadgeAuraBackground colors={[]} />)).toContain('badge-aura-background')
    expect(renderToStaticMarkup(<BadgeAuraBackground colors={['#aabbcc', 'nope']} />)).toBe('')
  })

  it('blurLength는 blurPx보다 앞서는 CSS 길이다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} blurPx={24} blurLength="calc(0.3125 * 100cqw)" />)
    expect(html.match(/filter:blur\(calc\(0\.3125 \* 100cqw\)\)/g)).toHaveLength(2)
    expect(html).not.toContain('blur(24px)')
  })

  it('variant="glow"는 그라데이션 세 장과 안쪽 빛이다 — 블러·블렌드·입자가 없고 바탕은 흰색이다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} variant="glow" />)
    expect(html).toContain('data-variant="glow"')
    expect(AURA_GLOW_BASE_COLOR).toBe('#ffffff')
    expect(html.toLowerCase()).toContain(`background-color:${AURA_GLOW_BASE_COLOR}`)
    expect(html.match(/linear-gradient\(to bottom/g)).toHaveLength(1)
    expect(html.match(/radial-gradient\(ellipse/g)).toHaveLength(2)
    expect(html).toContain('box-shadow:inset')
    expect(html).not.toContain('mix-blend-mode')
    expect(html).not.toContain('filter:blur')
    expect(html).not.toContain('soft-light')
  })

  it('선형은 진한 색이 위, 흰색이 아래이고 맨 아래 구간은 순백이다 — 정지점이 촘촘하다', () => {
    const linear = auraGlowLayers(COLORS).find((l) => l.startsWith('linear-gradient')) ?? ''
    const stops = linear.replace('linear-gradient(to bottom, ', '').replace(/\)$/, '').split(', ')
    expect(stops.length).toBeGreaterThanOrEqual(12)
    expect(stops[0]).not.toContain(AURA_GLOW_BASE_COLOR)
    expect(stops.slice(-3).every((st) => st.startsWith(AURA_GLOW_BASE_COLOR))).toBe(true)
  })

  it('대표색 3개 중 밝은 색은 쓰지 않고 2개(중간·진한 색)만 쓴다', () => {
    const [light] = tuneAuraColors(COLORS, AURA_GLOW_TUNING)
    expect(auraGlowLayers(COLORS).join(' ')).not.toContain(light)
  })

  it('위쪽 타원은 진한 색이 위 가운데(at 50% 0%)에서 투명으로 풀린다', () => {
    const radial = auraGlowLayers(COLORS).find((l) => l.includes('at 50% 0%')) ?? ''
    expect(radial.startsWith('radial-gradient')).toBe(true)
    expect(radial).toContain(',0) 100%)')
  })

  it('안쪽 빛은 밝은 색 inset 그림자 두 겹이다', () => {
    const shadow = auraGlowInsetShadow(COLORS)
    expect(shadow.match(/inset/g)).toHaveLength(2)
  })

  it('gray면 대표색 대신 무채색으로 깐다(미획득) — 선형의 모든 정지점이 무채색이다', () => {
    const chroma = (layers: string[]) => {
      const linear = layers.find((l) => l.startsWith('linear-gradient')) ?? ''
      return Math.max(
        ...[...linear.matchAll(/#([0-9a-f]{6})/g)].map((m) => {
          const n = parseInt(m[1], 16)
          const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
          return Math.max(...rgb) - Math.min(...rgb)
        }),
      )
    }
    expect(chroma(auraGlowLayers(COLORS, { gray: true }))).toBeLessThanOrEqual(12)
    expect(chroma(auraGlowLayers(COLORS))).toBeGreaterThan(20)
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} variant="glow" gray />)
    expect(html).toContain('data-variant="glow"')
  })

  it('will-change와 drop-shadow를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)
    expect(html).not.toContain('will-change')
    expect(html).not.toContain('drop-shadow')
  })
})
