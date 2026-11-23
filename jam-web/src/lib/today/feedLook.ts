/**
 * 홈피드 새 카드의 «그릴 값» 해석 (티켓 20261121_0041, 상위 20261120_2026 4회차-2).
 *
 * 카드 행의 새 칸(`today_cards`의 개편 칸, 마이그레이션 349)과 4-1이 만든 계산(`feedAssign.ts`·`feedChipSlots.ts`·`feedValueChips.ts`)을 합쳐
 * 화면이 그대로 그릴 값(색·칩·제목 속 칩·설명 노출·도장·박스)을 만든다.
 *
 * - 값만 받는 순수 함수다(DB·조회·훅 없음). 시각은 인자(`now`)로 받고 `Math.random`·`Date.now`는 쓰지 않는다 — 서버와 브라우저가 같은 행에서 같은 값을 낸다.
 * - 시드는 `feed_seed`가 있으면 그것(0도 유효), 없으면 카드 id의 해시다. 이웃 카드는 보지 않는다(등록 때 값을 저장해 고정하는 일은 5~6회차).
 * - 지정한 칸(NULL이 아닌 값)은 보존하고 NULL 칸만 4-1 계산이 채운다. 자리가 유형이 허용하지 않는 이름이면 지정하지 않은 것으로 본다.
 * - 값 칩은 `FeedValueChipSource`가 담은 값만 쓴다. 미션 조건·배지 달성 기준·레벨은 `cards.ts` 조회가 선택 칸으로 싣고(티켓 20261121_0155) `cardView.ts`가 이 입력에 연결한다. 칸이 없으면 그 칩만 없다.
 *
 * ## 칩 구성
 * - 저장된 `chips`(NULL이 아님): 그것을 그린다. 문구 칩은 `text`, 구분 칩은 `text` 또는 자원의 구분 문구, 값 칩은 `source`가 가리키는 값을 문구로 바꾼다
 *   (알려진 출처 키만: `mission.remaining`·`mission.reward_points`·`mission.condition`·`activity_badge.criteria`·`activity_badge.level`·`collection.item_count`·`checkin.required_badges`·`checkin.place_name`. 읽지 못하면 그 칩은 없다).
 * - NULL(자동): 첫 값 칩 → 구분 칩 순이다. 값이 없으면 구분 칩 하나, 구분 칩이 없는 자원이면 값 칩을 앞에서 두 개까지.
 *   **드랍·픽업(`drop_pickup`)만 다르다**: 자원과 무관하게 «DROP»·«PICKUP» 분류 칩(검정) 둘이다(티켓 20261122_2228 R1).
 *   분류 칩 문구는 영어 대문자(ACTIVITY·ITEM·MISSION·CHECK IN·COLLECTION·DROP·PICKUP)다. 저장된 한글 구분 문구(미션·액티비티 배지·아이템 배지·컬렉션·체크인, 문구 칩의 드랍·픽업)는 `toEnglishDivider`로 영어로 바꿔 보여 준다.
 * - 개수는 카드당 최대 2개이고 유형의 한도(`chipLimitOf`)로 한 번 더 자른다. 첫 칩은 큰 칩, 둘째는 작은 칩이다(샘플). 구분 칩은 검정이다. 드랍·픽업은 두 칩 모두 큰 칩이다(샘플).
 *
 * ## 지원 유형 목록
 * `FEED_RENDERED_TYPES`가 그릴 수 있는 유형(4-2의 다섯 유형에 4-3의 컬렉션 소개·드랍·픽업·목록형을 더한 여덟 유형)의 단일 원천이다.
 * `toCardView`(어떤 카드를 새 갈래로 보낼지)와 `FeedCard`(어떤 유형을 그릴지)가 함께 읽는다.
 * `full_image`는 `FEED_FULL_IMAGE_ENABLED`가 거짓인 동안 `isRenderedFeedType`이 거짓이다.
 * 4-3의 세 유형은 그리는 데 필요한 값(컬렉션 그림·아이템 배지·목록 항목)이 없으면 `toCardView`가 그 행을 옛 경로로 보낸다(이 파일은 유형만 안다).
 *
 * ## 컬렉션 배지 배치 (티켓 20261121_0115)
 * `collection_intro`의 `look.burst`는 아이템 배지 4개 자리의 도착 위치·기울기·크기·시작 지연이다. 저장된 `collection_burst`가 있으면 그것을(범위를 넘는 값은 범위 안으로 맞춘다),
 * 없는(NULL) 자리는 카드 시드로 정한다. 그리는 쪽은 배지 수만큼 앞에서부터 쓴다. 다른 유형의 `look`에는 `burst`가 없다.
 */
