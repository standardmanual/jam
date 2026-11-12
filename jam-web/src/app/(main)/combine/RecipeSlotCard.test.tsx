/**
 * 레시피 믹서 슬롯 칸(티켓 20261110_1115) — 상태별 버튼·흐림·펄스·접근성 이름을 고정한다.
 * 저장소에 jsdom이 없어 정적 렌더(`renderToStaticMarkup`)로 마크업을 본다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RecipeSlotCard from './RecipeSlotCard'
import { d, t } from '@/lib/i18n'

const render = (props: Partial<React.ComponentProps<typeof RecipeSlotCard>> = {}) =>
  renderToStaticMarkup(<RecipeSlotCard status="addable" name="황금빛 도토리" imageUrl="https://example.com/a.png" {...props} />)

describe('RecipeSlotCard', () => {
  it('addable: 흐린 회색 칸 + «+» 버튼(배지 이름이 붙은 aria-label), 칸 본체는 버튼이 아니다 (컬렉션 상세의 넣을 수 있는 칸과 같다, 2026-11-11)', () => {
    const html = render()
    expect(html).toContain(`aria-label="${t(d.combine.slotAddAria, { name: '황금빛 도토리' })}"`)
    expect(html).toContain('grayscale opacity-40')
    expect(html).not.toContain('brightness-0')
    expect(html).toContain('text-muted opacity-60')
    // 회색 이미지 위에 윤곽 점선이 겹친다(이미지 래퍼의 형제, 추적 실패 때 사각형 대체는 없다 — 티켓 20261112_1627)
    expect(html).toContain('data-outline-state="loading"')
    expect(html).toContain('class="absolute inset-0 h-full w-full"')
    // 버튼은 «+» 하나뿐이다(카드 본체는 비대화형 div)
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).not.toContain('active:scale-95')
  })

  it('filled: «−» 버튼만 나오고 썸네일·이름은 선명하다', () => {
    const html = render({ status: 'filled' })
    expect(html).not.toContain('grayscale')
    expect(html).not.toContain('text-muted')
    expect(html).toContain(`aria-label="${t(d.combine.slotRemoveAria, { name: '황금빛 도토리' })}"`)
    expect(html).not.toContain(`aria-label="${t(d.combine.slotAddAria, { name: '황금빛 도토리' })}"`)
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('채운 칸에만 등급 올리기와 같은 3px 회색 안쪽 테두리가 있다(addable·unowned에는 없다)', () => {
    expect(render({ status: 'filled' })).toContain('ring-3 ring-inset ring-muted')
    expect(render({ status: 'addable' })).not.toContain('ring-muted')
    expect(render({ status: 'unowned' })).not.toContain('ring-muted')
    // dense와 함께여도 둘 다 붙는다
    const dense = render({ status: 'filled', dense: true })
    expect(dense).toContain('p-2!')
    expect(dense).toContain('ring-inset')
  })

  it('addable: «+»는 카드 모서리가 아니라 이미지 상자 정중앙의 틀 안에 있고, 4열(dense)이면 틀 여백이 줄어든다', () => {
    const html = render()
    expect(html).toContain('pointer-events-none absolute z-10 inset-x-3 top-3')
    expect(html).toContain('relative mx-auto flex aspect-square w-full max-w-[90px] items-center justify-center')
    expect(html).toContain('pointer-events-auto relative')
    expect(html).not.toContain('right-1.5 top-1.5')
    const dense = render({ dense: true })
    expect(dense).toContain('inset-x-2 top-2')
    expect(dense).not.toContain('inset-x-3 top-3')
  })

  it('filled: «−»는 기존대로 우상단 안쪽이고 틀이 없다', () => {
    const html = render({ status: 'filled' })
    expect(html).toContain('absolute right-1.5 top-1.5')
    expect(html).not.toContain('pointer-events-none')
    expect(html).not.toContain('data-outline-state')
  })

  it('unowned: 이미지 없이 윤곽 점선만(이미지 주소가 없으면 사각형 점선), 이름은 muted이고 버튼이 없다 (컬렉션 상세의 미발견 칸과 같다, 2026-11-11)', () => {
    const html = render({ status: 'unowned' })
    expect(html).not.toContain('<img')
    expect(html).toContain('data-outline-state="loading"')
    expect(render({ status: 'unowned', imageUrl: null })).toContain('data-outline-state="box"')
    expect(html).not.toContain('brightness-0')
    expect(html).not.toContain('grayscale opacity-40')
    expect(html).toContain('text-muted opacity-60')
    expect(html).not.toContain('<button')
  })

  it('펄스는 «+»에만 걸린다 — «−»·흐린 칸에는 걸리지 않는다', () => {
    expect(render({ pulse: true })).toContain('jam-quest-pulse')
    expect(render({ pulse: false })).not.toContain('jam-quest-pulse')
    expect(render({ status: 'filled', pulse: true })).not.toContain('jam-quest-pulse')
    expect(render({ status: 'unowned', pulse: true })).not.toContain('jam-quest-pulse')
  })

  it('제출 중(loading)이면 버튼이 비활성이다', () => {
    expect(render({ loading: true })).toMatch(/<button[^>]*disabled=""/)
    expect(render({ status: 'filled', loading: true })).toMatch(/<button[^>]*disabled=""/)
    expect(render()).not.toMatch(/<button[^>]*disabled=""/)
  })

  it('dense면 카드 안쪽 여백을 p-2!로 줄인다', () => {
    expect(render({ dense: true })).toContain('p-2!')
    expect(render()).not.toContain('p-2!')
  })
})
