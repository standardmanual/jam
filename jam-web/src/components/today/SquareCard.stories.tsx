import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect, userEvent } from 'storybook/test'
import { d } from '@/lib/i18n'
import { buildFacts, type CardView, type ImageCardView } from '@/lib/today/cardView'
import TodayCard from './TodayCard'

/**
 * 정사각 큰 카드(`square`) 상태 행렬 (티켓 20261001_2013, 상위 20260930_1453 조각 b4).
 *
 * - 카드 폭은 뷰포트 에뮬레이션이 아니라 고정 폭 래퍼다: 360 기기 = 328px, 430 기기 = 398px, 320 기기 = 288px(최악 조합만).
 *   이미지 칸은 카드 폭과 같은 1:1이라 328px 폭에서 328px, 398px에서 398px, 288px에서 288px이다. 그 아래 흰 본문이 더해진다.
 * - 카드 높이 실측(Chromium, 2026-10-01 — 확정 설계의 450~570px 추정치 대신 이 값을 쓴다): 값이 가득 찬 미션 카드(요약·필수 정보 2줄) 328px 폭 523.2px · 398px 폭 593.2px,
 *   배지 카드(제목 2줄·요약·필수 정보 1줄) 328px 폭 534.4px, 드랍 카드 503.2px, titleInImage 카드(제목·요약 없음, 필수 정보 2줄) 452px.
 *   최악 조합(긴 제목·요약·필수 정보) 288px 폭 558.4px · 328px 폭 578.4px · 398px 폭 648.4px.
 * - 캔버스는 기본 검정이다. 흰 카드는 검정 위에서만 실제 모습이 나온다.
 * - 이미지 로딩 중 모습(`--color-surface` 단색 판)은 Story로 만들기 어렵다(로컬·data 이미지는 즉시 뜬다). 칸의 클래스(`aspect-square bg-surface`)가
 *   이미지와 무관하게 늘 있다는 것은 `__tests__/SquareCard.test.tsx`·`CardImageSlot.test.tsx`가 보증한다.
 * - Storybook은 `design-system/styles.css`를 import하므로 전역 `*:focus-visible` 윤곽선이 서비스에 없어도 보인다. 그래서 Story에서
 *   윤곽선이 보인다는 것은 서비스 증거가 아니다 — 클래스 단언(`__tests__/CardFrame.test.tsx`)이 보증한다. 아래 `play`는 높이·가로 넘침 같은
 *   계산 스타일을 눈으로 확인할 때 쓰는 보조 단언이고 CI에서 실행되지 않는다(vitest의 addon-vitest 연동 제거, `vitest.config.ts` 머리말).
 * - 계측이 켜진 Story는 노출·클릭 전송(`navigator.sendBeacon`)이 나가지 않게 `beforeEach`에서 막는다.
 * - 이미지는 외부 요청 없이 뜨도록 `data:` SVG 가짜 커버와 `public/badges/sample`의 배지 그림만 쓴다.
 */

const NOW = new Date('2026-10-05T12:00:00+09:00')

const W360 = 328 // 360 기기 카드 폭
const W430 = 398 // 430 기기 카드 폭
const W320 = 288 // 320 기기 카드 폭

