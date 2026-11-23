/**
 * 칩 계획 층 `FeedChipPlanLayer` (티켓 20261122_2228 R6, 상위 20261122_2217 §3·§4·§6·§7)
 *
 * 저장소에 jsdom이 없어 `renderToStaticMarkup`으로 마크업 문자열을 단언한다.
 *
 * 확인하는 것: 계획(`view.look.chipPlan`)의 문구·모양(`presentation`)·스티커 인자가 알약(`rounded-full`)·스티커(`role="img"`+분류 문구 `aria-label`)로 이어진다,
 * 값 칩은 저장된 칩 색·분류 알약은 검정, 기울기 부호·배율을 그대로 쓴다, 층은 `pointer-events-none`이다, 계획이 없는 단건 경로는 «앞 카드 없음» 계획으로 같은 그림을 낸다,
 * 칩 `[]`·흐름 줄(목록형)은 아무것도 그리지 않는다, 유형 7개의 칩이 카드 안(바깥 6px 한도)에서 글자·그림 안전 구역과 겹치지 않는다(계획 좌표 기준, 폭 343).
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedChipPlanLayer.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'
import { FeedChipPlanLayer } from '../feed/FeedCardParts'
import { burstBadgeStyle } from '../feed/FeedCollectionBurst'
import type { FeedCardView } from '@/lib/today/cardView'
import { chainInputOf, planFeedChips } from '@/lib/today/feedChipChain'
import { cardGeometryOf, cornerRect, overlapWithAll, tiltedBounds, type ChipGeometryType } from '@/lib/today/feedChipGeometry'
import type { ChipPlan, PlannedChip } from '@/lib/today/feedChipPlan'
import { FEED_BURST, FEED_CORNER_OVERHANG, FEED_CORNER_TILT_RANGE } from '@/lib/today/feedConstants'
import { resolveFeedLook, type FeedLookCard, type RenderedFeedType } from '@/lib/today/feedLook'
import type { FeedValueChipSource } from '@/lib/today/feedValueChips'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const MISSION: FeedValueChipSource = { resource: 'mission', endsAt: '2026-11-23T12:00:00+09:00', rewardPoints: 300 }
const BADGES = [
  { name: '펜', imageUrl: 'https://cdn.example/pen.png' },
  { name: '카메라', imageUrl: 'https://cdn.example/camera.png' },
  { name: '우산', imageUrl: 'https://cdn.example/umbrella.png' },
]
const TWO_CHIPS = [
  { kind: 'phrase' as const, text: '이번 주 미션' },
  { kind: 'label' as const, text: '아이템 배지' },
]

function viewOf(feedType: RenderedFeedType, stored: Partial<FeedLookCard> = {}, extra: Partial<FeedCardView> = {}): FeedCardView {
  const look = resolveFeedLook({
    card: { id: 'card-1', feed_type: feedType, ...stored },
    feedType,
    valueSource: feedType === 'drop_pickup' ? { resource: 'drop_pickup' } : MISSION,
    now: NOW,
  })
  return {
    resource: 'mission',
    title: '낙엽 소리 따라\n걷는 한 주',
    feedType,
    imageUrl: 'https://cdn.example/cover.png',
    badgeImageUrl: 'https://cdn.example/badge.png',
    look,
    ...(feedType === 'drop_pickup' ? { itemBadges: BADGES } : {}),
    ...extra,
  }
}

const render = (view: FeedCardView) => renderToStaticMarkup(<FeedChipPlanLayer view={view} />)
const count = (html: string, needle: string) => html.split(needle).length - 1

const chipOf = (overrides: Partial<PlannedChip>): PlannedChip => ({
  index: 0,
  kind: 'label',
  presentation: 'pill',
  text: 'ITEM',
  corner: 'top-left',
  inset: { x: 3, y: -1 },
  lowered: false,
  tilt: 7,
  size: 'lg',
  scale: 1,
  black: true,
  sticker: null,
  box: { w: 100, h: 52 },
  ...overrides,
})

const withPlan = (view: FeedCardView, chips: PlannedChip[]): FeedCardView => ({
  ...view,
  look: { ...view.look, chipPlan: { feedType: view.feedType, chips, backoff: 0, fit: true, overlap: 0, flow: false } satisfies ChipPlan },
})

describe('FeedChipPlanLayer — 계획을 그린다', () => {
  it('층은 pointer-events-none·absolute inset-0·z-10이다(카드 전체가 링크라 칩이 터치를 가로채지 않는다)', () => {
    const html = render(withPlan(viewOf('hero_box'), [chipOf({})]))
    expect(html).toMatch(/^<div data-chip-plan="" class="pointer-events-none absolute inset-0 z-10">/)
  })

  it('알약: 분류 알약은 검정(--foreground 면·--snow 글자), 코너 변형(52)이고 계획의 기울기를 그대로 쓴다', () => {
    const html = render(withPlan(viewOf('hero_box'), [chipOf({ tilt: -9 })]))
    expect(html).toContain('>ITEM<')
    expect(html).toContain('rounded-full')
    expect(html).toContain('background-color:var(--foreground)')
    expect(html).toContain('text-snow')
    expect(html).toContain('height:52px')
    expect(html).toContain('transform:rotate(-9deg)')
    expect(html).toContain('font-black')
  })

  it('값 칩 알약은 저장된 칩 색(chip_color_key)이고 작은 칩은 높이 40이다', () => {
    const view = viewOf('hero_box', { chip_color_key: 'green' })
    const html = render(withPlan(view, [chipOf({ kind: 'value', text: '3일 남음', black: false, size: 'sm' })]))
    expect(html).toContain('background-color:var(--jam-green)')
    expect(html).toContain('height:40px')
    expect(html).toContain('text-foreground')
    expect(html).not.toContain('text-snow')
  })

  it('스티커: role="img"와 분류 문구 aria-label이 붙고 알약은 그리지 않는다. 기울기·배율은 바깥 span의 transform이다', () => {
    const sticker = { shape: 'pebble' as const, pair: 'yellow-purple' as const, letter: 'J' as const, seed: '1:sticker:0', label: 'MISSION' }
    const html = render(
      withPlan(viewOf('hero_box'), [chipOf({ presentation: 'sticker', text: 'MISSION', black: false, tilt: -6, scale: 0.8, sticker, box: { w: 92.8, h: 67.2 } })]),
    )
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="MISSION"')
    expect(html).toContain('<svg')
    expect(html).toContain('transform:rotate(-6deg) scale(0.8)')
    expect(html).not.toContain('rounded-full')
  })

  it('칩마다 계획의 모서리·안쪽 오프셋으로 놓인다(left|right·top|bottom, 가운데 맞춤 translate)', () => {
    const html = render(
      withPlan(viewOf('text_box'), [
        chipOf({ corner: 'top-left', inset: { x: 2, y: -1 } }),
        chipOf({ index: 1, corner: 'bottom-right', inset: { x: 4, y: 3 }, tilt: -5, kind: 'value', black: false, text: '300P' }),
      ]),
    )
    expect(html).toMatch(/left:calc\(2% \+ [\d.]+px\);top:calc\(-1% \+ [\d.]+px\);transform:translate\(-50%, -50%\)/)
    expect(html).toMatch(/right:calc\(4% \+ [\d.]+px\);bottom:calc\(3% \+ [\d.]+px\);transform:translate\(50%, 50%\)/)
  })

  it('두 칩의 기울기 부호를 뒤집거나 평준화하지 않는다(반대 방향 그대로)', () => {
    const html = render(
      withPlan(viewOf('hero_box'), [chipOf({ tilt: 8 }), chipOf({ index: 1, corner: 'top-right', tilt: -5, kind: 'value', black: false, text: '3일' })]),
    )
    expect(html).toContain('rotate(8deg)')
    expect(html).toContain('rotate(-5deg)')
  })

  it('옛 앵커 걸침(top:-16px·left:-12px)을 쓰지 않는다', () => {
    const html = render(withPlan(viewOf('hero_box'), [chipOf({})]))
    expect(html).not.toContain('top:-16px')
    expect(html).not.toContain('left:-12px')
  })
})

describe('FeedChipPlanLayer — 그리지 않는 경우와 계획이 없는 경로', () => {
  it('칩이 없으면([]) 아무것도 그리지 않는다', () => {
    for (const type of ['hero_box', 'badge_intro', 'text_box', 'drop_pickup', 'collection_intro', 'badge_only'] as const) {
      expect(render(viewOf(type, { chips: [] }))).toBe('')
    }
  })

  it('목록형(흐름 줄)은 칩 층을 쓰지 않는다 — 칩이 있어도 아무것도 그리지 않는다', () => {
    expect(render(viewOf('gallery_list', { chips: [{ kind: 'phrase', text: '요즘 인기', slot: 'card-top-right' }] }))).toBe('')
    expect(render(withPlan(viewOf('gallery_list'), []))).toBe('')
  })

  it('계획이 비어 있으면(칩을 모두 뺀 계획) 층을 그리지 않는다', () => {
    expect(render(withPlan(viewOf('hero_box'), []))).toBe('')
  })

  it('look.chipPlan이 없으면 «앞 카드 없음» 계획을 즉석에서 만들어 같은 그림을 낸다', () => {
    for (const type of ['hero_box', 'badge_intro', 'text_box', 'drop_pickup', 'collection_intro'] as const) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const view = viewOf(type, { feed_seed: seed, chips: TWO_CHIPS })
        expect(view.look.chipPlan).toBeUndefined()
        const explicit = { ...view, look: { ...view.look, chipPlan: planFeedChips([chainInputOf(view)])[0] } }
        expect(render(view)).toBe(render(explicit))
      }
    }
  })

  it('계획의 문구·모양이 그대로 마크업이 된다: 스티커면 role="img"+분류 문구, 알약이면 rounded-full 문구', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      const view = viewOf('hero_box', { feed_seed: seed, chips: TWO_CHIPS })
      const plan = planFeedChips([chainInputOf(view)])[0]
      const html = render(view)
      expect(count(html, 'rounded-full')).toBe(plan.chips.filter((chip) => chip.presentation === 'pill').length)
      expect(count(html, 'role="img"')).toBe(plan.chips.filter((chip) => chip.presentation === 'sticker').length)
      for (const chip of plan.chips) {
        if (chip.presentation === 'sticker') {
          expect(html).toContain(`aria-label="${chip.sticker!.label}"`)
          seen.add('sticker')
        } else {
          expect(html).toContain(`>${chip.text}<`)
          seen.add('pill')
        }
      }
    }
    // 시드 40개 안에 알약과 스티커가 모두 나온다
    expect([...seen].sort()).toEqual(['pill', 'sticker'])
  })

  it('스티커는 카드당 한 개까지다', () => {
    for (const type of ['hero_box', 'badge_intro', 'text_box', 'drop_pickup', 'collection_intro'] as const) {
      for (let seed = 1; seed <= 30; seed += 1) {
        expect(count(render(viewOf(type, { feed_seed: seed, chips: TWO_CHIPS })), 'role="img"')).toBeLessThanOrEqual(1)
      }
    }
  })

  it('드랍·픽업의 둘째 칩은 스티커가 아니라 검정 알약이다(스티커 한 개 + 검정 알약, 또는 알약 둘)', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const html = render(viewOf('drop_pickup', { feed_seed: seed }))
      const stickers = count(html, 'role="img"')
      const pills = count(html, 'rounded-full')
      expect(stickers).toBeLessThanOrEqual(1)
      expect(stickers + pills).toBeLessThanOrEqual(2)
      if (pills > 0) expect(count(html, 'background-color:var(--foreground)')).toBe(pills)
    }
  })
})

describe('FeedChipPlanLayer — 유형 7개: 칩이 카드 안 모서리에서 글자·그림을 가리지 않는다(계획 좌표, 폭 343)', () => {
  const WIDTH = 343
  const types: ChipGeometryType[] = ['hero_box', 'badge_intro', 'text_box', 'drop_pickup', 'collection_intro', 'badge_only', 'gallery_list']

  for (const type of types) {
    it(`${type}: 그려지는 칩은 모두 바깥 한도(6px)와 기울기 3~12° 안이고 피할 영역과 겹치지 않는다`, () => {
      let drawn = 0
      for (let seed = 1; seed <= 25; seed += 1) {
        const view = viewOf(type, { feed_seed: seed, chips: TWO_CHIPS, ...(type === 'text_box' ? { box_kind: 'text' as const } : {}) })
        const plan = planFeedChips([chainInputOf(view)])[0]
        const html = render(view)
        expect(count(html, 'rounded-full') + count(html, 'role="img"')).toBe(plan.chips.length)
        if (plan.flow || plan.chips.length === 0) {
          expect(html).toBe('')
          continue
        }
        const { plan: input } = chainInputOf(view)
        const geometry = cardGeometryOf({ ...input, feedType: type, width: WIDTH })
        const rects = plan.chips.map((chip) => {
          const b = tiltedBounds(chip.box.w, chip.box.h, chip.tilt)
          return cornerRect(chip.corner, b.w, b.h, { x: chip.inset.x / 100, y: chip.inset.y / 100 }, geometry.width, geometry.height)
        })
        plan.chips.forEach((chip, i) => {
          drawn += 1
          const rect = rects[i]
          const edgeX = chip.corner.endsWith('left') ? rect.l : WIDTH - rect.r
          const edgeY = chip.corner.startsWith('top') ? rect.t : geometry.height - rect.b
          expect(edgeX).toBeGreaterThanOrEqual(-FEED_CORNER_OVERHANG - 1e-6)
          expect(edgeY).toBeGreaterThanOrEqual(-FEED_CORNER_OVERHANG - 1e-6)
          expect(Math.abs(chip.tilt)).toBeGreaterThanOrEqual(FEED_CORNER_TILT_RANGE.min)
          expect(Math.abs(chip.tilt)).toBeLessThanOrEqual(FEED_CORNER_TILT_RANGE.max)
          if (plan.fit) expect(overlapWithAll(rect, geometry.avoid)).toBe(0)
        })
      }
      // 배지만은 칩 자리가 없는 유형이라 그려지는 칩이 없다(R3 표에는 있지만 `look.chips`가 비어 있다)
      if (type === 'gallery_list' || type === 'badge_only') expect(drawn).toBe(0)
      else expect(drawn).toBeGreaterThan(0)
    })
  }
})

describe('컬렉션 퍼진 배지 영역 — 계획의 기하와 실제 CSS가 같다(R3·R4 가정 1·2 확인)', () => {
  it('계획은 중심을 «영역 가운데 + (x·(카드 폭−32)/2, y·240/2)»로 보고, 화면은 translate(x × 50cqw, y × 50cqh)로 그린다 — 50cqw=(폭−32)/2, 50cqh=120이라 같다', () => {
    const width = 343
    const burst = [{ x: 0.8, y: -0.6, size: 80 }]
    const geometry = cardGeometryOf({
      feedType: 'collection_intro',
      width,
      titleLines: [8],
      descriptionLength: 0,
      descriptionVisible: false,
      hasImage: false,
      burst,
    })
    // 마지막 피할 영역이 퍼진 배지(기울어도 덮이도록 한 변 × 1.2)다
    const rect = geometry.avoid[geometry.avoid.length - 1]
    const planned = { cx: (rect.l + rect.r) / 2, cy: (rect.t + rect.b) / 2 }

    const style = burstBadgeStyle({ imageUrl: 'x', x: 0.8, y: -0.6, tilt: 0, size: 80, delayMs: 100 }, { phase: 'spread', animate: false })
    expect(style.transform).toContain('calc(0.8 * 50cqw)')
    expect(style.transform).toContain('calc(-0.6 * 50cqh)')
    // 영역: 폭 = 카드 폭 − 안쪽 여백 32, 높이 = FEED_BURST.areaHeight, 위 여백 16 — 배지는 영역 가운데(50%·50%)에서 출발한다
    const area = { w: width - 32, h: FEED_BURST.areaHeight, left: 16, top: 16 }
    const actual = { cx: area.left + area.w / 2 + 0.8 * (area.w / 2), cy: area.top + area.h / 2 + -0.6 * (area.h / 2) }
    expect(planned.cx).toBeCloseTo(actual.cx, 6)
    expect(planned.cy).toBeCloseTo(actual.cy, 6)
  })
})