import type { TodayBoxKind, TodayBoxShape, TodayBurstPoint, TodayChipSpec } from '@/types/database'
import { createRng, hashSeed, type BoxSeed } from './boxShape'
import {
  assignChipPlacement,
  assignFeedColors,
  FEED_FALLBACK_COLORS,
  type ExcludedColorPair,
  type FeedChipFixedPlacement,
} from './feedAssign'
import { FEED_CHIP_SLOT_SPECS, isAllowedSlot, isFeedType, MAX_CARD_CHIPS } from './feedChipSlots'
import {
  FEED_BURST,
  FEED_BURST_SAMPLE,
  FEED_COLOR_KEYS,
  FEED_FULL_IMAGE_ENABLED,
  FEED_MOTION,
  FEED_TILTS,
  resolveBoxKind,
  type FeedColorKey,
  type FeedTilt,
} from './feedConstants'
import { limitChipsForType } from './feedChipLayout'
import {
  FEED_DROP_PICKUP_PHRASES,
  FEED_VALUE_CHIP_RULES,
  toEnglishDivider,
  buildValueChips,
  formatBadgeCriteriaChip,
  formatBadgeLevelChip,
  formatItemCountChip,
  formatMissionConditionChip,
  formatPlaceNameChip,
  formatRemainingChip,
  formatRequiredBadgesChip,
  formatRewardPointsChip,
  type FeedValueChipSource,
} from './feedValueChips'
import { MAX_TITLE_CHIPS } from './titleChips'

// ── 지원 유형 ────────────────────────────────────────────────

/** 그릴 수 있는 여덟 유형. 앞 다섯은 4-2, 뒤 셋(컬렉션 소개·드랍·픽업·목록형)은 4-3이다. */
export const FEED_RENDERED_TYPES = [
  'hero_box',
  'text_box',
  'badge_intro',
  'badge_only',
  'full_image',
  'collection_intro',
  'drop_pickup',
  'gallery_list',
] as const

export type RenderedFeedType = (typeof FEED_RENDERED_TYPES)[number]

/** 홈이 새 갈래로 그리는 유형인가. 모르는 값·NULL·꺼진 `full_image`는 거짓이라 옛 경로가 그린다. */
export function isRenderedFeedType(value: unknown): value is RenderedFeedType {
  if (!isFeedType(value)) return false
  if (value === 'full_image') return FEED_FULL_IMAGE_ENABLED
  return (FEED_RENDERED_TYPES as readonly string[]).includes(value)
}

/** 유형의 설명 문장 기본 노출(PRD «카드 유형 8가지» 표). 숨기는 유형은 `show_description`과 무관하게 숨긴다. 어드민 「카드 모양」 칸이 읽는다(티켓 20261121_1316). */
export const DESCRIPTION_DEFAULT: Readonly<Record<RenderedFeedType, boolean>> = {
  hero_box: true,
  text_box: false,
  badge_intro: true,
  badge_only: false,
  full_image: false,
  collection_intro: true,
  drop_pickup: true,
  gallery_list: true,
}

// ── 해석 결과 ────────────────────────────────────────────────

