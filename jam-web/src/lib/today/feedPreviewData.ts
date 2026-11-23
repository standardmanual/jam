/**
 * 홈피드 새 카드 개발용 미리보기 페이지의 가짜 데이터와 요약 계산 (티켓 20261121_0155, 상위 20261120_2026 4회차-4).
 *
 * `(main)/dev-sample/home-feed-cards/new/page.tsx`가 그리는 값을 만든다. 서비스 데이터(DB·세션·`getTodayCards`)를 읽지 않고 손으로 만든 값을
 * 실제 해석 함수(`resolveFeedLook`)에 넣어 화면 값(`FeedCardView`)을 만든다 — 해석 규칙이 바뀌면 이 화면도 같이 바뀐다.
 *
 * - 값만 받는 순수 함수다. 같은 입력은 같은 결과이고 `Math.random`·`Date.now`를 쓰지 않는다(시각은 고정값 `PREVIEW_NOW`).
 * - 이미지는 저장소에 이미 있는 정적 자산(`public/dev-sample`·`public/badges/sample`)이거나 비어 있다(색 면). 외부 주소를 쓰지 않는다.
 * - 자동 배정 구역: 서로 다른 시드 120장을 `resolveFeedLook`(칩·색 NULL)으로 배정하고, 통합 팔레트의 배제 표(`chipExclusionRule`)로 규칙 위반을 센다(티켓 20261122_2224 회차 4·5).
 *   사용자가 검수표에서 제외한 조합 «예시»(`PREVIEW_EXCLUDED_PAIRS`)를 입력으로 넣어 제외 조합과 겹치는 카드가 없는지도 센다. 실제 제외 목록은 6회차가 저장한다.
 * - 칩 배치: 자동 배정 120장은 홈과 같은 진입점(`attachChipPlans`, `toCardViews`의 마지막 단계)으로 한 배열을 훑어 `look.chipPlan`을 싣는다(티켓 20261122_2228 R7).
 *   유형별 샘플 구간은 샘플마다 «앞 카드 없음»이라 `chipPlan`을 싣지 않고 그리는 쪽이 즉석 계산한다.
 */
import type { TodayChipSpec } from '@/types/database'
import { attachChipPlans, type FeedCardView, type FeedCardViewBadge, type FeedCardViewListItem } from './cardView'
import { BOX_SHAPES, type BoxShape } from './boxShape'
import { assignFeedColors, type ExcludedColorPair } from './feedAssign'
import type { ChainStep } from './feedChipChain'
import { chipLimitOf, FEED_CHIP_SLOT_SPECS } from './feedChipSlots'
import { chipExclusionRule, type ColorRuleName } from './feedColorRules'
import type { FeedColorKey } from './feedConstants'
import { FEED_RENDERED_TYPES, resolveFeedLook, type FeedLookCard, type RenderedFeedType } from './feedLook'
import type { FeedValueChipSource } from './feedValueChips'

/** 남은 기간 칩이 늘 같은 값이 되도록 고정한 기준 시각 */
export const PREVIEW_NOW = new Date('2026-11-21T12:00:00+09:00')

/** 자동 배정 구역의 카드 수 */
export const PREVIEW_AUTO_COUNT = 120

/** 유형 이름(화면 표시용) */
export const PREVIEW_TYPE_LABELS: Readonly<Record<RenderedFeedType, string>> = {
  hero_box: '히어로',
  text_box: '텍스트',
  badge_intro: '배지 소개',
  badge_only: '배지만',
  full_image: '전체 배경 이미지',
  collection_intro: '컬렉션 소개',
  drop_pickup: '드랍·픽업',
  gallery_list: '목록형',
}

/** 박스 모양 이름(화면 표시용) */
export const PREVIEW_BOX_SHAPE_LABELS: Readonly<Record<BoxShape, string>> = {
  round: '둥근 모서리',
  ticket: '티켓',
  stamp: '우표',
  wave: '물결',
  bump: '돌출',
}

/**
 * 검수표에서 사용자가 제외한 색 조합의 «예시». 모두 통합 팔레트 규칙에서 나올 수 있는 쌍이라 제외하지 않으면 배정에 나온다(시험이 확인한다).
 * 되돌림 기본 조합(`FEED_FALLBACK_COLORS`)의 쌍과는 겹치지 않게 골랐다.
 */
export const PREVIEW_EXCLUDED_PAIRS: readonly ExcludedColorPair[] = [
  ['sky', 'yellow'],
  ['sky', 'pink'],
  ['green', 'pink'],
  ['purple', 'sky'],
]

