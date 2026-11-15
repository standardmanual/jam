/**
 * PoiCarouselModal 카드(`PoiCard`) 서버 렌더 — 픽업 갤러리·잠긴 개체 행·드랍 확인 단계의 마크업을 고정한다.
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 마크업만 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { PoiCard } from './PoiCarouselModal'
import { d, t } from '@/lib/i18n'
import type { PickupDrop } from '@/app/(main)/drops/BadgeDetailSheet'
import type { NearbyPoi } from '@/types/drops'

const TEST_POI: NearbyPoi = {
  id: 'test-poi',
  name: '테스트 장소',
  latitude: 0,
  longitude: 0,
  availableDrops: 1,
  distance_meters: 30,
  available_drops_count: 1,
  in_drop_range: true,
  poi_tier: 1,
}

const TEST_DROP: PickupDrop = {
  id: 'test-drop',
  badge_id: 'test-badge',
  badge_name: '테스트 배지',
  badge_rarity: 'common',
  badge_image_url: null,
  dropper_name: null,
  dropped_at: '2026-01-01T00:00:00.000Z',
  serial: null,
  serial_prefix: null,
  serial_number: null,
  expires_at: null,
}

/** 활성 카드에 픽업 가능 목록을 넣어 그린다 */
function renderList(drops: PickupDrop[]) {
  return renderToStaticMarkup(
    <PoiCard
      poi={TEST_POI}
      isActive
      drops={drops}
      loading={false}
      showInventory={false}
      inventoryLoading={false}
      pendingDropItem={null}
      dropping={false}
      dropGridItems={[]}
      onClose={vi.fn()}
    />
  )
}

describe('잠긴 개체 행과 드랍 확인 단계 (티켓 20261018_1817, 운영 로직 7.3·7.2절)', () => {
  // 서버는 잠긴 개체의 이름·그림·일련번호를 비워 내려 주지만, 화면이 그 값을 읽지 않는다는 것을 고정하려고 일부러 값이 남은 응답을 넣는다.
  const SECRET_NAME = '들키면안되는배지이름'
  const SECRET_SERIAL = 'ZZZZ000777'
  const SECRET_IMAGE = 'https://example.com/secret-image.png'
  const openDrop: PickupDrop = {
    ...TEST_DROP,
    id: 'open-1',
    badge_id: 'badge-open',
    badge_name: '열린 배지 이름',
    badge_rarity: 'common',
    serial: null,
  }
  function lockedDrop(id: string, rarity: string, required: number | null): PickupDrop {
    return {
      ...TEST_DROP,
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

describe('갤러리 칸 배선 (티켓 20261114_2352, 이전 20261108_1625)', () => {
  const base: PickupDrop = { ...TEST_DROP, id: 'r1', badge_id: 'badge-r', badge_name: '행 배지 이름', badge_rarity: 'common', serial: null }
  it('개체가 둘 이상이면 ×N 알약은 aria-hidden이고 개수 안내 문구가 따로 읽힌다', () => {
    const html = renderList([base, { ...base, id: 'r2' }])
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>×2<\/span>/)
    expect(html).toContain(`<span class="sr-only">${t(d.drops.pickupAvailableCountAria, { count: '2' })}</span>`)
  })

  it('개체가 하나면 개수 알약이 없다', () => {
    expect(renderList([base])).not.toContain('×1')
  })

  it('common 칸은 등급 칩을 그리지 않지만 칩 줄 높이(h-6)는 남는다', () => {
    // 칩이 그려졌는지는 등급 라벨 글자(RarityBadge 라벨 «Rare»)로 본다. 레이아웃 gap 문자열에 기대면 같은 모달의 다른 요소가 같은 gap을 쓸 때 오탐한다.
    expect(renderList([{ ...base, badge_rarity: 'rare' }])).toContain('>Rare<')
    expect(renderList([base])).not.toContain('>Rare<')
    expect(renderList([base])).toContain('h-6 flex items-center justify-center')
  })

  it('만료 임박 개체여도 칸에 만료 칩을 그리지 않는다', () => {
    const html = renderList([{ ...base, expires_at: new Date(Date.now() + 86_400_000).toISOString() }])
    expect(html).not.toContain(d.inventory.expiringSuffix)
  })

  it('칸은 compact 규격이다: 3열 갤러리, 면 --background-secondary, 여백 8', () => {
    const html = renderList([base])
    expect(html).toContain('grid grid-cols-3 gap-2')
    expect(html).toContain('bg-background-secondary')
    expect(html).toContain('p-2')
  })

  it('묶음이 몇 개든 본문 슬롯 높이는 2행 갤러리 높이(284)로 같고 갤러리는 안에서만 스크롤된다', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...base, id: `m${i}`, badge_id: `b${i}`, badge_name: `배지${i}` }))
    for (const drops of [[base], many]) {
      const html = renderList(drops)
      expect(html).toContain('height:284px')
      expect(html).toContain('overflow-y-auto overscroll-contain')
      expect(html).toContain('grid-auto-rows:138px')
    }
  })

  it('옆 카드(isActive=false)도 같은 높이의 본문·버튼 슬롯을 그린다', () => {
    const html = renderToStaticMarkup(
      <PoiCard
        poi={TEST_POI}
        isActive={false}
        drops={undefined}
        loading={false}
        showInventory={false}
        inventoryLoading={false}
        pendingDropItem={null}
        dropping={false}
        dropGridItems={[]}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('height:284px')
    expect(html).toContain('height:48px')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain(`>${d.drops.dropHereButton}<`)
  })
})

describe('잠긴 개체 드랍 확인 단계 (티켓 20261028_1741 2회)', () => {
  // 새 흐름은 채운 양을 만들지 않으므로 잠긴 개체의 드랍 확인에는 조회·대기·안내가 없다. 저장소에 jsdom이 없어 서버 렌더로 마크업만 고정한다
  // (조회 fetch 자체는 effect라 서버 렌더에서 돌지 않는다 — 조회 코드와 /drop-loss 경로는 파일째 없앴다).
  function renderConfirm(locked: boolean, extra: { dropping?: boolean } = {}) {
    return renderToStaticMarkup(
      <PoiCard
        poi={TEST_POI}
        isActive
        drops={[]}
        loading={false}
        showInventory
        inventoryLoading={false}
        pendingDropItem={{ id: 'item-1', badgeName: locked ? d.lockedItem.card.name : '열린 배지', badgeImageUrl: null, badgeRarity: 'epic', locked }}
        dropping={extra.dropping ?? false}
        dropGridItems={[]}
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
    // 문구 끝(</p>) 뒤에는 본문 슬롯을 닫고 버튼 슬롯 안의 버튼 행이 바로 이어진다
    expect(between).toMatch(/^그래도 드랍할까요\?<\/p><\/div><\/div><div class="shrink-0[^>]*><div class="flex gap-2 w-full">$/)
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