/** 칩 면 색: 색 키 9개 또는 `black`(구분 칩). */
export type FeedLookChipColor = FeedColorKey | 'black'

export interface FeedLookChip {
  kind: 'label' | 'value' | 'phrase'
  text: string
  color: FeedLookChipColor
  /** 첫 칩은 큰 칩(`lg`), 둘째는 작은 칩(`sm`) */
  size: 'lg' | 'sm'
  slot: string
  tilt: FeedTilt
}

export interface FeedLookStamp {
  slot: string
  color: FeedColorKey
}

/** 컬렉션 소개의 아이템 배지 한 개가 퍼져 닿는 자리. `x`·`y`는 가운데에서 영역 가장자리까지를 1로 본 −1~1이고, 크기(px)·시작 지연(ms)·기울기(deg)가 따라온다. */
export interface FeedBurstPlacement {
  x: number
  y: number
  tilt: number
  size: number
  delayMs: number
}

export interface FeedLook {
  /** 무작위 값의 시드(저장된 `feed_seed` 또는 카드 id의 해시) */
  seed: number
  colors: { bg: FeedColorKey; chip: FeedColorKey; box: FeedColorKey }
  chips: FeedLookChip[]
  /** 제목 속 칩: 낱말 목록(최대 2개)과 같은 위치끼리 짝인 색·기울기 */
  titleChips: { words: string[]; colors: FeedColorKey[]; tilts: FeedTilt[] }
  showDescription: boolean
  /** 도장. `stamp_enabled`가 참일 때만 있고 한 카드에 하나다 */
  stamp: FeedLookStamp | null
  boxShape: TodayBoxShape
  boxKind: TodayBoxKind
  /** 컬렉션 소개만 있다. 아이템 배지 4개 자리(`FEED_BURST.count`). 그리는 쪽이 배지 수만큼 앞에서 쓴다. */
  burst?: FeedBurstPlacement[]
}

/** 해석이 읽는 카드 값. 카드 행(`TodayCardRow`)과 서버 조회 결과(`TodayCardWithHref`)가 모두 맞는다. */
export interface FeedLookCard {
  id: string
  feed_type?: string | null
  bg_color_key?: string | null
  chip_color_key?: string | null
  box_color_key?: string | null
  chips?: TodayChipSpec[] | null
  title_chip_words?: string[] | null
  show_description?: boolean | null
  stamp_enabled?: boolean | null
  stamp_slot?: string | null
  box_shape?: TodayBoxShape | null
  box_kind?: TodayBoxKind | null
  collection_burst?: TodayBurstPoint[] | null
  feed_seed?: number | null
}

export interface ResolveFeedLookInput {
  card: FeedLookCard
  feedType: RenderedFeedType
  /** 값 칩의 입력. 자원이 칩을 내지 않으면 null */
  valueSource: FeedValueChipSource | null
  now: Date
  /** 미리보기 전용: 사용자가 검수표에서 제외한 색 조합(색 키 쌍, 순서 무관). 생략하면 제외 없이 배정한다(서비스 홈은 주지 않는다). */
  excludedColorPairs?: readonly ExcludedColorPair[]
}

// ── 보조 ─────────────────────────────────────────────────────

const BOX_SHAPES_ALL: readonly TodayBoxShape[] = ['round', 'ticket', 'stamp', 'wave', 'bump']

function colorKeyOr(value: string | null | undefined, fallback: FeedColorKey): FeedColorKey {
  return (FEED_COLOR_KEYS as readonly string[]).includes(value ?? '') ? (value as FeedColorKey) : fallback
}

