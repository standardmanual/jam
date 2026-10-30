/**
 * 개체 선택 시트 행의 잠긴 변형 (티켓 20261018_1817, 채원 사전 판정 2026-10-19)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더로 마크업만 고정한다. 잠긴 개체는 일련번호 자리에 «N 포인트 필요»를 보이고
 * 일련번호·만료 칩은 DOM 어디에도 없다. 열린 개체는 지금까지와 같다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ItemCandidateRow from './ItemCandidateRow'
import { d } from '@/lib/i18n'

const soon = new Date(Date.now() + 86_400_000).toISOString()

describe('ItemCandidateRow 잠긴 변형', () => {
  const lockedRow = (points: number | null | undefined, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      <ItemCandidateRow
        candidate={{ id: 'a', serial_number: 777, serial_prefix: 'ZZZZ', expires_at: soon, locked: true, unlock_points_required: points, ...extra }}
        rarity="rare"
        onClick={vi.fn()}
      />
    )

  it('양수면 일련번호 자리에 «N 포인트 필요»를 보이고 일련번호·만료 칩·«잼»을 그리지 않는다', () => {
    const html = lockedRow(5)
    expect(html).toContain('5 포인트 필요')
    expect(html).not.toContain('ZZZZ')
    expect(html).not.toContain('000777')
    expect(html).not.toContain(d.inventory.expiringSuffix)
    expect(html).not.toContain('잼')
  })

  it('천 단위는 쉼표로 끊는다', () => {
    expect(lockedRow(1200)).toContain('1,200 포인트 필요')
  })

  it('0이면 «포인트 없이 열 수 있어요»를 보인다', () => {
    const html = lockedRow(0)
    expect(html).toContain(d.lockedItem.detail.points.free)
    expect(html).not.toContain('포인트 필요')
  })

  it('값이 없으면(null) 등급 칩만 남기고 구분 줄을 그리지 않는다', () => {
    const html = lockedRow(null)
    expect(html).toContain('Rare')
    expect(html).not.toContain('포인트')
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

describe('ItemCandidateRow 개체별 등급 (티켓 20261028_1408)', () => {
  const base = { id: 'a', serial_number: 5, serial_prefix: 'ABCD', expires_at: null }

  it('개체에 등급이 있으면 행의 rarity prop보다 우선해 그 등급의 칩을 그린다', () => {
    const html = renderToStaticMarkup(
      <ItemCandidateRow candidate={{ ...base, rarity: 'epic' }} rarity="rare" onClick={vi.fn()} />
    )
    expect(html).toContain('Epic')
    expect(html).not.toContain('Rare')
  })

  it('개체에 등급 키가 없으면 지금처럼 rarity prop의 칩을 그린다(드랍·픽업 시트 회귀 방지)', () => {
    const html = renderToStaticMarkup(<ItemCandidateRow candidate={base} rarity="rare" onClick={vi.fn()} />)
    expect(html).toContain('Rare')
  })

  it('개체 등급이 Common이면 칩을 그리지 않는다', () => {
    const html = renderToStaticMarkup(
      <ItemCandidateRow candidate={{ ...base, rarity: 'common' }} rarity={undefined} onClick={vi.fn()} />
    )
    expect(html).not.toContain('Common')
  })
})
