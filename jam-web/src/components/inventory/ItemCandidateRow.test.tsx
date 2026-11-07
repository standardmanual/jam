/**
 * 개체 선택 시트 행의 잠긴 변형 (티켓 20261018_1817, 채원 사전 판정 2026-10-19)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더로 마크업만 고정한다. 잠긴 개체는 일련번호 자리에 «N 포인트 필요»를 보이고
 * 일련번호·만료 칩은 DOM 어디에도 없다. 열린 개체는 지금까지와 같다.
 *
 * `ListRow`는 행마다 `<style>`을 함께 내보내므로(티켓 20261107_1815) 텍스트·클래스 단언 전에 `render`가 style을 걷는다.
 */
import { describe, it, expect, vi } from 'vitest'
import type React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ItemCandidateRow from './ItemCandidateRow'
import { d } from '@/lib/i18n'

const soon = new Date(Date.now() + 86_400_000).toISOString()

/** 정적 마크업에서 `ListRow`의 `<style>`을 걷는다 — 그 안의 CSS 글자가 텍스트 검사를 오염시키지 않게 한다. */
const render = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/<style[\s\S]*?<\/style>/g, '')

describe('ItemCandidateRow 잠긴 변형', () => {
  const lockedRow = (points: number | null | undefined, extra: Record<string, unknown> = {}) =>
    render(
      <ItemCandidateRow
        candidate={{ id: 'a', serial_number: 777, serial_prefix: 'ZZZZ', expires_at: soon, locked: true, unlock_points_required: points, ...extra }}
        rarity="rare"
        onClick={vi.fn()}
      />
    )

  it('양수면 일련번호 자리에 «N 포인트 필요»를 보이고 일련번호·만료 칩·«잼»을 그리지 않는다', () => {
    const html = lockedRow(5)
    expect(html).toMatch(/<span class="text-point-text"[^>]*>5 포인트<\/span> 필요/)
    expect(html).not.toContain('ZZZZ')
    expect(html).not.toContain('000777')
    expect(html).not.toContain(d.inventory.expiringSuffix)
    expect(html).not.toContain('잼')
  })

  it('천 단위는 쉼표로 끊는다', () => {
    expect(lockedRow(1200)).toMatch(/<span class="text-point-text"[^>]*>1,200 포인트<\/span> 필요/)
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
    const html = render(
      <ItemCandidateRow candidate={{ id: 'a', serial_number: 5, serial_prefix: 'ABCD', expires_at: null }} rarity="common" onClick={vi.fn()} />
    )
    expect(html).not.toContain('필요')
    expect(html).toContain('000005')
  })
})

describe('ItemCandidateRow 개체별 등급 (티켓 20261028_1408)', () => {
  const base = { id: 'a', serial_number: 5, serial_prefix: 'ABCD', expires_at: null }

  it('개체에 등급이 있으면 행의 rarity prop보다 우선해 그 등급의 칩을 그린다', () => {
    const html = render(
      <ItemCandidateRow candidate={{ ...base, rarity: 'epic' }} rarity="rare" onClick={vi.fn()} />
    )
    expect(html).toContain('Epic')
    expect(html).not.toContain('Rare')
  })

  it('개체에 등급 키가 없으면 지금처럼 rarity prop의 칩을 그린다(드랍·픽업 시트 회귀 방지)', () => {
    const html = render(<ItemCandidateRow candidate={base} rarity="rare" onClick={vi.fn()} />)
    expect(html).toContain('Rare')
  })

  it('개체 등급이 Common이면 칩을 그리지 않는다', () => {
    const html = render(
      <ItemCandidateRow candidate={{ ...base, rarity: 'common' }} rarity={undefined} onClick={vi.fn()} />
    )
    expect(html).not.toContain('Common')
  })
})

describe('ItemCandidateRow ListRow 마크업 (티켓 20261107_1946)', () => {
  const open = { id: 'a', serial_number: 5, serial_prefix: 'ABCD', expires_at: null }

  it('선택한 행은 aria-pressed="true"를 갖는다', () => {
    const html = render(<ItemCandidateRow candidate={open} rarity="rare" selected onClick={vi.fn()} />)
    expect(html).toContain('aria-pressed="true"')
  })

  it('선택하지 않은 행에는 aria-pressed가 없다(고르면 실행되는 행이라 토글 의미를 주지 않는다)', () => {
    const html = render(<ItemCandidateRow candidate={open} rarity="rare" onClick={vi.fn()} />)
    expect(html).not.toContain('aria-pressed')
  })

  it('muted이면 <button disabled>라 클릭·Tab·Enter가 막힌다', () => {
    const html = render(<ItemCandidateRow candidate={open} rarity="rare" muted onClick={vi.fn()} />)
    expect(html).toMatch(/<button[^>]*\sdisabled=""/)
    expect(render(<ItemCandidateRow candidate={open} rarity="rare" onClick={vi.fn()} />)).not.toMatch(/<button[^>]*\sdisabled/)
  })

  it('만료 임박이면 칩에 «곧 만료»를 보인다', () => {
    const html = render(<ItemCandidateRow candidate={{ ...open, expires_at: soon }} rarity="rare" onClick={vi.fn()} />)
    expect(html).toContain(d.inventory.expiringSuffix)
  })

  it('만료가 7일보다 멀면 칩을 그리지 않는다', () => {
    const far = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const html = render(<ItemCandidateRow candidate={{ ...open, expires_at: far }} rarity="rare" onClick={vi.fn()} />)
    expect(html).not.toContain(d.inventory.expiringSuffix)
  })

  it('잠긴 개체에는 만료 칩이 없다', () => {
    const html = render(
      <ItemCandidateRow candidate={{ ...open, expires_at: soon, locked: true, unlock_points_required: 5 }} rarity="rare" onClick={vi.fn()} />
    )
    expect(html).not.toContain(d.inventory.expiringSuffix)
  })

  it('Common이거나 등급이 없으면 등급 칩 줄 자체가 없다(빈 eyebrow 줄 방지)', () => {
    const none = render(<ItemCandidateRow candidate={open} rarity={undefined} onClick={vi.fn()} />)
    const common = render(<ItemCandidateRow candidate={open} rarity="common" onClick={vi.fn()} />)
    expect(none).toBe(common)
    expect(none).not.toContain('margin-top:var(--list-row-line-gap)')
  })

  it('trailing은 trail 자리에 그려진다', () => {
    const html = render(<ItemCandidateRow candidate={open} rarity="rare" selected trailing={<span>처리 중</span>} onClick={vi.fn()} />)
    expect(html).toContain('ds-list-row-trail')
    expect(html).toContain('처리 중')
  })
})
