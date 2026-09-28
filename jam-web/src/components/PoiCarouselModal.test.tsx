/**
 * PoiCarouselModal의 `demoMode` 초기 렌더(티켓 20260927_2126 T3, 20260927_2128 T5).
 *
 * 온보딩 퀘스트 `pickup`·`drop` 연출(`QuestPickupScene.tsx`)이 실제 `PoiCarouselModal`을
 * 그대로 열되, 존재하지 않는 데모 POI id로 실제 드랍 API가 불리는 사고를 막기 위해 `pickup`은
 * "여기에 드랍" 버튼을 숨기고, `drop`은 `onDropOverride`가 있을 때만 버튼을 살린다는 완료
 * 조건을 고정한다. 저장소에 jsdom·testing-library가 없어(`QuestBagGrid.test.tsx`와 같은
 * 방식) 서버 렌더(`renderToStaticMarkup`)로 초기 마크업만 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import PoiCarouselModal, { toDemoDroppedPickup } from './PoiCarouselModal'
import { d } from '@/lib/i18n'
import { DEMO_PICKUP_POI, DEMO_PICKUP_DROP, DEMO_DROP_ITEM } from '@/lib/onboarding-quest/demo-data'

describe('PoiCarouselModal demoMode 초기 렌더', () => {
  const baseProps = {
    pois: [DEMO_PICKUP_POI],
    initialPoiId: DEMO_PICKUP_POI.id,
    userLat: 0,
    userLng: 0,
    onClose: vi.fn(),
    onCenterChange: vi.fn(),
    onDropOrPickupSuccess: vi.fn(),
    demoMode: true,
    initialDropsCache: { [DEMO_PICKUP_POI.id]: [DEMO_PICKUP_DROP] },
    onPickupOverride: vi.fn(async () => {}),
  }

  it('캐시로 미리 채운 데모 드랍(잃어버린 결혼반지)이 목록에 즉시 보인다', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...baseProps} />)
    expect(html).toContain(DEMO_PICKUP_DROP.badge_name)
  })

  it('"여기에 드랍" 버튼은 렌더되지 않는다(FK 위반·연출 훼손 방지)', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...baseProps} />)
    // POI 이름("근처 드랍 지점")·aria-label("지점 드랍·픽업")에도 "드랍"이 등장하므로,
    // 버튼 텍스트 노드의 정확한 경계(`>드랍<`)로 좁혀 확인한다.
    expect(html).not.toContain(`>${d.drops.dropHereButton}<`)
  })

  it('demoMode가 아니면 기존처럼 "여기에 드랍" 버튼이 보인다(회귀 방지)', () => {
    // drops를 빈 배열로 미리 채워 로딩 스피너 분기를 피한다(실제 화면은 fetchPoiDrops
    // effect가 채우지만, renderToStaticMarkup은 effect를 실행하지 않는다).
    const html = renderToStaticMarkup(
      <PoiCarouselModal {...baseProps} demoMode={false} initialDropsCache={{ [DEMO_PICKUP_POI.id]: [] }} />
    )
    expect(html).toContain(`>${d.drops.dropHereButton}<`)
  })
})

describe('PoiCarouselModal demoMode(drop) 초기 렌더', () => {
  const dropProps = {
    pois: [DEMO_PICKUP_POI],
    initialPoiId: DEMO_PICKUP_POI.id,
    userLat: 0,
    userLng: 0,
    onClose: vi.fn(),
    onCenterChange: vi.fn(),
    onDropOrPickupSuccess: vi.fn(),
    demoMode: true,
    initialDropsCache: { [DEMO_PICKUP_POI.id]: [] },
    demoDropItems: [DEMO_DROP_ITEM],
    onDropOverride: vi.fn(async () => true),
  }

  it('onDropOverride가 있으면 demoMode여도 "여기에 드랍" 버튼이 보인다(pickup 전용 숨김과 구분)', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...dropProps} />)
    expect(html).toContain(`>${d.drops.dropHereButton}<`)
  })

  it('채원 판정 2 — 초기 드랍 목록이 비어 있으면 EmptyState(드랍된 배지 없음) 문구가 보인다', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...dropProps} />)
    expect(html).toContain(d.drops.dropEmptyTitle)
  })
})

describe('toDemoDroppedPickup', () => {
  it('InventoryItem을 PickupDrop 셰이프로 변환한다 — 배지 필드는 유지하고 일련번호 관련은 null이다', () => {
    const result = toDemoDroppedPickup(DEMO_DROP_ITEM)
    expect(result.id).toBe(DEMO_DROP_ITEM.id)
    expect(result.badge_id).toBe(DEMO_DROP_ITEM.badge_id)
    expect(result.badge_name).toBe(DEMO_DROP_ITEM.badge_name)
    expect(result.badge_image_url).toBe(DEMO_DROP_ITEM.badge_image_url)
    expect(result.badge_rarity).toBe(DEMO_DROP_ITEM.badge_rarity)
    expect(result.serial).toBeNull()
    expect(result.dropper_name).toBeNull()
  })
})
