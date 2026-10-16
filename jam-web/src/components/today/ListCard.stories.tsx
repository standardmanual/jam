import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect, userEvent } from 'storybook/test'
import { d } from '@/lib/i18n'
import type { CardViewTile, ListCardView } from '@/lib/today/cardView'
import type { RankingBoardResult } from '@/lib/ranking/rankingDataSource'
import TodayCard from './TodayCard'

/**
 * 목록(`list`) 모양 상태 행렬 (티켓 20261001_2104, 상위 20260930_1453 조각 b5).
 *
 * - 두 갈래다: 타일형(배지·재료 64px 가로 스크롤 타일)과 랭킹 행형(순위 행, 카드 전체 링크 없음). 같은 본문(칩 줄 → 제목 → 요약 → 필수 정보 → 설명문) 아래가 갈린다.
 * - 카드 폭은 뷰포트 에뮬레이션이 아니라 고정 폭 래퍼다: 360 기기 = 328px, 430 기기 = 398px, 320 기기 = 288px. 타일 줄 계산(왼쪽 24px부터, 타일 64px + 간격 8px, 오른쪽은
 *   카드 가장자리까지 번진다): k번째 타일의 왼쪽 가장자리 = 24 + 72k. 328px 폭에서 5번째가 312에서 시작해 16px 보이고 4개는 280px로 딱 맞아 스크롤이 없다.
 *   398px 폭은 6번째가 384에서 시작해 14px 보이고(5개는 352px라 350px 안쪽 폭을 2px 넘어 거의 스크롤이 없다), 288px 폭은 4번째가 240에서 시작해 48px 보인다.
 *   다른 폭(예: 414 기기의 382px)에서는 잘림이 보장되지 않는다 — 확인하는 폭은 360·430·320뿐이다.
 * - 카드 높이 실측(Chromium, 2026-10-01 — 확정 설계의 추정치 대신 이 값을 쓴다): 328px 폭 타일형 값이 가득 찬 카드(요약·필수 정보 2줄·설명문·타일 줄·끝 줄) 370.8px(타일이 3개든
 *   12개든 같다), 328px 폭 행형 값이 가득 찬 카드(요약·설명문·순위 3행) 407.2px(순위 행 하나당 76px = 행 68px + 간격 8px, 1행 255.2px · 5행 559.2px · 10행 939.2px).
 *   최악 조합(긴 제목·요약·필수 정보·설명문)은 타일형 288px 폭 466px · 328px 폭 446px · 398px 폭 426px, 행형 10행 288px 폭 1086.5px · 328px 폭 1066.4px · 398px 폭 1046.4px.
 *   나머지 값은 각 Story 캡션에 적었다. 같은 폭에서 타일형과 행형 모두 높이가 타일 수·링크 유무와 무관하다.
 * - 캔버스는 크림(`--background`, #fafaf0)이다. 흰 카드의 경계는 1px `--border`가 맡는다. 순위 행은 tint 면(`--background-secondary`, 테두리 없음)이라 흰 카드 안에서 구획으로 보인다.
 * - Storybook은 `design-system/styles.css`를 import하므로 전역 `*:focus-visible` 윤곽선이 서비스에 없어도 보인다. 그래서 Story에서 윤곽선이 보인다는 것은 서비스 증거가 아니다 —
 *   클래스 단언(`__tests__/CardFrame.test.tsx`)이 보증한다. 아래 `play`는 높이·가로 넘침·링크 수 같은 계산 스타일을 눈으로 확인할 때 쓰는 보조 단언이고 CI에서 실행되지 않는다
 *   (vitest의 addon-vitest 연동 제거, `vitest.config.ts` 머리말).
 * - 계측이 켜진 Story는 노출·클릭 전송(`navigator.sendBeacon`)이 나가지 않게 `beforeEach`에서 막는다.
 * - 이미지는 외부 요청 없이 뜨도록 `public/badges/sample`의 배지 그림만 쓴다.
 * - 스크롤 칸(`overflow-x-auto`)에는 `tabIndex`를 주지 않는다(카드 전체가 링크라 안에 `tabindex` 요소를 두면 마크업 규칙 위반이다). Storybook a11y의 스크롤 영역 규칙
 *   (`scrollable-region-focusable`) 경고는 이 때문이고 `todo`라 막지 않는다. 카드 링크가 전체를 보여 주는 목록 화면으로 간다.
 */

const W360 = 328 // 360 기기 카드 폭
const W430 = 398 // 430 기기 카드 폭
const W320 = 288 // 320 기기 카드 폭

const SAMPLE = ['s008', 's094', 's001', 's003', 's004', 's005', 's006', 's007', 's009', 's011', 's012', 's013'].map((id) => `/badges/sample/${id}.png`)
const BROKEN = '/badges/sample/없는-파일.png'
const NAMES = [
  '성수동 탐험가',
  '한강 러너',
  '뚝섬 지킴이',
  '서울숲 산책가',
  '북한산 등반가',
  '남산 야경꾼',
  '여의도 피크닉러',
  '광화문 수문장',
  '망원동 맛객',
  '이태원 탐방가',
  '연남동 산책러',
  '홍대 버스커',
]

const TILE_TRACKING = { cardId: 'story-tiles', contentTypeId: null, templateType: 'badge_spotlight', shape: 'list' } as const
const RANKING_TRACKING = { cardId: 'story-ranking', contentTypeId: null, templateType: 'ranking_board', shape: 'list' } as const

// ─── 값 ──────────────────────────────────────────────────────────────────

/** 배지 타일 `count`개(12개까지). 보유 여부는 `earned`로 준다(생략하면 미리보기라 전부 컬러). */
function tiles(count: number, earned: (index: number) => boolean | undefined = () => true): CardViewTile[] {
  return Array.from({ length: count }, (_, index) => ({
    name: NAMES[index % NAMES.length],
    imageUrl: SAMPLE[index % SAMPLE.length],
    earned: earned(index),
  }))
}

function tileCard(overrides: Partial<ListCardView> = {}): ListCardView {
  return {
    shape: 'list',
    resource: 'badge',
    label: d.todayCard.badgeSpotlight,
    title: '성수동 골목 배지가 열렸어요',
    subtitle: '골목을 걸으며 모아 보세요',
    facts: ['기간 상시', '보상 배지 8개'],
    description: '걸음마다 하나씩 얻을 수 있는 배지예요',
    href: '/badges',
    tiles: tiles(8),
    ...overrides,
  }
}

