import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect } from 'storybook/test'
import { d } from '@/lib/i18n'
import { buildFacts, type CardView, type ImageCardView } from '@/lib/today/cardView'
import TodayCard from './TodayCard'

/**
 * 이미지 모양 세 개(`hero` · `poster` · `square`) 나란히 비교 (티켓 20261001_2013, 상위 20260930_1453 조각 b4) — 사용자 확인용 Story.
 * 1453 「확정 설계」 11절의 사용자 확인 시점(「b4 뒤」)에 이 Story 하나를 360·430 폭으로 열어 스크린숏 한 장씩으로 세 모양을 비교한다.
 *
 * 두 줄로 구성한다.
 * - A줄 — 같은 컨텐츠(미션 텍스트)를 모양마다 그 모양의 정규 비율 이미지로 보인다(hero 16:9 · poster 4:5 · square 1:1, 같은 그림의 세 비율 가짜 커버).
 *   360 기기(카드 328px)와 430 기기(카드 398px) 각각.
 * - B줄 — 같은 1:1 배지 그림 한 장을 세 모양에 넣는다. hero는 위아래가 잘리고, poster는 좌우가 잘리고, square는 전체가 보인다.
 *   1737에서 넘어온 사용자 확인 항목(hero에서 1:1 배지 그림이 크게 잘리는 것)을 이 줄이 바로 보여 준다.
 *
 * 카드 폭은 뷰포트 에뮬레이션이 아니라 고정 폭 래퍼다. 캔버스는 기본 검정이다. 개별 모양의 상태 행렬은 각 모양의 Story(`HeroCard`·`PosterCard`·`SquareCard`)에 있다.
 * 아래 `play`는 비율·잘림 같은 계산 스타일을 눈으로 확인할 때 쓰는 보조 단언이고 CI에서 실행되지 않는다(vitest의 addon-vitest 연동 제거, `vitest.config.ts` 머리말).
 * 이미지는 외부 요청 없이 뜨도록 `data:` SVG 가짜 커버와 `public/badges/sample`의 배지 그림만 쓴다.
 */

const NOW = new Date('2026-10-05T12:00:00+09:00')

const W360 = 328 // 360 기기 카드 폭
const W430 = 398 // 430 기기 카드 폭

