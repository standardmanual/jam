/**
 * DS BadgeHeroSection — size별 클래스, onMedia 글자색, 슬롯 렌더, 설명 없음 (티켓 20261112_1818)
 *
 * 저장소에 jsdom이 없어(vitest environment: node) 서버 렌더 마크업으로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/BadgeHeroSection.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BadgeHeroSection } from '@ds/components/cards/BadgeHeroSection'

const IMAGE = <div data-testid="image">이미지</div>

describe('DS BadgeHeroSection', () => {
  it('page는 바깥 여백 px-4 pt-0 pb-5와 카드 p-6, 흰 카드 면이다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection name="한강 러너" rarity="rare" imageSlot={IMAGE} />)
    expect(html).toContain('class="relative z-10 px-4 pt-0 pb-5"')
    expect(html).toMatch(/class="[^"]*rounded-2xl[^"]*gap-4 p-6[^"]*bg-card-bg"/)
    expect(html).not.toContain('bg-transparent')
    // backgroundColor를 안 넘기면 카드에 인라인 배경색이 없다(칩의 style은 별개)
    expect(html).not.toContain('background-color')
    expect(html).toMatch(/<h1 class="[^"]*text-foreground"/)
  })

  it('sheet는 바깥 여백이 없고 카드가 py-6 px-4다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection size="sheet" name="한강 러너" rarity="rare" imageSlot={IMAGE} />)
    expect(html).toContain('class="relative z-10"')
    expect(html).not.toContain('pb-5')
    expect(html).toContain('gap-4 py-6 px-4')
  })

  it('onMedia면 카드가 투명해지고 제목·설명이 모두 text-snow다', () => {
    const html = renderToStaticMarkup(
      <BadgeHeroSection onMedia name="새벽 러너" rarity="epic" descriptionLines={['첫째.', '둘째.']} imageSlot={IMAGE} />,
    )
    expect(html).toContain('bg-transparent')
    expect(html).not.toContain('bg-card-bg')
    expect(html).toMatch(/<h1 class="[^"]*text-snow"/)
    expect(html.match(/text-base text-center text-wrap! text-snow/g)).toHaveLength(2)
    expect(html).not.toContain('text-muted')
  })

  it('설명 줄은 줄마다 p 하나이고 평소에는 text-muted다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection name="한강 러너" descriptionLines={['첫째.', '둘째.']} imageSlot={IMAGE} />)
    expect(html.match(/<p /g)).toHaveLength(2)
    expect(html).toContain('text-wrap! text-muted')
  })

  it('슬롯과 폴백 값을 그린다: 이미지·배경·칩 옆 칩·제목·설명 노드·배경색·글자 style', () => {
    const html = renderToStaticMarkup(
      <BadgeHeroSection
        name="무시됨"
        rarity="rare"
        chipExtra={<span>잠김</span>}
        titleNode="가린 이름"
        descriptionNode="가린 설명"
        imageSlot={IMAGE}
        backgroundSlot={<i data-testid="bg" />}
        backgroundColor="var(--background-inverse)"
        onMedia
        textStyle={{ textShadow: 'none' }}
      />,
    )
    expect(html).toContain('data-testid="image"')
    expect(html).toContain('data-testid="bg"')
    // 배경 슬롯이 이미지보다 먼저(아래층) 놓인다
    expect(html.indexOf('data-testid="bg"')).toBeLessThan(html.indexOf('data-testid="image"'))
    expect(html).toContain('<div class="flex items-center gap-2">')
    expect(html).toContain('잠김')
    expect(html).toContain('>가린 이름</h1>')
    expect(html).not.toContain('무시됨')
    expect(html).toContain('>가린 설명</p>')
    expect(html).toContain('background-color:var(--background-inverse)')
    expect(html).toContain('text-shadow:none')
  })

  it('level이 있으면 Lv.N 칩을 그린다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection name="누적 러닝" level={7} imageSlot={IMAGE} />)
    expect(html).toContain('Lv.7')
  })

  it('설명이 없으면 설명 블록을 그리지 않는다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection name="한강 러너" rarity="rare" imageSlot={IMAGE} />)
    expect(html).not.toContain('<p')
    expect(html).not.toContain('gap-0.5')
  })
})
