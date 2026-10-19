/**
 * 개체 선택 시트 행의 잠긴 변형 (티켓 20261018_1817, 채원 사전 판정 2026-10-19)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더로 마크업만 고정한다. 잠긴 개체는 일련번호 자리에 «잼 N 필요»를 보이고
 * 일련번호·만료 칩은 DOM 어디에도 없다. 열린 개체는 지금까지와 같다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ItemCandidateRow from './ItemCandidateRow'
import { d } from '@/lib/i18n'

const soon = new Date(Date.now() + 86_400_000).toISOString()

describe('ItemCandidateRow 잠긴 변형', () => {
  it('일련번호 자리에 필요한 양을 보이고 일련번호·만료 칩을 그리지 않는다', () => {
    const html = renderToStaticMarkup(
      <ItemCandidateRow
        candidate={{ id: 'a', serial_number: 777, serial_prefix: 'ZZZZ', expires_at: soon, locked: true, unlock_required: 12 }}
        rarity="rare"
        onClick={vi.fn()}
      />
    )
    expect(html).toContain('잼 12 필요')
    expect(html).not.toContain('ZZZZ')
    expect(html).not.toContain('000777')
    expect(html).not.toContain(d.inventory.expiringSuffix)
  })

  it('필요한 양이 없는 비정상 응답이면 구분 줄을 생략한다', () => {
    const html = renderToStaticMarkup(
      <ItemCandidateRow candidate={{ id: 'a', serial_number: 0, serial_prefix: null, expires_at: null, locked: true, unlock_required: null }} rarity="rare" onClick={vi.fn()} />
    )
    expect(html).not.toContain('필요')
  })

  it('열린 개체는 일련번호를 보인다(회귀 방지)', () => {
    const html = renderToStaticMarkup(
      <ItemCandidateRow candidate={{ id: 'a', serial_number: 5, serial_prefix: 'ABCD', expires_at: null }} rarity="common" onClick={vi.fn()} />
    )
    expect(html).not.toContain('필요')
    expect(html).toContain('000005')
  })
})
