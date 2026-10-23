/**
 * 내 배지 시트 셀 (티켓 20261022_2119 3회) — `CombineClient.tsx`의 가방 셀을 그대로 옮긴 것이라 레시피 믹서의 렌더 결과가 달라지지 않아야 한다.
 * 기대 마크업은 옮기기 전 코드가 만들던 클래스 문자열을 그대로 적은 것이다(활성은 `active:scale-95`, 비활성은 `opacity-40`, 미보유만 그레이스케일).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BagItemCell from './BagItemCell'
import { d } from '@/lib/i18n'

const noop = () => {}
const BUTTON_BASE = 'flex flex-col items-center gap-1 p-2 rounded-2xl bg-background'
const IMAGE_BOX = 'w-16 h-16 rounded-2xl bg-surface flex items-center justify-center overflow-hidden'

function render(props: Partial<Parameters<typeof BagItemCell>[0]> = {}) {
  return renderToStaticMarkup(<BagItemCell name="캣닢 뭉치" imageUrl={null} state="active" onClick={noop} {...props} />)
}

describe('BagItemCell', () => {
  it('active: 누를 수 있고 눌림 효과만 있다', () => {
    const html = render({ state: 'active' })
    expect(html).toContain(`class="${BUTTON_BASE} active:scale-95"`)
    expect(html).not.toContain('disabled')
    expect(html).toContain(`class="${IMAGE_BOX} "`)
    expect(html).not.toContain(d.combine.bagUsedLabel)
  })

  it('used: 비활성 + «사용 중» 라벨', () => {
    const html = render({ state: 'used' })
    expect(html).toContain(`class="${BUTTON_BASE} opacity-40"`)
    expect(html).toContain('disabled')
    expect(html).toContain(`<span class="text-xs text-muted">${d.combine.bagUsedLabel}</span>`)
    expect(html).not.toContain('grayscale')
  })

  it('needed: 비활성 + 그림만 그레이스케일, 라벨 없음', () => {
    const html = render({ state: 'needed' })
    expect(html).toContain(`class="${BUTTON_BASE} opacity-40"`)
    expect(html).toContain(`class="${IMAGE_BOX} grayscale opacity-40"`)
    expect(html).not.toContain(d.combine.bagUsedLabel)
  })

  it('inactive: 비활성만 — 라벨도 그레이스케일도 없다(이유는 셀 밖 줄이 말한다)', () => {
    const html = render({ state: 'inactive' })
    expect(html).toContain(`class="${BUTTON_BASE} opacity-40"`)
    expect(html).toContain('disabled')
    expect(html).not.toContain('grayscale')
    expect(html).not.toContain(d.combine.bagUsedLabel)
  })

  it('이름은 두 줄까지 보인다', () => {
    expect(render({ name: '긴 이름의 배지' })).toContain('<p class="text-xs text-foreground text-center line-clamp-2">긴 이름의 배지</p>')
  })

  it('pulse가 켜지면 퀘스트 펄스 클래스가 붙는다', () => {
    expect(render({ pulse: true })).toContain(`class="${BUTTON_BASE} active:scale-95 jam-quest-pulse"`)
    expect(render({ pulse: false })).not.toContain('jam-quest-pulse')
  })
})