/** 가짜 커버 SVG. 가장자리 띠와 가운데 원으로 잘림(`object-cover`였다면 보였을 가장자리)과 칸 경계를 눈으로 볼 수 있게 한다. */
function fakeCover(width: number, height: number, background: string, accent: string): string {
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

/** 1:1 가짜 커버(1024×1024) */
const COVER = fakeCover(1024, 1024, '#3a5f7d', '#f2c14e')
/** 16:9 가짜 커버(1280×720) — 정사각 칸에 넣으면 위아래에 판이 드러나는 레터박스가 되고 테두리 띠가 전부 보인다. */
const COVER_WIDE = fakeCover(1280, 720, '#6b4a7e', '#8fd6a8')
/** 4:5 가짜 커버(1024×1280) — 정사각 칸에 넣으면 좌우에 판이 드러나고 테두리 띠가 전부 보인다. */
const COVER_TALL = fakeCover(1024, 1280, '#8a3b2f', '#f5d28b')

/** 투명 PNG 배지 그림(1:1). 어두운 판 위에서 잘 보인다. */
const SAMPLE = {
  epic: '/badges/sample/s008.png',
  rare: '/badges/sample/s094.png',
  /** 1:1이 아닌 투명 PNG(490×165) */
  wide: '/badges/sample/s331.png',
} as const

const BROKEN = '/badges/sample/없는-파일.png'

const TRACKING = { cardId: 'story-card', contentTypeId: null, templateType: 'mission_spotlight', shape: 'square' } as const

function square(overrides: Partial<ImageCardView>): ImageCardView {
  return { shape: 'square', resource: 'mission', title: '제목', imageUrl: COVER, ...overrides }
}

// ─── 값 ──────────────────────────────────────────────────────────────────

const MISSION = square({
  resource: 'mission',
  label: d.todayCard.missionSpotlight,
  title: '한강 러닝 챌린지',
  subtitle: '이번 주말 같이 달려요',
  facts: buildFacts(
    'mission',
    { period: { startsAt: '2026-10-12T00:00:00+09:00', endsAt: '2026-11-08T23:59:59+09:00' }, rewardPoints: 300, rewardBadgeCount: 1 },
    NOW,
  ),
  href: '/missions/m1',
})

/** 커버가 없어 첫 배지 그림이 이미지로 올라간 JAM! 배지 카드(`resolveShape`가 `square`로 보낸다). 희귀도 칩이 칩 줄에 있다. */
const BADGE = square({
  resource: 'badge',
  label: d.todayCard.badgeSpotlight,
  title: '성수동 탐험가 배지가 열렸어요',
  subtitle: '성수동 골목을 걸으면 얻을 수 있어요',
  facts: buildFacts('badge', { badgeName: '성수동 탐험가' }, NOW),
  rarity: 'epic',
  imageUrl: SAMPLE.epic,
  href: '/badges/b1',
})

const DROP = square({
  resource: 'drop',
  label: d.todayCard.dropAlert,
  title: '한강공원 번개 드랍',
  subtitle: '지금 가면 만날 수 있어요',
  // 지역 값이 있어도 드랍은 칩 줄에 핀을 그리지 않는다(필수 정보 「지역」 줄이 같은 값을 낸다)
  regionLabel: '여의도 한강공원',
  facts: buildFacts('drop', { place: '여의도 한강공원' }, NOW),
  href: '/drops',
})

// ─── 배치 도우미 ───────────────────────────────────────────────────────────

const STACK_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }
const CAPTION_STYLE: CSSProperties = { margin: '0 0 var(--spacing-4)', fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.6)' }
const ROW_STYLE: CSSProperties = { display: 'flex', gap: 'var(--spacing-32)', flexWrap: 'wrap', alignItems: 'flex-start' }

/** 고정 폭 열. 카드 사이 간격은 `TodayCardStack`의 `gap-[var(--spacing-16)]`과 같다 */
function Column({ width, children }: { width: number; children: ReactNode }) {
  return <div style={{ ...STACK_STYLE, width }}>{children}</div>
}

/** 캡션(검정 캔버스 위 설명 글자) + 카드. `data-card`가 높이·가로 넘침 측정 대상이다 */
function Case({ caption, view, width }: { caption: string; view: CardView; width?: number }) {
  return (
    <div style={width ? { width } : undefined}>
      <p style={CAPTION_STYLE}>{caption}</p>
      <div data-card>
        <TodayCard view={view} />
      </div>
    </div>
  )
}

const cardsOf = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-card]'))
const heightOf = (el: HTMLElement) => el.getBoundingClientRect().height
/** 카드 하나의 1:1 이미지 칸 */
const imageBoxOf = (card: HTMLElement) => card.querySelector<HTMLElement>('.aspect-square')!
/** 카드 하나의 흰 본문(이미지 칸 다음 칸) */
const bodyOf = (card: HTMLElement) => imageBoxOf(card).nextElementSibling as HTMLElement

/** 어떤 카드도 가로로 넘치지 않는다(`scrollWidth <= clientWidth`) */
function expectNoHorizontalOverflow(root: HTMLElement) {
  const cards = cardsOf(root)
  expect(cards.length).toBeGreaterThan(0)
  for (const card of cards) expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
}

