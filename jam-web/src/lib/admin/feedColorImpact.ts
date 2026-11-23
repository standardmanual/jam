/**
 * 홈피드 컬러셋 편집의 영향 계산 — 순수 함수 (티켓 20261121_2146, 상위 20261120_2026 후속).
 *
 * 어드민 «홈피드 컬러셋» 화면이 적용 전에 보여 주는 두 가지를 계산한다.
 * 1. 규칙 재계산: 9색 hex로 서로 다른 순서쌍을 규칙 ②→③→④에 통과시킨 개수(`summarizeColorPairs`)를 지금 값과 편집 값으로 비교한다.
 * 2. 영향받는 카드: 노출이 끝나지 않은 카드의 색 키 조합(배경·칩·박스) 가운데 «지금 팔레트로는 규칙을 통과하는데 편집 팔레트로는 새로 걸리는» 것.
 *    카드에는 hex가 아니라 키가 저장돼 있어 키는 바뀌지 않고 보이는 색만 바뀐다. 이미 걸리던 조합은 이번 변경 탓이 아니라서 제외한다.
 *
 * 값만 받는 순수 파일이다(서버·시각을 읽지 않는다). 이름표(한국어)는 화면이 붙이고 여기서는 키·규칙 이름만 돌려준다.
 */
import type { FeedPalette } from '@/lib/today/feedAssign'
import { BOX_FEED_TYPES, chipLimitOf, isFeedType } from '@/lib/today/feedChipSlots'
import { isOverrideHex } from '@/lib/today/feedColorOverrides'
import { firstViolatedRule, summarizeColorPairs, type ColorPairSummary, type ColorRuleName } from '@/lib/today/feedColorRules'
import { FEED_COLOR_KEYS, type FeedColorKey } from '@/lib/today/feedConstants'

/** 영향받는 카드 목록에 보이는 최대 장수. 넘으면 «외 N장»으로 적는다. */
export const IMPACT_CARD_LIMIT = 20

const isColorKey = (value: unknown): value is FeedColorKey =>
  typeof value === 'string' && (FEED_COLOR_KEYS as readonly string[]).includes(value)

// ── 팔레트 ────────────────────────────────────────────────────

/** 편집 중인 글자(키 → 입력한 hex 글자)에서 쓸 수 있는 값만 골라 현재 팔레트 위에 얹는다. 잘못된 글자는 현재 값이 그대로 남는다. */
export function buildEditedPalette(
  current: FeedPalette,
  drafts: Readonly<Partial<Record<FeedColorKey, string>>>,
): FeedPalette {
  const edited: Record<string, string> = { ...current }
  for (const key of FEED_COLOR_KEYS) {
    const draft = drafts[key]
    if (isOverrideHex(draft)) edited[key] = draft.toLowerCase()
  }
  return edited
}

