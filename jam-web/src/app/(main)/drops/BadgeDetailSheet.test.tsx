/**
 * 픽업 시트(BadgeDetailSheet)의 잠긴 변형과 막힘 안내 (티켓 20261018_1817, 채원 사전 판정 2026-10-19)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더로 마크업만 고정한다. `BottomSheet`는 body 포털이라 서버 렌더에서 아무것도 그리지 않으므로
 * 자식만 그대로 내보내는 가짜로 바꾼다. 하단 점유 높이 실측(ResizeObserver)은 effect라 서버 렌더에서 돌지 않아 카리나의 실렌더 확인 몫이다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="sheet">{children}</div>,
}))

import BadgeDetailSheet, { type PickupDrop } from './BadgeDetailSheet'
import { d } from '@/lib/i18n'

const SECRET_NAME = '들키면안되는배지이름'
const base: PickupDrop = {
  id: 'drop-1',
  badge_id: 'badge-1',
  badge_name: '열린 배지 이름',
  badge_rarity: 'epic',
  badge_image_url: 'https://example.com/open.png',
  dropper_name: '예린',
  dropped_at: '2026-10-19T00:00:00.000Z',
  serial: 'ABCD000005',
  serial_prefix: 'ABCD',
  serial_number: 5,
  expires_at: null,
}
// 서버는 잠긴 개체의 이름·그림·일련번호를 비워 내려 주지만 화면이 읽지 않는다는 것을 고정하려고 값이 남은 응답을 넣는다.
const locked: PickupDrop = {
  ...base,
  badge_id: 'locked:epic',
  badge_name: SECRET_NAME,
  badge_image_url: 'https://example.com/secret-image.png',
  serial: 'ZZZZ000777',
  serial_prefix: 'ZZZZ',
  serial_number: 777,
  locked: true,
  unlock_required: 12,
}

function render(drop: PickupDrop, extra: { notice?: string | null; pickupDisabled?: boolean } = {}) {
  return renderToStaticMarkup(
    <BadgeDetailSheet drop={drop} poiName="성수역" pickingUp={false} onPickup={vi.fn()} onCancel={vi.fn()} {...extra} />
  )
}

describe('BadgeDetailSheet 잠긴 변형', () => {
  const html = render(locked)

  it('제목은 «잠긴 아이템 배지», 등급 칩 옆에 «잠김» 칩이 있고 이름·그림·일련번호가 DOM 어디에도 없다', () => {
    expect(html).toContain(`>${d.lockedItem.card.name}</h1>`)
    expect(html).toContain(d.lockedItem.detail.chip)
    expect(html).not.toContain(SECRET_NAME)
    expect(html).not.toContain('secret-image')
    expect(html).not.toContain('ZZZZ')
    expect(html).not.toContain('000777')
  })

  it('카드에 장소 이름, 드랍한 사람, 필요한 양 한 줄, 픽업한 뒤의 일 한 줄이 있다', () => {
    expect(html).toContain('성수역')
    expect(html).toContain('예린이(가) 드랍')
    expect(html).toContain('여는 데 잼 12만큼 채워야 해요')
    expect(html).toContain(d.drops.pickupLockedHint)
  })

  it('필요한 양이 없는 비정상 응답이면 필요한 양 줄만 생략한다', () => {
    const noRequired = render({ ...locked, unlock_required: null })
    expect(noRequired).not.toContain('여는 데 잼')
    expect(noRequired).toContain(d.drops.pickupLockedHint)
  })

  it('열린 개체 시트에는 잠긴 변형의 문구가 없다(회귀 방지)', () => {
    const open = render(base)
    expect(open).toContain('열린 배지 이름')
    expect(open).toContain('000005')
    expect(open).not.toContain(d.drops.pickupLockedHint)
    expect(open).not.toContain(d.lockedItem.detail.chip)
  })
})

describe('BadgeDetailSheet 막힘 안내', () => {
  it('안내가 없으면 인라인 안내 블록이 없고 [픽업]이 눌린다', () => {
    const html = render(base)
    expect(html).not.toContain('role="status"')
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })

  it('가득 참 안내는 블록으로 보이고 [픽업]은 계속 눌린다', () => {
    const html = render(base, { notice: d.drops.pickupInventoryFull })
    expect(html).toContain('role="status"')
    expect(html).toContain(d.drops.pickupInventoryFull)
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })

  it('장소 차단은 안내와 함께 [픽업]만 비활성이고 [취소]는 눌린다', () => {
    const html = render(base, { notice: d.drops.pickupPoiBlocked, pickupDisabled: true })
    expect(html).toContain(d.drops.pickupPoiBlocked)
    const disabledButtons = html.match(/<button[^>]*disabled[^>]*>/g) ?? []
    expect(disabledButtons).toHaveLength(1)
    const cancel = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${d.drops.cancel}`))
    expect(cancel?.[0]).not.toContain('disabled')
  })
})