/** 같은 그림의 세 비율 가짜 커버. 가장자리 띠·테두리·가운데 원은 비율마다 같은 배색이다. */
function fakeCover(width: number, height: number): string {
  const background = '#3a5f7d'
  const accent = '#f2c14e'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${background}"/>` +
    `<rect width="${width}" height="${height * 0.12}" fill="${accent}" opacity="0.35"/>` +
    `<rect y="${height * 0.88}" width="${width}" height="${height * 0.12}" fill="${accent}" opacity="0.35"/>` +
    `<rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="${accent}" stroke-width="12"/>` +
    `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.27}" fill="${accent}"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const COVER = {
  hero: fakeCover(1280, 720), // 16:9
  poster: fakeCover(1024, 1280), // 4:5
  square: fakeCover(1024, 1024), // 1:1
} as const

/** 1:1 투명 PNG 배지 그림(276×276) */
const BADGE_ART = '/badges/sample/s008.png'

type Shape = 'hero' | 'poster' | 'square'

const SHAPES: readonly { shape: Shape; name: string }[] = [
  { shape: 'hero', name: 'hero · 16:9' },
  { shape: 'poster', name: 'poster · 4:5' },
  { shape: 'square', name: 'square · 1:1' },
]

const MISSION_FACTS = buildFacts(
  'mission',
  { period: { startsAt: '2026-10-12T00:00:00+09:00', endsAt: '2026-11-08T23:59:59+09:00' }, rewardPoints: 300, rewardBadgeCount: 1 },
  NOW,
)

/** A줄 — 같은 컨텐츠(미션 텍스트), 모양마다 정규 비율 이미지 */
const missionAs = (shape: Shape): ImageCardView => ({
  shape,
  resource: 'mission',
  label: d.todayCard.missionSpotlight,
  title: '한강 러닝 챌린지',
  subtitle: '이번 주말 같이 달려요',
  facts: MISSION_FACTS,
  description: '한강공원 코스를 달리면 보상을 드려요',
  href: '/missions/m1',
  imageUrl: COVER[shape],
})

/** B줄 — 같은 1:1 배지 그림 한 장을 세 모양에 */
const badgeAs = (shape: Shape): ImageCardView => ({
  shape,
  resource: 'badge',
  label: d.todayCard.badgeSpotlight,
  title: '성수동 탐험가 배지가 열렸어요',
  subtitle: '성수동 골목을 걸으면 얻을 수 있어요',
  facts: buildFacts('badge', { badgeName: '성수동 탐험가' }, NOW),
  rarity: 'epic',
  href: '/badges/b1',
  imageUrl: BADGE_ART,
})

// ─── 배치 도우미 ───────────────────────────────────────────────────────────

const GROUP_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-24)' }
const ROW_STYLE: CSSProperties = { display: 'flex', gap: 'var(--spacing-32)', alignItems: 'flex-start' }
const HEADING_STYLE: CSSProperties = { margin: '0 0 var(--spacing-8)', fontSize: 'var(--text-body)', color: 'rgba(255,255,255,0.9)' }
const CAPTION_STYLE: CSSProperties = { margin: '0 0 var(--spacing-4)', fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.6)' }

/** 캡션 + 카드. `data-card`가 비율·잘림 측정 대상이고 `data-shape`·`data-row`가 어느 모양·줄인지 알려 준다. */
function Case({ shape, row, width, caption, view }: { shape: Shape; row: string; width: number; caption: string; view: CardView }) {
  return (
    <div style={{ width }}>
      <p style={CAPTION_STYLE}>{caption}</p>
      <div data-card data-shape={shape} data-row={row}>
        <TodayCard view={view} />
      </div>
    </div>
  )
}

/** 한 줄 = 한 폭에서 세 모양 */
function ShapeRow({ row, width, title, make }: { row: string; width: number; title: string; make: (shape: Shape) => CardView }): ReactNode {
  return (
    <div>
      <p style={HEADING_STYLE}>{title}</p>
      <div style={ROW_STYLE}>
        {SHAPES.map(({ shape, name }) => (
          <Case key={shape} shape={shape} row={row} width={width} caption={name} view={make(shape)} />
        ))}
      </div>
    </div>
  )
}

const cardOf = (root: HTMLElement, row: string, shape: Shape) =>
  root.querySelector<HTMLElement>(`[data-row="${row}"][data-shape="${shape}"]`)!

/** 모양별 이미지 칸(비율 클래스로 찾는다) */
const slotOf = (card: HTMLElement) => card.querySelector<HTMLElement>('[class*="aspect-"]')!

/**
 * 이미지(원본 비율을 지키며 칸에 맞춘 그림)가 칸에서 잘리는 비율. `object-fit`이 `cover`면 한 변이 칸 밖으로 나가고 `contain`이면 0이다.
 * 반환값은 [세로 잘림, 가로 잘림] (0~1, 잘린 부분 / 그림 전체).
 */
function cropOf(card: HTMLElement): { vertical: number; horizontal: number } {
  const img = slotOf(card).querySelector<HTMLImageElement>('img')!
  const box = slotOf(card).getBoundingClientRect()
  const fit = getComputedStyle(img).objectFit
  const scale =
    fit === 'cover'
      ? Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight)
      : Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight)
  const shownWidth = img.naturalWidth * scale
  const shownHeight = img.naturalHeight * scale
  return {
    vertical: Math.max(0, (shownHeight - box.height) / shownHeight),
    horizontal: Math.max(0, (shownWidth - box.width) / shownWidth),
  }
}

// ─── 메타 ────────────────────────────────────────────────────────────────

const meta: Meta<typeof TodayCard> = {
  title: '서비스/Today/이미지 모양 비교',
  component: TodayCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '이미지가 있는 세 모양(`hero` 16:9 · `poster` 4:5 · `square` 1:1)을 한 화면에 나란히 보이는 사용자 확인용 Story — 티켓 20261001_2013(상위 20260930_1453 조각 b4). ' +
          'A줄은 같은 컨텐츠를 모양마다 정규 비율 이미지로, B줄은 같은 1:1 배지 그림 한 장을 세 모양에 넣어 hero는 위아래가, poster는 좌우가 잘리고 square는 전체가 보이는 것을 보여 준다.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

/** A줄(같은 컨텐츠, 정규 비율 이미지) 360·430 + B줄(같은 1:1 배지 그림) 360·430. */
export const Comparison: Story = {
  name: '세 모양 나란히 — A줄 같은 컨텐츠 · B줄 같은 1:1 배지 그림 (360 · 430)',
  render: () => (
    <div style={GROUP_STYLE}>
      <ShapeRow row="a360" width={W360} title="A줄 · 같은 컨텐츠 · 360 기기(카드 328px)" make={missionAs} />
      <ShapeRow row="a430" width={W430} title="A줄 · 같은 컨텐츠 · 430 기기(카드 398px)" make={missionAs} />
      <ShapeRow row="b360" width={W360} title="B줄 · 같은 1:1 배지 그림 · 360 기기 — hero 위아래 잘림 · poster 좌우 잘림 · square 전체" make={badgeAs} />
      <ShapeRow row="b430" width={W430} title="B줄 · 같은 1:1 배지 그림 · 430 기기" make={badgeAs} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    for (const [row, width] of [['a360', W360], ['a430', W430], ['b360', W360], ['b430', W430]] as const) {
      const hero = slotOf(cardOf(canvasElement, row, 'hero')).getBoundingClientRect()
      const poster = slotOf(cardOf(canvasElement, row, 'poster')).getBoundingClientRect()
      const square = slotOf(cardOf(canvasElement, row, 'square')).getBoundingClientRect()
      // 이미지 칸 비율: hero 16:9 · poster 4:5 · square 1:1, 세 모양 모두 카드 폭 가득
      expect(Math.abs(hero.width - width)).toBeLessThanOrEqual(1)
      expect(Math.abs(poster.width - width)).toBeLessThanOrEqual(1)
      expect(Math.abs(square.width - width)).toBeLessThanOrEqual(1)
      expect(Math.abs(hero.height - (width * 9) / 16)).toBeLessThanOrEqual(1)
      expect(Math.abs(poster.height - (width * 5) / 4)).toBeLessThanOrEqual(1)
      expect(Math.abs(square.height - width)).toBeLessThanOrEqual(1)
    }
    // A줄: 정규 비율 이미지라 어느 모양도 잘리지 않는다(원본 비율 = 칸 비율)
    for (const shape of ['hero', 'poster', 'square'] as const) {
      const { vertical, horizontal } = cropOf(cardOf(canvasElement, 'a360', shape))
      expect(vertical).toBeLessThan(0.01)
      expect(horizontal).toBeLessThan(0.01)
    }
    // B줄: 같은 1:1 그림이 hero에서는 위아래(43.75%)가, poster에서는 좌우(20%)가 잘리고 square에서는 전체가 보인다
    for (const row of ['b360', 'b430']) {
      const hero = cropOf(cardOf(canvasElement, row, 'hero'))
      const poster = cropOf(cardOf(canvasElement, row, 'poster'))
      const square = cropOf(cardOf(canvasElement, row, 'square'))
      expect(Math.abs(hero.vertical - 0.4375)).toBeLessThan(0.01)
      expect(hero.horizontal).toBeLessThan(0.01)
      expect(Math.abs(poster.horizontal - 0.2)).toBeLessThan(0.01)
      expect(poster.vertical).toBeLessThan(0.01)
      expect(square.vertical).toBeLessThan(0.01)
      expect(square.horizontal).toBeLessThan(0.01)
    }
  },
}