/** 모든 카드의 이미지 칸이 1:1이다(너비 = 높이 = 카드 폭, 오차 1px) */
function expectSquare(root: HTMLElement) {
  for (const card of cardsOf(root)) {
    const { width, height } = imageBoxOf(card).getBoundingClientRect()
    expect(Math.abs(height - width)).toBeLessThanOrEqual(1)
    expect(Math.abs(width - card.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  }
}

/** 칩 줄은 줄바꿈하지 않는다 — 높이가 칩 한 줄(24px) 안에 있고 가로로 넘치지 않는다 */
function expectChipRowOneLine(card: HTMLElement) {
  const row = bodyOf(card).firstElementChild as HTMLElement
  expect(row.getBoundingClientRect().height).toBeLessThanOrEqual(25)
  expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
}

// ─── 메타 ────────────────────────────────────────────────────────────────

const meta: Meta<typeof TodayCard> = {
  title: '서비스/Today/SquareCard',
  component: TodayCard,
  args: { view: MISSION },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '홈 「투데이」의 정사각 큰 카드 모양(`square`) — 티켓 20261001_2013(상위 20260930_1453 조각 b4). 위는 카드 폭 가득한 1:1 이미지 칸, 아래는 흰 본문이다: ' +
          '칩 줄(라벨 · 지역 핀 · 희귀도) · 제목 24px(2줄 말줄임) · 요약 16px(선택) · 필수 정보 14px 굵게(최대 2줄, 말줄임 없이 줄바꿈). 설명문·끝 줄은 없다. ' +
          '이미지는 자르지 않는다(`object-contain`) — 1:1이 아니면 어두운 판 위에 레터박스가 되고 이미지 위에는 아무것도 얹지 않는다. ' +
          '이미지가 없거나 깨져도 같은 1:1 칸에 자원 아이콘 판을 그려 높이가 같다. ' +
          '서비스 전용 컴포넌트라 MODULAR이 아니다(`TodayCard`가 모양을 고르고 `CardFrame`이 링크·계측·눌림·포커스를 맡는다).',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

// ─── 1. 자원별 대표 ───────────────────────────────────────────────────────

/** 미션 · 커버 없는 JAM! 배지(컬러·흑백, Epic 칩) · 드랍. 드랍은 칩 줄에 지역 핀이 없다. 배지 그림은 1:1을 자르지 않고 판 위에 그대로 보인다. */
export const ByResource: Story = {
  name: '자원별 대표 — 미션 · 배지(컬러·흑백, Epic 칩) · 드랍',
  render: () => (
    <Column width={W360}>
      <Case caption="미션 — 1:1 커버 · 요약 · 필수 정보 2줄" view={MISSION} />
      <Case caption="JAM! 배지 — 커버 없음, 첫 배지 그림(컬러) · Epic 칩" view={BADGE} />
      <Case caption="JAM! 배지 — 미보유 흑백(imageDimmed) · Epic 칩은 컬러" view={{ ...BADGE, imageDimmed: true }} />
      <Case caption="드랍 — 칩 줄에 지역 핀 없음(필수 정보 「지역」 줄이 같은 값)" view={DROP} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
    const [, badge, dimmed, drop] = cardsOf(canvasElement)
    expect(badge.textContent).toContain('Epic')
    // 흑백은 이미지에만 걸리고 희귀도 칩·본문은 컬러다
    expect(dimmed.querySelectorAll('.grayscale')).toHaveLength(1)
    expect(dimmed.querySelector('.grayscale')?.tagName).toBe('IMG')
    expect(dimmed.textContent).toContain('Epic')
    // 드랍은 핀이 없고 지역은 필수 정보 한 곳에서만 보인다
    expect(drop.querySelectorAll('.truncate')).toHaveLength(0)
    expect(drop.textContent?.match(/여의도 한강공원/g)).toHaveLength(1)
    // 설명문·끝 줄은 어떤 카드에도 없다
    for (const card of cardsOf(canvasElement)) {
      expect(card.textContent).not.toContain(d.today.cardReadMore)
      expect(card.textContent).not.toContain('→')
    }
  },
}

// ─── 2. 이미지 맞춤 — 투명 PNG · 레터박스 ──────────────────────────────────

/** 투명 PNG 배지 그림은 어두운 판 위에 얹힌다(1:1은 칸을 가득 채우고, 1:1이 아닌 그림은 가로 또는 세로가 비어 판이 드러난다). */
export const TransparentBadge: Story = {
  name: '투명 PNG 배지 그림 — 어두운 판 위(1:1 · 가로로 긴 그림)',
  render: () => (
    <Column width={W360}>
      <Case caption="1:1 투명 PNG — 칸을 가득 채움" view={{ ...BADGE, imageUrl: SAMPLE.rare }} />
      <Case caption="가로로 긴 투명 PNG(490×165) — 위아래가 판으로 비고 그림은 잘리지 않음" view={{ ...BADGE, imageUrl: SAMPLE.wide }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      const img = imageBoxOf(card).querySelector<HTMLImageElement>('img')!
      expect(getComputedStyle(img).objectFit).toBe('contain')
      // 이미지 칸의 바탕은 어두운 판(--color-surface)이다
      const probe = document.createElement('span')
      probe.style.color = 'var(--color-surface)'
      canvasElement.appendChild(probe)
      expect(getComputedStyle(imageBoxOf(card)).backgroundColor).toBe(getComputedStyle(probe).color)
      probe.remove()
    }
  },
}

/** 1:1이 아닌 커버는 잘리지 않고 판 위에 레터박스가 된다 — 16:9는 위아래, 4:5는 좌우가 비고 테두리 띠가 네 변 모두 보인다. */
export const Letterbox: Story = {
  name: '레터박스 — 16:9 · 4:5 커버를 정사각 칸에 넣어도 잘리지 않음',
  render: () => (
    <Column width={W360}>
      <Case caption="1:1 커버(기준)" view={MISSION} />
      <Case caption="16:9 커버 — 위아래에 판이 드러나고 좌우 테두리 띠가 끝까지 보임" view={{ ...MISSION, imageUrl: COVER_WIDE }} />
      <Case caption="4:5 커버 — 좌우에 판이 드러나고 위아래 테두리 띠가 끝까지 보임" view={{ ...MISSION, imageUrl: COVER_TALL }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
    const [, wide, tall] = cardsOf(canvasElement)
    for (const card of [wide, tall]) {
      const img = imageBoxOf(card).querySelector<HTMLImageElement>('img')!
      const style = getComputedStyle(img)
      // 자르지 않는 맞춤이다(object-cover가 아니다)
      expect(style.objectFit).toBe('contain')
      expect(img.naturalWidth).toBeGreaterThan(0)
      // 그림 전체가 칸 안에 들어 있다: 원본 비율을 지킨 그림의 한 변은 칸과 같고 다른 변은 칸보다 작다
      const box = imageBoxOf(card).getBoundingClientRect()
      const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight)
      expect(img.naturalWidth * scale).toBeLessThanOrEqual(box.width + 0.5)
      expect(img.naturalHeight * scale).toBeLessThanOrEqual(box.height + 0.5)
      expect(Math.min(box.width - img.naturalWidth * scale, box.height - img.naturalHeight * scale)).toBeLessThan(0.5)
    }
    // 16:9는 위아래가, 4:5는 좌우가 비어 판이 드러난다
    const wideImg = imageBoxOf(wide).querySelector<HTMLImageElement>('img')!
    const tallImg = imageBoxOf(tall).querySelector<HTMLImageElement>('img')!
    expect(wideImg.naturalWidth).toBeGreaterThan(wideImg.naturalHeight)
    expect(tallImg.naturalHeight).toBeGreaterThan(tallImg.naturalWidth)
  },
}

// ─── 3. 요약 ──────────────────────────────────────────────────────────────

/** 요약이 있으면 제목 아래 4px, 없으면 제목만 남는다. 요약은 2줄에서 말줄임한다. */
export const Subtitle: Story = {
  name: '요약 있음 · 없음 · 2줄 말줄임',
  render: () => (
    <Column width={W360}>
      <Case caption="요약 있음" view={MISSION} />
      <Case caption="요약 없음 — 빈 칸 없이 제목만" view={{ ...MISSION, subtitle: undefined }} />
      <Case
        caption="긴 요약 — 2줄에서 말줄임"
        view={{
          ...MISSION,
          subtitle: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너를 모집하니 놓치지 말고 지금 바로 신청해 보세요',
        }}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [withSubtitle, without, clamped] = cardsOf(canvasElement)
    expect(withSubtitle.textContent).toContain('이번 주말 같이 달려요')
    expect(without.textContent).not.toContain('이번 주말 같이 달려요')
    expect(heightOf(withSubtitle)).toBeGreaterThan(heightOf(without))
    const text = Array.from(clamped.querySelectorAll<HTMLElement>('p.line-clamp-2'))[0]
    expect(text.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(text).lineHeight) * 2 + 1)
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
  },
}

// ─── 4. 필수 정보 ─────────────────────────────────────────────────────────

/** 필수 정보 0·1·2줄. 그 줄만 생략되고 간격은 그룹 구조라 중복이 없다. */
export const FactLines: Story = {
  name: '필수 정보 0줄 · 1줄 · 2줄',
  render: () => (
    <Column width={W360}>
      <Case caption="0줄 — 그 줄만 생략" view={{ ...MISSION, facts: undefined }} />
      <Case caption="1줄" view={{ ...MISSION, facts: ['기간 상시'] }} />
      <Case caption="2줄" view={MISSION} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [zero, one, two] = cardsOf(canvasElement).map(heightOf)
    expect(one).toBeGreaterThan(zero)
    expect(two).toBeGreaterThan(one)
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
  },
}

// ─── 5. 이미지에 제목이 있는 카드 ──────────────────────────────────────────

/**
 * 화면 글자에 제목·요약이 없고 필수 정보가 칩 줄 바로 다음이다. 이미지 alt가 제목이다. 옛 미션 소개 카드는 커버가 연결 미션 이미지와 같으면
 * 「이미지에 제목 있음」으로 본다(결정 12, `resolveTitleInImage`). 이미지가 없으면 판 위에 제목을 그린다.
 */
export const TitleInImage: Story = {
  name: 'titleInImage — 이미지 있음(alt = 제목, 미션 소개 포함) · 이미지 없음(판 위 제목)',
  render: () => (
    <Column width={W360}>
      <Case caption="이미지 있음 — 제목·요약 글자 없음, alt가 제목" view={{ ...MISSION, titleInImage: true }} />
      <Case
        caption="미션 소개 카드 — 커버가 연결 미션 이미지와 같아 titleInImage(결정 12)"
        view={{ ...MISSION, titleInImage: true, imageUrl: COVER_TALL }}
      />
      <Case caption="이미지 없음 — 판 위에 아이콘 + 제목(16px bold, 3줄 한도)" view={{ ...MISSION, titleInImage: true, imageUrl: null }} />
      <Case
        caption="이미지 없음 — 긴 제목은 3줄에서 말줄임"
        view={{
          ...MISSION,
          titleInImage: true,
          imageUrl: null,
          title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너들을 모집해요 지금 바로 확인하세요',
        }}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [withImage, intro, withoutImage] = cardsOf(canvasElement)
    for (const card of [withImage, intro]) {
      expect(card.querySelector('h3')).toBeNull()
      expect(card.querySelector('img')?.getAttribute('alt')).toBe('한강 러닝 챌린지')
      // 제목·요약은 화면 글자로 없고(alt만), 필수 정보는 남는다
      expect(card.textContent).not.toContain('한강 러닝 챌린지')
      expect(card.textContent).not.toContain('이번 주말 같이 달려요')
      expect(card.textContent).toContain('기간')
    }
    expect(withoutImage.querySelector('h3')).toBeNull()
    expect(imageBoxOf(withoutImage).textContent).toContain('한강 러닝 챌린지')
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
  },
}

// ─── 6. 이미지 없음 · 로드 실패 ─────────────────────────────────────────────

/**
 * 이미지 주소가 없을 때와 로드에 실패했을 때(깨진 경로)는 같은 자리 표시를 탄다. 일반 카드는 판 위에 아이콘만 있고(제목은 아래 본문 24px 하나뿐),
 * 높이는 이미지가 있는 카드와 같다. 로드 실패는 정적 렌더로 재현되지 않아 이 Story의 `play`가 칸 높이로 확인한다.
 */
export const NoImage: Story = {
  name: '이미지 없음 · 로드 실패 — 이미지 있는 카드와 같은 높이',
  render: () => (
    <Column width={W360}>
      <Case caption="이미지 있음 (기준)" view={MISSION} />
      <Case caption="주소 없음 — 아이콘만" view={{ ...MISSION, imageUrl: null }} />
      <Case caption="로드 실패(깨진 경로) — 같은 판 · 아이콘만" view={{ ...MISSION, imageUrl: BROKEN }} />
      <Case caption="주소 없음 · JAM! 배지 — 메달 아이콘" view={{ ...BADGE, imageUrl: null }} />
      <Case caption="주소 없음 · 드랍 — 상자 아이콘" view={{ ...DROP, imageUrl: null }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    // 깨진 경로가 fallback으로 바뀔 시간을 준다
    await new Promise((resolve) => setTimeout(resolve, 800))
    const [normal, none, broken] = cardsOf(canvasElement)
    expect(Math.abs(heightOf(imageBoxOf(none)) - heightOf(imageBoxOf(normal)))).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(imageBoxOf(broken)) - heightOf(imageBoxOf(normal)))).toBeLessThanOrEqual(1)
    // 카드 전체 높이도 같다(같은 값의 카드)
    expect(Math.abs(heightOf(none) - heightOf(normal))).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(broken) - heightOf(normal))).toBeLessThanOrEqual(1)
    // 주소 없음·로드 실패는 이미지 대신 아이콘이고 제목은 판 위에 없다(아래 본문 h3 하나뿐)
    for (const card of [none, broken]) {
      expect(imageBoxOf(card).querySelector('img')).toBeNull()
      expect(imageBoxOf(card).querySelectorAll('svg')).toHaveLength(1)
      expect(imageBoxOf(card).textContent).toBe('')
      expect(card.textContent?.match(/한강 러닝 챌린지/g)).toHaveLength(1)
    }
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
  },
}