const entry = (rank: number, name?: string, username: string | null | undefined = undefined) => ({
  userId: `user-${rank}`,
  displayName: name ?? `러너 ${rank}`,
  username: username === undefined ? `runner${rank}` : username,
  avatarUrl: null,
  value: Math.max(1, 120 - rank * 9),
  rank,
})

function ranking(count: number, overrides: Partial<RankingBoardResult> = {}): RankingBoardResult {
  return {
    metricType: 'mission_progress',
    missionType: 'distance',
    conditionFieldKey: null,
    totalParticipants: count,
    entries: Array.from({ length: count }, (_, index) => entry(index + 1)),
    ...overrides,
  }
}

function rankingCard(overrides: Partial<ListCardView> = {}): ListCardView {
  return {
    shape: 'list',
    resource: 'ranking',
    label: d.todayCard.rankingBoard,
    title: '이번 주 한강 러너 순위',
    subtitle: '가장 멀리 달린 러너를 만나요',
    description: '매일 새로 계산돼요',
    href: '/missions/m1/status',
    tiles: [],
    ranking: ranking(3),
    ...overrides,
  }
}

const live = (view: ListCardView): ListCardView => ({ ...view, tracking: view.resource === 'ranking' ? RANKING_TRACKING : TILE_TRACKING })

// ─── 배치 도우미 ───────────────────────────────────────────────────────────

const STACK_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }
const CAPTION_STYLE: CSSProperties = { margin: '0 0 var(--spacing-4)', fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.6)' }
const ROW_STYLE: CSSProperties = { display: 'flex', gap: 'var(--spacing-32)', flexWrap: 'wrap', alignItems: 'flex-start' }

/** 고정 폭 열. 카드 사이 간격은 `TodayCardStack`의 `gap-4`과 같다 */
function Column({ width, children }: { width: number; children: ReactNode }) {
  return <div style={{ ...STACK_STYLE, width }}>{children}</div>
}

/** 캡션(크림 캔버스 위 설명 글자) + 카드. `data-card`가 높이·가로 넘침·링크 수 측정 대상이다 */
function Case({ caption, view, width, currentUserId }: { caption: string; view: ListCardView; width?: number; currentUserId?: string }) {
  return (
    <div style={width ? { width } : undefined}>
      <p style={CAPTION_STYLE}>{caption}</p>
      <div data-card>
        <TodayCard view={view} currentUserId={currentUserId} />
      </div>
    </div>
  )
}

const cardsOf = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-card]'))
const heightOf = (el: HTMLElement) => el.getBoundingClientRect().height
/** 카드 하나의 가로 스크롤 칸(타일형) */
const laneOf = (card: HTMLElement) => card.querySelector<HTMLElement>('.overflow-x-auto')!
const tilesOf = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>('li'))
const anchorsOf = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLAnchorElement>('a'))
/** 스크롤 칸이 가로로 밀 수 있는가 */
const scrolls = (card: HTMLElement) => laneOf(card).scrollWidth > laneOf(card).clientWidth + 1

/** 어떤 카드도 가로로 넘치지 않는다(`scrollWidth <= clientWidth`). 스크롤 칸 안쪽 넘침은 칸이 스스로 가두므로 카드에는 번지지 않는다. */
function expectNoHorizontalOverflow(root: HTMLElement) {
  const cards = cardsOf(root)
  expect(cards.length).toBeGreaterThan(0)
  for (const card of cards) expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
}

/** 칩 줄은 줄바꿈하지 않는다 — 높이가 칩 한 줄(24px) 안에 있고 가로로 넘치지 않는다 */
function expectChipRowOneLine(card: HTMLElement) {
  const row = card.querySelector<HTMLElement>('.flex.items-center.gap-\\[var\\(--spacing-8\\)\\]')!
  expect(row.getBoundingClientRect().height).toBeLessThanOrEqual(25)
  expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
}

/** 앵커 안에 앵커가 없다 */
function expectNoNestedAnchors(root: ParentNode) {
  expect(root.querySelectorAll('a a')).toHaveLength(0)
}

// ─── 메타 ────────────────────────────────────────────────────────────────

const meta: Meta<typeof TodayCard> = {
  title: '서비스/Today/ListCard',
  component: TodayCard,
  args: { view: tileCard() },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '홈 「투데이」의 목록 모양(`list`) — 티켓 20261001_2104(상위 20260930_1453 조각 b5). 흰 카드에 왼쪽 정렬 본문(칩 줄 · 제목 24px · 요약 16px · 필수 정보 14px 굵게 · 설명문 14px)이 있고 ' +
          '그 아래가 두 갈래다. 타일형은 64px 정사각 타일(그림 + 이름)이 한 줄 가로 스크롤이고 카드 전체가 하나의 링크다. 타일 줄이 카드 좌우 끝까지 번져 다음 타일이 잘려 보이는 것이 ' +
          '더 있다는 유일한 단서다. 랭킹 행형은 순위 행이 각자 프로필 링크라 카드 전체 링크가 없고 제목 영역만 미션 대상 랭킹에서 링크이며, 홈에서 내 순위 행이 강조된다. ' +
          '서비스 전용 컴포넌트라 MODULAR이 아니다(`TodayCard`가 모양을 고르고 `CardFrame`이 링크·계측·눌림·포커스를 맡는다).',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

const sendBeaconOff: NonNullable<Story['beforeEach']> = () => {
  // 계측이 켜진 카드의 노출·클릭 전송이 나가지 않게 막는다(Story에서는 어떤 요청도 보내지 않는다)
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => true })
  return () => {
    Reflect.deleteProperty(navigator, 'sendBeacon')
  }
}

// ─── 1. 타일형 — 폭 경계 ──────────────────────────────────────────────────

/**
 * 360 기기(카드 328px, 안쪽 280px): 3개는 다 들어와 스크롤이 없고 4개는 딱 맞는다(4×64 + 3×8 = 280). 5개부터 다섯째 타일이 가장자리에서 16px 잘려 보이고 스크롤이 된다.
 * 캡션의 높이는 이 폭의 실측이다.
 */
