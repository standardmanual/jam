/**
 * 내 배지 시트 셀 (티켓 20261022_2119 3회, 티켓 20261110_2150) — 인벤토리·컬렉션·배지 목록과 같은 `BadgeGridCard` 레이아웃으로 그린다
 * (캔버스 «JAM! 바텀시트» 07번). 활성만 버튼이고, 사용 중은 카드 아래 «사용 중», 미보유·비활성은 카드가 흐리다(미보유만 그림이 그레이스케일).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BagItemCell from './BagItemCell'
import { d } from '@/lib/i18n'

const noop = () => {}

function render(props: Partial<Parameters<typeof BagItemCell>[0]> = {}) {
  return renderToStaticMarkup(<BagItemCell name="캣닢 뭉치" imageUrl={null} state="active" onClick={noop} {...props} />)
}

describe('BagItemCell — BadgeGridCard 레이아웃', () => {
  it('active: 카드가 버튼이고 이름이 14px 굵은 글씨로 보인다', () => {
    const html = render({ state: 'active' })
    expect(html.startsWith('<button type="button"')).toBe(true)
    expect(html).toContain('active:scale-95')
    expect(html).toContain('캣닢 뭉치')
    expect(html).toContain('text-sm font-bold')
    expect(html).not.toContain(d.combine.bagUsedLabel)
    expect(html).not.toContain('opacity-40')
  })

  it('used: 버튼이 아니고 흐리지 않으며 카드 아래에 «사용 중»이 붙는다', () => {
    const html = render({ state: 'used' })
    expect(html.startsWith('<div')).toBe(true)
    expect(html).not.toContain('<button')
    expect(html).toContain(`<span class="text-xs text-muted">${d.combine.bagUsedLabel}</span>`)
    expect(html).not.toContain('opacity-40')
    expect(html).not.toContain('grayscale')
  })

  it('needed: 버튼이 아니고 카드가 흐리며 그림만 그레이스케일이다(라벨 없음)', () => {
    const html = render({ state: 'needed' })
    expect(html).not.toContain('<button')
    expect(html).toContain('opacity-40')
    expect(html).toContain('grayscale')
    expect(html).not.toContain(d.combine.bagUsedLabel)
  })

  it('inactive: 버튼이 아니고 카드만 흐리다 — 라벨도 그레이스케일도 없다(이유는 셀 밖 줄이 말한다)', () => {
    const html = render({ state: 'inactive' })
    expect(html).not.toContain('<button')
    expect(html).toContain('opacity-40')
    expect(html).not.toContain('grayscale')
    expect(html).not.toContain(d.combine.bagUsedLabel)
  })

  it('등급을 주면 등급 칩이 이름 아래에 보이고 Common이거나 없으면 칩이 없다', () => {
    expect(render({ rarity: 'rare' })).toContain('>Rare<')
    expect(render({ rarity: 'common' })).not.toContain('Common')
    expect(render({ rarity: null })).not.toContain('Rare')
  })

  it('pulse가 켜지면 퀘스트 펄스 클래스가 붙는다', () => {
    expect(render({ pulse: true })).toContain('jam-quest-pulse')
    expect(render({ pulse: false })).not.toContain('jam-quest-pulse')
  })
})