// ── 가짜 이미지(정적 자산) ───────────────────────────────────

const COVER = '/dev-sample/card-cover.webp'
const COVER_SQUARE = '/dev-sample/card-cover-square.webp'
const ACTIVITY_BADGE = '/badges/sample/s142.png'

/** 컬렉션 소개·드랍·픽업이 쓰는 아이템 배지 샘플(`public/badges/sample`) */
export const PREVIEW_ITEM_BADGES: readonly FeedCardViewBadge[] = [
  { name: '황동 카메라', imageUrl: '/badges/sample/s001.png' },
  { name: '다 쓴 필름통', imageUrl: '/badges/sample/s003.png' },
  { name: '인화 타이머', imageUrl: '/badges/sample/s004.png' },
  { name: '압정 한 줌', imageUrl: '/badges/sample/s005.png' },
]

/** 드랍·픽업 견본 배지: 그림 있는 5종(배지 한도 5, 티켓 20261122_2229). 컬렉션 소개의 4종과 같은 그림에 하나를 더한다. */
const PREVIEW_DROP_BADGES: readonly FeedCardViewBadge[] = [...PREVIEW_ITEM_BADGES, { name: '손때 묻은 열쇠', imageUrl: '/badges/sample/s006.png' }]

/** 목록형 항목 샘플. 그림이 없는 항목(색 면)도 하나 둔다. */
export const PREVIEW_LIST_ITEMS: readonly FeedCardViewListItem[] = [
  { name: '산', href: '/drops?place=mountain', imageUrl: COVER_SQUARE },
  { name: '편의점', href: '/drops?place=cvs', imageUrl: null },
  { name: '마트', href: '/drops?place=mart', imageUrl: '/badges/sample/s006.png' },
]

// ── 화면 값 만들기 ───────────────────────────────────────────

export interface PreviewCardOptions extends Partial<Omit<FeedLookCard, 'feed_type'>> {
  title?: string
  description?: string
  /** `null`이면 이미지 없음(박스는 색 면) */
  imageUrl?: string | null
  badgeImageUrl?: string | null
  badgeName?: string
  valueSource?: FeedValueChipSource | null
  collectionName?: string
  collectionBadges?: readonly FeedCardViewBadge[]
  itemBadges?: readonly FeedCardViewBadge[]
  listItems?: readonly FeedCardViewListItem[]
  listMoreHref?: string
  excludedColorPairs?: readonly ExcludedColorPair[]
}

/** 해석 함수를 거쳐 표시 데이터를 만든다. 지정하지 않은 칸은 자동 규칙(NULL)이다. `tracking`은 싣지 않는다(계측·링크 없음). */
export function buildPreviewView(feedType: RenderedFeedType, options: PreviewCardOptions = {}): FeedCardView {
  const {
    id = `preview-${feedType}`,
    title = '낙엽 소리 따라\n걷는 한 주',
    description,
    imageUrl = COVER,
    badgeImageUrl = null,
    badgeName,
    valueSource = null,
    collectionName,
    collectionBadges,
    itemBadges,
    listItems,
    listMoreHref,
    excludedColorPairs,
    ...stored
  } = options
  const look = resolveFeedLook({
    card: { id, feed_type: feedType, ...stored },
    feedType,
    valueSource,
    now: PREVIEW_NOW,
    excludedColorPairs,
  })
  const view: FeedCardView = { resource: 'mission', title, feedType, imageUrl, look }
  if (description && look.showDescription) view.description = description
  if (badgeImageUrl) view.badgeImageUrl = badgeImageUrl
  if (badgeName) view.badgeName = badgeName
  if (collectionName) view.collectionName = collectionName
  if (collectionBadges) view.collectionBadges = [...collectionBadges]
  if (itemBadges) view.itemBadges = [...itemBadges]
  if (listItems) view.listItems = [...listItems]
  if (listMoreHref) view.listMoreHref = listMoreHref
  return view
}

const MISSION_SOURCE: FeedValueChipSource = {
  resource: 'mission',
  endsAt: '2026-11-23T12:00:00+09:00',
  rewardPoints: 300,
  condition: { activity_type: 'walking', distance_km: 8 },
}

/** 유형별 기본 값. 제목에 넣은 낱말(`titleWords`)은 제목 속 칩 시험이 쓴다 — 제목에 그대로 들어 있어야 한다. */
interface PreviewBase {
  options: PreviewCardOptions
  titleWords: readonly [string, string]
}