export const TilesAt360: Story = {
  name: '타일형 360 — 3개(스크롤 없음) · 4개(딱 맞음) · 5개(잘린 다섯째 타일) · 8개 · 12개',
  render: () => (
    <Column width={W360}>
      <Case caption="3개 — 폭 안에 다 들어옴, 스크롤 없음" view={tileCard({ tiles: tiles(3) })} />
      <Case caption="4개 — 280px로 딱 맞음, 스크롤 없음" view={tileCard({ tiles: tiles(4) })} />
      <Case caption="5개 — 다섯째 타일이 가장자리에서 16px 잘려 보임" view={tileCard({ tiles: tiles(5) })} />
      <Case caption="8개 — 스크롤, 카드 높이는 타일 수와 무관" view={tileCard({ tiles: tiles(8) })} />
      <Case caption="12개 — 스크롤, 카드 높이는 타일 수와 무관" view={tileCard({ tiles: tiles(12) })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    expectNoHorizontalOverflow(canvasElement)
    const [three, four, five, eight, twelve] = cardsOf(canvasElement)
    expect(scrolls(three)).toBe(false)
    expect(scrolls(four)).toBe(false)
    for (const card of [five, eight, twelve]) {
      expect(scrolls(card)).toBe(true)
      // 다섯째 타일이 스크롤 칸 오른쪽 가장자리에서 잘려 보인다: 왼쪽 가장자리는 칸 안, 오른쪽 가장자리는 칸 밖
      const lane = laneOf(card).getBoundingClientRect()
      const fifth = tilesOf(card)[4].getBoundingClientRect()
      expect(fifth.left).toBeLessThan(lane.right)
      expect(fifth.right).toBeGreaterThan(lane.right)
      expect(Math.round(lane.right - fifth.left)).toBe(16)
    }
    // 타일 수가 달라도 카드 높이는 같다(한 줄 스크롤)
    expect(Math.abs(heightOf(five) - heightOf(twelve))).toBeLessThanOrEqual(1)
    // 모든 타일은 64px 정사각 칸이고 줄바꿈하지 않는다(한 줄)
    for (const card of cardsOf(canvasElement)) {
      const tops = new Set(tilesOf(card).map((li) => Math.round(li.getBoundingClientRect().top)))
      expect(tops.size).toBe(1)
      for (const li of tilesOf(card)) expect(li.getBoundingClientRect().width).toBe(64)
    }
  },
}

/**
 * 끝까지 밀면 마지막 타일 오른쪽에 24px 여백이 남는다. 안쪽 `ul`에 `w-max`가 없으면 칸의 오른쪽 `padding`이 스크롤 영역에 들어가지 않아 0px였고(Chromium 실측),
 * 마지막 `li`에 오른쪽 `margin`을 줘도 0px였다. `w-max`로 24px이 남는다.
 */
export const TilesScrollEnd: Story = {
  name: '타일형 360 — 끝까지 밀면 마지막 타일 오른쪽에 24px 여백',
  render: () => (
    <Column width={W360}>
      <Case caption="8개 — 끝까지 민 모습 (마지막 타일 오른쪽 24px)" view={tileCard({ tiles: tiles(8) })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const card = cardsOf(canvasElement)[0]
    const lane = laneOf(card)
    lane.scrollLeft = lane.scrollWidth
    await new Promise((resolve) => setTimeout(resolve, 100))
    const last = tilesOf(card).at(-1)!.getBoundingClientRect()
    expect(Math.round(lane.getBoundingClientRect().right - last.right)).toBe(24)
  },
}

/** 430 기기(카드 398px, 안쪽 350px): 5개는 352px라 거의 스크롤이 없고, 6개부터 여섯째 타일이 14px 잘려 보인다. */
export const TilesAt430: Story = {
  name: '타일형 430 — 5개(2px 넘침) · 6개(잘린 여섯째 타일)',
  render: () => (
    <Column width={W430}>
      <Case caption="5개 — 352px로 안쪽 폭 350px을 2px 넘음(단서가 사실상 없음)" view={tileCard({ tiles: tiles(5) })} />
      <Case caption="6개 — 여섯째 타일이 가장자리에서 14px 잘려 보임" view={tileCard({ tiles: tiles(6) })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    const [five, six] = cardsOf(canvasElement)
    expect(laneOf(five).scrollWidth - laneOf(five).clientWidth).toBeLessThanOrEqual(26)
    const lane = laneOf(six).getBoundingClientRect()
    const sixth = tilesOf(six)[5].getBoundingClientRect()
    expect(sixth.left).toBeLessThan(lane.right)
    expect(sixth.right).toBeGreaterThan(lane.right)
    expect(Math.round(lane.right - sixth.left)).toBe(14)
  },
}

/** 320 기기(카드 288px, 안쪽 240px): 3개는 다 들어오고(208px), 4개부터 넷째 타일이 48px 보이다 잘린다. */
export const TilesAt320: Story = {
  name: '타일형 320 — 3개(스크롤 없음) · 4개(잘린 넷째 타일)',
  render: () => (
    <Column width={W320}>
      <Case caption="3개 — 208px, 스크롤 없음" view={tileCard({ tiles: tiles(3) })} />
      <Case caption="4개 — 넷째 타일이 가장자리에서 48px 보이다 잘림" view={tileCard({ tiles: tiles(4) })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    const [three, four] = cardsOf(canvasElement)
    expect(scrolls(three)).toBe(false)
    expect(scrolls(four)).toBe(true)
    const lane = laneOf(four).getBoundingClientRect()
    const fourth = tilesOf(four)[3].getBoundingClientRect()
    expect(fourth.right).toBeGreaterThan(lane.right)
    expect(Math.round(lane.right - fourth.left)).toBe(48)
  },
}

// ─── 2. 타일형 — 타일 내용 ────────────────────────────────────────────────

/** 보유·미보유가 섞이면 미보유 그림만 흑백이고 이름은 컬러다. 유저 정보가 없는 미리보기(`earned` 없음)는 전부 컬러다. */
export const TileOwnership: Story = {
  name: '타일 보유·미보유 섞임 · 미리보기(전부 컬러)',
  render: () => (
    <Column width={W360}>
      <Case caption="보유 · 미보유 섞임 — 미보유 그림만 흑백, 이름은 컬러" view={tileCard({ tiles: tiles(4, (i) => i % 2 === 0) })} />
      <Case caption="미리보기(earned 없음) — 전부 컬러" view={tileCard({ tiles: tiles(4, () => undefined) })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [mixed, preview] = cardsOf(canvasElement)
    const gray = Array.from(mixed.querySelectorAll('.grayscale'))
    expect(gray).toHaveLength(2)
    for (const el of gray) expect(el.tagName).toBe('IMG')
    // 이름은 흑백이 아니다
    for (const p of Array.from(mixed.querySelectorAll<HTMLElement>('li p'))) expect(getComputedStyle(p).filter).toBe('none')
    expect(preview.querySelectorAll('.grayscale')).toHaveLength(0)
  },
}

/** 재료 타일(그림 없음 → 플라스크)과 배지 타일을 나란히. 자원 아이콘은 카드의 자원이 정한다. 같은 64px 칸이라 크기가 같다. */
export const TileRecipeAndBadge: Story = {
  name: '재료 타일(플라스크) · 배지 타일 나란히 — 같은 64px 칸',
  render: () => (
    <Column width={W360}>
      <Case
        caption="레시피(recipe) — 재료 타일 그림 없음 → 플라스크 + 배지 타일 그림"
        view={tileCard({
          resource: 'recipe',
          label: '레시피',
          title: '성수동 탐험가 레시피',
          tiles: [
            { name: '성수동 지도', imageUrl: null },
            { name: '한강 물병', imageUrl: null },
            { name: '성수동 탐험가', imageUrl: SAMPLE[0], earned: true },
          ],
        })}
      />
      <Case
        caption="JAM! 배지 — 그림 없는 타일은 메달 아이콘"
        view={tileCard({ tiles: [{ name: '그림 없음', imageUrl: null, earned: true }, ...tiles(2)] })}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [recipe, badge] = cardsOf(canvasElement)
    for (const card of [recipe, badge]) {
      for (const li of tilesOf(card)) {
        const box = li.firstElementChild as HTMLElement
        expect(box.getBoundingClientRect().width).toBe(64)
        expect(box.getBoundingClientRect().height).toBe(64)
      }
    }
    // 그림이 없는 칸은 아이콘 하나, 있는 칸은 그림 하나
    expect(tilesOf(recipe)[0].querySelectorAll('svg')).toHaveLength(1)
    expect(tilesOf(recipe)[0].querySelectorAll('img')).toHaveLength(0)
    expect(tilesOf(recipe)[2].querySelectorAll('img')).toHaveLength(1)
    expect(tilesOf(badge)[0].querySelectorAll('svg')).toHaveLength(1)
    // 재료 타일의 아이콘과 메달 아이콘은 다른 모양이다
    expect(tilesOf(recipe)[0].querySelector('svg')!.innerHTML).not.toBe(tilesOf(badge)[0].querySelector('svg')!.innerHTML)
  },
}

/**
 * 레시피 공개 카드의 공개 뒤 모습(티켓 20261006_1217). 타일은 슬롯마다 하나(대표 후보)이고 후보를 펼치지 않는다 — 가진 후보가 있는 슬롯은 컬러, 없는 슬롯은 첫 후보의 흑백이다.
 * 정보 줄은 「재료 N개」·「보상 …」, 타일 수는 재료 수와 같다. 328px 폭에서 4개는 딱 맞고 5개부터 잘려 보이며 슬롯 상한 10개까지 자르지 않는다.
 * 타일이 하나도 없으면(레시피 줄 없음·후보 전부 삭제) `brief`로 그려져 이 Story의 맨 아래 카드가 보이지 않는다 — 그 모습은 `BriefCard`의 「레시피 공개 전」 Story에 있다.
 */
export const RecipeRevealTiles: Story = {
  name: '레시피 공개 뒤 — 슬롯당 타일 하나(컬러·흑백 섞임), 4개 · 10개',
  render: () => (
    <Column width={W360}>
      <Case
        caption="슬롯 4개 — 가진 슬롯은 컬러, 없는 슬롯은 첫 후보의 흑백(이름은 컬러), 그림 없는 타일은 플라스크"
        view={tileCard({
          resource: 'recipe',
          template: 'recipe_reveal',
          label: d.todayCard.recipeReveal,
          title: '성수동 탐험가 레시피가 열렸어요',
          subtitle: undefined,
          description: undefined,
          facts: ['재료 4개', '보상 300 포인트 · 배지 1개'],
          href: '/combine',
          tiles: [
            { name: '성수동 지도', imageUrl: SAMPLE[0], earned: true },
            { name: '한강 물병', imageUrl: SAMPLE[1], earned: false },
            { name: '뚝섬 돗자리', imageUrl: null, earned: false },
            { name: '서울숲 손전등', imageUrl: SAMPLE[3], earned: true },
          ],
        })}
      />
      <Case
        caption="슬롯 10개(상한) — 자르지 않고 모두 그린다, 다섯째부터 가장자리에서 잘려 보인다"
        view={tileCard({
          resource: 'recipe',
          template: 'recipe_reveal',
          label: d.todayCard.recipeReveal,
          title: '열 칸 레시피가 열렸어요',
          subtitle: undefined,
          description: undefined,
          facts: ['재료 10개', '보상 배지 1개'],
          href: '/combine',
          tiles: tiles(10, (index) => index % 3 === 0),
        })}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    const [four, ten] = cardsOf(canvasElement)
    expect(tilesOf(four)).toHaveLength(4)
    expect(tilesOf(ten)).toHaveLength(10)
    // 「재료 N개」와 타일 수가 같다
    expect(four.textContent).toContain('재료 4개')
    expect(ten.textContent).toContain('재료 10개')
    // 흑백은 이미지에만 걸리고 이름은 컬러다
    for (const el of Array.from(four.querySelectorAll('.grayscale'))) expect(el.tagName).toBe('IMG')
    expect(four.querySelectorAll('.grayscale')).toHaveLength(1)
    // 4개는 280px 안쪽 폭에 딱 맞아 스크롤이 없고, 10개는 스크롤이다
    expect(scrolls(four)).toBe(false)
    expect(scrolls(ten)).toBe(true)
    // 「+N」·「외 N개」가 없다
    for (const card of [four, ten]) expect(card.textContent).not.toMatch(/외 \d+개|\+\d+/)
  },
}

/** 그림 주소가 없을 때와 로드에 실패했을 때(깨진 경로)는 같은 칸에 자원 아이콘이다. 칸 크기가 그림이 있는 타일과 같다. */
export const TileNoImage: Story = {
  name: '타일 그림 없음 · 로드 실패 — 같은 64px 칸에 아이콘, 카드 높이 같음',
  render: () => (
    <Column width={W360}>
      <Case caption="그림 있음 (기준)" view={tileCard({ tiles: tiles(3) })} />
      <Case caption="주소 없음 — 아이콘" view={tileCard({ tiles: tiles(3).map((t) => ({ ...t, imageUrl: null })) })} />
      <Case caption="로드 실패(깨진 경로) — 같은 칸 · 아이콘" view={tileCard({ tiles: tiles(3).map((t) => ({ ...t, imageUrl: BROKEN })) })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    // 깨진 경로가 fallback으로 바뀔 시간을 준다
    await new Promise((resolve) => setTimeout(resolve, 800))
    const [normal, none, broken] = cardsOf(canvasElement)
    expect(Math.abs(heightOf(none) - heightOf(normal))).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(broken) - heightOf(normal))).toBeLessThanOrEqual(1)
    for (const card of [none, broken]) {
      expect(card.querySelectorAll('li img')).toHaveLength(0)
      expect(card.querySelectorAll('li svg')).toHaveLength(3)
      for (const li of tilesOf(card)) expect((li.firstElementChild as HTMLElement).getBoundingClientRect().height).toBe(64)
    }
    expectNoHorizontalOverflow(canvasElement)
  },
}

/** 이름 줄 수 경계: 1줄·2줄·3줄 이상(2줄 말줄임)·공백 없는 긴 단어(8자). 칸 폭은 64px 그대로다. */
export const TileNames: Story = {
  name: '타일 이름 — 1줄 · 2줄 · 3줄 이상(말줄임) · 공백 없는 8자',
  render: () => {
    const named = (names: string[]) => tileCard({ tiles: names.map((name, i) => ({ name, imageUrl: SAMPLE[i], earned: true })) })
    return (
      <Column width={W360}>
        <Case caption="1줄(짧은 이름) · 2줄(어절 단위 줄바꿈)" view={named(['러너', '한강 러너', '성수동 탐험가'])} />
        <Case
          caption="3줄 이상 — 2줄에서 말줄임(전체 이름은 목록 화면에 있음)"
          view={named(['서울숲 한가운데 산책가 수집가', '여의도 한강공원 피크닉 대장 배지', '아주 아주 긴 이름의 배지 하나'])}
        />
        <Case caption="공백 없는 긴 단어(8자) — 칸 안에서 줄바꿈, 칸을 넓히지 않음" view={named(['한강러닝챌린지', '성수동탐험가배지', '서울숲산책가'])} />
      </Column>
    )
  },
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      for (const li of tilesOf(card)) {
        expect(li.getBoundingClientRect().width).toBe(64)
        const name = li.querySelector<HTMLElement>('p')!
        // 이름은 2줄을 넘지 않는다(12px, line-height 1.4)
        expect(name.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(name).lineHeight) * 2 + 1)
        expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth + 1)
        expect(getComputedStyle(name).textAlign).toBe('center')
      }
    }
  },
}

