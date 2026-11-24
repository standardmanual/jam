/**
 * 드랍·픽업 카드 `FeedDropPickupCard` (티켓 20261121_0115, 상위 20261120_2026 4회차-3 · 티켓 20261122_2229 «흩뿌린 배지»)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 마크업 문자열을 단언한다.
 *
 * 확인하는 것: 구성(최소 높이 380·배지 영역 기준 326×248 비율), 배지 수별 배치 스타일(중심 %·한 변 %·기울기·앞뒤 순서)과 박스 없음, 배지 1~5개·6개 이상은 앞 5개만, 이미지 없는 배지는 이름 글자,
 * 칩 «DROP»·«PICKUP» 두 개를 칩 계획 층이 카드 모서리에 그림, 카드 전체 링크 하나, 설명 숨김, hex 없음.
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
import { chainInputOf, planFeedChips } from '@/lib/today/feedChipChain'
import { cardGeometryOf, cornerRect, tiltedBounds } from '@/lib/today/feedChipGeometry'
import { FEED_CARD_MIN_HEIGHT, FEED_CORNER_OVERHANG, FEED_DROP_PICKUP, FEED_DROP_PICKUP_FRAMES } from '@/lib/today/feedConstants'
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
    view.tracking = { cardId: 'card-1', contentTypeId: null, templateType: 'drop_alert', feedType: view.feedType }
  }
  return view
}

const render = (view: FeedCardView) => renderToStaticMarkup(<FeedCard view={view} />)
const count = (html: string, needle: string) => html.split(needle).length - 1
/** 칩 층이 그린 칩 수: 알약(`rounded-full`)과 스티커(`role="img"`)의 합. 이 카드에는 제목 속 칩이 없다. */
const chipCount = (html: string) => count(html, 'rounded-full') + count(html, 'role="img"')
/** 이 view의 칩 계획(`toCardViews`가 없는 단건 경로는 «앞 카드 없음» 계획이다) */
const planOf = (view: FeedCardView) => view.look.chipPlan ?? planFeedChips([chainInputOf(view)])[0]