const BASES: Readonly<Record<RenderedFeedType, PreviewBase>> = {
  hero_box: {
    options: {
      title: '낙엽 소리 따라\n걷는 한 주',
      description: '먼저 참가하고 바스락 소리를 따라 걸어 봐요.',
      valueSource: MISSION_SOURCE,
      box_shape: 'round',
      feed_seed: 7,
    },
    titleWords: ['낙엽', '걷는'],
  },
  text_box: {
    options: {
      title: '잠긴 채\n온 배지,\n열어\n볼까요',
      valueSource: MISSION_SOURCE,
      box_shape: 'round',
      feed_seed: 11,
    },
    titleWords: ['잠긴', '열어'],
  },
  badge_intro: {
    options: {
      title: '산 위에서\n한숨 돌리는 날',
      description: '산에서 최고 고도 700m를 넘기면 높은 곳 배지를 획득할 수 있어요.',
      imageUrl: null,
      badgeImageUrl: ACTIVITY_BADGE,
      badgeName: '높은 곳 배지',
      valueSource: { resource: 'activity_badge', condition: { elevation_gain_m: 700 }, level: 1 },
      feed_seed: 4,
    },
    titleWords: ['산 위', '한숨'],
  },
  badge_only: {
    options: {
      title: '해가 짧아진 저녁의\n한 바퀴',
      imageUrl: null,
      badgeImageUrl: ACTIVITY_BADGE,
      badgeName: '파장의 골목 배지',
      valueSource: { resource: 'activity_badge', level: 2 },
      feed_seed: 9,
    },
    titleWords: ['저녁', '한 바퀴'],
  },
  full_image: {
    options: {
      title: '잎 진 산길에서\n만나는 하늘',
      valueSource: MISSION_SOURCE,
      feed_seed: 5,
    },
    titleWords: ['산길', '하늘'],
  },
  collection_intro: {
    options: {
      title: '골목길 필름 스냅',
      description: '활판 골목 끝 현상소의 안쪽 벽에는 찾아가지 않은 사진이 붙어 있습니다.',
      imageUrl: COVER_SQUARE,
      collectionName: '골목길 필름 스냅',
      collectionBadges: PREVIEW_ITEM_BADGES,
      valueSource: { resource: 'collection', itemCount: 12 },
      feed_seed: 11,
    },
    titleWords: ['골목길', '필름'],
  },
  drop_pickup: {
    options: {
      title: '내겐 남는 것이\n누군가의 새것',
      description: '남는 아이템 배지는 드랍하고, 필요한 건 픽업해 봐요.',
      imageUrl: null,
      itemBadges: PREVIEW_DROP_BADGES,
      valueSource: { resource: 'drop_pickup' },
      box_shape: 'round',
      feed_seed: 5,
    },
    titleWords: ['남는', '새것'],
  },
  gallery_list: {
    options: {
      title: '요즘 드랍이 많은 곳',
      description: '산, 편의점, 마트에 아이템 배지가 많이 드랍돼 있어요. 가까운 곳에서 픽업해 봐요.',
      imageUrl: null,
      listItems: PREVIEW_LIST_ITEMS,
      listMoreHref: '/drops',
      valueSource: null,
      box_color_key: 'yellow',
      feed_seed: 3,
    },
    titleWords: ['요즘', '많은'],
  },
}

/** 유형별 기본 값에 덮어쓸 값을 얹어 화면 값을 만든다. `id`는 유형·시드로 정해 같은 입력이 같은 카드가 되게 한다. */
export function previewView(feedType: RenderedFeedType, overrides: PreviewCardOptions = {}): FeedCardView {
  return buildPreviewView(feedType, { ...BASES[feedType].options, ...overrides })
}

/** 유형별 기본 값이 제목 속 칩으로 쓰는 낱말 둘(제목에 그대로 들어 있다) */
export function previewTitleWords(feedType: RenderedFeedType): readonly [string, string] {
  return BASES[feedType].titleWords
}

// ── ① 유형별 구역 ────────────────────────────────────────────

export interface PreviewCell {
  /** 칸 이름표(상태 설명) */
  label: string
  view: FeedCardView
  /** 컬렉션 소개만: 모션 래퍼를 «모인»·«퍼진» 모습으로 고정한다. 없으면 조립(`FeedCard`)이 그대로 그린다. */
  phase?: 'collected' | 'spread'
}

