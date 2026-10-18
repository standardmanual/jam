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

  it('leadingItem.pulse가 true면 선두 셀에 jam-quest-pulse 클래스가 붙는다 (20260928_1753)', () => {
    const html = renderToStaticMarkup(
      <InventoryGrid
        items={[REAL_ITEM]}
        mode="navigate"
        leadingItem={{ item: LEADING_ITEM, onSelect: () => {}, pulse: true }}
      />
    )
    expect(html).toContain('jam-quest-pulse')
  })

  it('leadingItem.pulse를 넘기지 않으면 jam-quest-pulse 클래스가 붙지 않는다', () => {
    const html = renderToStaticMarkup(
      <InventoryGrid
        items={[REAL_ITEM]}
        mode="navigate"
        leadingItem={{ item: LEADING_ITEM, onSelect: () => {} }}
      />
    )
    expect(html).not.toContain('jam-quest-pulse')
  })
})

describe('InventoryGrid 잠긴 개체 (티켓 20261018_0054 2회)', () => {
  const LOCKED_ITEM: InventoryGridItem = {
    id: 'locked-item-1',
    // 서버가 비워서 내린 값 — 카드가 이 값에 기대지 않는다
    badgeName: '',
    badgeImageUrl: null,
    badgeRarity: 'rare',
    locked: true,
    fillPercent: 40,
  }

  it('잠긴 개체는 가린 이름과 /inventory/[id] 링크로 그려지고 게이지 비율만 싣는다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[REAL_ITEM, LOCKED_ITEM]} mode="navigate" />)
    expect(html).toContain(`href="/inventory/${LOCKED_ITEM.id}"`)
    expect(html).toContain('잠긴 아이템 배지')
    expect(html).toContain('--ds-progress-fill:40%')
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

  it('locked가 없는 항목에는 게이지가 없다', () => {
    const html = renderToStaticMarkup(<InventoryGrid items={[REAL_ITEM]} mode="navigate" />)
    expect(html).not.toContain('--ds-progress-fill')
  })
})
