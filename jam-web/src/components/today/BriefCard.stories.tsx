import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect, userEvent } from 'storybook/test'
import { d } from '@/lib/i18n'
import { buildFacts, type BriefCardView, type CardView } from '@/lib/today/cardView'
import TodayCard from './TodayCard'

/**
 * 짧은 소식(`brief`) 상태 행렬 (티켓 20261001_1458, 상위 20260930_1453 b2) — 서비스 Story의 첫 파일이다.
 *
 * - 카드 폭은 뷰포트 에뮬레이션이 아니라 고정 폭 래퍼다: 360 기기 = 328px, 430 기기 = 398px, 320 기기 = 288px(최악 조합만).
 * - 캔버스는 크림(`--background`, #f1f0eb)이다. 흰 카드의 경계는 1px `--border`가 맡고 그림자는 없다.
 * - Storybook은 `design-system/styles.css`를 import하므로 전역 `*:focus-visible` 윤곽선이 서비스에 없어도 보인다. 그래서 Story에서
 *   윤곽선이 보인다는 것은 서비스 증거가 아니다 — 클래스 단언(`__tests__/CardFrame.test.tsx`)이 보증한다. 아래 `play`는 높이·가로 넘침 같은
 *   계산 스타일을 눈으로 확인할 때 쓰는 보조 단언이고 CI에서 실행되지 않는다(vitest의 addon-vitest 연동 제거, `vitest.config.ts` 머리말).
 * - 계측이 켜진 Story는 노출·클릭 전송(`navigator.sendBeacon`)이 나가지 않게 `beforeEach`에서 막는다.
 */

const NOW = new Date('2026-10-05T12:00:00+09:00')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const W360 = 328 // 360 기기 카드 폭
const W430 = 398 // 430 기기 카드 폭
const W320 = 288 // 320 기기 카드 폭

/** 기준 시각에서 `ms` 뒤에 끝나는 기간(남은 시간 문구 확인용) */
const endsIn = (ms: number) => ({ startsAt: '2026-10-01T00:00:00+09:00', endsAt: new Date(NOW.getTime() + ms).toISOString() })

const SAMPLE = {
  common: '/badges/sample/s222.png',
  rare: '/badges/sample/s142.png',
  epic: '/badges/sample/s331.png',
  mystic: '/badges/sample/s019.png',
} as const

const TRACKING = { cardId: 'story-card', contentTypeId: null, templateType: 'drop_alert', shape: 'brief' } as const

function brief(overrides: Partial<BriefCardView>): BriefCardView {
  return { shape: 'brief', resource: 'drop', title: '제목', ...overrides }
}

// ─── 값 ──────────────────────────────────────────────────────────────────

