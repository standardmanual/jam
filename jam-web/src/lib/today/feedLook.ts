/**
 * 홈피드 새 카드의 «그릴 값» 해석 (티켓 20261121_0041, 상위 20261120_2026 4회차-2).
 *
 * 카드 행의 새 칸(`today_cards`의 개편 칸, 마이그레이션 349)과 4-1이 만든 계산(`feedAssign.ts`·`feedChipSlots.ts`·`feedValueChips.ts`)을 합쳐
 * 화면이 그대로 그릴 값(색·칩·제목 속 칩·설명 노출·도장·박스)을 만든다.
 *
 * - 값만 받는 순수 함수다(DB·조회·훅 없음). 시각은 인자(`now`)로 받고 `Math.random`·`Date.now`는 쓰지 않는다 — 서버와 브라우저가 같은 행에서 같은 값을 낸다.
 * - 시드는 `feed_seed`가 있으면 그것(0도 유효), 없으면 카드 id의 해시다. 이웃 카드는 보지 않는다(등록 때 값을 저장해 고정하는 일은 5~6회차).
 * - 지정한 칸(NULL이 아닌 값)은 보존하고 NULL 칸만 4-1 계산이 채운다. 자리가 유형이 허용하지 않는 이름이면 지정하지 않은 것으로 본다.
 * - 값 칩은 지금 `TodayCardWithHref`가 싣고 있는 값만 쓴다(`FeedValueChipSource`). 미션 조건·배지 달성 기준·레벨은 `cards.ts` 조회 확장이 필요해 4-4로 미뤘다.
 *
 * ## 칩 구성
 * - 저장된 `chips`(NULL이 아님): 그것을 그린다. 문구 칩은 `text`, 구분 칩은 `text` 또는 자원의 구분 문구, 값 칩은 `source`가 가리키는 값을 문구로 바꾼다
 *   (알려진 출처 키만: `mission.remaining`·`mission.reward_points`·`collection.item_count`·`checkin.required_badges`·`checkin.place_name`. 읽지 못하면 그 칩은 없다).
 * - NULL(자동): 첫 값 칩 → 구분 칩 순이다. 값이 없으면 구분 칩 하나, 구분 칩이 없는 자원이면 값 칩을 앞에서 두 개까지.
 * - 개수는 카드당 최대 2개이고 유형의 한도(`chipLimitOf`)로 한 번 더 자른다. 첫 칩은 큰 칩, 둘째는 작은 칩이다(샘플). 구분 칩은 검정이다.
 *
 * ## 지원 유형 목록
 * `FEED_RENDERED_TYPES`가 4-2가 그릴 수 있는 다섯 유형의 단일 원천이다. `toCardView`(어떤 카드를 새 갈래로 보낼지)와 `FeedCard`(어떤 유형을 그릴지)가 함께 읽는다.
 * `full_image`는 `FEED_FULL_IMAGE_ENABLED`가 거짓인 동안 `isRenderedFeedType`이 거짓이다.
 */
import type { TodayBoxKind, TodayBoxShape, TodayChipSpec } from '@/types/database'
import { createRng, hashSeed, type BoxSeed } from './boxShape'
import { assignChipPlacement, assignFeedColors, FEED_FALLBACK_COLORS, type FeedChipFixedPlacement } from './feedAssign'
import { FEED_CHIP_SLOT_SPECS, isAllowedSlot, isFeedType, MAX_CARD_CHIPS } from './feedChipSlots'
import { FEED_COLOR_KEYS, FEED_FULL_IMAGE_ENABLED, FEED_TILTS, type FeedColorKey, type FeedTilt } from './feedConstants'
import { limitChipsForType } from './feedChipLayout'
import {
  FEED_VALUE_CHIP_RULES,
  buildValueChips,
  formatItemCountChip,
  formatPlaceNameChip,
  formatRemainingChip,
  formatRequiredBadgesChip,
  formatRewardPointsChip,
  type FeedValueChipSource,
} from './feedValueChips'
import { MAX_TITLE_CHIPS } from './titleChips'

// ── 지원 유형 ────────────────────────────────────────────────

/** 4-2가 그리는 다섯 유형. 나머지(컬렉션 소개·드랍·픽업·목록형)는 4-3이다. */
export const FEED_RENDERED_TYPES = ['hero_box', 'text_box', 'badge_intro', 'badge_only', 'full_image'] as const

export type RenderedFeedType = (typeof FEED_RENDERED_TYPES)[number]

