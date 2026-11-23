/**
 * 피드 순서를 지키는 칩 배치(순수 계산) — 티켓 20261122_2228 R5, 상위 20261122_2217 §3·§4.
 *
 * 한 카드의 «물러서기까지 반영한 후보 계획 목록»(`feedChipPlan.ts`의 `chipPlanCandidates`)을 받아, 홈 피드의 카드 배열을 순서대로 한 번 훑으며 카드마다 하나를 고른다.
 * 앞에서 뒤로만 흐르는 상태(`ChainState`: 바로 앞 두 장의 값·앞 서명·앞 스티커)만 쓰므로, 배열의 앞부분이 같으면 뒤가 달라도 앞 결과는 같다. `Math.random`·`Date` 없음.
 *
 * 규칙(상위 §3·§4):
 * - (가) 같은 값은 연속 2장까지만 이어진다. 값은 자리(첫 칩의 모서리)·기울기 방향(첫 칩)·모양(알약·조약돌·물결)·분류 문구를 각자 따로 본다. 번갈아 쓰는 고정 패턴은 쓰지 않는다.
 * - (나) 바로 앞 카드와 칩 배치 전체(서명, `signatureOf`)가 같으면 안 된다.
 * - (다) 같은 꼴(알약만·스티커 포함)이 세 장 이어지지 않는다(연속 2장까지).
 * - (라) 스티커의 글자는 바로 앞 스티커와 다르고, 바탕 색 짝은 카드 바탕·박스 색과 다르며 바로 앞 스티커와 다르다. 이 둘은 후보와 상관없이 늘 지킬 수 있어(글자 3개, 짝 8개) 고른 계획에 사후로 맞춘다.
 *
 * 카드마다 후보 목록에서 규칙을 모두 지키는 첫 후보를 쓰고, 없으면 위반이 가장 적은 후보(같으면 앞선 후보)를 쓴다. 가릴 영역과 겹치는 후보(`fit: false`)는 맞는 후보가 하나도 없을 때만 쓴다.
 * 위반이 남고 카드에 분류 칩이 있으면 스티커 여부를 바꾼 후보(`stickerMode`)도 후보에 더해 «같은 꼴 3연속»을 깰 수 있게 한다.
 * 칩이 없는 카드(`[]`, 배지만 등)와 흐름 줄 카드(목록형)는 상태를 바꾸지 않고 건너뛴다. «앞 카드»는 직전의 칩 있는 카드다(결정 4).
 *
 * 칩 색은 여기서 정하지 않는다(저장값 `chip_color_key` 그대로, 결정 2). 이 파일은 카드 값 → 후보 입력 어댑터(`chainInputOf`)도 맡는다.
 */
import { STICKER_COLOR_PAIRS, type CategoryStickerPair } from '@ds/components/cards/CategorySticker'
import type { FeedCardView } from './cardView'
import type { ChipCorner } from './feedChipLayout'
import { cornerOfSlot } from './feedChipLayout'
import { chipPlanCandidates, signatureOf, type ChipPlan, type ChipPlanDraft, type ChipPlanInput, type PlannedChip } from './feedChipPlan'
import type { FeedColorKey } from './feedConstants'

const LETTERS = ['J', 'a', 'm'] as const
const PAIR_KEYS = Object.keys(STICKER_COLOR_PAIRS) as CategoryStickerPair[]
/** 값 연속 한도: 같은 값은 연속 2장까지. */
const RUN_LIMIT = 2

export type ChainViolation = 'pos' | 'dir' | 'shape' | 'label' | 'signature' | 'form'

/** 한 장(칩 있는 카드)의 비교용 값. */
export interface ChainFeatures {
  /** 첫 칩의 모서리 */
  pos: ChipCorner
  /** 첫 칩의 기울기 방향(둘째 칩은 반대) */
  dir: '+' | '-'
  /** 스티커가 있으면 그 모양, 없으면 알약 */
  shape: 'pill' | 'pebble' | 'wave'
  /** 분류 칩 문구(분류 칩이 둘이면 `|`로 이은 것). 분류 칩이 없으면 null이라 비교하지 않는다 */
  label: string | null
  form: 'pill' | 'sticker'
}

export interface ChainState {
  /** 직전 칩 있는 카드들의 값(오래된 것이 앞, 최대 `RUN_LIMIT`장) */
  recent: readonly ChainFeatures[]
  /** 직전 칩 있는 카드의 서명 */
  signature: string | null
  /** 바로 앞 스티커의 글자·색 짝(카드 사이에 스티커 없는 카드가 끼어도 이어서 본다) */
  sticker: { letter: 'J' | 'a' | 'm'; pair: CategoryStickerPair } | null
}

