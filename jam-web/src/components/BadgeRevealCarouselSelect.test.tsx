/**
 * MODULAR BadgeRevealCarousel — 선택 모드·슬롯·closeDisabled (티켓 20261017_1425 2회)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 구조를 고정한다(동작은 Storybook play가 본다). 고정하는 것:
 * - 기본값(`selectable` false, 슬롯 없음)에서는 선택 요소가 DOM에 없고 스테이지가 오버레이의 직계 자식이다(이전 배치 그대로).
 * - 선택 모드: 토글에 `aria-pressed`, 라벨은 `selectLabel`/`selectedLabel`, 선택된 카드만 링·체크 칩이 보인다.
 * - `selectionFull`이면 안 고른 카드 토글만 `aria-disabled`다(고른 카드는 해제할 수 있다).
 * - 슬롯: header는 스테이지 앞, footer는 스테이지 뒤에 오고 스테이지는 가운데 영역 안에 놓인다. 오버레이는 세로로 쌓인다.
 * - closeDisabled: 닫기 버튼이 soft disabled이고 onClick이 걸리지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/BadgeRevealCarouselSelect.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BadgeRevealCarousel } from '@ds/components/patterns/BadgeRevealCarousel'

const ITEMS = [
  { id: 'a', name: '바람의 깃', description: '', rarity: 'rare' as const },
  { id: 'b', name: '들꽃', description: '', rarity: 'common' as const },
  { id: 'c', name: '새벽 안개', description: '', rarity: 'epic' as const },
]

/** 오버레이(다이얼로그) 루트의 style 문자열 */
function rootStyle(html: string): string {
  return html.match(/^<div class="ds-badge-reveal"[^>]*style="([^"]*)"/)?.[1] ?? ''
}

function render(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(<BadgeRevealCarousel open items={ITEMS} {...props} />)
}

describe('기본 모드', () => {
  it('선택 요소가 DOM에 없다', () => {
    const html = render()

    expect(html).not.toContain('data-select-toggle')
    expect(html).not.toContain('aria-pressed')
    expect(html).not.toContain('var(--link)')
  })

  it('스테이지가 오버레이의 직계 자식이고 세로 배치로 바뀌지 않는다', () => {
    const html = render()

    expect(html).toMatch(/<div aria-live="polite"[^>]*>[^]*?<\/div><div role="group" aria-roledescription="carousel"/)
    expect(rootStyle(html)).not.toContain('flex-direction')
    expect(rootStyle(html)).toContain('align-items:center;justify-content:center')
  })

  it('닫기 버튼은 막히지 않는다', () => {
    expect(render()).not.toContain('aria-disabled="true"')
  })
})

describe('선택 모드', () => {
  it('카드마다 토글이 있고 aria-pressed로 선택 여부를 알린다', () => {
    const html = render({ selectable: true, selectedIds: ['b'] })

    expect(html.match(/data-select-toggle/g)).toHaveLength(3)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2)
  })

  it('라벨은 selectLabel / selectedLabel을 쓴다', () => {
    const html = render({ selectable: true, selectedIds: ['b'], selectLabel: '고르기', selectedLabel: '골랐어요' })

    expect(html.match(/>고르기</g)).toHaveLength(2)
    expect(html.match(/>골랐어요</g)).toHaveLength(1)
  })

  it('선택된 카드만 링과 체크 칩이 보인다(opacity 1), 나머지는 0이다', () => {
    const html = render({ selectable: true, selectedIds: ['b'] })

    const rings = html.match(/box-shadow:inset 0 0 0 2px var\(--link\);opacity:(\d)/g) ?? []
    expect(rings).toHaveLength(3)
    expect(rings.filter((r) => r.endsWith('opacity:1'))).toHaveLength(1)
    // 체크 칩: 면은 --accent, 체크는 --accent-foreground(글자·선에 --accent를 쓰지 않는다)
    expect(html).toContain('background:var(--accent);color:var(--accent-foreground)')
  })

  it('토글은 BadgeCard(aria-hidden) 밖에 있다 — 이름 문구가 든 aria-hidden 블록 안에 토글이 없다', () => {
    const html = render({ selectable: true, selectedIds: [] })
    const hiddenCards = html.match(/<div aria-hidden="true" style="width:100%;height:100%[^]*?<\/p><\/div>/g) ?? []

    expect(hiddenCards.length).toBeGreaterThan(0)
    for (const card of hiddenCards) expect(card).not.toContain('data-select-toggle')
  })

  it('가득 선택하면 안 고른 카드 토글만 aria-disabled다', () => {
    const html = render({ selectable: true, selectedIds: ['a', 'b'], selectionFull: true })
    const toggles = html.match(/<button[^>]*data-select-toggle[^>]*>/g) ?? []

    expect(toggles).toHaveLength(3)
    expect(toggles.filter((tag) => tag.includes('aria-disabled="true"'))).toHaveLength(1)
    expect(toggles.filter((tag) => tag.includes('aria-pressed="true"') && !tag.includes('aria-disabled'))).toHaveLength(2)
  })

  it('가득 차지 않았으면 어떤 토글도 aria-disabled가 아니다', () => {
    const html = render({ selectable: true, selectedIds: ['a'], selectionFull: false })

    expect(html).not.toContain('aria-disabled="true"')
  })

  it('중앙 카드 토글만 탭 순서에 있고 이웃 카드 토글은 tabindex -1이다', () => {
    const html = render({ selectable: true, selectedIds: [] })
    const toggles = html.match(/<button[^>]*data-select-toggle[^>]*>/g) ?? []

    expect(toggles.filter((tag) => tag.includes('tabindex="0"'))).toHaveLength(1)
    expect(toggles.filter((tag) => tag.includes('tabindex="-1"'))).toHaveLength(2)
  })
})

describe('슬롯', () => {
  it('header는 스테이지 앞, footer는 스테이지 뒤에 오고 스테이지는 가운데 영역에 놓인다', () => {
    const html = render({ header: <p>HEADER</p>, footer: <p>FOOTER</p> })

    const header = html.indexOf('HEADER')
    const stage = html.indexOf('aria-roledescription="carousel"')
    const footer = html.indexOf('FOOTER')
    expect(header).toBeGreaterThan(-1)
    expect(header).toBeLessThan(stage)
    expect(stage).toBeLessThan(footer)
    expect(rootStyle(html)).toContain('flex-direction:column')
    expect(html).toMatch(/<div style="flex:1 1 auto;min-height:0[^"]*"><div role="group"/)
  })

  it('header만 있어도 세로 배치다', () => {
    const html = render({ header: <p>HEADER</p> })

    expect(rootStyle(html)).toContain('flex-direction:column')
    expect(html).not.toContain('FOOTER')
  })
})

describe('closeDisabled', () => {
  it('닫기 버튼이 soft disabled다', () => {
    const html = render({ closeDisabled: true, closeLabel: '나중에', onClose: () => {} })
    const close = html.match(/<button[^>]*aria-label="나중에"[^>]*>/)?.[0] ?? ''

    expect(close).toContain('aria-disabled="true"')
  })

  it('기본값에서는 닫기 버튼이 막히지 않는다', () => {
    const html = render({ closeLabel: '나중에', onClose: () => {} })
    const close = html.match(/<button[^>]*aria-label="나중에"[^>]*>/)?.[0] ?? ''

    expect(close).not.toContain('aria-disabled')
  })
})