export interface PreviewTypeSample {
  feedType: RenderedFeedType
  name: string
  /** 서비스에서 이 유형이 지금 어떻게 보이는지 한 줄 */
  note: string
  cell: PreviewCell
}

/** 전체 배경 이미지는 서비스에서 꺼져 있다(`FEED_FULL_IMAGE_ENABLED`). 이 페이지는 컴포넌트를 직접 그려 보인다. */
export const PREVIEW_FULL_IMAGE_NOTE = '꺼짐 상태예요. 켤 때 채원이 글자색과 막을 정해요.'

export function buildTypeSamples(): PreviewTypeSample[] {
  return FEED_RENDERED_TYPES.map((feedType) => ({
    feedType,
    name: PREVIEW_TYPE_LABELS[feedType],
    note: feedType === 'full_image' ? PREVIEW_FULL_IMAGE_NOTE : '서비스 홈에 나오는 유형이에요.',
    cell: {
      label: '샘플 구성',
      view: previewView(feedType),
      phase: feedType === 'collection_intro' ? 'spread' : undefined,
    },
  }))
}

// ── ② 박스 모양 5종 × 박스 유형 ─────────────────────────────

export interface PreviewBoxRow {
  /** 줄 이름(유형과 박스 용도) */
  name: string
  cells: PreviewCell[]
}

/** 박스가 있는 유형: 히어로(이미지 박스), 텍스트(글자 박스·이미지 박스), 드랍·픽업(아이템 박스). 박스 모양 5종을 한 줄씩 늘어놓는다. */
export function buildBoxMatrix(): PreviewBoxRow[] {
  const rows: { name: string; feedType: RenderedFeedType; overrides: PreviewCardOptions }[] = [
    { name: '히어로: 이미지 박스', feedType: 'hero_box', overrides: { feed_seed: 7 } },
    { name: '텍스트: 글자 박스', feedType: 'text_box', overrides: { feed_seed: 11 } },
    { name: '텍스트: 이미지 박스', feedType: 'text_box', overrides: { feed_seed: 11, box_kind: 'image_mask' } },
    { name: '드랍·픽업: 아이템 박스', feedType: 'drop_pickup', overrides: { feed_seed: 5 } },
  ]
  return rows.map(({ name, feedType, overrides }) => ({
    name,
    cells: BOX_SHAPES.map((shape) => ({
      label: PREVIEW_BOX_SHAPE_LABELS[shape],
      view: previewView(feedType, { ...overrides, box_shape: shape }),
    })),
  }))
}

// ── ③ 칩·도장·설명 숨김 상태 ────────────────────────────────

const ONE_CHIP: TodayChipSpec[] = [{ kind: 'phrase', text: '이번 주 미션' }]
const TWO_CHIPS: TodayChipSpec[] = [{ kind: 'phrase', text: '이번 주' }, { kind: 'label', text: '미션' }]

export interface PreviewStateRow {
  feedType: RenderedFeedType
  name: string
  cells: PreviewCell[]
}

/** 유형마다 칩 0·1·2개, 제목 속 칩 2개, 도장 켬, (설명이 보이는 유형만) 설명 숨김. 칩 한도가 모자라는 유형은 이름표에 한도를 적는다. */
export function buildStateMatrix(): PreviewStateRow[] {
  return FEED_RENDERED_TYPES.map((feedType) => {
    const limit = chipLimitOf(feedType)
    const chipLabel = (count: number) => (count > limit ? `칩 ${count}개 요청(이 유형은 최대 ${limit}개)` : `칩 ${count}개`)
    const base = BASES[feedType].options
    const cells: PreviewCell[] = [
      { label: chipLabel(0), view: previewView(feedType, { chips: [] }) },
      { label: chipLabel(1), view: previewView(feedType, { chips: ONE_CHIP }) },
      { label: chipLabel(2), view: previewView(feedType, { chips: TWO_CHIPS }) },
      { label: '제목 속 칩 2개', view: previewView(feedType, { title_chip_words: [...BASES[feedType].titleWords] }) },
      {
        label: FEED_CHIP_SLOT_SPECS[feedType].slots.length === 0 ? '도장 켬(이 유형은 놓을 자리가 없어요)' : '도장 켬',
        view: previewView(feedType, { stamp_enabled: true }),
      },
    ]
    const shownByDefault = Boolean(base.description)
    if (shownByDefault) cells.push({ label: '설명 숨김', view: previewView(feedType, { show_description: false }) })
    return { feedType, name: PREVIEW_TYPE_LABELS[feedType], cells }
  })
}

