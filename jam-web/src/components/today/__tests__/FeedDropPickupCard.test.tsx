/**
 * 드랍·픽업 카드 `FeedDropPickupCard` (티켓 20261121_0115, 상위 20261120_2026 4회차-3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 마크업 문자열을 단언한다.
 *
 * 확인하는 것: 구성(최소 높이 360·박스 줄 높이 184·칸 폭 3칸 기준·배지 80), 박스 모양을 아이템 방향으로 그림(외곽선 없음), 배지 1~3개, 이미지 없는 배지는 이름 글자,
 * 칩 «드랍»·«픽업» 두 개가 박스 줄의 대각선 모서리에 걸침, 카드 전체 링크 하나, 설명 숨김, hex 없음.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedDropPickupCard.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/today/TodayCardTracker', () => ({
  default: ({ cardId, trackClick, children }: { cardId: string; trackClick?: boolean; children: ReactNode }) => (
    <div data-tracker={cardId} data-track-click={String(trackClick ?? true)}>
      {children}
    </div>
  ),
}))

import FeedCard from '../feed/FeedCard'
import type { FeedCardView, FeedCardViewBadge } from '@/lib/today/cardView'
import { diagonalOf } from '@/lib/today/feedChipSlots'
import { FEED_CARD_MIN_HEIGHT, FEED_CHIP_OFFSET, FEED_DROP_PICKUP } from '@/lib/today/feedConstants'
import { resolveFeedLook, type FeedLookCard } from '@/lib/today/feedLook'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const BADGES: FeedCardViewBadge[] = [
  { name: '레터링 펜', imageUrl: 'https://cdn.example/pen.png' },
  { name: '황동 카메라', imageUrl: 'https://cdn.example/camera.png' },
  { name: '비닐우산', imageUrl: 'https://cdn.example/umbrella.png' },
]

interface Options extends Partial<FeedLookCard> {
  badges?: FeedCardViewBadge[]
  description?: string
  tracking?: boolean
}

function dropView({ badges = BADGES, description, tracking, ...stored }: Options = {}): FeedCardView {
  const look = resolveFeedLook({
    card: { id: 'card-1', feed_type: 'drop_pickup', ...stored },
    feedType: 'drop_pickup',
    valueSource: { resource: 'drop_pickup' },
    now: NOW,
  })
  const view: FeedCardView = { resource: 'drop', title: '내겐 남는 것이\n누군가의 새것', feedType: 'drop_pickup', imageUrl: null, itemBadges: badges, look }
  if (description && look.showDescription) view.description = description
  if (tracking) {
    view.href = '/drops'
    view.tracking = { cardId: 'card-1', contentTypeId: null, templateType: 'drop_alert', shape: 'hero' }
  }
  return view
}

const render = (view: FeedCardView) => renderToStaticMarkup(<FeedCard view={view} />)
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('드랍·픽업 — 구성', () => {
  it('최소 높이 360, 박스 줄 높이 184, 칸 폭은 3칸 기준, 배지 80×80이다', () => {
    const html = render(dropView({ description: '남는 배지는 드랍해 봐요.' }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.drop_pickup}px`)
    expect(FEED_CARD_MIN_HEIGHT.drop_pickup).toBe(360)
    expect(html).toContain(`height:${FEED_DROP_PICKUP.rowHeight}px`)
    expect(FEED_DROP_PICKUP.rowHeight).toBe(184)
    expect(html).toContain('width:calc((100% - 16px) / 3)')
    expect(html).toContain('gap-2')
    expect(html).toContain('width="80"')
    expect(html).toContain('height="80"')
    expect(html).toContain('남는 배지는 드랍해 봐요.')
  })

  it('배지 3개가 박스에 담기고 박스 색은 색 변수다(외곽선 없음, hex 없음)', () => {
    const html = render(dropView({ box_color_key: 'ref-lime', box_shape: 'round' }))
    expect(count(html, 'background-color:var(--feed-color-ref-lime, var(--feed-ref-lime))')).toBe(3)
    for (const badge of BADGES) expect(html).toContain(badge.imageUrl as string)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}[;"']/)
    // 칩에만 외곽선(border-width)이 있다
    expect(count(html, 'border-width')).toBe(count(html, 'rounded-full'))
  })

  it('배지의 alt는 이름이다', () => {
    const html = render(dropView())
    for (const badge of BADGES) expect(html).toContain(`alt="${badge.name}"`)
  })

  it('박스 모양은 카드가 정한 모양을 아이템 방향으로 그린다(티켓은 마스크, 라운드는 모서리 클래스)', () => {
    expect(render(dropView({ box_shape: 'round' }))).toContain('rounded-xl')
    const ticket = render(dropView({ box_shape: 'ticket' }))
    expect(ticket).toContain('mask-image')
    // 반원 돌출은 아이템 방향이라 위·아래에 28px 바깥 여백이 생긴다
    expect(render(dropView({ box_shape: 'bump' }))).toContain('padding:28px 0px 28px 0px')
  })

  it('배지가 1~2개여도 있는 만큼 같은 칸 폭으로 그린다', () => {
    for (const n of [1, 2]) {
      const html = render(dropView({ badges: BADGES.slice(0, n), box_color_key: 'red-soft' }))
      expect(count(html, 'background-color:var(--feed-color-red-soft, var(--jam-red-soft))')).toBe(n)
      expect(count(html, 'width:calc((100% - 16px) / 3)')).toBe(n)
    }
  })

  it('이미지가 없는 배지는 이름 글자로 대신한다(이미지 태그 없음)', () => {
    const html = render(dropView({ badges: [{ name: '이름만 있는 배지', imageUrl: null }] }))
    expect(html).not.toContain('<img')
    expect(html).toContain('이름만 있는 배지')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
  })
})

describe('드랍·픽업 — 칩·링크·설명', () => {
  it('칩이 저장되지 않으면 «드랍»(색 칩)·«픽업»(검정 칩) 두 칩이고 둘 다 큰 칩(40)이다', () => {
    const view = dropView({ chip_color_key: 'ref-lime' })
    expect(view.look.chips.map((chip) => [chip.text, chip.color, chip.size])).toEqual([
      ['드랍', 'ref-lime', 'lg'],
      ['픽업', 'black', 'lg'],
    ])
    const html = render(view)
    expect(count(html, 'rounded-full')).toBe(2)
    expect(count(html, 'height:40px')).toBe(2)
    expect(html).toContain('드랍')
    expect(html).toContain('픽업')
    // 색 칩은 색 변수, 검정 칩은 --foreground 면에 --snow 글자
    expect(html).toContain('background-color:var(--feed-color-ref-lime, var(--feed-ref-lime))')
    expect(html).toContain('background-color:var(--foreground)')
    expect(html).toContain('text-snow')
  })

  it('두 칩은 박스 줄의 대각선 모서리에 걸친다(위쪽은 위로, 아래쪽은 아래로, 가로 12·세로 16)', () => {
    const offsets: Record<string, string[]> = {
      'box-row-top-left': ['top:-16px', 'left:-12px'],
      'box-row-top-right': ['top:-16px', 'right:-12px'],
      'box-row-bottom-left': ['bottom:-16px', 'left:-12px'],
      'box-row-bottom-right': ['bottom:-16px', 'right:-12px'],
    }
    const pairs = new Set<string>()
    for (let n = 0; n < 40; n++) {
      const view = dropView({ feed_seed: n })
      const slots = view.look.chips.map((chip) => chip.slot)
      expect(slots).toHaveLength(2)
      expect(diagonalOf('drop_pickup', slots[0])).toBe(slots[1])
      pairs.add([...slots].sort().join('/'))
      const html = render(view)
      for (const slot of slots) for (const part of offsets[slot]) expect(html).toContain(part)
    }
    // 대각선 짝 두 가지가 모두 나온다
    expect([...pairs].sort()).toEqual(['box-row-bottom-left/box-row-top-right', 'box-row-bottom-right/box-row-top-left'])
  })

  it('저장된 chips가 있으면 그것을 따른다(한 개만 저장하면 한 개)', () => {
    const html = render(dropView({ chips: [{ kind: 'phrase', text: '드랍 예정', slot: 'box-row-bottom-right' }] }))
    expect(count(html, 'rounded-full')).toBe(1)
    expect(html).toContain('드랍 예정')
    expect(html).toContain('bottom:-16px')
    expect(html).toContain('right:-12px')
    expect(html).not.toContain('픽업')
  })

  it('저장된 칩이 셋이어도 두 개까지만 그린다', () => {
    const html = render(
      dropView({
        chips: [
          { kind: 'phrase', text: '가' },
          { kind: 'phrase', text: '나' },
          { kind: 'phrase', text: '다' },
        ],
      }),
    )
    expect(count(html, 'rounded-full')).toBe(2)
  })

  it('칩 없음([])이면 칩이 없다', () => {
    expect(count(render(dropView({ chips: [] })), 'rounded-full')).toBe(0)
  })

  it('폭 320에서 칩이 카드 바깥으로 나가지 않는다(가로 걸침 12 < 안쪽 여백 16)', () => {
    expect(FEED_CHIP_OFFSET.x).toBeLessThan(16)
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const html = render(dropView({ feed_seed: n }))
      const sides = [...html.matchAll(/(?:left|right):(-?\d+)px/g)].map((match) => Math.abs(Number(match[1])))
      expect(sides.length).toBeGreaterThan(0)
      for (const side of sides) expect(side).toBeLessThan(16)
    }
  })

  it('설명 숨김이면 설명이 없다', () => {
    expect(render(dropView({ description: '남는 배지는 드랍해 봐요.', show_description: false }))).not.toContain('남는 배지는 드랍해 봐요.')
  })

  it('계측 정보가 있으면 카드 전체 링크가 하나이고 클릭을 기록한다', () => {
    const html = render(dropView({ tracking: true }))
    expect(count(html, '<a ')).toBe(1)
    expect(html).toContain('href="/drops"')
    expect(html).toContain('data-track-click="true"')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커가 없다', () => {
    const html = render(dropView())
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('data-tracker')
  })
})