export const EMPTY_CHAIN_STATE: ChainState = { recent: [], signature: null, sticker: null }

export interface ChainCardInput {
  /** R4 후보 계획 입력(카드 시드·칩·글자·그림 정보) */
  plan: ChipPlanInput
  /** 카드 바탕색 키 */
  bg: FeedColorKey
  /** 박스 색 키 */
  box: FeedColorKey
}

export interface ChainStep {
  plan: ChipPlan
  /** 남은 위반(없으면 빈 배열). 후보로 풀 수 없는 위반(같은 분류 문구가 이어지는 피드 등)도 센다 */
  violations: ChainViolation[]
}

const stickerOf = (plan: ChipPlan): PlannedChip | null => plan.chips.find((chip) => chip.presentation === 'sticker' && chip.sticker) ?? null

/** 계획 → 비교용 값. 칩이 없으면(빈 계획·흐름 줄) null이라 건너뛴다. */
export function featuresOf(plan: ChipPlan): ChainFeatures | null {
  if (plan.chips.length === 0) return null
  const first = plan.chips[0]
  const sticker = stickerOf(plan)
  const labels = plan.chips.filter((chip) => chip.kind === 'label').map((chip) => chip.text)
  return {
    pos: first.corner,
    dir: first.tilt < 0 ? '-' : '+',
    shape: sticker?.sticker ? sticker.sticker.shape : 'pill',
    label: labels.length > 0 ? labels.join('|') : null,
    form: sticker ? 'sticker' : 'pill',
  }
}

const RUN_KEYS = ['pos', 'dir', 'shape', 'label'] as const

/** 이 계획을 지금 상태 뒤에 놓을 때 어기는 규칙 목록. 칩 없는 계획은 어기는 것이 없다. */
export function violationsOf(state: ChainState, plan: ChipPlan): ChainViolation[] {
  const features = featuresOf(plan)
  if (!features) return []
  const out: ChainViolation[] = []
  const lastTwo = state.recent.length >= RUN_LIMIT ? state.recent.slice(-RUN_LIMIT) : null
  if (lastTwo) {
    for (const key of RUN_KEYS) {
      const value = features[key]
      if (value !== null && lastTwo.every((past) => past[key] === value)) out.push(key)
    }
    if (lastTwo.every((past) => past.form === features.form)) out.push('form')
  }
  if (state.signature !== null && state.signature === signatureOf(plan)) out.push('signature')
  return out
}

/** 후보 목록에서 규칙을 모두 지키는 첫 후보, 없으면 위반이 가장 적은 후보(같으면 앞선 것)를 고른다. 맞는(`fit`) 후보가 있으면 그 안에서만 고른다. */
export function pickCandidate(state: ChainState, candidates: readonly ChipPlan[]): ChainStep {
  const pool = candidates.some((plan) => plan.fit) ? candidates.filter((plan) => plan.fit) : candidates
  let best: ChainStep | null = null
  for (const plan of pool) {
    const violations = violationsOf(state, plan)
    if (!best || violations.length < best.violations.length) best = { plan, violations }
    if (violations.length === 0) break
  }
  return best as ChainStep
}

/** 처음 후보부터 돌려 `ok`를 만족하는 첫 항목(없으면 처음 항목). */
function firstOkFrom<T>(list: readonly T[], start: number, ok: (item: T) => boolean): T {
  for (let i = 0; i < list.length; i += 1) {
    const item = list[(start + i) % list.length]
    if (ok(item)) return item
  }
  return list[start]
}

/** 스티커의 글자·색 짝을 규칙(라)에 맞춘다. 시드가 정한 값에서 시작해 어긋나면 다음 값으로 넘어간다(결정적). */
function finalizeSticker(state: ChainState, plan: ChipPlan, bg: FeedColorKey, box: FeedColorKey): ChipPlan {
  if (!stickerOf(plan)) return plan
  return {
    ...plan,
    chips: plan.chips.map((chip) => {
      if (chip.presentation !== 'sticker' || !chip.sticker) return chip
      const letter = firstOkFrom(LETTERS, Math.max(0, LETTERS.indexOf(chip.sticker.letter)), (l) => l !== state.sticker?.letter)
      const pair = firstOkFrom(
        PAIR_KEYS,
        Math.max(0, PAIR_KEYS.indexOf(chip.sticker.pair)),
        (key) => {
          const base = key.split('-')[0]
          return base !== bg && base !== box && key !== state.sticker?.pair
        },
      )
      return { ...chip, sticker: { ...chip.sticker, letter, pair } }
    }),
  }
}

