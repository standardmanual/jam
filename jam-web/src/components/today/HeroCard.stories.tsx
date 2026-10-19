import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect, userEvent } from 'storybook/test'
import { d } from '@/lib/i18n'
import { buildFacts, type CardView, type ImageCardView } from '@/lib/today/cardView'
import TodayCard from './TodayCard'

/**
 * 큰 이미지(`hero`) 상태 행렬 (티켓 20261001_1737, 상위 20260930_1453 조각 b3).
 *
 * - 카드 폭은 뷰포트 에뮬레이션이 아니라 고정 폭 래퍼다: 360 기기 = 328px, 430 기기 = 398px, 320 기기 = 288px(최악 조합만).
 *   이미지 칸은 16:9라 328px 폭에서 약 184px, 398px에서 약 224px, 288px에서 162px이다.
 * - 카드 높이 실측(Chromium, 2026-10-01 — 확정 설계의 추정치 대신 이 값을 쓴다): 값이 가득 찬 미션 카드(요약·필수 정보 2줄·설명문·끝 줄) 328px 폭 441.7px ·
 *   398px 폭 481.1px, 기사 카드 328px 폭 409.7px, 드랍 카드 389.7px. 최악 조합(긴 제목·요약·필수 정보·설명문) 288px 폭 514.5px · 328px 폭 516.9px · 398px 폭 556.3px.
 * - 캔버스는 크림(`--background`, #f1f0eb)이다. 흰 카드의 경계는 1px `--border`가 맡고 그림자는 없다.
 * - 이미지 로딩 중 모습(`--background` 단색 판)은 Story로 만들기 어렵다(로컬·data 이미지는 즉시 뜬다). 칸의 클래스(`aspect-video bg-background`)가
 *   이미지와 무관하게 늘 있다는 것은 `__tests__/HeroCard.test.tsx`가 보증한다.
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

/** 16:9 가짜 커버(1280×720). 가장자리 잘림(object-cover)과 칸 경계를 눈으로 볼 수 있게 가로 줄무늬와 원을 넣었다. */
function fakeCover(background: string, accent: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">` +
    `<rect width="1280" height="720" fill="${background}"/>` +
    `<rect y="0" width="1280" height="90" fill="${accent}" opacity="0.35"/>` +
    `<rect y="630" width="1280" height="90" fill="${accent}" opacity="0.35"/>` +
    `<circle cx="640" cy="360" r="170" fill="${accent}"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const COVER = fakeCover('#3a5f7d', '#f2c14e')
const COVER_ALT = fakeCover('#6b4a7e', '#8fd6a8')

const SAMPLE = {
  rare: '/badges/sample/s142.png',
  epic: '/badges/sample/s331.png',
} as const

const BROKEN = '/badges/sample/없는-파일.png'

const TRACKING = { cardId: 'story-card', contentTypeId: null, templateType: 'mission_spotlight', shape: 'hero' } as const

function hero(overrides: Partial<ImageCardView>): ImageCardView {
  return { shape: 'hero', resource: 'mission', title: '제목', imageUrl: COVER, ...overrides }
}

// ─── 값 ──────────────────────────────────────────────────────────────────

const ARTICLE = hero({
  resource: 'article',
  label: d.todayCard.editorialArticle,
  title: '가을 한강 러닝 코스 가이드',
  subtitle: '러너가 직접 걸어 본 코스 다섯 곳',
  description: '초보 러너도 편하게 달릴 수 있는 코스만 모았어요. 출발 지점과 화장실 위치까지 알려 드려요.',
  publishedAt: '2026-10-05T09:00:00+09:00',
  href: '/today/a1',
})

const MISSION = hero({
  resource: 'mission',
  label: d.todayCard.missionSpotlight,
  title: '한강 러닝 챌린지',
  subtitle: '이번 주말 같이 달려요',
  facts: buildFacts(
    'mission',
    { period: { startsAt: '2026-10-12T00:00:00+09:00', endsAt: '2026-11-08T23:59:59+09:00' }, rewardPoints: 300, rewardBadgeCount: 1 },
    NOW,
  ),
  description: '한강공원 코스를 달리면 보상을 드려요',
  href: '/missions/m1',
  imageUrl: COVER_ALT,
})

const COLLECTION = hero({
  resource: 'collection',
  label: d.todayCard.itembookMilestone,
  title: '새 아이템이 열렸어요',
  subtitle: '한강 컬렉션이 한 칸 더 채워졌어요',
  facts: buildFacts('collection', { collectionName: '한강 컬렉션', itemCount: 12 }, NOW),
  href: '/collections/c1',
})

/** 첫 배지 그림이 커버로 올라간 카드. 1:1 PNG를 16:9로 자르므로 위아래가 잘린다(`object-cover`) — 잘림 정도를 눈으로 확인한다. */
const BADGE_PROMOTED = hero({
  resource: 'badge',
  label: d.todayCard.badgeSpotlight,
  title: '성수동 탐험가 배지가 열렸어요',
  subtitle: '성수동 골목을 걸으면 얻을 수 있어요',
  facts: buildFacts('badge', { badgeName: '성수동 탐험가' }, NOW),
  rarity: 'epic',
  imageUrl: SAMPLE.epic,
  href: '/badges/b1',
})

const DROP = hero({
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
const CAPTION_STYLE: CSSProperties = { margin: '0 0 var(--spacing-4)', fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.6)' }
const ROW_STYLE: CSSProperties = { display: 'flex', gap: 'var(--spacing-32)', flexWrap: 'wrap', alignItems: 'flex-start' }

/** 고정 폭 열. 카드 사이 간격은 `TodayCardStack`의 `gap-4`과 같다 */
function Column({ width, children }: { width: number; children: ReactNode }) {
  return <div style={{ ...STACK_STYLE, width }}>{children}</div>
}

/** 캡션(크림 캔버스 위 설명 글자) + 카드. `data-card`가 높이·가로 넘침 측정 대상이다 */
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
/** 카드 하나의 16:9 이미지 칸 */
const imageBoxOf = (card: HTMLElement) => card.querySelector<HTMLElement>('.aspect-video')!

/** 어떤 카드도 가로로 넘치지 않는다(`scrollWidth <= clientWidth`) */
function expectNoHorizontalOverflow(root: HTMLElement) {
  const cards = cardsOf(root)
  expect(cards.length).toBeGreaterThan(0)
  for (const card of cards) expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
}

/** 모든 카드의 이미지 칸이 16:9다(폭 × 9/16, 오차 1px) */
function expectSixteenByNine(root: HTMLElement) {
  for (const card of cardsOf(root)) {
    const box = imageBoxOf(card)
    const { width, height } = box.getBoundingClientRect()
    expect(Math.abs(height - (width * 9) / 16)).toBeLessThanOrEqual(1)
  }
}

/** 칩 줄은 줄바꿈하지 않는다 — 높이가 칩 한 줄(24px) 안에 있고 가로로 넘치지 않는다 */
function expectChipRowOneLine(card: HTMLElement) {
  // 라벨 칩(shrink-0)의 부모가 칩 줄이다
  const row = card.querySelector<HTMLElement>('span.shrink-0')!.parentElement!
  expect(row.getBoundingClientRect().height).toBeLessThanOrEqual(25)
  expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
}

// ─── 메타 ────────────────────────────────────────────────────────────────

const meta: Meta<typeof TodayCard> = {
  title: '서비스/Today/HeroCard',
  component: TodayCard,
  args: { view: MISSION },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '홈 「투데이」의 큰 이미지 모양(`hero`) — 티켓 20261001_1737(상위 20260930_1453 조각 b3). 위는 16:9 이미지 칸, 아래는 흰 본문이다: ' +
          '칩 줄(라벨 · 지역 핀 · 희귀도 · 기사는 줄 끝 게재일) · 제목 24px(2줄 말줄임) · 요약 16px · 필수 정보 14px 굵게(최대 2줄, 말줄임 없이 줄바꿈) · ' +
          '설명문 14px(2줄 말줄임) · 끝 줄 「자세히 보기 →」(기사는 「기사 읽기 →」). 이미지가 없거나 깨져도 같은 16:9 칸에 자원 아이콘 판을 그려 높이가 같다. ' +
          '서비스 전용 컴포넌트라 MODULAR이 아니다(`TodayCard`가 모양을 고르고 `CardFrame`이 링크·계측·눌림·포커스를 맡는다).',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

// ─── 1. 자원별 대표 ───────────────────────────────────────────────────────

/** 기사·미션·컬렉션·JAM! 배지(그림 승격 컬러·흑백)·드랍. 드랍은 칩 줄에 지역 핀이 없다. 배지 그림은 1:1을 16:9로 자르므로 위아래가 잘리는 정도를 눈으로 본다. */
export const ByResource: Story = {
  name: '자원별 대표 — 기사 · 미션 · 컬렉션 · 배지(컬러·흑백) · 드랍',
  render: () => (
    <Column width={W360}>
      <Case caption="기사 — 칩 줄 끝 게재일 · 끝 줄 「기사 읽기 →」" view={ARTICLE} />
      <Case caption="미션 — 필수 정보 2줄" view={MISSION} />
      <Case caption="컬렉션 — 이름 · 아이템 수" view={COLLECTION} />
      <Case caption="JAM! 배지 — 그림 승격(컬러) · 희귀도 칩 · 1:1 PNG가 16:9로 잘림" view={BADGE_PROMOTED} />
      <Case caption="JAM! 배지 — 그림 승격(미보유 흑백, imageDimmed) · 희귀도 칩은 흑백 아님" view={{ ...BADGE_PROMOTED, imageDimmed: true }} />
      <Case caption="드랍 — 칩 줄에 지역 핀 없음(필수 정보 「지역」 줄이 같은 값)" view={DROP} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSixteenByNine(canvasElement)
    const [article, , , , dimmed, drop] = cardsOf(canvasElement)
    expect(article.textContent).toContain('10월 5일')
    expect(article.textContent).toContain(d.today.cardReadArticle)
    // 흑백은 이미지에만 걸린다
    expect(dimmed.querySelectorAll('.grayscale')).toHaveLength(1)
    expect(dimmed.querySelector('.grayscale')?.tagName).toBe('IMG')
    // 드랍은 핀이 없고 지역은 필수 정보 한 곳에서만 보인다
    expect(drop.querySelectorAll('.truncate')).toHaveLength(0)
    expect(drop.textContent?.match(/여의도 한강공원/g)).toHaveLength(1)
  },
}

// ─── 2. 칩 줄 조합 ─────────────────────────────────────────────────────────

/** 라벨 6자 + 핀 10자 + 희귀도는 360에서 핀이 말줄임된다. 기사의 게재일은 줄 끝, 핀만 줄어든다. 칩 줄은 줄바꿈하지 않는다. */
export const ChipRowCombinations: Story = {
  name: '칩 줄 조합 — 배지(핀 말줄임) · 기사 + 핀 + 게재일 · 라벨만',
  render: () => (
    <div style={ROW_STYLE}>
      {[W360, W430].map((width) => (
        <Column key={width} width={width}>
          <Case
            caption={`${width}px — 라벨 6자 · 핀 10자 · Epic (핀만 말줄임)`}
            view={{ ...BADGE_PROMOTED, label: '지역 트렌드', regionLabel: '서울 성동구 성수동 일대', rarity: 'epic' }}
          />
          <Case
            caption={`${width}px — 기사 · 핀 · 게재일 (핀만 줄어듦)`}
            view={{ ...ARTICLE, regionLabel: '서울특별시 성동구 성수동 서울숲길 일대' }}
          />
          <Case caption={`${width}px — 라벨만`} view={{ ...MISSION, subtitle: undefined, facts: undefined, description: undefined }} />
        </Column>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    for (const card of cardsOf(canvasElement)) expectChipRowOneLine(card)
    // 라벨·희귀도·게재일 칩 폭은 핀 길이와 상관없이 줄어들지 않는다
    const [badge360, article360] = cardsOf(canvasElement)
    expect(badge360.querySelectorAll('.truncate')).toHaveLength(1)
    // 게재일은 줄 끝(카드 오른쪽 안쪽 여백 24px)에 붙는다
    const time = article360.querySelector<HTMLElement>('time')!
    expect(time.getBoundingClientRect().right).toBeCloseTo(article360.getBoundingClientRect().right - 24, 0)
  },
}

// ─── 3. 필수 정보·요약·설명문 ──────────────────────────────────────────────

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
    expectSixteenByNine(canvasElement)
  },
}

/** 요약·설명문 각각 / 둘 다 / 둘 다 없음. 없는 그룹은 사라진다. */
export const SubtitleAndDescription: Story = {
  name: '요약 · 설명문 — 각각 · 둘 다 · 둘 다 없음',
  render: () => (
    <Column width={W360}>
      <Case caption="요약만" view={{ ...MISSION, description: undefined }} />
      <Case caption="설명문만" view={{ ...MISSION, subtitle: undefined }} />
      <Case caption="둘 다 있음" view={MISSION} />
      <Case caption="둘 다 없음" view={{ ...MISSION, subtitle: undefined, description: undefined }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [subtitleOnly, descriptionOnly, both, neither] = cardsOf(canvasElement)
    expect(subtitleOnly.textContent).toContain('이번 주말 같이 달려요')
    expect(subtitleOnly.textContent).not.toContain('한강공원 코스를')
    expect(descriptionOnly.textContent).not.toContain('이번 주말 같이 달려요')
    expect(descriptionOnly.textContent).toContain('한강공원 코스를')
    expect(both.textContent).toContain('이번 주말 같이 달려요')
    expect(both.textContent).toContain('한강공원 코스를')
    expect(neither.textContent).not.toContain('이번 주말 같이 달려요')
    expect(neither.textContent).not.toContain('한강공원 코스를')
    expectNoHorizontalOverflow(canvasElement)
  },
}

// ─── 4. 이미지에 제목이 있는 카드 ──────────────────────────────────────────

/** 화면 글자에 제목·요약이 없고 필수 정보가 칩 줄 바로 다음이다. 이미지 alt가 제목이다. 이미지가 없으면 판 위에 제목을 그린다. */
export const TitleInImage: Story = {
  name: 'titleInImage — 이미지 있음(alt = 제목) · 이미지 없음(판 위 제목)',
  render: () => (
    <Column width={W360}>
      <Case caption="이미지 있음 — 제목·요약 글자 없음, alt가 제목" view={{ ...MISSION, titleInImage: true }} />
      <Case caption="이미지 없음 — 판 위에 제목(16px bold, 3줄 한도)" view={{ ...MISSION, titleInImage: true, imageUrl: null }} />
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
    expect(withoutImage.querySelector('.aspect-video')?.textContent).toContain('한강 러닝 챌린지')
    expectNoHorizontalOverflow(canvasElement)
    expectSixteenByNine(canvasElement)
  },
}

// ─── 5. 이미지 없음 · 로드 실패 ─────────────────────────────────────────────

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
      <Case caption="주소 없음 · 기사 — 신문 아이콘" view={{ ...ARTICLE, imageUrl: null }} />
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
  },
}

// ─── 6. 긴 글 ─────────────────────────────────────────────────────────────

const LONG_TITLE = '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너를 모집해요'
const LONG_FACTS = ['한강 이북 둘레길 완주자를 위한 특별 컬렉션 시리즈', '보상 1,200,000 포인트 · 배지 12개 · 쿠폰']
const LONG_SUBTITLE = '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너를 모집하니 놓치지 말고 지금 바로 신청해 보세요'
const LONG_DESCRIPTION =
  '완주하면 한정 배지와 포인트를 드려요. 코스는 여의도에서 반포까지이고, 중간에 쉬어 갈 수 있는 보급 지점이 세 곳 있어요. 비가 오면 일정이 바뀔 수 있어요.'

/** 제목 22자 초과(2줄 말줄임) · 필수 정보 22자 초과(말줄임 없이 줄바꿈) · 요약·설명문 2줄 말줄임. */
export const LongText: Story = {
  name: '긴 글 — 제목 2줄 말줄임 · 필수 정보 줄바꿈(말줄임 없음) · 요약·설명문 2줄 말줄임',
  render: () => (
    <div style={ROW_STYLE}>
      {[W360, W430].map((width) => (
        <Column key={width} width={width}>
          <Case caption={`${width}px — 긴 제목`} view={{ ...MISSION, title: LONG_TITLE, facts: undefined }} />
          <Case caption={`${width}px — 긴 필수 정보 (줄바꿈, 2개 한도)`} view={{ ...COLLECTION, facts: LONG_FACTS }} />
          <Case
            caption={`${width}px — 긴 요약 · 설명문`}
            view={{ ...MISSION, subtitle: LONG_SUBTITLE, description: LONG_DESCRIPTION, facts: undefined }}
          />
        </Column>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
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
    // 요약·설명문은 각각 2줄까지만 보인다
    const [, , clamped] = cardsOf(canvasElement)
    for (const text of Array.from(clamped.querySelectorAll<HTMLElement>('p.line-clamp-2'))) {
      expect(text.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(text).lineHeight) * 2 + 1)
    }
  },
}

// ─── 7. 계측 있음 · 없음 ───────────────────────────────────────────────────

const sendBeaconOff: NonNullable<Story['beforeEach']> = () => {
  // 계측이 켜진 카드의 노출·클릭 전송이 나가지 않게 막는다(Story에서는 어떤 요청도 보내지 않는다)
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => true })
  return () => {
    Reflect.deleteProperty(navigator, 'sendBeacon')
  }
}

/** 계측 정보와 `href`가 있으면 링크가 블록 요소이고 눌림(`.jam-press`)·키보드 포커스 윤곽선(2px·오프셋 2px·`--link`)을 가진다. 윤곽선은 이미지 모서리에 잘리지 않는다. */
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
    // 윤곽선 색은 DS 토큰 --link와 같다
    const probe = document.createElement('span')
    probe.style.color = 'var(--link)'
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

/** 계측 정보가 없으면(운영툴 미리보기) 링크·트래커·눌림이 없다. `href`가 있으면 끝 줄만 보이고, 없으면 끝 줄도 없다. */
export const Untracked: Story = {
  name: '계측 없음(미리보기) — 링크 없음, href 있으면 끝 줄만 보임, href 없으면 끝 줄도 없음',
  render: () => (
    <Column width={W360}>
      <Case caption="① href 있음 — 끝 줄 보임, 링크 없음" view={{ ...MISSION, href: '/missions/m1' }} />
      <Case caption="② href 없음 — 끝 줄도 없음" view={{ ...MISSION, href: undefined }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelectorAll('a')).toHaveLength(0)
    expect(canvasElement.querySelectorAll('.jam-press')).toHaveLength(0)
    const [withHref, withoutHref] = cardsOf(canvasElement)
    expect(withHref.textContent).toContain(d.today.cardReadMore)
    expect(withoutHref.textContent).not.toContain(d.today.cardReadMore)
    expect(withoutHref.textContent).not.toContain('→')
  },
}

// ─── 8. 폭 · 최악 조합 ─────────────────────────────────────────────────────

const WORST = hero({
  resource: 'collection',
  label: d.todayCard.itembookMilestone,
  // 제목 40자
  title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너들을 모집해요',
  subtitle: LONG_SUBTITLE,
  // 필수 정보 둘 다 22자 초과
  facts: LONG_FACTS,
  description: LONG_DESCRIPTION,
  regionLabel: '서울 성동구 성수동',
  href: '/collections/c1',
})

/** 360·430 기기 폭 나란히. 높이는 글자 수에 따라 달라지므로 각 카드의 실측 높이를 눈으로 확인한다(확정 설계의 추정치 대신 기록). */
export const Widths: Story = {
  name: '폭 360(328px) · 430(398px) 나란히',
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="360 기기 (카드 328px, 이미지 칸 약 184px)" view={MISSION} width={W360} />
      <Case caption="430 기기 (카드 398px, 이미지 칸 약 224px)" view={MISSION} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSixteenByNine(canvasElement)
    const [narrow, wide] = cardsOf(canvasElement)
    expect(Math.abs(heightOf(imageBoxOf(narrow)) - 184.5)).toBeLessThanOrEqual(1)
    expect(Math.abs(heightOf(imageBoxOf(wide)) - 224)).toBeLessThanOrEqual(1)
  },
}

/** 제목 40자 + 필수 정보 둘 다 22자 초과 + 긴 요약·설명문. 320 기기(288px) 한 장과 360·430으로 가로 넘침이 없는지 본다. */
export const WorstCase: Story = {
  name: '최악 조합 — 긴 제목 · 긴 필수 정보 · 긴 요약·설명문 (320 · 360 · 430)',
  render: () => (
    <div style={ROW_STYLE}>
      <Case caption="320 기기 (카드 288px, 이미지 칸 162px)" view={WORST} width={W320} />
      <Case caption="360 기기 (카드 328px)" view={WORST} width={W360} />
      <Case caption="430 기기 (카드 398px)" view={WORST} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    expectSixteenByNine(canvasElement)
    for (const card of cardsOf(canvasElement)) expectChipRowOneLine(card)
  },
}

/** 320 기기에서 판 위 제목이 3줄 한도로 이미지 칸(162px) 안에 들어가는지 본다(아이콘 32 + 간격 8 + 3줄 72 = 112px + 위아래 여백). */
export const PlaceholderWorstAt320: Story = {
  name: '320 기기 — 판 위 제목 3줄 한도가 이미지 칸 안에 들어감',
  render: () => (
    <Case
      caption="320 기기 (카드 288px, 이미지 칸 162px) — 제목 3줄에서 말줄임"
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
