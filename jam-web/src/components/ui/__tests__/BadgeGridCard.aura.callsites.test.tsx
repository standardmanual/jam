/**
 * BadgeGridCard 호출부의 대표색 연결 (티켓 20261119_1654)
 *
 * 호출부가 `bgColors`를 카드까지 넘기는지, 잠긴 칸·미발견 칸은 색을 싣지 않는지 서버 렌더로 고정한다.
 * 조회·API 쪽 연결은 각 라우트·함수 시험(`pending`, `inventory/items`, `hydrate`)이 맡는다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import BagItemCell from '@/app/(main)/combine/BagItemCell'
import RecipeSlotCard from '@/app/(main)/combine/RecipeSlotCard'
import InventoryGrid from '@/components/inventory/InventoryGrid'
import ItemCandidateRow from '@/components/inventory/ItemCandidateRow'

const COLORS = ['#e0e8ff', '#7090e0', '#203a8a']
const TESTID = 'data-testid="badge-aura-background"'
const IMAGE = 'https://example.com/badge.png'

describe('호출부 → BadgeGridCard 대표색', () => {
  it('믹스 가방 셀(BagItemCell)은 색이 있을 때만 Aura를 깐다', () => {
    expect(renderToStaticMarkup(<BagItemCell name="깃" imageUrl={IMAGE} bgColors={COLORS} state="active" onClick={() => {}} />)).toContain(TESTID)
    expect(renderToStaticMarkup(<BagItemCell name="깃" imageUrl={IMAGE} state="active" onClick={() => {}} />)).not.toContain(TESTID)
  })

  it('레시피 칸(RecipeSlotCard)은 채운 칸·넣을 수 있는 칸에 깔고, 가진 게 없는 칸(unowned)에는 깔지 않는다', () => {
    const card = (status: 'filled' | 'addable' | 'unowned') =>
      renderToStaticMarkup(<RecipeSlotCard status={status} name="깃" imageUrl={IMAGE} bgColors={COLORS} />)
    expect(card('filled')).toContain(TESTID)
    expect(card('addable')).toContain(TESTID)
    expect(card('unowned')).not.toContain(TESTID)
  })

  it('인벤토리 그리드는 열린 개체에만 깔고 잠긴 개체에는 깔지 않는다', () => {
    const html = renderToStaticMarkup(
      <InventoryGrid
        mode="navigate"
        items={[
          { id: 'a', badgeName: '열림', badgeImageUrl: IMAGE, badgeBgColors: COLORS, badgeRarity: 'rare' },
          { id: 'b', badgeName: '', badgeImageUrl: null, badgeRarity: 'rare', locked: true },
        ]}
      />,
    )
    expect(html.match(new RegExp(TESTID, 'g'))).toHaveLength(1)
    // 잠긴 개체에 색이 실려 들어와도 카드가 막는다(호출부 실수 방어)
    const leaked = renderToStaticMarkup(
      <InventoryGrid mode="select" items={[{ id: 'c', badgeName: '', badgeImageUrl: null, badgeBgColors: COLORS, badgeRarity: 'rare', locked: true }]} />,
    )
    expect(leaked).not.toContain(TESTID)
  })

  it('개체 선택 행(ItemCandidateRow)은 열린 개체에만 깔고 잠긴 개체에는 깔지 않는다', () => {
    const candidate = { id: 'i', serial_number: 7, serial_prefix: 'WND', expires_at: null }
    expect(renderToStaticMarkup(<ItemCandidateRow candidate={candidate} rarity="rare" imageUrl={IMAGE} bgColors={COLORS} onClick={() => {}} />)).toContain(TESTID)
    expect(
      renderToStaticMarkup(<ItemCandidateRow candidate={{ ...candidate, locked: true }} rarity="rare" imageUrl={IMAGE} bgColors={COLORS} onClick={() => {}} />),
    ).not.toContain(TESTID)
    expect(renderToStaticMarkup(<ItemCandidateRow candidate={candidate} rarity="rare" imageUrl={IMAGE} onClick={() => {}} />)).not.toContain(TESTID)
  })
})