/** 타일에는 희귀도 칩이 없다(`CardViewTile.rarity`는 표시 데이터에 있되 쓰지 않는다). 단일 배지 카드의 칩 줄 희귀도는 그대로 보인다. */
export const TileRarity: Story = {
  name: '타일 희귀도 — 값이 있어도 타일에 칩 없음 · 단일 배지 카드는 칩 줄에 보임',
  render: () => (
    <Column width={W360}>
      <Case
        caption="타일에 Epic·Mystic·Rare 값이 있어도 칩이 없음 (줄 높이 같음)"
        view={tileCard({ tiles: tiles(4).map((t, i) => ({ ...t, rarity: ['epic', 'mystic', 'rare', 'common'][i] })) })}
      />
      <Case
        caption="배지 1개 카드 — 칩 줄에 Epic 칩 (희귀도는 카드 단위 정보)"
        view={tileCard({ rarity: 'epic', tiles: tiles(1), facts: ['성수동 탐험가'] })}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [tilesCard, single] = cardsOf(canvasElement)
    for (const word of ['Epic', 'Mystic', 'Rare']) expect(laneOf(tilesCard).textContent).not.toContain(word)
    expect(tilesCard.textContent).not.toContain('Epic')
    expect(single.textContent).toContain('Epic')
    // 타일 높이는 모두 같다
    const heights = new Set(tilesOf(tilesCard).map((li) => Math.round(li.getBoundingClientRect().height)))
    expect(heights.size).toBe(1)
  },
}