// ── ⑤ 컬렉션 모션 ───────────────────────────────────────────

export interface PreviewMotion {
  collected: PreviewCell
  spread: PreviewCell
  /** 실제 관찰자가 돌아가는 카드(스크롤하면 모이고 퍼진다) */
  scrolling: PreviewCell
  /** 아이템 배지가 4개 미만일 때 한 칸 */
  fewBadges: PreviewCell
}

export function buildMotion(): PreviewMotion {
  const view = previewView('collection_intro')
  return {
    collected: { label: '모인 상태(배지가 가운데에 모여 투명)', view, phase: 'collected' },
    spread: { label: '퍼진 상태(기본 HTML과 같다)', view, phase: 'spread' },
    scrolling: { label: '스크롤 재생(카드가 55% 넘게 보이면 퍼져요)', view: previewView('collection_intro', { feed_seed: 21 }) },
    fewBadges: {
      label: '배지 2개',
      view: previewView('collection_intro', { collectionBadges: PREVIEW_ITEM_BADGES.slice(0, 2) }),
      phase: 'spread',
    },
  }
}

// ── ④ 자동 배정 120장과 요약 ────────────────────────────────

export interface PreviewAutoCard {
  /** 1부터 */
  number: number
  feedType: RenderedFeedType
  seed: number
  view: FeedCardView
  /** 색 쌍이 걸린 첫 규칙의 이름. 걸린 쌍이 없으면 빈 배열 */
  violatedRules: ColorRuleName[]
  /** 카드의 색 쌍 중 제외 목록에 든 쌍이 있는가 */
  overlapsExcluded: boolean
  /** 통과하는 조합이 없어 안전한 기본 조합으로 되돌렸는가 */
  usedFallback: boolean
}

/** 자동 배정 구간의 칩 배치 요약(120장을 한 배열로 훑은 계획 기준) */
export interface PreviewChipSummary {
  /** 계획에 든 스티커 수 */
  stickerCount: number
  /** 계획에 든 알약 수 */
  pillCount: number
  /** 물러서기 단계별 카드 수: 물러서지 않음(0단계) · 가볍게(1~2단계: 기울기·스티커 80%) · 크게(3단계 이상) */
  backoff: { none: number; light: number; heavy: number }
  /** 피드 순서 규칙(`ChainViolation`)을 어긴 건수 */
  violationCount: number
}

/** 배열 계획의 카드별 결과(`ChainStep`)를 요약한다. 칩이 없는 카드(`[]`·목록형)는 물러서기 단계에 세지 않는다. */
export function summarizeChipSteps(steps: readonly ChainStep[]): PreviewChipSummary {
  const summary: PreviewChipSummary = { stickerCount: 0, pillCount: 0, backoff: { none: 0, light: 0, heavy: 0 }, violationCount: 0 }
  for (const { plan, violations } of steps) {
    summary.violationCount += violations.length
    if (plan.chips.length === 0) continue
    for (const chip of plan.chips) {
      if (chip.presentation === 'sticker') summary.stickerCount += 1
      else summary.pillCount += 1
    }
    if (plan.backoff === 0) summary.backoff.none += 1
    else if (plan.backoff <= 2) summary.backoff.light += 1
    else summary.backoff.heavy += 1
  }
  return summary
}

/** 칩 배치 요약을 한 줄 문장으로 만든다. 값이 0이어도 항목을 숨기지 않는다. */
export function formatChipSummary(chips: PreviewChipSummary): string {
  const { backoff } = chips
  const retreat = `물러서기 0단계 ${backoff.none}장 / 1~2단계 ${backoff.light}장 / 3~6단계 ${backoff.heavy}장`
  return `칩 배치: 스티커 ${chips.stickerCount}장 · 알약 ${chips.pillCount}장 · ${retreat} · 연속·앞 카드 규칙 위반 ${chips.violationCount}`
}

export interface PreviewAssignSummary {
  cardCount: number
  /** 규칙 ①~④에 걸린 색 쌍이 하나라도 있는 카드 수 */
  ruleViolationCount: number
  /** 색 쌍이 제외 목록과 겹치는 카드 수 */
  excludedOverlapCount: number
  /** 되돌림 기본 조합이 쓰인 카드 수 */
  fallbackCount: number
  /** 입력으로 넣은 제외 조합(색 키 쌍) */
  excludedPairs: readonly ExcludedColorPair[]
  /** 칩 배치 요약 */
  chips: PreviewChipSummary
}