// ─── 7. 긴 글 ─────────────────────────────────────────────────────────────

const LONG_TITLE = '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너를 모집해요'
const LONG_FACTS = ['한강 이북 둘레길 완주자를 위한 특별 컬렉션 시리즈', '보상 1,200,000 포인트 · 배지 12개 · 쿠폰']

/** 제목 22자 초과(2줄 말줄임) · 필수 정보 22자 초과(말줄임 없이 줄바꿈). */
export const LongText: Story = {
  name: '긴 글 — 제목 2줄 말줄임 · 필수 정보 줄바꿈(말줄임 없음)',
  render: () => (
    <div style={ROW_STYLE}>
      {[W360, W430].map((width) => (
        <Column key={width} width={width}>
          <Case caption={`${width}px — 긴 제목`} view={{ ...MISSION, title: LONG_TITLE, facts: undefined }} />
          <Case caption={`${width}px — 긴 필수 정보 (줄바꿈, 2개 한도)`} view={{ ...MISSION, facts: LONG_FACTS }} />
        </Column>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      // 제목은 2줄까지만 보인다(line-clamp-2)
      const title = card.querySelector<HTMLElement>('h3')!
      expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(title).lineHeight) * 2 + 1)
      // 필수 정보는 말줄임이 없다 — 글자가 잘리지 않는다
      for (const fact of Array.from(card.querySelectorAll<HTMLElement>('p.font-bold'))) {
        expect(getComputedStyle(fact).textOverflow).not.toBe('ellipsis')
        expect(fact.scrollWidth).toBeLessThanOrEqual(fact.clientWidth)
      }
    }
  },
}