// ─── 3. 타일형 — 본문 그룹 ─────────────────────────────────────────────────

/** 필수 정보 0·1·2줄. 그 줄만 생략되고 간격도 같이 사라진다. */
export const TileFactLines: Story = {
  name: '타일형 필수 정보 0줄 · 1줄 · 2줄',
  render: () => (
    <Column width={W360}>
      <Case caption="0줄 — 그 줄만 생략" view={tileCard({ facts: undefined })} />
      <Case caption="1줄" view={tileCard({ facts: ['기간 상시'] })} />
      <Case caption="2줄" view={tileCard({ facts: ['기간 상시', '보상 배지 8개'] })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [zero, one, two] = cardsOf(canvasElement).map(heightOf)
    expect(one).toBeGreaterThan(zero)
    expect(two).toBeGreaterThan(one)
    expectNoHorizontalOverflow(canvasElement)
  },
}

/** 요약·설명문 있음/없음과 모두 없는 카드(칩 + 제목 + 타일). 값이 없는 그룹만 사라진다. */
export const TileGroups: Story = {
  name: '타일형 요약·설명문 있음 · 없음 · 모두 없음 · href 없음(끝 줄 없음)',
  render: () => (
    <Column width={W360}>
      <Case caption="요약·설명문 있음" view={tileCard()} />
      <Case caption="요약 없음 — 빈 칸 없이 제목만" view={tileCard({ subtitle: undefined })} />
      <Case caption="설명문 없음" view={tileCard({ description: undefined })} />
      <Case
        caption="모두 없음 — 칩 + 제목 + 타일 줄 + 끝 줄뿐"
        view={tileCard({ subtitle: undefined, facts: undefined, description: undefined })}
      />
      <Case caption="href 없음 — 「전체 보기 →」 없음(링크가 없는 카드는 말하지 않는다)" view={tileCard({ href: undefined })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [all, noSubtitle, noDescription, bare, noHref] = cardsOf(canvasElement)
    expect(all.textContent).toContain('골목을 걸으며 모아 보세요')
    expect(noSubtitle.textContent).not.toContain('골목을 걸으며 모아 보세요')
    expect(noDescription.textContent).not.toContain('걸음마다 하나씩')
    expect(heightOf(all)).toBeGreaterThan(heightOf(noSubtitle))
    expect(heightOf(all)).toBeGreaterThan(heightOf(noDescription))
    expect(heightOf(noSubtitle)).toBeGreaterThan(heightOf(bare))
    expect(bare.querySelectorAll('p.font-bold')).toHaveLength(0)
    expect(all.textContent).toContain(d.today.cardViewAll)
    expect(noHref.textContent).not.toContain(d.today.cardViewAll)
    expectNoHorizontalOverflow(canvasElement)
  },
}

/** `titleInImage`는 `list`에서 무시한다 — 이미지 칸이 없어 제목은 늘 보인다. */
export const TitleInImageIgnored: Story = {
  name: 'titleInImage가 true여도 제목을 숨기지 않음 (타일형 · 행형)',
  render: () => (
    <Column width={W360}>
      <Case caption="타일형 — 제목·요약이 그대로 보임" view={tileCard({ titleInImage: true })} />
      <Case caption="행형 — 제목·요약이 그대로 보임" view={rankingCard({ titleInImage: true })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    for (const card of cardsOf(canvasElement)) {
      expect(card.querySelector('h3')).not.toBeNull()
      expect(card.querySelector('h3')!.textContent).not.toBe('')
    }
  },
}

// ─── 4. 랭킹 행형 ─────────────────────────────────────────────────────────

/**
 * 미션 대상 랭킹(홈): 제목 영역이 링크(눌림 포함)이고 순위 행은 각자 프로필 링크다. 유저 직접 지정 랭킹은 제목에 링크가 없고 행 링크만 있다.
 * 카드 전체 링크는 없다(앵커 안에 앵커가 없다). 순위 행은 8px 간격으로 쌓이고 포디엄이 없다.
 */
export const RankingTargets: Story = {
  name: '행형 — 미션 대상(제목 링크) · 유저 직접 지정(제목 링크 없음)',
  beforeEach: sendBeaconOff,
  render: () => (
    <Column width={W360}>
      <Case caption="미션 대상 — 제목 영역이 링크 + 행 3개 링크 (앵커 4개)" view={live(rankingCard())} />
      <Case
        caption="유저 직접 지정(배지 개수) — 제목에 링크 없음, 행 링크만 (앵커 3개)"
        view={live(rankingCard({ ranking: ranking(3, { metricType: 'badge_count', missionType: null }) }))}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [mission, user] = cardsOf(canvasElement)
    expect(anchorsOf(mission)).toHaveLength(1 + 3)
    expect(anchorsOf(user)).toHaveLength(3)
    // 제목 링크는 칩 줄·제목·요약·설명문을 감싸고 순위 행은 그 밖이다
    const titleLink = anchorsOf(mission)[0]
    expect(titleLink.getAttribute('href')).toBe('/missions/m1/status')
    expect(titleLink.querySelector('h3')).not.toBeNull()
    expect(titleLink.textContent).not.toContain('러너 1')
    expect(titleLink.className).toContain('jam-press')
    // 눌림은 링크마다 하나다: 미션 대상 카드는 제목 링크 하나와 순위 행 셋, 유저 직접 지정 카드는 순위 행 셋(카드 전체에는 없다)
    expect(mission.querySelectorAll('.jam-press')).toHaveLength(1 + 3)
    expect(user.querySelectorAll('.jam-press')).toHaveLength(3)
    expectNoNestedAnchors(canvasElement)
    // 카드 전체를 감싸는 링크가 없다: 카드(흰 면)의 첫 자식 요소는 링크가 아니다
    for (const card of [mission, user]) expect(card.querySelector(':scope > a')).toBeNull()
    expectNoHorizontalOverflow(canvasElement)
  },
}

/** 내 순위 강조(홈): 내 행만 순위·값이 레드·24px다. 1위·중간·마지막과 내가 목록에 없는 경우. */
export const RankingMe: Story = {
  name: '행형 내 순위 강조 — 1위 · 중간 · 마지막 · 내가 목록에 없음',
  beforeEach: sendBeaconOff,
  render: () => (
    <Column width={W360}>
      <Case caption="내가 1위" view={live(rankingCard({ ranking: ranking(5) }))} currentUserId="user-1" />
      <Case caption="내가 중간(3위)" view={live(rankingCard({ ranking: ranking(5) }))} currentUserId="user-3" />
      <Case caption="내가 마지막(5위)" view={live(rankingCard({ ranking: ranking(5) }))} currentUserId="user-5" />
      <Case caption="내가 목록에 없음 — 강조 없음" view={live(rankingCard({ ranking: ranking(5) }))} currentUserId="someone-else" />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const emphasized = (card: HTMLElement) =>
      Array.from(card.querySelectorAll<HTMLElement>('span')).filter((span) => span.style.fontSize === 'var(--text-2xl)')
    const [first, middle, last, absent] = cardsOf(canvasElement)
    for (const card of [first, middle, last]) expect(emphasized(card)).toHaveLength(2)
    expect(emphasized(first).map((s) => s.textContent)).toContain('1')
    expect(emphasized(middle).map((s) => s.textContent)).toContain('3')
    expect(emphasized(last).map((s) => s.textContent)).toContain('5')
    expect(emphasized(absent)).toHaveLength(0)
  },
}

/** 값 포맷 3종(미션 진행도·배지 개수·조건 필드 단위)과 순위 1·3·10행. 행 사이 간격은 8px다. */
export const RankingFormats: Story = {
  name: '행형 값 포맷 3종 · 순위 1행 · 3행 · 10행',
  render: () => (
    <div style={ROW_STYLE}>
      <Column width={W360}>
        <Case caption="미션 진행도(거리, 소수 1자리)" view={rankingCard({ ranking: ranking(3) })} />
        <Case caption="배지 개수(개)" view={rankingCard({ ranking: ranking(3, { metricType: 'badge_count', missionType: null }) })} />
        <Case
          caption="조건 필드(거리 km)"
          view={rankingCard({ ranking: ranking(3, { metricType: 'condition_field', missionType: null, conditionFieldKey: 'distance_km' }) })}
        />
        <Case caption="순위 1행" view={rankingCard({ ranking: ranking(1) })} />
      </Column>
      <Column width={W360}>
        <Case caption="순위 10행 — 카드가 행 수만큼 길어짐" view={rankingCard({ ranking: ranking(10) })} />
      </Column>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [mission, badge, field, one, ten] = cardsOf(canvasElement)
    expect(mission.textContent).toMatch(/\d+\.\d/)
    expect(badge.textContent).toContain('개')
    expect(field.textContent).toContain('km')
    // 행은 8px 간격으로 쌓인다
    const rows = ten.querySelectorAll<HTMLElement>('.flex.flex-col.gap-\\[var\\(--spacing-8\\)\\] > *')
    expect(rows).toHaveLength(10)
    const gap = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom
    expect(Math.round(gap)).toBe(8)
    expect(heightOf(ten)).toBeGreaterThan(heightOf(one))
    expectNoHorizontalOverflow(canvasElement)
  },
}

/** 긴 표시 이름은 한 줄에서 말줄임이다. 탈퇴 등으로 `username`이 없는 행은 링크가 없다. */
export const RankingNames: Story = {
  name: '행형 긴 표시 이름(말줄임) · username 없는 행(링크 없음)',
  beforeEach: sendBeaconOff,
  render: () => (
    <Column width={W360}>
      <Case
        caption="긴 표시 이름 — 한 줄 말줄임, 가로 넘침 없음"
        view={live(
          rankingCard({
            ranking: ranking(3, {
              entries: [entry(1, '아주아주아주아주아주아주아주아주 긴 표시 이름의 러너'), entry(2), entry(3)],
            }),
          }),
        )}
      />
      <Case
        caption="탈퇴 등으로 username 없음(2위) — 그 행만 링크 없음 (앵커 1 + 2행)"
        view={live(rankingCard({ ranking: ranking(3, { entries: [entry(1), entry(2, '탈퇴한 러너', null), entry(3)] }) }))}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [long, withdrawn] = cardsOf(canvasElement)
    const name = Array.from(long.querySelectorAll<HTMLElement>('p.truncate'))[0]
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
    expect(getComputedStyle(name).textOverflow).toBe('ellipsis')
    expect(anchorsOf(withdrawn)).toHaveLength(1 + 2)
    expectNoHorizontalOverflow(canvasElement)
  },
}

/**
 * 순위가 비면(`ranking`이 null이거나 행이 0개) 행 자리에 「아직 랭킹이 없어요」를 16px 옅게 왼쪽 정렬로 보인다. 이때도 노출은 기록한다(트래커 유지).
 * 제목 링크는 순위 조회 결과의 지표가 미션 진행도일 때만이라 `ranking`이 null이면 없고, 행이 0개여도 지표가 있으면(미션 대상) 있다.
 */
export const RankingEmpty: Story = {
  name: '행형 순위 없음 — ranking null · 행 0개',
  beforeEach: sendBeaconOff,
  render: () => (
    <Column width={W360}>
      <Case caption="ranking이 null(순위를 읽지 못함) — 제목 링크 없음" view={live(rankingCard({ ranking: null }))} />
      <Case caption="행이 0개(아직 순위 없음) · 미션 대상 — 제목 링크만 있음" view={live(rankingCard({ ranking: ranking(0) }))} />
      <Case caption="미리보기 · 행이 0개 — 링크 없음" view={rankingCard({ ranking: ranking(0) })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    for (const card of cardsOf(canvasElement)) {
      expect(card.textContent).toContain(d.todayCard.rankingEmpty)
      expect(card.querySelectorAll('svg')).toHaveLength(0)
      const message = Array.from(card.querySelectorAll<HTMLElement>('p')).find((p) => p.textContent === d.todayCard.rankingEmpty)!
      expect(getComputedStyle(message).textAlign).not.toBe('center')
      expect(getComputedStyle(message).fontSize).toBe('16px')
    }
    const [unread, empty, preview] = cardsOf(canvasElement)
    expect(anchorsOf(unread)).toHaveLength(0)
    expect(anchorsOf(empty)).toHaveLength(1)
    expect(anchorsOf(preview)).toHaveLength(0)
    expectNoNestedAnchors(canvasElement)
    expectNoHorizontalOverflow(canvasElement)
  },
}

// ─── 5. 계측 있음 · 없음 ───────────────────────────────────────────────────

/** 타일형은 카드 전체가 링크 하나다. 눌림(`.jam-press`)·키보드 포커스 윤곽선(2px·오프셋 2px·`--link`)을 가진다. */
export const TilesTracked: Story = {
  name: '타일형 계측 있음 — 카드 전체가 링크 하나 · 눌림 · 포커스(Tab 키로 확인)',
  beforeEach: sendBeaconOff,
  render: () => (
    <Column width={W360}>
      <Case caption="누르면 0.98배, 80ms. Tab 키를 눌러 포커스 윤곽선을 본다 (스크롤 칸에는 tab 정지점이 없음)" view={live(tileCard())} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expect(anchorsOf(canvasElement)).toHaveLength(1)
    const link = anchorsOf(canvasElement)[0]
    expect(getComputedStyle(link).display).toBe('block')
    expect(link.className).toContain('jam-press')
    expect(canvasElement.querySelectorAll('.jam-press')).toHaveLength(1)
    expectNoNestedAnchors(canvasElement)
    await userEvent.tab()
    expect(document.activeElement).toBe(link)
    const style = getComputedStyle(link)
    expect(style.outlineWidth).toBe('2px')
    expect(style.outlineOffset).toBe('2px')
    expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0)
    // 링크 안에 tab 정지점이 더 없다(링크 안에 tabindex 요소를 두지 않는다)
    expect(link.querySelectorAll('[tabindex]')).toHaveLength(0)
  },
}

/** 계측 정보가 없으면(운영툴 미리보기) 두 갈래 모두 링크·트래커·눌림이 없다. 타일형은 `href`가 있으면 끝 줄만 보이고 행형은 행 링크도 없다. */
export const Untracked: Story = {
  name: '계측 없음(미리보기) — 링크 · 눌림 없음, 행 링크도 없음, 가로 스크롤은 그대로',
  render: () => (
    <div style={ROW_STYLE}>
      <Column width={W360}>
        <Case caption="타일형 — 링크 0, 끝 줄만 보임, 스크롤 동작" view={tileCard({ tiles: tiles(8, () => undefined) })} />
      </Column>
      <Column width={W360}>
        <Case caption="행형 · 미션 대상과 같은 순위 — 링크 0 · 강조 없음(currentUserId를 넘겨도)" view={rankingCard()} currentUserId="user-2" />
      </Column>
    </div>
  ),
  play: async ({ canvasElement }) => {
    expect(anchorsOf(canvasElement)).toHaveLength(0)
    expect(canvasElement.querySelectorAll('.jam-press')).toHaveLength(0)
    const [tilesCard, rankingCardEl] = cardsOf(canvasElement)
    expect(scrolls(tilesCard)).toBe(true)
    expect(tilesCard.textContent).toContain(d.today.cardViewAll)
    for (const span of Array.from(rankingCardEl.querySelectorAll<HTMLElement>('span'))) expect(span.style.fontSize).not.toBe('var(--text-2xl)')
    expect(rankingCardEl.textContent).not.toContain(d.today.cardViewAll)
  },
}

/** 같은 순위로 미션 대상(홈)과 미리보기를 한 쌍으로 놓고 링크 수를 비교한다. */
export const RankingTrackedVsPreview: Story = {
  name: '행형 미션 대상(홈) vs 미리보기 — 같은 순위, 링크 수 비교',
  beforeEach: sendBeaconOff,
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="홈(계측 있음) — 앵커 1(제목) + 3(행) = 4, 눌림 4(링크마다), 내 순위 강조" view={live(rankingCard())} width={W360} currentUserId="user-2" />
      <Case caption="미리보기(계측 없음) — 앵커 0, 눌림 0, 강조 없음" view={rankingCard()} width={W360} currentUserId="user-2" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [home, preview] = cardsOf(canvasElement)
    expect(anchorsOf(home)).toHaveLength(4)
    expect(anchorsOf(preview)).toHaveLength(0)
    expect(home.querySelectorAll('.jam-press')).toHaveLength(4)
    expect(preview.querySelectorAll('.jam-press')).toHaveLength(0)
    expectNoNestedAnchors(canvasElement)
    // 두 카드는 같은 높이다(링크 유무가 모양을 바꾸지 않는다)
    expect(Math.abs(heightOf(home) - heightOf(preview))).toBeLessThanOrEqual(1)
  },
}

// ─── 6. 폭 · 최악 조합 ─────────────────────────────────────────────────────

const LONG_TITLE = '성수동에서 한강까지 이어지는 가을 밤 러닝 코스 배지 모음이 열렸어요'
const LONG_SUBTITLE = '골목과 강변을 따라 걸으며 하나씩 모아 보는 배지로 가을 밤을 채워 보세요'
const LONG_FACTS = ['한강 이북 둘레길 완주자를 위한 특별 컬렉션 시리즈', '보상 1,200,000 포인트 · 배지 12개 · 쿠폰']
const LONG_DESCRIPTION = '한 번에 다 모으지 않아도 되고 천천히 걸을수록 더 많이 얻어요'

const WORST_TILES = tileCard({
  resource: 'badge',
  title: LONG_TITLE,
  subtitle: LONG_SUBTITLE,
  facts: LONG_FACTS,
  description: LONG_DESCRIPTION,
  regionLabel: '서울 성동구 성수동',
  rarity: 'epic',
  tiles: [
    { name: '서울숲 한가운데 산책가 수집가', imageUrl: SAMPLE[0], earned: true },
    { name: '한강러닝챌린지', imageUrl: null, earned: false },
    ...tiles(6, (i) => i % 2 === 0),
  ],
})

const WORST_RANKING = rankingCard({
  title: LONG_TITLE,
  subtitle: LONG_SUBTITLE,
  facts: LONG_FACTS,
  description: LONG_DESCRIPTION,
  regionLabel: '서울 성동구 성수동',
  ranking: ranking(10, { entries: Array.from({ length: 10 }, (_, i) => entry(i + 1, `아주아주아주아주아주 긴 표시 이름의 러너 ${i + 1}`)) }),
})

/** 360·430 기기 폭 나란히(타일형·행형 각각). 카드 높이는 이 값의 실측이다. */
export const Widths: Story = {
  name: '폭 360(328px) · 430(398px) 나란히 — 타일형 · 행형',
  beforeEach: sendBeaconOff,
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="타일형 360 (카드 328px, 높이 370.8px)" view={live(tileCard())} width={W360} />
      <Case caption="타일형 430 (카드 398px, 높이 370.8px)" view={live(tileCard())} width={W430} />
      <Case caption="행형 360 (카드 328px, 높이 407.2px)" view={live(rankingCard())} width={W360} />
      <Case caption="행형 430 (카드 398px, 높이 407.2px)" view={live(rankingCard())} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    const [t360, t430, r360, r430] = cardsOf(canvasElement)
    expect(Math.round(t360.getBoundingClientRect().width)).toBe(W360)
    expect(Math.round(t430.getBoundingClientRect().width)).toBe(W430)
    expect(Math.round(r360.getBoundingClientRect().width)).toBe(W360)
    expect(Math.round(r430.getBoundingClientRect().width)).toBe(W430)
  },
}

/** 제목 40자 + 필수 정보 둘 다 22자 초과 + 긴 요약·설명문 + 희귀도 칩 + 지역 핀 + 타일 8개(이름 3줄 이상·공백 없는 단어). 320·360·430에서 가로 넘침이 없고 칩 줄이 한 줄인지 본다. */
export const WorstCaseTiles: Story = {
  name: '최악 조합 타일형 — 긴 제목·요약·필수 정보·설명문 · 희귀도 칩 + 지역 핀 · 긴 이름 타일 (320 · 360 · 430)',
  beforeEach: sendBeaconOff,
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="320 기기 (카드 288px, 높이 466px)" view={live(WORST_TILES)} width={W320} />
      <Case caption="360 기기 (카드 328px, 높이 446px)" view={live(WORST_TILES)} width={W360} />
      <Case caption="430 기기 (카드 398px, 높이 426px)" view={live(WORST_TILES)} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      expectChipRowOneLine(card)
      const title = card.querySelector<HTMLElement>('h3')!
      expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(title).lineHeight) * 2 + 1)
      for (const fact of Array.from(card.querySelectorAll<HTMLElement>('p.font-bold'))) {
        expect(getComputedStyle(fact).textOverflow).not.toBe('ellipsis')
        expect(fact.scrollWidth).toBeLessThanOrEqual(fact.clientWidth)
      }
      for (const li of tilesOf(card)) expect(li.getBoundingClientRect().width).toBe(64)
      expect(scrolls(card)).toBe(true)
    }
  },
}

/** 최악 조합 행형(제목 40자·필수 정보 긴 글·긴 요약·설명문·희귀도 값 없음·지역 핀 + 긴 이름 순위 10행). 320·360·430. */
export const WorstCaseRanking: Story = {
  name: '최악 조합 행형 — 긴 제목·요약·필수 정보·설명문 · 지역 핀 · 긴 이름 10행 (320 · 360 · 430)',
  beforeEach: sendBeaconOff,
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="320 기기 (카드 288px, 높이 1086.5px)" view={live(WORST_RANKING)} width={W320} currentUserId="user-10" />
      <Case caption="360 기기 (카드 328px, 높이 1066.4px)" view={live(WORST_RANKING)} width={W360} currentUserId="user-10" />
      <Case caption="430 기기 (카드 398px, 높이 1046.4px)" view={live(WORST_RANKING)} width={W430} currentUserId="user-10" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      expectChipRowOneLine(card)
      expect(anchorsOf(card)).toHaveLength(1 + 10)
    }
    expectNoNestedAnchors(canvasElement)
  },
}