/** 한 카드를 처리한다: 후보 → 고르기 → 스티커 글자·짝 맞추기 → 다음 상태. 입력 상태는 바꾸지 않는다. */
export function stepChain(state: ChainState, card: ChainCardInput): ChainStep & { state: ChainState } {
  const auto = chipPlanCandidates(card.plan)
  if (auto[0].chips.length === 0) return { plan: auto[0], violations: [], state }

  let picked = pickCandidate(state, auto)
  if (picked.violations.length > 0 && card.plan.chips.some((chip) => chip.kind === 'label' && chip.text.trim().length > 0)) {
    // 규칙을 다 못 지켰다: 스티커 여부를 바꾼 후보를 더해 «같은 꼴 3연속» 등을 깰 수 있는지 본다(앞선 후보 순서는 그대로 우선)
    const alternate = featuresOf(auto[0])?.form === 'sticker' ? 'pill' : 'sticker'
    picked = pickCandidate(state, [...auto, ...chipPlanCandidates({ ...card.plan, stickerMode: alternate })])
  }

  const plan = finalizeSticker(state, picked.plan, card.bg, card.box)
  const features = featuresOf(plan) as ChainFeatures
  const sticker = stickerOf(plan)?.sticker ?? null
  const next: ChainState = {
    recent: [...state.recent, features].slice(-RUN_LIMIT),
    signature: signatureOf(plan),
    sticker: sticker ? { letter: sticker.letter, pair: sticker.pair } : state.sticker,
  }
  return { plan, violations: picked.violations, state: next }
}

/** 카드별 최종 계획과 남은 위반(시험·진단용). 같은 순서로 돌려준다. */
export function planFeedChipsDetailed(cards: readonly ChainCardInput[]): ChainStep[] {
  let state = EMPTY_CHAIN_STATE
  return cards.map((card) => {
    const step = stepChain(state, card)
    state = step.state
    return { plan: step.plan, violations: step.violations }
  })
}

/** 피드 순서로 늘어놓은 카드들의 칩 계획. 입력과 같은 순서·같은 길이다. */
export function planFeedChips(cards: readonly ChainCardInput[]): ChipPlan[] {
  return planFeedChipsDetailed(cards).map((step) => step.plan)
}

// ── 카드 값 → 후보 입력 어댑터 ────────────────────────────────

/** 제목의 줄마다 글자 수(데이터의 줄바꿈 기준). 줄바꿈이 없으면 `[길이]`. */
function titleLinesOf(title: string): number[] {
  const lines = title.split('\n').map((line) => [...line.trim()].length)
  return lines.length > 0 ? lines : [0]
}

/**
 * 표시 데이터 → 배열 연쇄가 읽는 입력. 칩 초안(`look.chips`)은 분류 칩(`label`)은 그대로, 값 칩과 문구 칩(`phrase`)은 값 칩(알약만)으로 바꾼다
 * (드랍·픽업의 «드랍»·«픽업» 문구 칩은 `draftChips`가 이미 분류 칩으로 올려 둔다). 어드민이 정한 자리·기울기는 `fixed`로 넘긴다(결정 3).
 */
export function chainInputOf(view: FeedCardView): ChainCardInput {
  const { look } = view
  const chips: ChipPlanDraft[] = look.chips.map((chip) => ({
    kind: chip.kind === 'label' ? 'label' : 'value',
    text: chip.text,
    size: chip.size,
    ...(chip.fixed ? { fixed: { corner: chip.fixed.corner, tilt: chip.fixed.tilt } } : {}),
  }))
  const description = view.description ?? ''
  const itemBadgeCount = view.itemBadges?.length ?? 0
  const stampCorner = look.stamp ? cornerOfSlot(look.stamp.slot) : null
  const plan: ChipPlanInput = {
    feedType: view.feedType,
    seed: look.seed,
    chips,
    titleLines: titleLinesOf(view.title),
    descriptionLength: [...description].length,
    descriptionVisible: look.showDescription && description.length > 0,
    hasImage: view.feedType === 'drop_pickup' ? itemBadgeCount > 0 : Boolean(view.imageUrl || view.badgeImageUrl),
    ...(view.feedType === 'drop_pickup' && itemBadgeCount > 0 ? { imageCount: Math.min(3, itemBadgeCount) } : {}),
    ...(look.burst ? { burst: look.burst.map((b) => ({ x: b.x, y: b.y, size: b.size })) } : {}),
    ...(stampCorner ? { stampCorner } : {}),
  }
  return { plan, bg: look.colors.bg, box: look.colors.box }
}