// ─── 8. 계측 있음 · 없음 ───────────────────────────────────────────────────

const sendBeaconOff: NonNullable<Story['beforeEach']> = () => {
  // 계측이 켜진 카드의 노출·클릭 전송이 나가지 않게 막는다(Story에서는 어떤 요청도 보내지 않는다)
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => true })
  return () => {
    Reflect.deleteProperty(navigator, 'sendBeacon')
  }
}

/** 계측 정보와 `href`가 있으면 링크가 블록 요소이고 눌림(`.jam-press`)·키보드 포커스 윤곽선(2px·오프셋 2px·`--color-primary`)을 가진다. 윤곽선은 이미지 모서리에 잘리지 않는다. */
export const Tracked: Story = {
  name: '계측 있음 — 링크 · 눌림 · 포커스(Tab 키로 확인)',
  beforeEach: sendBeaconOff,
  render: () => (
    <Column width={W360}>
      <Case caption="누르면 0.98배, 80ms. Tab 키를 눌러 포커스 윤곽선을 본다" view={{ ...MISSION, tracking: TRACKING }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector<HTMLAnchorElement>('a')!
    expect(link).not.toBeNull()
    expect(getComputedStyle(link).display).toBe('block')
    expect(link.className).toContain('jam-press')
    await userEvent.tab()
    expect(document.activeElement).toBe(link)
    const style = getComputedStyle(link)
    expect(style.outlineWidth).toBe('2px')
    expect(style.outlineOffset).toBe('2px')
    // 윤곽선 색은 DS 토큰 --color-primary와 같다
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-primary)'
    canvasElement.appendChild(probe)
    expect(style.outlineColor).toBe(getComputedStyle(probe).color)
    probe.remove()
    // 윤곽선이 둥근 카드를 따라가고, overflow-hidden은 링크가 아니라 안쪽 카드에만 있다(윤곽선이 잘리지 않는다)
    expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0)
    expect(style.overflow).toBe('visible')
    // 눌림 대상은 링크 하나다
    expect(canvasElement.querySelectorAll('.jam-press')).toHaveLength(1)
  },
}

