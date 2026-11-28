/**
 * 등급 UP 결과 글자 묶음 시험 (티켓 20261127_2225) — 결과 배지 아래 설명 줄은 응답의 `description`이 있을 때만 그린다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TierUpGachaResultMeta, type TierUpGachaBadge } from './TierUpGachaStage'

const T = (ms: number) => ms
const base: TierUpGachaBadge = { name: '달빛 페이스메이커', rarity: 'rare', imageUrl: null, description: null }
const render = (badge: TierUpGachaBadge) => renderToStaticMarkup(<TierUpGachaResultMeta badge={badge} T={T} />)

describe('TierUpGachaResultMeta', () => {
  it('설명이 있으면 이름 아래에 설명 줄을 그린다(앞뒤 공백은 지운다)', () => {
    const html = render({ ...base, description: '  밤길을 함께 달려 주는 은은한 빛이에요.  ' })
    expect(html).toContain('data-tier-up-description')
    expect(html).toContain('>밤길을 함께 달려 주는 은은한 빛이에요.</p>')
    expect(html.indexOf('달빛 페이스메이커')).toBeLessThan(html.indexOf('밤길을 함께'))
  })

  it('설명이 없거나 공백뿐이면 설명 줄을 그리지 않는다', () => {
    for (const description of [null, '', '   ']) {
      const html = render({ ...base, description })
      expect(html).not.toContain('data-tier-up-description')
      expect(html).toContain('달빛 페이스메이커')
    }
  })

  it('«인벤토리에 담았어요» 문구는 더 이상 그리지 않는다', () => {
    expect(render({ ...base, description: '설명' })).not.toContain('인벤토리에 담았어요')
  })

  it('«한 번 더»는 보일 때 터치를 받는다 — 결과 영역(.reveal)이 터치를 막아도 버튼 자리는 다시 받는다(티켓 20261128_1258)', () => {
    const shown = renderToStaticMarkup(<TierUpGachaResultMeta badge={base} T={T} again={{ visible: true, onClick: () => {} }} />)
    expect(shown).toMatch(/pointer-events:auto[^"]*"><button/)
    const hidden = renderToStaticMarkup(<TierUpGachaResultMeta badge={base} T={T} again={{ visible: false, onClick: () => {} }} />)
    expect(hidden).toMatch(/pointer-events:none[^"]*"><button/)
  })
})
