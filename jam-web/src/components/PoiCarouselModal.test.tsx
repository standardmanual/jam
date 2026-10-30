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

import PoiCarouselModal, { PoiCard, toDemoDroppedPickup } from './PoiCarouselModal'
import { d } from '@/lib/i18n'
import type { PickupDrop } from '@/app/(main)/drops/BadgeDetailSheet'
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

  it('questPulseStep 미지정이면 평소처럼 펄스 클래스가 없다(회귀 방지, 티켓 20260928_1754)', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...baseProps} />)
    expect(html).not.toContain('jam-quest-pulse')
  })

  it('questPulseStep="pickup"이면 픽업 그룹 행에만 펄스 클래스가 붙는다(티켓 20260928_1754)', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...baseProps} questPulseStep="pickup" />)
    expect(html).toContain('jam-quest-pulse')
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

  it('questPulseStep="drop"이면 초기 화면(인벤토리 열기 전)의 "여기에 드랍" 버튼에 펄스 클래스가 붙는다(티켓 20260928_1754)', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...dropProps} questPulseStep="drop" />)
    expect(html).toContain('jam-quest-pulse')
  })

  it('questPulseStep 미지정이면 "여기에 드랍" 버튼에 펄스 클래스가 없다(회귀 방지, 티켓 20260928_1754)', () => {
    const html = renderToStaticMarkup(<PoiCarouselModal {...dropProps} />)
    expect(html).not.toContain('jam-quest-pulse')
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

describe('잠긴 개체 행과 드랍 확인 단계 (티켓 20261018_1817, 운영 로직 7.3·7.2절)', () => {
  // 서버는 잠긴 개체의 이름·그림·일련번호를 비워 내려 주지만, 화면이 그 값을 읽지 않는다는 것을 고정하려고 일부러 값이 남은 응답을 넣는다.
  const SECRET_NAME = '들키면안되는배지이름'
  const SECRET_SERIAL = 'ZZZZ000777'
  const SECRET_IMAGE = 'https://example.com/secret-image.png'
  const openDrop: PickupDrop = {
    ...DEMO_PICKUP_DROP,
    id: 'open-1',
    badge_id: 'badge-open',
    badge_name: '열린 배지 이름',
    badge_rarity: 'common',
    serial: null,
  }
  function lockedDrop(id: string, rarity: string, required: number | null): PickupDrop {
    return {
      ...DEMO_PICKUP_DROP,
      id,
      badge_id: `locked:${rarity}`,
      badge_name: SECRET_NAME,
      badge_rarity: rarity,
      badge_image_url: SECRET_IMAGE,
      serial: SECRET_SERIAL,
      serial_prefix: 'ZZZZ',
      serial_number: 777,
      expires_at: '2099-01-01T00:00:00.000Z',
      locked: true,
      unlock_points_required: required,
    }
  }

  function renderList(drops: PickupDrop[]) {
    return renderToStaticMarkup(
      <PoiCarouselModal
        pois={[DEMO_PICKUP_POI]}
        initialPoiId={DEMO_PICKUP_POI.id}
        userLat={0}
        userLng={0}
        onClose={vi.fn()}
        onCenterChange={vi.fn()}
        onDropOrPickupSuccess={vi.fn()}
        demoMode
        initialDropsCache={{ [DEMO_PICKUP_POI.id]: drops }}
      />
    )
  }

  it('잠긴 개체는 «잠긴 아이템 배지»와 등급만 보이고 이름·그림·일련번호가 DOM 어디에도 없다', () => {
    const html = renderList([lockedDrop('l1', 'rare', 5), lockedDrop('l2', 'rare', 8)])
    expect(html).toContain(d.lockedItem.card.name)
    expect(html).not.toContain(SECRET_NAME)
    expect(html).not.toContain(SECRET_SERIAL)
    expect(html).not.toContain('secret-image')
    expect(html).not.toContain('ZZZZ')
  })

  it('같은 등급의 잠긴 개체는 한 행으로 묶이고 등급이 다르면 다른 행이다', () => {
    const one = renderList([lockedDrop('l1', 'rare', 5), lockedDrop('l2', 'rare', 8)])
    expect(one.split(d.lockedItem.card.name).length - 1).toBe(1)
    const two = renderList([lockedDrop('l1', 'rare', 5), lockedDrop('l2', 'epic', 8)])
    expect(two.split(d.lockedItem.card.name).length - 1).toBe(2)
  })

  it('잠긴 개체의 만료일이 있어도 만료 칩을 그리지 않는다', () => {
    const html = renderList([{ ...lockedDrop('l1', 'rare', 5), expires_at: new Date(Date.now() + 86_400_000).toISOString() }])
    expect(html).not.toContain(d.inventory.expiringSuffix)
  })

  it('잠긴 행은 열린 행 뒤에 둔다 — 서버 순서가 잠긴 개체가 먼저여도 같다', () => {
    const html = renderList([lockedDrop('l1', 'rare', 5), openDrop])
    expect(html.indexOf(openDrop.badge_name)).toBeGreaterThan(-1)
    expect(html.indexOf(openDrop.badge_name)).toBeLessThan(html.indexOf(d.lockedItem.card.name))
  })
})

describe('잠긴 개체 드랍 확인 단계 (티켓 20261028_1741 2회)', () => {
  // 새 흐름은 채운 양을 만들지 않으므로 잠긴 개체의 드랍 확인에는 조회·대기·안내가 없다. 저장소에 jsdom이 없어 서버 렌더로 마크업만 고정한다
  // (조회 fetch 자체는 effect라 서버 렌더에서 돌지 않는다 — 조회 코드와 /drop-loss 경로는 파일째 없앴다).
  function renderConfirm(locked: boolean, extra: { dropping?: boolean; questPulseStep?: 'pickup' | 'drop' } = {}) {
    return renderToStaticMarkup(
      <PoiCard
        poi={DEMO_PICKUP_POI}
        isActive
        drops={[]}
        loading={false}
        showInventory
        inventoryLoading={false}
        pendingDropItem={{ id: 'item-1', badgeName: locked ? d.lockedItem.card.name : '열린 배지', badgeImageUrl: null, badgeRarity: 'epic', locked }}
        dropping={extra.dropping ?? false}
        dropGridItems={[]}
        questPulseStep={extra.questPulseStep}
        onClose={vi.fn()}
      />
    )
  }
  const dropButtonDisabled = (html: string) => new RegExp(`<button[^>]*disabled[^>]*>(?:(?!</button>).)*${d.drops.dropButton}`).test(html)

  it('잠긴 개체도 열리자마자 [드랍]을 누를 수 있고 대기 표시·읽기 실패·사라질 양 안내가 없다', () => {
    const html = renderConfirm(true)
    expect(dropButtonDisabled(html)).toBe(false)
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('채운 잼')
    expect(html).not.toContain('사라져요')
    expect(html).not.toContain('다시 확인')
    expect(html).not.toContain('잼')
  })

  it('보이는 것은 잠금 타일, 확인 문구, [취소]와 [드랍]뿐이고 확인 문구와 버튼 사이에 다른 블록이 끼지 않는다', () => {
    const html = renderConfirm(true)
    expect(html).toContain('그래도 드랍할까요?')
    expect(html).toContain(d.drops.cancel)
    expect(html).toContain(d.drops.dropButton)
    const start = html.indexOf('그래도 드랍할까요?')
    const between = html.slice(start, html.indexOf('<button', start))
    expect(between).not.toContain('role="status"')
    // 문구 끝(</p>) 바로 뒤에 버튼 행이 온다
    expect(between).toBe('그래도 드랍할까요?</p><div class="flex gap-2 w-full">')
  })

  it('열린 개체의 확인 단계도 같다(회귀 방지)', () => {
    const html = renderConfirm(false)
    expect(dropButtonDisabled(html)).toBe(false)
  })

  it('드랍 중에는 [드랍]이 loading 상태다', () => {
    const html = renderConfirm(true, { dropping: true })
    expect(html).toContain(d.drops.dropButton)
  })
})