/** 계측 정보가 없으면(운영툴 미리보기) 링크·트래커·눌림이 없다. `href`가 있어도 정사각 카드에는 끝 줄이 없다. */
export const Untracked: Story = {
  name: '계측 없음(미리보기) — 링크·눌림 없음, href가 있어도 끝 줄 없음',
  render: () => (
    <Column width={W360}>
      <Case caption="① href 있음 — 링크 없음, 끝 줄 없음" view={{ ...MISSION, href: '/missions/m1' }} />
      <Case caption="② href 없음" view={{ ...MISSION, href: undefined }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelectorAll('a')).toHaveLength(0)
    expect(canvasElement.querySelectorAll('.jam-press')).toHaveLength(0)
    for (const card of cardsOf(canvasElement)) {
      expect(card.textContent).not.toContain(d.today.cardReadMore)
      expect(card.textContent).not.toContain('→')
    }
  },
}

// ─── 9. 폭 · 최악 조합 ─────────────────────────────────────────────────────

const WORST = square({
  resource: 'badge',
  label: d.todayCard.badgeSpotlight,
  // 제목 40자
  title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너들을 모집해요',
  subtitle: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너를 모집하니 놓치지 말고 지금 바로 신청해 보세요',
  // 필수 정보 둘 다 22자 초과
  facts: LONG_FACTS,
  regionLabel: '서울 성동구 성수동',
  rarity: 'epic',
  imageUrl: SAMPLE.epic,
  href: '/badges/b1',
})

