import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect, userEvent } from 'storybook/test'
import { d } from '@/lib/i18n'
import { buildFacts, type CardView, type ImageCardView } from '@/lib/today/cardView'
import TodayCard from './TodayCard'

/**
 * 포스터(`poster`) 상태 행렬 (티켓 20261001_2013, 상위 20260930_1453 조각 b4).
 *
 * - 카드 폭은 뷰포트 에뮬레이션이 아니라 고정 폭 래퍼다: 360 기기 = 328px, 430 기기 = 398px, 320 기기 = 288px(최악 조합만).
 *   4:5 카드의 높이는 328px 폭에서 410px, 398px에서 497.5px, 288px에서 360px이다(막이 `absolute`라 글자 수가 높이를 바꾸지 않는다).
 * - 막(글자 블록 뒤 그라디언트)은 `var(--color-overlay)`(0.6)에서 시작해 위 32px가 램프다. 칩 줄 윗변은 늘 램프가 끝난 뒤에서 시작한다.
 *   막이 카드에서 차지하는 높이는 글자 수에 따라 다르다 — 328px 폭 실측은 「막 높이 실측」 Story의 캡션에 있다.
 * - 캔버스는 기본 검정이다. 이미지 칸의 판(`--color-surface`)과 막은 검정 위에서 실제 모습이 나온다.
 * - 이미지 로딩 중 모습(`--color-surface` 단색 판 + 막·글자는 그대로)은 Story로 만들기 어렵다(로컬·data 이미지는 즉시 뜬다). 칸의 클래스(`aspect-[4/5] bg-surface`)가
 *   이미지와 무관하게 늘 있다는 것은 `__tests__/PosterCard.test.tsx`·`CardImageSlot.test.tsx`가 보증한다.
 * - Storybook은 `design-system/styles.css`를 import하므로 전역 `*:focus-visible` 윤곽선이 서비스에 없어도 보인다. 그래서 Story에서
 *   윤곽선이 보인다는 것은 서비스 증거가 아니다 — 클래스 단언(`__tests__/CardFrame.test.tsx`)이 보증한다. 아래 `play`는 높이·가로 넘침 같은
 *   계산 스타일을 눈으로 확인할 때 쓰는 보조 단언이고 CI에서 실행되지 않는다(vitest의 addon-vitest 연동 제거, `vitest.config.ts` 머리말).
 * - 계측이 켜진 Story는 노출·클릭 전송(`navigator.sendBeacon`)이 나가지 않게 `beforeEach`에서 막는다.
 * - 이미지는 외부 요청 없이 뜨도록 `data:` SVG 가짜 커버만 쓴다.
 */

const NOW = new Date('2026-10-05T12:00:00+09:00')

const W360 = 328 // 360 기기 카드 폭
const W430 = 398 // 430 기기 카드 폭
const W320 = 288 // 320 기기 카드 폭