function fixedKey(value: string | null | undefined): string | null {
  return (FEED_COLOR_KEYS as readonly string[]).includes(value ?? '') ? (value as string) : null
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

function isTilt(value: unknown): value is FeedTilt {
  return typeof value === 'number' && (FEED_TILTS as readonly number[]).includes(value)
}

/** 저장된 값 칩의 `source` → 문구. 알려진 출처만 읽고, 입력이 그 자원의 것이 아니거나 값이 없으면 null. */
function valueChipTextOf(source: string | undefined, valueSource: FeedValueChipSource | null, now: Date): string | null {
  if (!source || !valueSource) return null
  switch (source) {
    case 'mission.remaining':
    case 'mission.ends_at':
      return valueSource.resource === 'mission' ? formatRemainingChip(valueSource.endsAt, now) : null
    case 'mission.reward_points':
      return valueSource.resource === 'mission' ? formatRewardPointsChip(valueSource.rewardPoints) : null
    case 'mission.condition':
      return valueSource.resource === 'mission' ? formatMissionConditionChip(valueSource.condition) : null
    case 'activity_badge.criteria':
      return valueSource.resource === 'activity_badge' ? formatBadgeCriteriaChip(valueSource.condition) : null
    case 'activity_badge.level':
      return valueSource.resource === 'activity_badge' ? formatBadgeLevelChip(valueSource.level) : null
    case 'collection.item_count':
      return valueSource.resource === 'collection' ? formatItemCountChip(valueSource.itemCount) : null
    case 'checkin.required_badges':
      return valueSource.resource === 'checkin' ? formatRequiredBadgesChip(valueSource.requiredBadgeCount) : null
    case 'checkin.place_name':
      return valueSource.resource === 'checkin' ? formatPlaceNameChip(valueSource.placeName) : null
    default:
      return null
  }
}

interface ChipDraft {
  kind: FeedLookChip['kind']
  text: string
  fixed: FeedChipFixedPlacement
}

/** 칩의 글자와 지정 자리·기울기를 모은다(자리 배정 전). */
function draftChips(
  stored: readonly TodayChipSpec[] | null | undefined,
  valueSource: FeedValueChipSource | null,
  now: Date,
  feedType: RenderedFeedType,
): ChipDraft[] {
  const divider = valueSource ? FEED_VALUE_CHIP_RULES[valueSource.resource].divider : null
  if (stored) {
    const drafts: ChipDraft[] = []
    for (const spec of stored) {
      let text: string | null
      let kind: FeedLookChip['kind'] = spec.kind
      if (spec.kind === 'phrase') {
        text = spec.text?.trim() || null
        // 저장된 «드랍»·«픽업» 문구 칩은 분류 칩이다(둘 다 분류 칩, 티켓 20261122_2228 R1). 다른 문구 칩은 그대로 둔다.
        if (text === '드랍' || text === '픽업') {
          text = toEnglishDivider(text)
          kind = 'label'
        }
      } else if (spec.kind === 'label') {
        // 저장된 한글 구분 문구(미션 등)는 영어 대문자로 보여 준다. 표에 없는 문구는 그대로다.
        const stored = spec.text?.trim()
        text = stored ? toEnglishDivider(stored) : divider
      } else text = valueChipTextOf(spec.source, valueSource, now)
      if (!text) continue
      drafts.push({ kind, text, fixed: { slot: spec.slot ?? null, tilt: spec.tilt ?? null } })
    }
    return drafts
  }
  // 드랍·픽업의 자동 칩: «DROP»·«PICKUP» 두 칩이고 둘 다 분류 칩(검정)이다(티켓 20261122_2228 R1, 전에는 «드랍» 색 칩·«픽업» 검정 칩)
  if (feedType === 'drop_pickup') {
    const [drop, pickup] = FEED_DROP_PICKUP_PHRASES
    return [
      { kind: 'label', text: drop, fixed: {} },
      { kind: 'label', text: pickup, fixed: {} },
    ]
  }
  if (!valueSource) return []
  const values = buildValueChips(valueSource, now)
  const valueDrafts = (texts: string[]): ChipDraft[] => texts.map((text) => ({ kind: 'value' as const, text, fixed: {} }))
  if (!divider) return valueDrafts(values.slice(0, MAX_CARD_CHIPS))
  const dividerDraft: ChipDraft = { kind: 'label', text: divider, fixed: {} }
  return values.length > 0 ? [...valueDrafts(values.slice(0, 1)), dividerDraft] : [dividerDraft]
}

// ── 컬렉션 배지 배치 ─────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** 시드 난수로 제자리 섞기(피셔–예이츠). 입력은 바꾸지 않는다. */
function shuffled<T>(rng: () => number, list: readonly T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** 시작 지연 후보 네 개: 70~210ms를 같은 간격으로 나눈 값(70·117·163·210). 배지마다 서로 다르다. */
const BURST_DELAYS: readonly number[] = Array.from({ length: FEED_BURST.count }, (_, index) =>
  Math.round(FEED_MOTION.delayMs.min + ((FEED_MOTION.delayMs.max - FEED_MOTION.delayMs.min) * index) / (FEED_BURST.count - 1)),
)

/** 사분면(부호 쌍) → 샘플 배치의 자리. 위왼쪽·아래왼쪽·위오른쪽·아래오른쪽이다. */
const QUADRANTS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

function placementFromPx(px: number, py: number, tilt: number, size: number, delayMs: number): FeedBurstPlacement {
  return {
    x: round3(px / FEED_BURST.referenceHalf.x),
    y: round3(py / FEED_BURST.referenceHalf.y),
    tilt,
    size,
    delayMs,
  }
}

function burstCenterDistance(point: FeedBurstPlacement): number {
  return Math.hypot(point.x * FEED_BURST.referenceHalf.x, point.y * FEED_BURST.referenceHalf.y)
}

function burstPairDistance(a: FeedBurstPlacement, b: FeedBurstPlacement): number {
  return Math.hypot((a.x - b.x) * FEED_BURST.referenceHalf.x, (a.y - b.y) * FEED_BURST.referenceHalf.y)
}

/** 새 배치가 가운데 그림과 앞의 배지들에서 최소 거리를 지키는가. */
function isBurstPointClear(point: FeedBurstPlacement, placed: readonly FeedBurstPlacement[]): boolean {
  if (burstCenterDistance(point) < FEED_BURST.minCenterDistance) return false
  return placed.every((other) => burstPairDistance(point, other) >= FEED_BURST.minPairDistance)
}

/**
 * 카드 시드로 배지 4개의 자리를 불규칙하게 정한다. 배지마다 사분면을 하나씩 맡아 한쪽으로 몰리지 않고(순서는 시드로 섞는다),
 * 사분면 안의 자리·크기(68~84)·기울기(±6~14°)는 난수로 고른다. 가운데 그림과 배지끼리 최소 거리를 지킬 때까지 자리를 다시 뽑고(자리당 30번),
 * 끝내 못 찾으면 그 사분면의 샘플 자리를 쓴다. 같은 시드는 서버와 브라우저에서 같은 값이다(`Math.random` 없음).
 */
export function generateCollectionBurst(seed: number): FeedBurstPlacement[] {
  const rng = createRng(`${seed}:collection-burst`)
  const delays = shuffled(rng, BURST_DELAYS)
  const placed: FeedBurstPlacement[] = []
  shuffled(rng, QUADRANTS.map((_, index) => index)).forEach((quadrantIndex, order) => {
    const [signX, signY] = QUADRANTS[quadrantIndex]
    const sample = FEED_BURST_SAMPLE[quadrantIndex]
    const { badgeSize, referenceHalf, edgeMargin, tilt } = FEED_BURST
    let chosen: FeedBurstPlacement | null = null
    for (let attempt = 0; attempt < 30 && !chosen; attempt++) {
      const size = badgeSize.min + Math.floor(rng() * (badgeSize.max - badgeSize.min + 1))
      const maxX = referenceHalf.x - size / 2 - edgeMargin
      const maxY = referenceHalf.y - size / 2 - edgeMargin
      const minX = 48
      const minY = 8
      const tiltAbs = tilt.min + Math.floor(rng() * (tilt.max - tilt.min + 1))
      const tiltSign = rng() < 0.5 ? -1 : 1
      const candidate = placementFromPx(
        signX * (minX + rng() * (maxX - minX)),
        signY * (minY + rng() * (maxY - minY)),
        tiltSign * tiltAbs,
        size,
        delays[order],
      )
      if (isBurstPointClear(candidate, placed)) chosen = candidate
    }
    placed[quadrantIndex] = chosen ?? placementFromPx(sample.px, sample.py, sample.tilt, sample.size, delays[order])
  })
  // 사분면 순서(위왼쪽부터)로 놓았으므로 배지 순서도 그 순서다. 샘플 자리가 섞여 최소 거리를 어기면 샘플 배치 전체로 대신한다.
  const valid = placed.every((point, index) => isBurstPointClear(point, placed.slice(0, index)))
  if (valid) return placed
  return FEED_BURST_SAMPLE.map((sample, index) => placementFromPx(sample.px, sample.py, sample.tilt, sample.size, BURST_DELAYS[index]))
}

/**
 * 저장된 `collection_burst`와 시드 배치를 합친다. 저장된 칸은 범위 안으로 맞춰(`x`·`y` −1~1, 크기 68~84, 지연 70~210, 기울기 ±45) 쓰고,
 * 값이 모자라거나 읽을 수 없는 칸·저장되지 않은 자리는 시드 배치가 채운다. 항상 `FEED_BURST.count`개다.
 */
export function resolveCollectionBurst(stored: readonly TodayBurstPoint[] | null | undefined, seed: number): FeedBurstPlacement[] {
  const generated = generateCollectionBurst(seed)
  if (!Array.isArray(stored) || stored.length === 0) return generated
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  return generated.map((fallback, index) => {
    const point = stored[index]
    if (!point || !finite(point.x) || !finite(point.y)) return fallback
    return {
      x: clamp(point.x, -1, 1),
      y: clamp(point.y, -1, 1),
      tilt: finite(point.tilt) ? clamp(point.tilt, -45, 45) : fallback.tilt,
      size: finite(point.size) ? clamp(Math.round(point.size), FEED_BURST.badgeSize.min, FEED_BURST.badgeSize.max) : fallback.size,
      delayMs: finite(point.delay_ms) ? clamp(Math.round(point.delay_ms), FEED_MOTION.delayMs.min, FEED_MOTION.delayMs.max) : fallback.delayMs,
    }
  })
}

// ── 해석 ─────────────────────────────────────────────────────

/** 카드 행의 새 칸과 4-1 계산을 합쳐 «그릴 값»을 낸다. 같은 입력은 언제 어디서 열어도 같은 값이다. */
export function resolveFeedLook({ card, feedType, valueSource, now, excludedColorPairs }: ResolveFeedLookInput): FeedLook {
  const seed: number = typeof card.feed_seed === 'number' ? card.feed_seed : hashSeed(card.id)
  const seedKey: BoxSeed = seed

  // 박스 용도 — NULL이면 유형 기본. 색 배정(글자가 들어가는 박스인지)에도 같은 값을 쓴다
  const boxKind: TodayBoxKind = resolveBoxKind(feedType, card.box_kind)

  // 색 — 지정한 칸은 보존하고 NULL 칸만 자동 규칙이 채운다. 앞 카드 정보가 없어 `recentBgKeys`는 빈 목록이다(저장값이 없는 카드의 폴백 경로).
  const assigned = assignFeedColors(
    {
      seed: seedKey,
      fixed: { bg: fixedKey(card.bg_color_key), chip: fixedKey(card.chip_color_key), box: fixedKey(card.box_color_key) },
      recentBgKeys: [],
      boxHasText: boxKind !== 'image_mask',
    },
    { ...(excludedColorPairs ? { excludedPairs: excludedColorPairs } : {}) },
  )
  const colors = {
    bg: colorKeyOr(assigned.bg, FEED_FALLBACK_COLORS.bg as FeedColorKey),
    chip: colorKeyOr(assigned.chip, FEED_FALLBACK_COLORS.chip as FeedColorKey),
    box: colorKeyOr(assigned.box, FEED_FALLBACK_COLORS.box as FeedColorKey),
  }

  // 칩 — 글자 → 한도 → 자리·기울기
  const drafts = limitChipsForType(feedType, draftChips(card.chips, valueSource, now, feedType)).slice(0, MAX_CARD_CHIPS)
  const placements = assignChipPlacement({
    seed: seedKey,
    feedType,
    chipCount: drafts.length,
    fixed: drafts.map((draft) => ({
      slot: draft.fixed.slot && isAllowedSlot(feedType, draft.fixed.slot) ? draft.fixed.slot : null,
      tilt: isTilt(draft.fixed.tilt) ? draft.fixed.tilt : null,
    })),
  })
  const chips: FeedLookChip[] = drafts.slice(0, placements.length).map((draft, index) => ({
    kind: draft.kind,
    text: draft.text,
    color: draft.kind === 'label' ? 'black' : colors.chip,
    size: index === 0 || feedType === 'drop_pickup' ? 'lg' : 'sm',
    slot: placements[index].slot,
    tilt: isTilt(placements[index].tilt) ? placements[index].tilt : FEED_TILTS[0],
  }))

  // 제목 속 칩 — 낱말 최대 2개, 색은 카드의 칩 색, 기울기는 시드로(둘째는 첫째와 다르게)
  const words = (card.title_chip_words ?? []).slice(0, MAX_TITLE_CHIPS)
  const tiltRng = createRng(`${seed}:title-chips`)
  const firstTilt = pick(tiltRng, FEED_TILTS)
  const secondTilt = pick(tiltRng, FEED_TILTS.filter((tilt) => tilt !== firstTilt))
  const titleChips = {
    words,
    colors: words.map(() => colors.chip),
    tilts: words.map((_, index) => (index === 0 ? firstTilt : secondTilt)),
  }

  // 설명 — 숨기는 유형은 `show_description`과 무관하게 숨기고, 보이는 유형은 거짓일 때만 숨긴다(NULL은 «유형 기본»)
  const showDescription = DESCRIPTION_DEFAULT[feedType] && card.show_description !== false

  // 도장 — 켜졌을 때만, 한 카드에 하나. 자리는 지정값(허용 자리일 때) 또는 칩이 쓰지 않는 자리 중 시드로 고른다
  let stamp: FeedLookStamp | null = null
  if (card.stamp_enabled === true) {
    const slots = FEED_CHIP_SLOT_SPECS[feedType].slots
    const taken = new Set(chips.map((chip) => chip.slot))
    const free = slots.filter((slot) => !taken.has(slot))
    const candidates = free.length > 0 ? free : slots
    const slot =
      card.stamp_slot && isAllowedSlot(feedType, card.stamp_slot)
        ? card.stamp_slot
        : candidates.length > 0
          ? pick(createRng(`${seed}:stamp`), candidates)
          : null
    if (slot) stamp = { slot, color: colors.chip }
  }

  // 박스 — 모양은 NULL이면 5종 중 시드로 고른다(박스를 끄는 선택지는 없다). 용도는 위에서 정했다
  const boxShape = card.box_shape ?? pick(createRng(`${seed}:box-shape`), BOX_SHAPES_ALL)

  const look: FeedLook = { seed, colors, chips, titleChips, showDescription, stamp, boxShape, boxKind }
  if (feedType === 'collection_intro') look.burst = resolveCollectionBurst(card.collection_burst, seed)
  return look
}