/** 홈이 새 갈래로 그리는 유형인가. 모르는 값·4-3 유형·꺼진 `full_image`는 거짓이라 옛 경로가 그린다. */
export function isRenderedFeedType(value: unknown): value is RenderedFeedType {
  if (!isFeedType(value)) return false
  if (value === 'full_image') return FEED_FULL_IMAGE_ENABLED
  return (FEED_RENDERED_TYPES as readonly string[]).includes(value)
}

/** 유형의 설명 문장 기본 노출(PRD «카드 유형 8가지» 표). 숨기는 유형은 `show_description`과 무관하게 숨긴다. */
const DESCRIPTION_DEFAULT: Readonly<Record<RenderedFeedType, boolean>> = {
  hero_box: true,
  text_box: false,
  badge_intro: true,
  badge_only: false,
  full_image: false,
}

// ── 해석 결과 ────────────────────────────────────────────────

/** 칩 면 색: 색 키 15개 또는 `black`(구분 칩). */
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
  feed_seed?: number | null
}

export interface ResolveFeedLookInput {
  card: FeedLookCard
  feedType: RenderedFeedType
  /** 값 칩의 입력. 자원이 칩을 내지 않으면 null */
  valueSource: FeedValueChipSource | null
  now: Date
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
): ChipDraft[] {
  const divider = valueSource ? FEED_VALUE_CHIP_RULES[valueSource.resource].divider : null
  if (stored) {
    const drafts: ChipDraft[] = []
    for (const spec of stored) {
      let text: string | null
      if (spec.kind === 'phrase') text = spec.text?.trim() || null
      else if (spec.kind === 'label') text = spec.text?.trim() || divider
      else text = valueChipTextOf(spec.source, valueSource, now)
      if (!text) continue
      drafts.push({ kind: spec.kind, text, fixed: { slot: spec.slot ?? null, tilt: spec.tilt ?? null } })
    }
    return drafts
  }
  if (!valueSource) return []
  const values = buildValueChips(valueSource, now)
  const valueDrafts = (texts: string[]): ChipDraft[] => texts.map((text) => ({ kind: 'value' as const, text, fixed: {} }))
  if (!divider) return valueDrafts(values.slice(0, MAX_CARD_CHIPS))
  const dividerDraft: ChipDraft = { kind: 'label', text: divider, fixed: {} }
  return values.length > 0 ? [...valueDrafts(values.slice(0, 1)), dividerDraft] : [dividerDraft]
}

// ── 해석 ─────────────────────────────────────────────────────

/** 카드 행의 새 칸과 4-1 계산을 합쳐 «그릴 값»을 낸다. 같은 입력은 언제 어디서 열어도 같은 값이다. */
export function resolveFeedLook({ card, feedType, valueSource, now }: ResolveFeedLookInput): FeedLook {
  const seed: number = typeof card.feed_seed === 'number' ? card.feed_seed : hashSeed(card.id)
  const seedKey: BoxSeed = seed

  // 색 — 지정한 칸은 보존하고 NULL 칸만 자동 규칙이 채운다
  const assigned = assignFeedColors({
    seed: seedKey,
    fixed: { bg: fixedKey(card.bg_color_key), chip: fixedKey(card.chip_color_key), box: fixedKey(card.box_color_key) },
  })
  const colors = {
    bg: colorKeyOr(assigned.bg, FEED_FALLBACK_COLORS.bg as FeedColorKey),
    chip: colorKeyOr(assigned.chip, FEED_FALLBACK_COLORS.chip as FeedColorKey),
    box: colorKeyOr(assigned.box, FEED_FALLBACK_COLORS.box as FeedColorKey),
  }

  // 칩 — 글자 → 한도 → 자리·기울기
  const drafts = limitChipsForType(feedType, draftChips(card.chips, valueSource, now)).slice(0, MAX_CARD_CHIPS)
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
    size: index === 0 ? 'lg' : 'sm',
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

  // 박스 — 모양은 NULL이면 5종 중 시드로 고른다(박스를 끄는 선택지는 없다). 용도는 NULL이면 유형 기본
  const boxShape = card.box_shape ?? pick(createRng(`${seed}:box-shape`), BOX_SHAPES_ALL)
  const boxKind: TodayBoxKind = card.box_kind ?? (feedType === 'hero_box' ? 'image_mask' : 'text')

  return { seed, colors, chips, titleChips, showDescription, stamp, boxShape, boxKind }
}