const MISSION = brief({
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

const DROP = brief({
  resource: 'drop',
  label: d.todayCard.dropAlert,
  title: '한강공원 번개 드랍',
  // 지역 값이 있어도 드랍은 칩 줄에 핀을 그리지 않는다(필수 정보 「지역」 줄이 같은 값을 낸다)
  regionLabel: '여의도 한강공원',
  facts: buildFacts('drop', { place: '여의도 한강공원' }, NOW),
  href: '/drops',
})

const COLLECTION = brief({
  resource: 'collection',
  label: d.todayCard.itembookMilestone,
  title: '새 아이템이 열렸어요',
  facts: buildFacts('collection', { collectionName: '한강 컬렉션', itemCount: 12 }, NOW),
  href: '/collections/c1',
})

const BADGE = brief({
  resource: 'badge',
  label: d.todayCard.badgeSpotlight,
  title: '성수동 탐험가 배지가 열렸어요',
  facts: buildFacts('badge', { badgeName: '성수동 탐험가' }, NOW),
  rarity: 'epic',
  thumbnailUrl: SAMPLE.epic,
  href: '/badges/b1',
})

const AUTO_NUDGE = brief({
  resource: 'auto',
  template: 'progress_nudge',
  label: d.todayCard.progressNudge,
  title: '한강 러닝 챌린지가 곧 끝나요',
  facts: buildFacts('auto', { period: endsIn(3 * DAY) }, NOW),
  href: '/missions/m1',
})

const AUTO_TREND = brief({
  resource: 'auto',
  template: 'location_trend',
  label: d.todayCard.locationTrend,
  title: '성수동에서 러닝이 인기예요',
  regionLabel: '성수동',
  href: '/search',
})

const RANKING = brief({ resource: 'ranking', label: d.todayCard.rankingBoard, title: '이번 주 러닝 랭킹', href: '/missions/m1/status' })

const ARTICLE = brief({ resource: 'article', label: d.todayCard.editorialArticle, title: '가을 한강 러닝 코스 가이드', href: '/today/a1' })

/** 레시피 공개 카드(`recipe_reveal`)의 공개 전 모습 — 타일이 없어 `list`가 아니라 `brief`로 그려진다. 필수 정보는 재료 수·공개일뿐이다(티켓 20261006_1217). */
const RECIPE = brief({
  resource: 'recipe',
  template: 'recipe_reveal',
  label: d.todayCard.recipeReveal,
  title: '새 레시피가 곧 공개돼요',
  facts: buildFacts('recipe', { ingredientCount: 4, revealAt: '2026-10-12T18:00:00+09:00' }, NOW),
  href: '/combine',
})

// ─── 배치 도우미 ───────────────────────────────────────────────────────────

const STACK_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }
const CAPTION_STYLE: CSSProperties = { margin: '0 0 var(--spacing-4)', fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.6)' }

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

/** 어떤 카드도 가로로 넘치지 않는다(`scrollWidth <= clientWidth`) */
function expectNoHorizontalOverflow(root: HTMLElement) {
  const cards = cardsOf(root)
  expect(cards.length).toBeGreaterThan(0)
  for (const card of cards) expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
}

// ─── 메타 ────────────────────────────────────────────────────────────────

const meta: Meta<typeof TodayCard> = {
  title: '서비스/Today/BriefCard',
  component: TodayCard,
  args: { view: MISSION },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '홈 「투데이」의 짧은 소식 모양(`brief`) — 티켓 20261001_1458(상위 20260930_1453 조각 b2). 왼쪽 64px 칸(배지 썸네일 또는 자원 아이콘) · ' +
          '칩 줄(라벨 · 지역 핀 · 희귀도) · 제목 16px(2줄 말줄임) · 필수 정보 14px(최대 2줄, 말줄임 없이 줄바꿈) · 끝 `›`. ' +
          '최소 높이 88px. 서비스 전용 컴포넌트라 MODULAR이 아니다(`TodayCard`가 모양을 고르고 `CardFrame`이 링크·계측·눌림·포커스를 맡는다).',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

// ─── 1. 자원별 ───────────────────────────────────────────────────────────

/** 자원 8종(자동 카드는 진행 알림·지역 트렌드 둘). 랭킹·기사는 필수 정보 없이 아이콘 모양 구분만 보고, 레시피는 재료 수·공개일 두 줄이다. */
export const ByResource: Story = {
  name: '자원별 8종 — 아이콘 모양으로만 구분',
  render: () => (
    <Column width={W360}>
      <Case caption="미션 — 필수 정보 2줄" view={MISSION} />
      <Case caption="드랍 — 지역 (칩 줄에 지역 핀 없음)" view={DROP} />
      <Case caption="컬렉션 — 이름 · 아이템 수" view={COLLECTION} />
      <Case caption="JAM! 배지 — 배지 그림 썸네일 · 희귀도 칩" view={BADGE} />
      <Case caption="자동 카드 — 진행 알림 (모래시계)" view={AUTO_NUDGE} />
      <Case caption="자동 카드 — 지역 트렌드 (핀)" view={AUTO_TREND} />
      <Case caption="랭킹 — 필수 정보 없음" view={RANKING} />
      <Case caption="기사 — 필수 정보 없음" view={ARTICLE} />
      <Case caption="레시피 공개 전 — 재료 수 · 공개일 (플라스크)" view={RECIPE} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    // 아이콘 칸의 아이콘은 서로 다른 모양이다(색이 아니라 모양으로만 구분)
    const slotIcons = cardsOf(canvasElement)
      .map((card) => card.querySelector('.w-16 svg')?.innerHTML)
      .filter((html): html is string => Boolean(html))
    // 배지 카드는 썸네일 이미지를 그려 아이콘이 없다
    expect(slotIcons).toHaveLength(8)
    expect(new Set(slotIcons).size).toBe(8)
  },
}

// ─── 1-1. 레시피 공개 전 ───────────────────────────────────────────────────

/**
 * 레시피 공개 카드의 공개 전 · 레시피 줄이 없는 카드 · 공개일을 읽을 수 없는 카드. 모두 `brief`다 — 타일이 0개인 `list`는 `brief`로 그려진다.
 * 레시피 이름·재료 후보·보상은 공개 전 값에 없으므로 어느 카드에도 나오지 않는다(1500 ⑫ 사용자 결정 Q3).
 */
export const RecipeReveal: Story = {
  name: '레시피 공개 전 — 재료 수 · 공개일, 레시피 없음, 공개일 없음',
  render: () => (
    <Column width={W360}>
      <Case caption="공개 전 — 재료 N개 · 공개 M월 D일 · › (플라스크)" view={RECIPE} />
      <Case
        caption="레시피 줄 없음(비었거나 끝났거나 조회 실패) — 정보 줄이 없다"
        view={brief({ ...RECIPE, facts: undefined })}
      />
      <Case
        caption="공개일을 읽을 수 없음 — 공개일 줄만 생략"
        view={brief({ ...RECIPE, facts: buildFacts('recipe', { ingredientCount: 4, revealAt: 'not-a-date' }, NOW) })}
      />
      <Case
        caption="처음 보는 템플릿 값 — 아이콘·칩 없이 그려지고 칩 줄 여백도 없다"
        view={brief({ resource: undefined as never, template: 'future_template' as never, label: undefined, title: '미래 카드', href: '/' })}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    const [reveal, none, noDate, unknown] = cardsOf(canvasElement)
    expect(Array.from(reveal.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['재료 4개', '공개 10월 12일'])
    expect(none.querySelectorAll('p')).toHaveLength(0)
    expect(Array.from(noDate.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['재료 4개'])
    // 모르는 템플릿은 64px 칸이 비어 있어도 카드 높이는 최소 88px을 지킨다
    expect(heightOf(unknown)).toBeGreaterThanOrEqual(88)
    expect(unknown.querySelector('.w-16 svg')).toBeNull()
  },
}

// ─── 2. 미션 종료 임박 ─────────────────────────────────────────────────────

/** 종료 7일 이내면 「N일 남음」, 24시간 이내면 「N시간 남음」이 기간 줄을 대신한다. 1357의 문구가 처음 화면에 나오는 곳이다. */
export const MissionEndingSoon: Story = {
  name: '미션 종료 임박 — N일 남음 · N시간 남음',
  render: () => (
    <Column width={W360}>
      <Case
        caption="종료 3일 전 — 「N일 남음」이 기간 줄을 대신"
        view={{
          ...MISSION,
          facts: buildFacts('mission', { period: endsIn(3 * DAY + 5 * HOUR), rewardPoints: 300, rewardBadgeCount: 1 }, NOW),
        }}
      />
      <Case
        caption="종료 5시간 전 — 「N시간 남음」"
        view={{ ...MISSION, facts: buildFacts('mission', { period: endsIn(5 * HOUR - 1), rewardPoints: 300 }, NOW) }}
      />
      <Case
        caption="종료 8일 전 — 기간 그대로"
        view={{ ...MISSION, facts: buildFacts('mission', { period: endsIn(8 * DAY), rewardPoints: 300 }, NOW) }}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    const text = canvasElement.textContent ?? ''
    expect(text).toContain('3일 남음')
    expect(text).toContain('5시간 남음')
  },
}

// ─── 3. JAM! 배지 희귀도 ───────────────────────────────────────────────────

const badgeWithRarity = (rarity: BriefCardView['rarity'], thumbnailUrl: string): BriefCardView => ({
  ...BADGE,
  title: '한강 러너 배지가 열렸어요',
  facts: ['한강 러너'],
  rarity,
  thumbnailUrl,
})

export const BadgeRarity: Story = {
  name: 'JAM! 배지 희귀도 — Common(칩 없음) · Rare · Epic · Mystic · 등급 없음',
  render: () => (
    <Column width={W360}>
      <Case caption="Common — 칩 없음" view={badgeWithRarity('common', SAMPLE.common)} />
      <Case caption="Rare" view={badgeWithRarity('rare', SAMPLE.rare)} />
      <Case caption="Epic" view={badgeWithRarity('epic', SAMPLE.epic)} />
      <Case caption="Mystic" view={badgeWithRarity('mystic', SAMPLE.mystic)} />
      <Case caption="등급 없음(null, 무한레벨형) — 이름만" view={badgeWithRarity(null, SAMPLE.common)} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    // 칩만 센다(캡션 글자에도 「Common」이 들어 있다)
    const chips = Array.from(canvasElement.querySelectorAll('span')).map((el) => el.textContent)
    for (const label of ['Rare', 'Epic', 'Mystic']) expect(chips).toContain(label)
    expect(chips).not.toContain('Common')
    expectNoHorizontalOverflow(canvasElement)
  },
}

// ─── 4. JAM! 배지 썸네일 ───────────────────────────────────────────────────

/** 미보유 배지는 흑백, 유저 정보가 없는 미리보기는 컬러, 주소가 없거나 로드에 실패하면 같은 칸에 아이콘이다. 다섯 카드의 높이는 같다. */
export const BadgeThumbnail: Story = {
  name: 'JAM! 배지 썸네일 — 보유 컬러 · 미보유 흑백 · 미리보기 컬러 · 주소 없음 · 로드 실패',
  render: () => (
    <Column width={W360}>
      <Case caption="보유 — 컬러" view={{ ...BADGE, rarity: 'rare', thumbnailUrl: SAMPLE.rare }} />
      <Case caption="미보유 — 흑백(thumbnailDimmed)" view={{ ...BADGE, rarity: 'rare', thumbnailUrl: SAMPLE.rare, thumbnailDimmed: true }} />
      <Case caption="유저 정보 없는 미리보기 — 컬러(thumbnailDimmed 없음)" view={{ ...BADGE, rarity: 'rare', thumbnailUrl: SAMPLE.rare }} />
      <Case caption="주소 없음 — 자원 아이콘" view={{ ...BADGE, rarity: 'rare', thumbnailUrl: undefined }} />
      <Case caption="로드 실패(깨진 경로) — SafeImage fallback 아이콘" view={{ ...BADGE, rarity: 'rare', thumbnailUrl: '/badges/sample/없는-파일.png' }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    // 깨진 경로가 fallback으로 바뀔 시간을 준다
    await new Promise((resolve) => setTimeout(resolve, 800))
    const heights = cardsOf(canvasElement).map(heightOf)
    expect(heights).toHaveLength(5)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
    const images = canvasElement.querySelectorAll('.w-16 img')
    // 보유·미보유·미리보기만 이미지가 남고, 주소 없음·로드 실패는 아이콘이다
    expect(images).toHaveLength(3)
    expect(canvasElement.querySelectorAll('.w-16 img.grayscale')).toHaveLength(1)
    expect(canvasElement.querySelectorAll('.w-16 svg')).toHaveLength(2)
    expectNoHorizontalOverflow(canvasElement)
  },
}

// ─── 5. 칩 줄 최악 ─────────────────────────────────────────────────────────

/** 라벨 6자 + 지역 핀 10자(+ 희귀도). 핀만 말줄임되고 라벨·희귀도 칩은 줄어들지 않는다. */
export const ChipRowWorst: Story = {
  name: '칩 줄 최악 — 라벨 6자 + 지역 핀 10자 + 희귀도, 핀이 더 길면 핀만 말줄임',
  render: () => (
    <Column width={W360}>
      <Case
        caption="라벨 6자 · 지역 핀 10자 · Mystic — 360에서는 핀이 말줄임된다"
        view={{ ...BADGE, label: '지역 트렌드', regionLabel: '서울 성동구 성수동', rarity: 'mystic', thumbnailUrl: SAMPLE.mystic }}
      />
      <Case
        caption="지역 핀 21자 — 핀만 말줄임"
        view={{ ...BADGE, label: '지역 트렌드', regionLabel: '서울특별시 성동구 성수동 서울숲길 일대', rarity: 'mystic', thumbnailUrl: SAMPLE.mystic }}
      />
      <Case
        caption="라벨 · 지역 핀 (희귀도 없음)"
        view={{ ...AUTO_TREND, regionLabel: '서울 성동구 성수동' }}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    // 라벨 칩과 희귀도 칩의 폭은 핀 길이와 상관없이 같다
    const [first, second] = cardsOf(canvasElement)
    const widthOf = (card: HTMLElement, text: string) =>
      Array.from(card.querySelectorAll<HTMLElement>('span.shrink-0')).find((el) => el.textContent === text)?.getBoundingClientRect().width
    expect(widthOf(first, 'Mystic')).toBeDefined()
    expect(widthOf(first, 'Mystic')).toBeCloseTo(widthOf(second, 'Mystic') ?? -1, 0)
    expect(widthOf(first, '지역 트렌드')).toBeCloseTo(widthOf(second, '지역 트렌드') ?? -1, 0)
  },
}

// ─── 6. 최악 조합 ──────────────────────────────────────────────────────────

const WORST = brief({
  resource: 'collection',
  label: d.todayCard.itembookMilestone,
  // 제목 40자
  title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너들을 모집해요',
  // 필수 정보 둘 다 15자 초과
  facts: ['한강 이북 둘레길 완주자를 위한 특별 컬렉션 시리즈', '보상 1,200,000 포인트 · 배지 12개 · 쿠폰'],
  regionLabel: '서울 성동구 성수동',
  href: '/collections/c1',
})

/** 제목 40자 + 필수 정보 둘 다 15자 초과. 360·430, 그리고 320 한 장으로 가로 넘침이 없는지 본다. 제목은 2줄에서 말줄임되고 필수 정보는 줄바꿈된다. */
export const WorstCase: Story = {
  name: '최악 조합 — 제목 40자 + 필수 정보 둘 다 15자 초과 (320 · 360 · 430)',
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--spacing-32)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <Case caption="320 기기 (카드 288px)" view={WORST} width={W320} />
      <Case caption="360 기기 (카드 328px)" view={WORST} width={W360} />
      <Case caption="430 기기 (카드 398px)" view={WORST} width={W430} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    for (const card of cardsOf(canvasElement)) {
      const title = card.querySelector<HTMLElement>('h3')!
      // 제목은 2줄까지만 보인다(line-clamp-2)
      const lineHeight = parseFloat(getComputedStyle(title).lineHeight)
      expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight * 2 + 1)
      // 필수 정보는 말줄임이 없다 — 글자가 잘리지 않는다
      for (const fact of Array.from(card.querySelectorAll<HTMLElement>('p'))) {
        expect(getComputedStyle(fact).textOverflow).not.toBe('ellipsis')
        expect(fact.scrollWidth).toBeLessThanOrEqual(fact.clientWidth)
      }
    }
  },
}

// ─── 7. 필수 정보 줄 수와 가장 짧은 카드 ────────────────────────────────────

/** 칩 + 제목 1줄 + 필수 정보 0줄이면 높이는 칸 64 + 여백 24 = 88px로 정해진다. 글자가 많아지면 위로 늘어난다. */
export const Shortest: Story = {
  name: '가장 짧은 카드 — 칩 + 제목 1줄 + 필수 정보 0줄 = 88px',
  render: () => (
    <Column width={W360}>
      <Case caption="필수 정보 0줄" view={brief({ resource: 'ranking', label: d.todayCard.rankingBoard, title: '이번 주 러닝 랭킹' })} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const card = cardsOf(canvasElement)[0].firstElementChild as HTMLElement
    expect(Math.abs(heightOf(card) - 88)).toBeLessThanOrEqual(1)
  },
}

export const FactLines: Story = {
  name: '필수 정보 0줄 · 1줄 · 2줄',
  render: () => (
    <Column width={W360}>
      <Case caption="0줄 — 그 줄만 생략, 높이는 88px 최소" view={{ ...MISSION, facts: undefined }} />
      <Case caption="1줄" view={{ ...MISSION, facts: ['기간 상시'] }} />
      <Case caption="2줄" view={MISSION} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const [zero, one, two] = cardsOf(canvasElement).map((card) => heightOf(card.firstElementChild as HTMLElement))
    expect(Math.abs(zero - 88)).toBeLessThanOrEqual(1)
    expect(one).toBeGreaterThanOrEqual(88 - 1)
    expect(two).toBeGreaterThan(one)
    expectNoHorizontalOverflow(canvasElement)
  },
}

/**
 * 제목 28자·필수 정보 15자 상한 실측용(확정 설계 3절 「구현 때 실측」). 328px·398px에서 각각 몇 줄이 되는지 눈으로 본다.
 * 줄바꿈이 생기는 것은 정상이다(`break-keep`은 어절 단위로 끊는다).
 */
export const TextLimits: Story = {
  name: '글자 상한 실측 — 제목 28자 · 29자 초과 / 필수 정보 15자 · 20자',
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--spacing-32)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {[W360, W430].map((width) => (
        <Column key={width} width={width}>
          <Case
            caption={`${width}px — 제목 28자`}
            view={{ ...MISSION, title: '한강 둔치 러닝 챌린지에 함께할 가을 러너 모집해요', facts: undefined }}
          />
          <Case
            caption={`${width}px — 제목 29자 초과(2줄 말줄임)`}
            view={{ ...MISSION, title: '한강 둔치 러닝 챌린지에 함께할 가을 러너를 모집해요 지금 바로 확인하세요', facts: undefined }}
          />
          <Case
            caption={`${width}px — 필수 정보 15자`}
            view={{ ...DROP, facts: ['지역 여의도 한강시민공원 앞'] }}
          />
          <Case
            caption={`${width}px — 필수 정보 20자(줄바꿈, 말줄임 없음)`}
            view={{ ...DROP, facts: ['지역 여의도 한강시민공원 물빛광장 앞'] }}
          />
        </Column>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
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

/** 계측 정보와 `href`가 있으면 링크가 블록 요소이고 눌림(`.jam-press`)·키보드 포커스 윤곽선(2px·오프셋 2px·`--link`)을 가진다. */
export const Tracked: Story = {
  name: '계측 있음 — 링크 · 눌림 · 포커스(Tab 키로 확인)',
  beforeEach: sendBeaconOff,
  render: () => (
    <Column width={W360}>
      <Case caption="누르면 0.98배, 80ms. Tab 키를 눌러 포커스 윤곽선을 본다" view={{ ...DROP, tracking: TRACKING }} />
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
    // 윤곽선이 둥근 카드를 따라간다
    expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0)
    // 눌림 대상은 링크 하나다
    expect(canvasElement.querySelectorAll('.jam-press')).toHaveLength(1)
  },
}

/** 계측 정보가 없으면(운영툴 미리보기) 링크·트래커·눌림이 없다. `href`가 있으면 `›`만 보이고, 없으면 `›`도 없다. */
export const Untracked: Story = {
  name: '계측 없음(미리보기) — 링크 없음, href 있으면 › 만 보임, href 없으면 › 도 없음',
  render: () => (
    <Column width={W360}>
      <Case caption="① href 있음 — › 보임, 링크 없음" view={{ ...DROP, href: '/drops' }} />
      <Case caption="② href 없음 — › 도 없음" view={{ ...DROP, href: undefined }} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelectorAll('a')).toHaveLength(0)
    expect(canvasElement.querySelectorAll('.jam-press')).toHaveLength(0)
    const [withHref, withoutHref] = cardsOf(canvasElement)
    expect(withHref.textContent).toContain('›')
    expect(withoutHref.textContent).not.toContain('›')
  },
}

// ─── 9. 쌓은 맥락 ──────────────────────────────────────────────────────────

const STACK: CardView[] = [MISSION, { ...BADGE, rarity: 'rare', thumbnailUrl: SAMPLE.rare }, DROP]

/** 카드 3장을 `gap-4`로 쌓은 맥락. 간격 리듬 확인용이고 360·430 스크린숏의 소스다. */
export const StackedAt360: Story = {
  name: '쌓은 맥락 — 360 기기 (카드 328px)',
  render: () => (
    <Column width={W360}>
      {STACK.map((view, i) => (
        <div key={i} data-card>
          <TodayCard view={view} />
        </div>
      ))}
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
  },
}

export const StackedAt430: Story = {
  name: '쌓은 맥락 — 430 기기 (카드 398px)',
  render: () => (
    <Column width={W430}>
      {STACK.map((view, i) => (
        <div key={i} data-card>
          <TodayCard view={view} />
        </div>
      ))}
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
  },
}