/** 360·430 기기 폭 나란히. 이미지 칸은 카드 폭과 같은 1:1이다. */
export const Widths: Story = {
  name: '폭 360(328px) · 430(398px) 나란히',
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="360 기기 (카드 328px, 이미지 칸 328px, 높이 523px)" view={MISSION} width={W360} />
      <Case caption="430 기기 (카드 398px, 이미지 칸 398px, 높이 593px)" view={MISSION} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
    const [narrow, wide] = cardsOf(canvasElement)
    expect(Math.abs(heightOf(imageBoxOf(narrow)) - 328)).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(imageBoxOf(wide)) - 398)).toBeLessThanOrEqual(1)
  },
}

/** 제목 40자 + 필수 정보 둘 다 22자 초과 + 긴 요약 + 희귀도 칩 + 지역 핀. 320 기기(288px) 한 장과 360·430으로 가로 넘침이 없고 칩 줄이 한 줄인지 본다. */
export const WorstCase: Story = {
  name: '최악 조합 — 긴 제목 · 긴 요약 · 긴 필수 정보 · 희귀도 칩 + 지역 핀 (320 · 360 · 430)',
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="320 기기 (카드 288px, 높이 558px)" view={WORST} width={W320} />
      <Case caption="360 기기 (카드 328px, 높이 578px)" view={WORST} width={W360} />
      <Case caption="430 기기 (카드 398px, 높이 648px)" view={WORST} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSquare(canvasElement)
    for (const card of cardsOf(canvasElement)) expectChipRowOneLine(card)
  },
}

/** 320 기기에서 판 위 제목이 3줄 한도로 이미지 칸(288px) 안에 들어가는지 본다(아이콘 32 + 간격 8 + 3줄 72 = 112px + 위아래 여백). */
export const PlaceholderWorstAt320: Story = {
  name: '320 기기 — 판 위 제목 3줄 한도가 이미지 칸 안에 들어감',
  render: () => (
    <Case
      caption="320 기기 (카드 288px, 이미지 칸 288px) — 제목 3줄에서 말줄임"
      view={{ ...WORST, titleInImage: true, imageUrl: null }}
      width={W320}
    />
  ),
  play: async ({ canvasElement }) => {
    const box = imageBoxOf(cardsOf(canvasElement)[0])
    const content = box.firstElementChild as HTMLElement
    expect(content.scrollHeight).toBeLessThanOrEqual(content.clientHeight)
    const title = content.querySelector<HTMLElement>('p')!
    expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(title).lineHeight) * 3 + 1)
  },
}