export interface PreviewAssignment {
  cards: PreviewAutoCard[]
  summary: PreviewAssignSummary
}

/** 자동 배정 카드가 쓰는 값 칩 입력. 자원을 돌려 가며 칩 구성(값 칩 → 구분 칩)이 여러 모양으로 나오게 한다. */
function autoValueSource(feedType: RenderedFeedType, index: number): FeedValueChipSource | null {
  switch (feedType) {
    case 'hero_box':
    case 'text_box':
    case 'full_image':
      return index % 2 === 0 ? MISSION_SOURCE : { resource: 'mission', rewardPoints: 500 }
    case 'badge_intro':
    case 'badge_only':
      return index % 2 === 0
        ? { resource: 'activity_badge', condition: { elevation_gain_m: 700 }, level: 1 }
        : { resource: 'activity_badge', level: 3 }
    case 'collection_intro':
      return { resource: 'collection', itemCount: 6 + (index % 7) }
    case 'drop_pickup':
      return { resource: 'drop_pickup' }
    case 'gallery_list':
      return null
  }
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
}

/** 한 카드의 세 색 쌍(배경↔칩, 칩↔박스, 배경↔박스) */
function colorPairsOf(colors: { bg: FeedColorKey; chip: FeedColorKey; box: FeedColorKey }) {
  return [
    { a: colors.bg, b: colors.chip, involvesChip: true },
    { a: colors.chip, b: colors.box, involvesChip: true },
    { a: colors.bg, b: colors.box, involvesChip: false },
  ] as const
}

/**
 * 서로 다른 시드 `count`장을 유형 8개에 돌려 가며 자동 배정(`resolveFeedLook`, 칩·색 NULL)하고, 규칙 위반·제외 조합 겹침·되돌림 수를 센다.
 * 규칙 판정은 4-1의 `feedColorRules`(`firstViolatedRule`)이고, 입력이 같으면 결과가 같다.
 */
export function buildAutoAssignment(
  count: number = PREVIEW_AUTO_COUNT,
  excludedPairs: readonly ExcludedColorPair[] = PREVIEW_EXCLUDED_PAIRS,
): PreviewAssignment {
  const excludedKeys = new Set(excludedPairs.map(([a, b]) => pairKey(a, b)))
  const built = Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => {
    const feedType = FEED_RENDERED_TYPES[index % FEED_RENDERED_TYPES.length]
    const seed = index + 1
    const base = BASES[feedType].options
    const view = buildPreviewView(feedType, {
      // 색·칩은 지정하지 않는다(NULL). 나머지는 유형 기본 값이다
      ...base,
      id: `preview-auto-${String(seed).padStart(3, '0')}`,
      feed_seed: seed,
      box_shape: null,
      box_color_key: null,
      valueSource: autoValueSource(feedType, index),
      excludedColorPairs: excludedPairs,
    })
    const pairs = colorPairsOf(view.look.colors)
    const violatedRules: ColorRuleName[] = []
    for (const { a, b, involvesChip } of pairs) {
      // 배제 표는 칩과 그 아래 면의 쌍만 본다(바탕↔박스는 조합 9개가 정한다)
      const rule = involvesChip ? chipExclusionRule(a, b) : null
      if (rule) violatedRules.push(rule)
    }
    const overlapsExcluded = pairs.some(({ a, b }) => excludedKeys.has(pairKey(a, b)))
    // 되돌림 여부는 해석 결과에 없어, 같은 시드·같은 제외 목록으로 배정 함수를 한 번 더 불러 읽는다(같은 입력이라 같은 값이다)
    const { usedFallback } = assignFeedColors({ seed: view.look.seed }, { excludedPairs })
    return { number: seed, feedType, seed, view, violatedRules, overlapsExcluded, usedFallback }
  })
  // 120장을 한 배열로 훑어 칩 배치 계획을 싣는다 — 홈(`toCardViews`)과 같은 계산이다
  const { views, steps } = attachChipPlans(built.map((card) => card.view))
  const cards: PreviewAutoCard[] = built.map((card, index) => ({ ...card, view: views[index] }))
  return {
    cards,
    summary: {
      cardCount: cards.length,
      ruleViolationCount: cards.filter((card) => card.violatedRules.length > 0).length,
      excludedOverlapCount: cards.filter((card) => card.overlapsExcluded).length,
      fallbackCount: cards.filter((card) => card.usedFallback).length,
      excludedPairs,
      chips: summarizeChipSteps(steps),
    },
  }
}
