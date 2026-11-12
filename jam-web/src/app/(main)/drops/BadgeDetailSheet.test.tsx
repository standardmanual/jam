/**
 * 픽업 시트(BadgeDetailSheet)의 잠긴 변형과 막힘 안내 (티켓 20261018_1817, 채원 사전 판정 2026-10-19)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더로 마크업만 고정한다. `BottomSheet`는 body 포털이라 서버 렌더에서 아무것도 그리지 않으므로
 * 자식만 그대로 내보내는 가짜로 바꾼다. 하단 점유 높이 실측(ResizeObserver)은 effect라 서버 렌더에서 돌지 않아 카리나의 실렌더 확인 몫이다.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ children, panelTone }: { children: React.ReactNode; panelTone?: string }) => (
    <div data-testid="sheet" data-panel-tone={panelTone}>
      {children}
    </div>
  ),
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

  it('카드에 장소 이름, 드랍한 사람, 픽업한 뒤의 일 한 줄만 있다', () => {
    expect(html).toContain('성수역')
    expect(html).toContain('예린이(가) 드랍')
    expect(html).toContain(d.drops.pickupLockedHint)
    expect(html.split(d.drops.pickupLockedHint).length - 1).toBe(1)
  })

  it('«잼»·필요한 양 서술이 없다(여는 비용은 줍고 나서 잠긴 상세에서 본다)', () => {
    expect(html).not.toContain('잼')
    expect(html).not.toContain('{n}')
    expect(d.drops.pickupLockedHint).toContain('포인트')
  })

  it('열린 개체 시트에는 잠긴 변형의 문구가 없다(회귀 방지)', () => {
    const open = render(base)
    expect(open).toContain('열린 배지 이름')
    expect(open).toContain('000005')
    expect(open).not.toContain(d.drops.pickupLockedHint)
    expect(open).not.toContain(d.lockedItem.detail.chip)
  })
})

describe('BadgeDetailSheet 배지 설명과 일련번호 자리 (티켓 20261111_1056)', () => {
  const withDescription: PickupDrop = { ...base, badge_description: '손바닥보다 큰 뻥튀기 한 장입니다. 부푼 알갱이 사이가 보입니다.' }

  it('배지 이름 아래에 설명이 문장 단위로 나뉘어 보인다', () => {
    const html = render(withDescription)
    expect(html).toContain('>손바닥보다 큰 뻥튀기 한 장입니다.<')
    expect(html).toContain('>부푼 알갱이 사이가 보입니다.<')
    expect(html.indexOf('</h1>')).toBeLessThan(html.indexOf('손바닥보다 큰 뻥튀기 한 장입니다.'))
  })

  it('일련번호는 설명 아래, 장소·드랍한 사람 카드 위에 있다', () => {
    const html = render(withDescription)
    const description = html.indexOf('부푼 알갱이 사이가 보입니다.')
    const serial = html.indexOf('>000005<')
    const poi = html.indexOf('성수역')
    expect(serial).toBeGreaterThan(-1)
    expect(description).toBeLessThan(serial)
    expect(serial).toBeLessThan(poi)
  })

  it('설명이 없으면 설명 줄 없이 일련번호만 이름 아래에 있다', () => {
    const html = render(base)
    expect(html).not.toContain('text-wrap!')
    expect(html.indexOf('</h1>')).toBeLessThan(html.indexOf('>000005<'))
    expect(html.indexOf('>000005<')).toBeLessThan(html.indexOf('성수역'))
  })

  it('잠긴 개체는 설명이 값으로 남아 있어도 그리지 않는다', () => {
    const html = render({ ...locked, badge_description: '들키면 안 되는 설명입니다.' })
    expect(html).not.toContain('들키면 안 되는 설명')
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

describe('BadgeDetailSheet 흰 카드 구조 (티켓 20261112_1629)', () => {
  const html = render({ ...base, badge_description: '손바닥보다 큰 뻥튀기 한 장입니다.' })

  it('시트 바탕은 --background(panelTone="background")이다', () => {
    expect(html).toContain('data-panel-tone="background"')
  })

  it('이미지·등급 칩·이름·설명이 흰 카드(bg-card-bg) 한 장 안에 있고 회색 이미지 상자가 없다', () => {
    const cardStart = html.indexOf('bg-card-bg')
    expect(cardStart).toBeGreaterThan(-1)
    const cardHtml = html.slice(cardStart)
    for (const part of ['open.png', 'Epic', '열린 배지 이름', '손바닥보다 큰 뻥튀기 한 장입니다.']) {
      expect(cardHtml.indexOf(part), part).toBeGreaterThan(-1)
    }
    expect(html).not.toContain('bg-background-secondary')
    // 카드 안쪽 여백 24 16, 이미지 176
    expect(html).toContain('py-6 px-4')
    expect(html).toContain('w-44 h-44')
    // 칩이 이름 위에 있다(배지 상세 페이지와 같은 순서)
    expect(html.indexOf('Epic')).toBeLessThan(html.indexOf('>열린 배지 이름</h1>'))
  })

  it('카드 아래 순서는 시리얼 → 장소 카드 → 취소·픽업이다', () => {
    const serial = html.indexOf('>000005<')
    const poi = html.indexOf('성수역')
    const cancel = html.indexOf(d.drops.cancel)
    const pickup = html.indexOf(d.drops.pickupButton)
    expect(html.indexOf('손바닥보다')).toBeLessThan(serial)
    expect(serial).toBeLessThan(poi)
    expect(poi).toBeLessThan(cancel)
    expect(cancel).toBeLessThan(pickup)
  })

  it('잠긴 개체도 같은 카드 구조다 — 등급 칩과 «잠김» 칩이 나란히, 잠금 타일, 시리얼 자리는 비어 있다', () => {
    const lockedHtml = render(locked)
    expect(lockedHtml).toContain('bg-card-bg')
    expect(lockedHtml).toContain('py-6 px-4')
    expect(lockedHtml.indexOf('Epic')).toBeLessThan(lockedHtml.indexOf(d.lockedItem.detail.chip))
    expect(lockedHtml.indexOf(d.lockedItem.detail.chip)).toBeLessThan(lockedHtml.indexOf(`>${d.lockedItem.card.name}</h1>`))
  })

  it('이미지·이름·설명을 이 파일에서 따로 그리지 않고 BadgeHeroSection을 쓴다', () => {
    const src = readFileSync(path.resolve(__dirname, 'BadgeDetailSheet.tsx'), 'utf8')
    expect(src).toContain("import BadgeHeroSection from '@/components/BadgeHeroSection'")
    expect(src).toContain('size="sheet"')
    expect(src).not.toContain('<h1')
    expect(src).not.toContain('<SafeImage')
    expect(src).not.toContain('<RarityBadge')
    expect(src).not.toContain('splitDescriptionSentences(')
  })
})