const MANY: FeedCardViewBadge[] = [
  ...BADGES,
  { name: '압정 한 줌', imageUrl: 'https://cdn.example/pin.png' },
  { name: '손때 묻은 열쇠', imageUrl: 'https://cdn.example/key.png' },
  { name: '여섯째 배지', imageUrl: 'https://cdn.example/sixth.png' },
]
/** 배지 상자 하나하나의 style 속성 문자열(그려진 순서) */
const badgeStyles = (html: string) => [...html.matchAll(/<div data-drop-badge="" class="[^"]*" style="([^"]*)"/g)].map((match) => match[1])

describe('드랍·픽업 — 구성', () => {
  it('최소 높이 380, 배지 영역은 326×248 비율이고 제목·설명이 아래에 있다', () => {
    const html = render(dropView({ description: '남는 배지는 드랍해 봐요.' }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.drop_pickup}px`)
    expect(FEED_CARD_MIN_HEIGHT.drop_pickup).toBe(380)
    expect(html).toContain('aspect-ratio:326 / 248')
    expect(html).toContain('남는 배지는 드랍해 봐요.')
    expect(html.indexOf('data-drop-badge')).toBeLessThan(html.indexOf('<h3'))
  })

  it('배지 수별로 틀의 중심 %·한 변 %·기울기·앞뒤 순서(z)를 그대로 그린다', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      const styles = badgeStyles(render(dropView({ badges: MANY.slice(0, n) })))
      expect(styles).toHaveLength(n)
      styles.forEach((style, index) => {
        const spot = FEED_DROP_PICKUP_FRAMES[n][index]
        expect(style).toContain(`left:${spot.x}%`)
        expect(style).toContain(`top:${spot.y}%`)
        expect(style).toContain(`width:${(spot.size / FEED_DROP_PICKUP.refWidth) * 100}%`)
        expect(style).toContain('aspect-ratio:1 / 1')
        expect(style).toContain(`transform:translate(-50%, -50%) rotate(${spot.tilt}deg)`)
        expect(style).toContain(`z-index:${index}`)
      })
    }
  })

  it('같은 배지 수면 늘 같은 모양이다(시드가 달라도 배치가 같다)', () => {
    const a = badgeStyles(render(dropView({ badges: MANY.slice(0, 4), feed_seed: 3 })))
    const b = badgeStyles(render(dropView({ badges: MANY.slice(0, 4), feed_seed: 99 })))
    expect(a).toEqual(b)
  })

  it('6개 이상이면 앞 5개만 그린다', () => {
    const html = render(dropView({ badges: MANY }))
    expect(badgeStyles(html)).toHaveLength(5)
    expect(html).toContain('alt="손때 묻은 열쇠"')
    expect(html).not.toContain('여섯째 배지')
  })

  it('박스(FeedBox)도, 박스 색도, 외곽선·그림자도 없다(hex 없음)', () => {
    const html = render(dropView({ badges: MANY.slice(0, 5), box_color_key: 'green', box_shape: 'ticket' }))
    expect(html).not.toContain('mask-image')
    expect(html).not.toContain('padding:28px')
    expect(html).not.toContain('background-color:var(--jam-green)')
    expect(html).not.toMatch(/box-shadow|drop-shadow|filter:/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}[;"']/)
    // 칩에만 외곽선(border-width)이 있다
    expect(count(html, 'border-width')).toBe(count(html, 'rounded-full'))
  })

  it('배지의 alt는 이름이고 그림은 object-contain이다', () => {
    const html = render(dropView())
    for (const badge of BADGES) expect(html).toContain(`alt="${badge.name}"`)
    expect(html).toContain('object-contain')
  })

  it('이미지가 없는 배지는 같은 상자 안에서 이름 글자(font-black, 가운데)로 대신한다(이미지 태그 없음)', () => {
    const html = render(dropView({ badges: [{ name: '이름만 있는 배지', imageUrl: null }] }))
    expect(html).not.toContain('<img')
    expect(html).toContain('이름만 있는 배지')
    expect(html).toContain('font-black')
    expect(html).toContain('text-base')
    expect(html).toContain('text-center')
    expect(html).toContain('line-clamp-3')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
    expect(badgeStyles(html)).toHaveLength(1)
  })

  it('일부만 그림이 없어도 틀은 그대로이고, 이름 글자색은 바탕을 따른다(짙은 초록 --snow, 밝은 바탕 --foreground)', () => {
    const mixed = MANY.slice(0, 3).map((badge, index) => (index === 1 ? { ...badge, imageUrl: null } : badge))
    const deep = render(dropView({ badges: mixed, bg_color_key: 'green-deep' }))
    expect(badgeStyles(deep)).toHaveLength(3)
    expect(count(deep, '<img')).toBe(2)
    expect(deep).toMatch(/<span class="line-clamp-3[^"]*" style="color:var\(--snow\)">황동 카메라<\/span>/)
    const bright = render(dropView({ badges: mixed, bg_color_key: 'yellow' }))
    expect(bright).toMatch(/<span class="line-clamp-3[^"]*" style="color:var\(--foreground\)">황동 카메라<\/span>/)
  })
})

describe('드랍·픽업 — 칩·링크·설명', () => {
  it('칩이 저장되지 않으면 «DROP»·«PICKUP» 두 분류 칩(검정)이 자동 칩이고 계획이 그린다(스티커 한 개 + 검정 알약, 또는 알약, 못 놓으면 둘째 칩을 뺀다)', () => {
    const view = dropView({ chip_color_key: 'green' })
    expect(view.look.chips.map((chip) => [chip.text, chip.color, chip.size])).toEqual([
      ['DROP', 'black', 'lg'],
      ['PICKUP', 'black', 'lg'],
    ])
    for (let seed = 1; seed <= 40; seed += 1) {
      const seeded = dropView({ chip_color_key: 'green', feed_seed: seed })
      const html = render(seeded)
      const plan = planOf(seeded)
      expect(plan.chips.length).toBeGreaterThanOrEqual(1)
      expect(chipCount(html)).toBe(plan.chips.length)
      expect(plan.chips.filter((chip) => chip.presentation === 'sticker').length).toBeLessThanOrEqual(1)
      for (const chip of plan.chips) {
        expect(chip.kind).toBe('label')
        if (chip.presentation === 'sticker') {
          expect(html).toContain(`aria-label="${chip.text}"`)
        } else {
          // 알약은 분류 칩이라 --foreground 면에 --snow 글자이고 계획의 크기(큰 코너 칩 52, 물러서면 40)다
          expect(chip.black).toBe(true)
          expect(html).toContain(`>${chip.text}<`)
          expect(html).toContain(`height:${chip.size === 'lg' ? 52 : 40}px`)
        }
      }
      if (plan.chips.some((chip) => chip.presentation === 'pill')) {
        expect(html).toContain('background-color:var(--foreground)')
        expect(html).toContain('text-snow')
      }
    }
  })

  it('칩이 둘 남는 계획이면 서로 다른 모서리에 반대 방향으로 기울고 같은 줄에 서지 않는다(둘째가 내려 앉거나 대각선)', () => {
    // 알려진 한계(티켓 20261122_2228 R5): 폭 343에서 배지 세 칸의 가운데를 피하면 칩 둘이 함께 들어가기 어려워 계획이 둘째 분류 칩을 뺄 수 있다. 그래서 «둘이 남은 계획»만 확인한다.
    for (let seed = 1; seed <= 60; seed += 1) {
      const plan = planOf(dropView({ feed_seed: seed }))
      expect(plan.chips.length).toBeGreaterThanOrEqual(1)
      expect(plan.chips.length).toBeLessThanOrEqual(2)
      if (plan.chips.length < 2) continue
      const [first, second] = plan.chips
      expect(first.corner).not.toBe(second.corner)
      expect(Math.sign(first.tilt)).toBe(-Math.sign(second.tilt))
      if (first.corner.startsWith(second.corner.slice(0, 3))) expect(first.lowered || second.lowered || first.edge || second.edge).toBeTruthy() // 둘째가 내려 앉거나 «제목 옆 가장자리»에 놓인다
    }
  })

  it('저장된 chips가 있으면 그것을 따른다(한 개만 저장하면 한 개, 어드민이 정한 자리는 옮기지 않는다)', () => {
    const view = dropView({ chips: [{ kind: 'phrase', text: '드랍 예정', slot: 'box-row-bottom-right' }] })
    const html = render(view)
    expect(chipCount(html)).toBe(1)
    expect(html).toContain('드랍 예정')
    expect(planOf(view).chips[0].corner).toBe('bottom-right')
    expect(html).toMatch(/right:calc\(-?[\d.]+% \+ [\d.]+px\);bottom:calc\(-?[\d.]+% \+ [\d.]+px\)/)
    expect(html).not.toContain('PICKUP')
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
    expect(chipCount(html)).toBe(2)
  })

  it('칩 없음([])이면 칩 층이 없다', () => {
    const html = render(dropView({ chips: [] }))
    expect(chipCount(html)).toBe(0)
    expect(html).not.toContain('data-chip-plan')
  })

  it('칩 층은 카드 셸의 직계라 박스 줄 안(배지 칸)에 칩이 없고, 바깥으로는 6px까지만 나간다(폭 343)', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const view = dropView({ feed_seed: n })
      const html = render(view)
      expect(html).not.toContain('top:-16px')
      expect(html).not.toContain('left:-12px')
      expect(html.indexOf('data-chip-plan')).toBeGreaterThan(html.indexOf('<h3'))
      const { plan: input } = chainInputOf(view)
      const { height } = cardGeometryOf({ ...input, feedType: 'drop_pickup', width: 343 })
      for (const chip of planOf(view).chips) {
        const b = tiltedBounds(chip.box.w, chip.box.h, chip.tilt)
        const rect = cornerRect(chip.corner, b.w, b.h, { x: chip.inset.x / 100, y: chip.inset.y / 100 }, 343, height)
        const edgeX = chip.corner.endsWith('left') ? rect.l : 343 - rect.r
        const edgeY = chip.corner.startsWith('top') ? rect.t : height - rect.b
        expect(edgeX).toBeGreaterThanOrEqual(-FEED_CORNER_OVERHANG - 1e-6)
        expect(edgeY).toBeGreaterThanOrEqual(-FEED_CORNER_OVERHANG - 1e-6)
      }
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
