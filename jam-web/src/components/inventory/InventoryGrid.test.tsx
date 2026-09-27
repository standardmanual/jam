/**
 * InventoryGrid `leadingItem` prop (티켓 20260928_0137, 상위 20260927_2123 T2b).
 *
 * 저장소에 jsdom·testing-library가 없어(`OnboardingSyncButton.test.tsx`와 같은 방식)
 * 서버 렌더(`renderToStaticMarkup`)로 마크업만 고정한다: `leadingItem`이 있으면 첫 칸이
 * `<button>`(select 동작)으로 렌더되고, 나머지 `items`는 `mode="navigate"` 그대로
 * `/inventory/[id]` 링크를 유지한다.
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

const LEADING_ITEM: InventoryGridItem = {
  id: 'demo-acorn',
  badgeName: '황금빛 도토리',
  badgeImageUrl: null,
  badgeRarity: 'common',
}

describe('InventoryGrid leadingItem', () => {
  it('leadingItem이 있으면 첫 칸이 버튼으로 렌더된다', () => {
    const html = renderToStaticMarkup(
      <InventoryGrid
        items={[REAL_ITEM]}
        mode="navigate"
        leadingItem={{ item: LEADING_ITEM, onSelect: () => {} }}
      />
    )
    expect(html).toContain('<button')
    expect(html).toContain(LEADING_ITEM.badgeName)
  })

  it('나머지 items는 mode="navigate" 그대로 /inventory/[id] 링크를 유지한다', () => {
    const html = renderToStaticMarkup(
      <InventoryGrid
        items={[REAL_ITEM]}
        mode="navigate"
        leadingItem={{ item: LEADING_ITEM, onSelect: () => {} }}
      />
    )
    expect(html).toContain(`href="/inventory/${REAL_ITEM.id}"`)
  })

  it('leadingItem이 없으면 기존 호출부(드랍 바텀시트 등)는 변경 없이 렌더된다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[REAL_ITEM]} mode="navigate" />)
    expect(html).toContain(`href="/inventory/${REAL_ITEM.id}"`)
    expect(html).not.toContain(LEADING_ITEM.badgeName)
  })
})