const sameHex = (a: string | undefined, b: string | undefined): boolean =>
  (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

/** 두 팔레트에서 hex가 다른 색 키(9색 순서). */
export function changedColorKeys(before: FeedPalette, after: FeedPalette): FeedColorKey[] {
  return FEED_COLOR_KEYS.filter((key) => !sameHex(before[key], after[key]))
}

// ── 규칙 재계산 ───────────────────────────────────────────────

/** 팔레트 9색의 순서쌍을 옛 색 규칙(대비·키즈·명도)에 통과시킨 요약. 컬러셋 메뉴 전용이다. */
export function summarizePalette(palette: FeedPalette): ColorPairSummary {
  return summarizeColorPairs(FEED_COLOR_KEYS.map((key) => palette[key]))
}

export interface PaletteComparison {
  current: ColorPairSummary
  edited: ColorPairSummary
  /** 편집 값의 통과 조합 수에서 지금 값의 수를 뺀 값. 음수면 줄었다. */
  delta: number
  /** 통과 조합이 지금보다 줄었는가(경고 문구를 보인다 — 막지는 않는다). */
  decreased: boolean
}

export function comparePalettes(current: FeedPalette, edited: FeedPalette): PaletteComparison {
  const currentSummary = summarizePalette(current)
  const editedSummary = summarizePalette(edited)
  const delta = editedSummary.remaining - currentSummary.remaining
  return { current: currentSummary, edited: editedSummary, delta, decreased: delta < 0 }
}

// ── 영향받는 카드 ─────────────────────────────────────────────

/** 서버가 읽어 넘기는 카드의 색 키 조합. 키는 카드에 저장된 값이다(자동 배정으로 저장된 것 포함). */
export interface FeedColorCardInput {
  id: string
  title: string
  feedType: string | null
  bgColorKey: string | null
  chipColorKey: string | null
  boxColorKey: string | null
}

export type ColorSlot = 'bg' | 'chip' | 'box'

export interface NewlyViolatedPair {
  slots: readonly [ColorSlot, ColorSlot]
  keys: readonly [FeedColorKey, FeedColorKey]
  rule: ColorRuleName
}

export interface ChangedCardColor {
  slot: ColorSlot
  key: FeedColorKey
  before: string
  after: string
}

export interface ImpactedCard {
  id: string
  title: string
  violations: NewlyViolatedPair[]
  /** 이 카드가 쓰는 색 가운데 hex가 바뀐 것 */
  changedColors: ChangedCardColor[]
}

export interface ColorImpact {
  /** 목록에 보일 카드(최대 `limit`장) */
  cards: ImpactedCard[]
  /** 새로 걸리는 카드 전체 장수 */
  total: number
  /** 한도를 넘어 목록에서 빠진 장수 */
  hidden: number
}

const SLOT_PAIRS: ReadonlyArray<{ slots: readonly [ColorSlot, ColorSlot]; involvesChip: boolean }> = [
  { slots: ['bg', 'chip'], involvesChip: true },
  { slots: ['chip', 'box'], involvesChip: true },
  { slots: ['bg', 'box'], involvesChip: false },
]

/**
 * 카드가 실제로 그리는 칸의 색 키. 새 모양(개편) 유형이 아닌 카드는 이 색을 쓰지 않으므로 칸이 없다.
 * 칩 칸은 칩을 둘 수 있는 유형, 박스 칸은 박스가 있는 유형에서만 그린다(작성 화면의 «색 경고»가 같은 기준이다).
 */
function colorKeysOf(card: FeedColorCardInput): Partial<Record<ColorSlot, FeedColorKey>> {
  if (!isFeedType(card.feedType)) return {}
  const keys: Partial<Record<ColorSlot, FeedColorKey>> = {}
  if (isColorKey(card.bgColorKey)) keys.bg = card.bgColorKey
  if (chipLimitOf(card.feedType) > 0 && isColorKey(card.chipColorKey)) keys.chip = card.chipColorKey
  if (BOX_FEED_TYPES.includes(card.feedType) && isColorKey(card.boxColorKey)) keys.box = card.boxColorKey
  return keys
}

/**
 * 지금 팔레트로는 규칙을 통과하는데 편집 팔레트로는 새로 걸리는 카드를 찾는다.
 * 한 카드의 세 짝(배경·칩, 칩·박스, 배경·박스) 가운데 새로 걸리는 짝을 모두 담는다. 원래 걸리던 짝은 건너뛴다.
 */
export function findNewlyViolatedCards(
  current: FeedPalette,
  edited: FeedPalette,
  cards: readonly FeedColorCardInput[],
  limit: number = IMPACT_CARD_LIMIT,
): ColorImpact {
  const impacted: ImpactedCard[] = []
  for (const card of cards) {
    const keys = colorKeysOf(card)
    const violations: NewlyViolatedPair[] = []
    for (const { slots, involvesChip } of SLOT_PAIRS) {
      const keyA = keys[slots[0]]
      const keyB = keys[slots[1]]
      if (!keyA || !keyB) continue
      // 두 키가 같으면 지금도 '같은 색'으로 걸리던 조합이다(이번 변경이 만든 것이 아니다)
      if (firstViolatedRule(current[keyA], current[keyB], { involvesChip }) !== null) continue
      const rule = firstViolatedRule(edited[keyA], edited[keyB], { involvesChip })
      if (rule) violations.push({ slots, keys: [keyA, keyB], rule })
    }
    if (violations.length === 0) continue
    const changedColors: ChangedCardColor[] = []
    for (const slot of ['bg', 'chip', 'box'] as const) {
      const key = keys[slot]
      if (key && !sameHex(current[key], edited[key])) {
        changedColors.push({ slot, key, before: current[key].toLowerCase(), after: edited[key].toLowerCase() })
      }
    }
    impacted.push({ id: card.id, title: card.title, violations, changedColors })
  }
  const shown = impacted.slice(0, Math.max(0, limit))
  return { cards: shown, total: impacted.length, hidden: impacted.length - shown.length }
}