/** 4:5 가짜 커버(1024×1280). 원과 위·아래 띠로 칸 경계와 막이 덮는 영역을 눈으로 볼 수 있게 한다. */
function fakeCover(background: string, accent: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1280" viewBox="0 0 1024 1280">` +
    `<rect width="1024" height="1280" fill="${background}"/>` +
    `<rect y="0" width="1024" height="128" fill="${accent}" opacity="0.35"/>` +
    `<rect y="1152" width="1024" height="128" fill="${accent}" opacity="0.35"/>` +
    `<circle cx="512" cy="540" r="260" fill="${accent}"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const COVER = fakeCover('#3a5f7d', '#f2c14e')
const COVER_ALT = fakeCover('#6b4a7e', '#8fd6a8')
const COVER_WARM = fakeCover('#8a3b2f', '#f5d28b')

/** 순백에 가까운 가짜 커버 — 막이 없으면 흰 글자가 읽히지 않는 최악의 바탕이다. 배경 #ffffff에 아주 옅은 회색 원만 둔다. */
const COVER_WHITE = (() => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1280" viewBox="0 0 1024 1280">` +
    `<rect width="1024" height="1280" fill="#ffffff"/>` +
    `<circle cx="512" cy="540" r="260" fill="#f2f2f2"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
})()

const BROKEN = '/badges/sample/없는-파일.png'

const TRACKING = { cardId: 'story-card', contentTypeId: null, templateType: 'itembook_milestone', shape: 'poster' } as const

function poster(overrides: Partial<ImageCardView>): ImageCardView {
  return { shape: 'poster', resource: 'mission', title: '제목', imageUrl: COVER, ...overrides }
}

// ─── 값 ──────────────────────────────────────────────────────────────────

const COLLECTION = poster({
  resource: 'collection',
  label: d.todayCard.itembookMilestone,
  title: '새 아이템이 열렸어요',
  facts: buildFacts('collection', { collectionName: '한강 컬렉션', itemCount: 12 }, NOW),
  href: '/collections/c1',
})

/** 레시피는 대응하는 템플릿이 아직 없다(`recipe_reveal`은 티켓 1500·1458 소관). 필수 정보도 없다. */
const RECIPE = poster({
  resource: 'recipe',
  label: '레시피',
  title: '새 조합법이 곧 공개돼요',
  href: '/combine',
  imageUrl: COVER_ALT,
})

/** 희귀도 칩과 지역 핀이 막 위에 함께 있는 카드. 흰 알약 라벨 · 흰 글자 핀 · 희귀도 칩. */
const BADGE_WITH_PIN = poster({
  resource: 'badge',
  label: d.todayCard.badgeSpotlight,
  title: '성수동 탐험가 배지가 열렸어요',
  regionLabel: '성수동',
  rarity: 'epic',
  facts: buildFacts('badge', { badgeName: '성수동 탐험가' }, NOW),
  href: '/badges/b1',
  imageUrl: COVER_WARM,
})

const MISSION = poster({
  resource: 'mission',
  label: d.todayCard.missionSpotlight,
  title: '한강 러닝 챌린지',
  facts: buildFacts(
    'mission',
    { period: { startsAt: '2026-10-12T00:00:00+09:00', endsAt: '2026-11-08T23:59:59+09:00' }, rewardPoints: 300, rewardBadgeCount: 1 },
    NOW,
  ),
  href: '/missions/m1',
})

const DROP = poster({
  resource: 'drop',
  label: d.todayCard.dropAlert,
  title: '한강공원 번개 드랍',
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
/** 카드 하나의 4:5 이미지 칸 */
const imageBoxOf = (card: HTMLElement) => card.querySelector<HTMLElement>('[class*="aspect-[4/5]"]')!
/** 카드 하나의 어두운 막(글자 블록) */
const scrimOf = (card: HTMLElement) => card.querySelector<HTMLElement>('[class*="bg-[linear-gradient"]')!
/** 막의 첫 자식 = 칩 줄 */
const chipRowOf = (card: HTMLElement) => scrimOf(card).firstElementChild as HTMLElement

/** 어떤 카드도 가로로 넘치지 않는다(`scrollWidth <= clientWidth`) */
function expectNoHorizontalOverflow(root: HTMLElement) {
  const cards = cardsOf(root)
  expect(cards.length).toBeGreaterThan(0)
  for (const card of cards) expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
}

/** 모든 카드의 이미지 칸이 4:5이고 카드 높이가 칸 높이와 같다(막이 높이를 바꾸지 않는다, 오차 1px) */
function expectFourByFive(root: HTMLElement) {
  for (const card of cardsOf(root)) {
    const { width, height } = imageBoxOf(card).getBoundingClientRect()
    expect(Math.abs(height - (width * 5) / 4)).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(card) - height)).toBeLessThanOrEqual(1)
  }
}

/** 칩 줄은 줄바꿈하지 않는다 — 높이가 칩 한 줄(24px) 안에 있고 가로로 넘치지 않는다 */
function expectChipRowOneLine(card: HTMLElement) {
  const row = chipRowOf(card)
  expect(row.getBoundingClientRect().height).toBeLessThanOrEqual(25)
  expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
}

/** 막은 카드 안에 있고 카드 아래에 붙어 있다 */
function expectScrimAtBottom(card: HTMLElement) {
  const box = card.getBoundingClientRect()
  const scrim = scrimOf(card).getBoundingClientRect()
  expect(Math.abs(scrim.bottom - box.bottom)).toBeLessThanOrEqual(1)
  expect(scrim.top).toBeGreaterThanOrEqual(box.top)
}

// ─── 메타 ────────────────────────────────────────────────────────────────

const meta: Meta<typeof TodayCard> = {
  title: '서비스/Today/PosterCard',
  component: TodayCard,
  args: { view: MISSION },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '홈 「투데이」의 포스터 모양(`poster`) — 티켓 20261001_2013(상위 20260930_1453 조각 b4). 4:5 이미지가 카드 전체이고 아래쪽에만 어두운 막이 올라온다: ' +
          '막 위에 칩 줄(흰 알약 라벨 · 흰 글자 지역 핀 · 희귀도 칩) · 제목 24px 흰색(2줄 말줄임) · 필수 정보 14px 흰색(최대 2줄, 말줄임 없이 줄바꿈). 요약·설명문·끝 줄은 없다. ' +
          '막은 `--color-overlay`(0.6)에서 시작하는 선형 그라디언트이고 위 32px가 램프다 — 글자 블록 첫 줄도 막 진하기 60% 이상에서 시작한다. ' +
          '이미지가 없거나 깨져도 같은 4:5 칸에 자원 아이콘 판을 위쪽 60%에 그리고 막과 글자는 그대로다. ' +
          '서비스 전용 컴포넌트라 MODULAR이 아니다(`TodayCard`가 모양을 고르고 `CardFrame`이 링크·계측·눌림·포커스를 맡는다).',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

// ─── 1. 자원별 대표 ───────────────────────────────────────────────────────

/** 컬렉션 · 레시피 공개 예고 · 희귀도 칩 + 지역 핀(막 위 칩 줄이 가장 가득 찬 조합) · 미션 · 드랍(핀 없음). */
export const ByResource: Story = {
  name: '자원별 대표 — 컬렉션 · 레시피 공개 예고 · 배지(희귀도 칩 + 지역 핀) · 미션 · 드랍',
  render: () => (
    <Column width={W360}>
      <Case caption="컬렉션 — 필수 정보 2줄" view={COLLECTION} />
      <Case caption="레시피 공개 예고 — 필수 정보 없음" view={RECIPE} />
      <Case caption="JAM! 배지 — 흰 알약 라벨 · 흰 글자 핀 · Epic 칩이 막의 첫 줄에 함께" view={BADGE_WITH_PIN} />
      <Case caption="미션 — 필수 정보 2줄" view={MISSION} />
      <Case caption="드랍 — 칩 줄에 지역 핀 없음(필수 정보 「지역」 줄이 같은 값)" view={DROP} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
    const cards = cardsOf(canvasElement)
    for (const card of cards) {
      expectScrimAtBottom(card)
      expectChipRowOneLine(card)
    }
    const [, , badge, , drop] = cards
    // 배지: 핀·희귀도 칩이 막의 칩 줄 안에 있다
    expect(chipRowOf(badge).querySelectorAll('.truncate')).toHaveLength(1)
    expect(chipRowOf(badge).textContent).toContain('Epic')
    // 드랍은 핀이 없고 지역은 필수 정보 한 곳에서만 보인다
    expect(drop.querySelectorAll('.truncate')).toHaveLength(0)
    expect(drop.textContent?.match(/여의도 한강공원/g)).toHaveLength(1)
    // 요약·설명문·끝 줄은 어떤 카드에도 없다
    for (const card of cards) {
      expect(card.textContent).not.toContain(d.today.cardReadMore)
      expect(card.textContent).not.toContain('→')
    }
  },
}

// ─── 2. 밝은 이미지 위 막 ─────────────────────────────────────────────────

/**
 * 순백에 가까운 이미지 위에서 막 첫 줄(칩 줄)의 대비를 본다. 막이 없다면 흰 글자가 읽히지 않는 최악의 바탕이다.
 * `play`가 세 가지를 계산해 단언한다: (a) `--color-overlay` 알파 0.6 이상 (b) 칩 줄 윗변이 막 윗변보다 32px 이상 아래(램프가 끝난 뒤에 첫 줄이 시작)
 * (c) 순백 이미지 위 막 합성색과 흰 글자의 대비 4.5:1 이상.
 */
export const BrightImage: Story = {
  name: '밝은 이미지 위 막 — 순백 가까운 커버, 첫 줄 진하기·대비 계산',
  render: () => (
    <Column width={W360}>
      <Case caption="순백 가까운 이미지 — 제목 2줄 · 필수 정보 2줄(막이 가장 높은 조합)" view={poster({ ...MISSION, imageUrl: COVER_WHITE, title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께해요' })} />
      <Case caption="순백 가까운 이미지 — 희귀도 칩 + 지역 핀" view={{ ...BADGE_WITH_PIN, imageUrl: COVER_WHITE }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    // (a) 토큰 알파 — 값이 0.6 아래로 바뀌면 막 설계가 깨진다
    const overlay = getComputedStyle(document.documentElement).getPropertyValue('--color-overlay')
    const alpha = Number(overlay.match(/rgba?\([^)]*,\s*([0-9.]+)\s*\)/)?.[1])
    expect(alpha).toBeGreaterThanOrEqual(0.6)

    for (const card of cardsOf(canvasElement)) {
      const scrim = scrimOf(card)
      // 막 그라디언트: transparent에서 시작해 고정 32px 지점에서 overlay 알파에 닿는다(퍼센트가 아니다)
      const gradient = getComputedStyle(scrim).backgroundImage
      expect(gradient).toContain('linear-gradient')
      expect(gradient).toContain('32px')
      expect(gradient).not.toContain('%')
      // (b) 칩 줄 윗변 − 막 윗변 ≥ 32px — 첫 줄은 램프가 끝난 뒤(알파 0.6)에서 시작한다
      const gap = chipRowOf(card).getBoundingClientRect().top - scrim.getBoundingClientRect().top
      expect(gap).toBeGreaterThanOrEqual(32)
    }

    // (c) 순백(255) 이미지 위에 검정 알파를 얹은 합성색과 흰 글자의 대비
    const luminance = (channel: number) => {
      const c = channel / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const composite = 255 * (1 - alpha)
    const contrast = (luminance(255) + 0.05) / (luminance(composite) + 0.05)
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  },
}

// ─── 3. 막 높이 실측 ──────────────────────────────────────────────────────

/**
 * 328px 폭(360 기기)에서 막이 카드에서 차지하는 높이를 실측해 캡션에 적는다(단언이 아니라 기록 — 확정 설계 「이미지 아래 40%에는 이미지 속 글자를 두지 않는다」의
 * 에셋 제작 가이드 수치를 정할 재료다). 막 높이 = 위 램프 32 + 칩 줄 24 + 간격 12 + 제목(1줄 31.2 · 2줄 62.4) + 간격 12 + 필수 정보(줄당 20) + 아래 여백 24.
 * 실측(Chromium, 2026-10-01): 123.2 / 175.2 / 206.4px. 필수 정보가 줄바꿈하면 줄당 20px씩 더 커진다.
 */
export const ScrimHeights: Story = {
  name: '막 높이 실측 — 328px 폭(카드 410px)에서 막 윗변이 카드 몇 %인지',
  render: () => (
    <div style={ROW_STYLE}>
      <Column width={W360}>
        <Case
          caption="제목 1줄 · 필수 정보 0줄 — 막 123px(카드의 30%, 막 윗변은 카드 위에서 70% 지점)"
          view={{ ...MISSION, facts: undefined }}
        />
        <Case caption="제목 1줄 · 필수 정보 2줄 — 막 175px(카드의 43%, 윗변 57% 지점)" view={MISSION} />
      </Column>
      <Column width={W360}>
        <Case
          caption="제목 2줄 · 필수 정보 2줄 — 막 206px(카드의 50%, 윗변 50% 지점). 램프 32px를 뺀 글자 블록 174px가 아래 40%(164px)를 10px 넘는다"
          view={{ ...MISSION, title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께해요' }}
        />
      </Column>
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      expectScrimAtBottom(card)
      // 막은 글자 블록 + 램프까지다 — 어떤 조합에서도 카드의 절반 가까이에서 멈추고 그림 전체를 덮지 않는다
      expect(heightOf(scrimOf(card)) / heightOf(card)).toBeLessThan(0.6)
    }
  },
}

// ─── 4. 필수 정보 ─────────────────────────────────────────────────────────

/** 필수 정보 0·1·2줄. 그 줄만 생략되고 막은 글자 블록만큼만 줄어든다. 카드 높이는 같다. */
export const FactLines: Story = {
  name: '필수 정보 0줄 · 1줄 · 2줄 — 막만 줄고 카드 높이는 같음',
  render: () => (
    <Column width={W360}>
      <Case caption="0줄" view={{ ...MISSION, facts: undefined }} />
      <Case caption="1줄" view={{ ...MISSION, facts: ['기간 상시'] }} />
      <Case caption="2줄" view={MISSION} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [zero, one, two] = cardsOf(canvasElement)
    expect(heightOf(scrimOf(one))).toBeGreaterThan(heightOf(scrimOf(zero)))
    expect(heightOf(scrimOf(two))).toBeGreaterThan(heightOf(scrimOf(one)))
    // 카드 높이는 글자 수와 무관하다
    expect(Math.abs(heightOf(zero) - heightOf(two))).toBeLessThanOrEqual(1)
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
  },
}

// ─── 5. imageDimmed ───────────────────────────────────────────────────────

/** 이미지만 흑백이고 막·글자·희귀도 칩은 컬러다. */
export const ImageDimmed: Story = {
  name: 'imageDimmed — 이미지만 흑백, 막·글자·희귀도 칩은 컬러',
  render: () => (
    <Column width={W360}>
      <Case caption="컬러(기준)" view={BADGE_WITH_PIN} />
      <Case caption="흑백(imageDimmed) — Epic 칩은 컬러" view={{ ...BADGE_WITH_PIN, imageDimmed: true }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [, dimmed] = cardsOf(canvasElement)
    expect(dimmed.querySelectorAll('.grayscale')).toHaveLength(1)
    expect(dimmed.querySelector('.grayscale')?.tagName).toBe('IMG')
    expect(scrimOf(dimmed).querySelector('.grayscale')).toBeNull()
    expectFourByFive(canvasElement)
  },
}

// ─── 6. 이미지에 제목이 있는 카드 ──────────────────────────────────────────

/**
 * 막에 제목이 없고 필수 정보가 칩 줄 바로 다음이다. 이미지 alt가 제목이다.
 * 이미지가 없으면 판 위 위쪽 60% 가운데에 아이콘과 제목을 그린다(막과 겹치지 않는다).
 */
export const TitleInImage: Story = {
  name: 'titleInImage — 이미지 있음(alt = 제목) · 이미지 없음(판 위 제목)',
  render: () => (
    <Column width={W360}>
      <Case caption="이미지 있음 — 막에 제목 없음, alt가 제목" view={{ ...MISSION, titleInImage: true }} />
      <Case caption="이미지 없음 — 위쪽 60% 가운데에 아이콘 + 제목(16px bold, 3줄 한도)" view={{ ...MISSION, titleInImage: true, imageUrl: null }} />
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
    const [withImage, withoutImage] = cardsOf(canvasElement)
    expect(withImage.querySelector('h3')).toBeNull()
    expect(withImage.querySelector('img')?.getAttribute('alt')).toBe('한강 러닝 챌린지')
    // 제목은 화면 글자로 없고(alt만), 필수 정보는 남는다
    expect(withImage.textContent).not.toContain('한강 러닝 챌린지')
    expect(withImage.textContent).toContain('기간')
    expect(withoutImage.querySelector('h3')).toBeNull()
    expect(imageBoxOf(withoutImage).textContent).toContain('한강 러닝 챌린지')
    // 판 위 제목은 막 윗변 위에 들어간다(겹쳐 읽히지 않는다)
    for (const card of [withoutImage, cardsOf(canvasElement)[2]]) {
      const title = imageBoxOf(card).querySelector<HTMLElement>('p')!
      expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(scrimOf(card).getBoundingClientRect().top)
    }
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
  },
}

// ─── 7. 이미지 없음 · 로드 실패 ─────────────────────────────────────────────

/**
 * 이미지 주소가 없을 때와 로드에 실패했을 때(깨진 경로)는 같은 자리 표시를 탄다. 일반 카드는 위쪽 60% 판 위에 아이콘만 있고(제목은 막 24px 하나뿐),
 * 카드 높이는 이미지가 있는 카드와 같은 4:5다. 로드 실패는 정적 렌더로 재현되지 않아 이 Story의 `play`가 칸 높이로 확인한다.
 */
export const NoImage: Story = {
  name: '이미지 없음 · 로드 실패 — 이미지 있는 카드와 같은 4:5 높이',
  render: () => (
    <Column width={W360}>
      <Case caption="이미지 있음 (기준)" view={MISSION} />
      <Case caption="주소 없음 — 아이콘만" view={{ ...MISSION, imageUrl: null }} />
      <Case caption="로드 실패(깨진 경로) — 같은 판 · 아이콘만" view={{ ...MISSION, imageUrl: BROKEN }} />
      <Case caption="주소 없음 · 컬렉션 — 책 아이콘" view={{ ...COLLECTION, imageUrl: null }} />
      <Case caption="주소 없음 · 드랍 — 상자 아이콘" view={{ ...DROP, imageUrl: null }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    // 깨진 경로가 fallback으로 바뀔 시간을 준다
    await new Promise((resolve) => setTimeout(resolve, 800))
    const [normal, none, broken] = cardsOf(canvasElement)
    expect(Math.abs(heightOf(none) - heightOf(normal))).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(broken) - heightOf(normal))).toBeLessThanOrEqual(1)
    // 주소 없음·로드 실패는 이미지 대신 아이콘이고 제목은 판 위에 없다(막 h3 하나뿐)
    for (const card of [none, broken]) {
      expect(imageBoxOf(card).querySelector('img')).toBeNull()
      expect(imageBoxOf(card).querySelectorAll('svg')).toHaveLength(1)
      expect(imageBoxOf(card).textContent).toBe('')
      expect(card.textContent?.match(/한강 러닝 챌린지/g)).toHaveLength(1)
      // 막과 글자는 그대로다
      expect(scrimOf(card).querySelector('h3')).not.toBeNull()
    }
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
  },
}

// ─── 8. 긴 글 ─────────────────────────────────────────────────────────────

const LONG_TITLE = '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너를 모집해요'
const LONG_FACTS = ['한강 이북 둘레길 완주자를 위한 특별 컬렉션 시리즈', '보상 1,200,000 포인트 · 배지 12개 · 쿠폰']

/** 제목 18자 초과(2줄 말줄임) · 필수 정보 20자 초과(말줄임 없이 줄바꿈). 막은 위로만 자라고 카드 높이는 그대로다. */
export const LongText: Story = {
  name: '긴 글 — 제목 2줄 말줄임 · 필수 정보 줄바꿈(말줄임 없음)',
  render: () => (
    <div style={ROW_STYLE}>
      {[W360, W430].map((width) => (
        <Column key={width} width={width}>
          <Case caption={`${width}px — 긴 제목`} view={{ ...MISSION, title: LONG_TITLE, facts: undefined }} />
          <Case caption={`${width}px — 긴 필수 정보 (줄바꿈, 2개 한도)`} view={{ ...COLLECTION, facts: LONG_FACTS }} />
        </Column>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      expectScrimAtBottom(card)
      // 제목은 2줄까지만 보인다(line-clamp-2)
      const title = card.querySelector<HTMLElement>('h3')
      if (title) expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(title).lineHeight) * 2 + 1)
      // 필수 정보는 말줄임이 없다 — 글자가 잘리지 않는다
      for (const fact of Array.from(scrimOf(card).querySelectorAll<HTMLElement>('p'))) {
        expect(getComputedStyle(fact).textOverflow).not.toBe('ellipsis')
        expect(fact.scrollWidth).toBeLessThanOrEqual(fact.clientWidth)
      }
    }
  },
}

// ─── 9. 계측 있음 · 없음 ───────────────────────────────────────────────────

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
      <Case caption="누르면 0.98배, 80ms. Tab 키를 눌러 포커스 윤곽선을 본다" view={{ ...COLLECTION, tracking: TRACKING }} />
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

/** 계측 정보가 없으면(운영툴 미리보기) 링크·트래커·눌림이 없다. `href`가 있어도 포스터에는 끝 줄이 없다. */
export const Untracked: Story = {
  name: '계측 없음(미리보기) — 링크·눌림 없음, href가 있어도 끝 줄 없음',
  render: () => (
    <Column width={W360}>
      <Case caption="① href 있음 — 링크 없음, 끝 줄 없음" view={{ ...COLLECTION, href: '/collections/c1' }} />
      <Case caption="② href 없음" view={{ ...COLLECTION, href: undefined }} />
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

// ─── 10. 폭 · 최악 조합 ────────────────────────────────────────────────────

const WORST = poster({
  resource: 'collection',
  label: d.todayCard.itembookMilestone,
  // 제목 40자
  title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너들을 모집해요',
  // 필수 정보 둘 다 20자 초과
  facts: LONG_FACTS,
  regionLabel: '서울 성동구 성수동',
  rarity: 'epic',
  href: '/collections/c1',
})

/** 360·430 기기 폭 나란히. 카드 높이는 폭에 따라 410 / 497.5px로 정해진다(4:5). */
export const Widths: Story = {
  name: '폭 360(328px) · 430(398px) 나란히',
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="360 기기 (카드 328px, 높이 410px)" view={MISSION} width={W360} />
      <Case caption="430 기기 (카드 398px, 높이 497.5px)" view={MISSION} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
    const [narrow, wide] = cardsOf(canvasElement)
    expect(Math.abs(heightOf(narrow) - 410)).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(wide) - 497.5)).toBeLessThanOrEqual(1)
  },
}

/**
 * 제목 40자 + 필수 정보 둘 다 20자 초과 + 희귀도 칩 + 지역 핀. 320 기기(288px) 한 장과 360·430으로 가로 넘침이 없고
 * 칩 줄이 한 줄을 지키는지 본다. 막이 `absolute`라 글자가 늘어도 카드 높이(4:5)는 그대로이고 막이 위로만 자란다.
 */
export const WorstCase: Story = {
  name: '최악 조합 — 긴 제목 · 긴 필수 정보 · 희귀도 칩 + 지역 핀 (320 · 360 · 430)',
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="320 기기 (카드 288px, 높이 360px)" view={WORST} width={W320} />
      <Case caption="360 기기 (카드 328px)" view={WORST} width={W360} />
      <Case caption="430 기기 (카드 398px)" view={WORST} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectFourByFive(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      expectChipRowOneLine(card)
      expectScrimAtBottom(card)
    }
  },
}

/**
 * 320 기기에서 판 위 제목(titleInImage + 이미지 없음)이 3줄 한도로 위쪽 60%(216px) 안에 들어가고 막 윗변 위에서 끝나는지 본다
 * (아이콘 32 + 간격 8 + 3줄 72 = 112px, 가운데 정렬).
 */
export const PlaceholderWorstAt320: Story = {
  name: '320 기기 — 판 위 제목 3줄 한도가 위쪽 60% 안에 들어가고 막과 겹치지 않음',
  render: () => (
    <Case
      caption="320 기기 (카드 288px, 위쪽 60% = 216px) — 제목 3줄에서 말줄임, 필수 정보 줄바꿈"
      view={{ ...WORST, titleInImage: true, imageUrl: null }}
      width={W320}
    />
  ),
  play: async ({ canvasElement }) => {
    const card = cardsOf(canvasElement)[0]
    const box = imageBoxOf(card)
    const content = box.firstElementChild as HTMLElement
    expect(content.scrollHeight).toBeLessThanOrEqual(content.clientHeight)
    expect(content.getBoundingClientRect().height).toBeCloseTo(heightOf(box) * 0.6, 0)
    const title = content.querySelector<HTMLElement>('p')!
    expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(title).lineHeight) * 3 + 1)
    expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(scrimOf(card).getBoundingClientRect().top)
  },
}
