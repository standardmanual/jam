/**
 * InventoryGrid 마크업 — 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import InventoryGrid, { InventoryGridItem } from './InventoryGrid'

const REAL_ITEM: InventoryGridItem = {
  id: 'real-item-1',
  badgeName: '실제 배지',
  badgeImageUrl: null,
  badgeRarity: 'common',
}

describe('InventoryGrid 잠긴 개체 (티켓 20261018_0054 2회)', () => {
  const LOCKED_ITEM: InventoryGridItem = {
    id: 'locked-item-1',
    // 서버가 비워서 내린 값 — 카드가 이 값에 기대지 않는다
    badgeName: '',
    badgeImageUrl: null,
    badgeRarity: 'rare',
    locked: true,
  }

  it('잠긴 개체는 가린 이름과 /inventory/[id] 링크, 등급 칩으로 그려지고 게이지는 없다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[REAL_ITEM, LOCKED_ITEM]} mode="navigate" />)
    expect(html).toContain(`href="/inventory/${LOCKED_ITEM.id}"`)
    expect(html).toContain('잠긴 아이템 배지')
    expect(html).toContain('Rare')
    expect(html).not.toContain('--ds-progress-fill')
    expect(html).not.toContain('role="progressbar"')
    // 일반 카드는 그대로다
    expect(html).toContain(REAL_ITEM.badgeName)
  })

  it('호출부가 실수로 이름과 그림 URL을 넘겨도 잠긴 카드의 DOM에 없다', () => {
    const leaky: InventoryGridItem = { ...LOCKED_ITEM, badgeName: '새어 나가면 안 되는 이름', badgeImageUrl: 'https://example.com/secret.png' }
    const html = renderToStaticMarkup(<InventoryGrid items={[leaky]} mode="navigate" />)
    expect(html).not.toContain('새어 나가면 안 되는 이름')
    expect(html).not.toContain('secret.png')
    expect(html).not.toContain('<img')
  })

  it('select 모드에서도 잠긴 개체는 잠김 카드로 그려진다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[LOCKED_ITEM]} mode="select" onSelect={() => {}} />)
    expect(html).toContain('잠긴 아이템 배지')
    expect(html).toContain('<button')
  })

  it('locked가 없는 항목에도 게이지가 없다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[REAL_ITEM]} mode="navigate" />)
    expect(html).not.toContain('--ds-progress-fill')
  })
})

describe('InventoryGrid 빈 슬롯 (티켓 20261114_1040 → 20261125_1444 치수 통일)', () => {
  it('빈 슬롯은 BadgeGridCardPlaceholder로 카드 면만 그리고 안쪽 회색 상자와 «+»는 없다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[REAL_ITEM]} mode="navigate" emptySlots={2} />)
    // 면은 채운 카드와 같은 회색(--background-secondary)을 옅게 깐다(티켓 20261125_1649)
    const placeholders = html.match(/<div class="flex flex-col items-center rounded-2xl p-3 overflow-hidden bg-background-secondary opacity-30"[\s\S]*?<div class="h-6"><\/div><\/div><\/div>/g) ?? []
    expect(placeholders).toHaveLength(2)
    expect(html).not.toContain('>+<')
    // 빈 슬롯 안쪽에는 회색 상자가 없다 — 썸네일 자리는 면 없는 정사각형뿐이다
    for (const p of placeholders) {
      expect(p).toContain('<div class="w-full aspect-square rounded-2xl"></div>')
      expect(p.match(/bg-/g)).toHaveLength(1)
    }
  })

  it('빈 슬롯도 채운 카드와 동일한 풀폭 aspect-square·text-sm 기하를 유지한다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[]} mode="navigate" emptySlots={1} />)
    expect(html).toContain('w-full aspect-square rounded-2xl')
    expect(html).toContain('text-sm font-bold')
    expect(html).not.toContain('w-[90px] h-[90px]')
  })
})
