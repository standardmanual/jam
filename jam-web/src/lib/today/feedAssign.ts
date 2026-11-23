/**
 * 홈피드 새 카드의 자동 배정 — 색(배경·칩·박스)과 칩 자리·기울기를 카드 id 시드로 정한다 (티켓 20261121_0012, 상위 20261120_2026 4회차-1).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격」의 «색 → 자동 배정»·«칩 → 자리와 기울기»·«구현 때 지킬 점 → 무작위 값»이다.
 * 색은 통합 팔레트 규칙(티켓 20261122_2224 회차 4·5, 상위 20261122_2217 결정 §2·§3·§5)이다: 바탕+박스 조합 가중 추첨, 짙은 초록 바탕 리듬, 값 칩 7색과 배제 표.
 *
 * - 같은 입력(시드·지정값·최근 바탕 목록·제외 목록)은 언제 어디서 열어도 같은 값이다. `Math.random`은 쓰지 않고 `boxShape.ts`의 `createRng`를 쓴다.
 * - 시각·서버 값을 읽지 않는 순수 함수다. 결과를 카드에 저장하는 일은 호출하는 쪽(등록 경로, 6회차)이 한다.
 * - 사용자가 지정한 값(NULL이 아닌 칸)은 덮어쓰지 않는다. 지정값끼리 규칙에 걸려도 막지 않는다(PRD «수동 지정»: 경고만).
 *   통합 팔레트 9키에 없는 지정값(옛 키 등)은 «지정 없음»으로 보고 자동으로 정한다(티켓 20261122_2224 회차 12).
 * - 배지 그림 색 겹침 규칙(⑤·⑥)만 hex를 읽는다. 색 키 → hex 표(`palette`)를 인자로 받고 기본값은 `FEED_COLORS`다.
 */
import { createRng, type BoxSeed } from './boxShape'
import { chipExclusionRule, isHexColor, violatesImageColorRule } from './feedColorRules'
import {
  boxAllowedFor,
  FEED_BG_BOX_COMBOS,
  FEED_COLOR_KEYS,
  FEED_COLOR_USAGE,
  FEED_COLORS,
  FEED_DEEP_GREEN_COMBOS,
  FEED_DEEP_GREEN_KEY,
  FEED_DEEP_GREEN_RHYTHM,
  FEED_TILTS,
} from './feedConstants'
import { chipLimitOf, diagonalOf, FEED_CHIP_SLOT_SPECS, MAX_CARD_CHIPS, type FeedType } from './feedChipSlots'

// ── 색 ────────────────────────────────────────────────────────

/** 색 키 → hex 표. 키는 통합 팔레트 9키다. 지정값으로 들어온 모르는 키는 표에 없다. */
export type FeedPalette = Readonly<Record<string, string>>

/** 기본 표: `FEED_COLORS`의 9키. 컬러셋 메뉴·그림 색 규칙이 읽는다. */
export const DEFAULT_FEED_PALETTE: FeedPalette = Object.fromEntries(
  Object.entries(FEED_COLORS).map(([key, color]) => [key, color.hex]),
)

/** 통합 팔레트 9키에 든 값만 돌려준다. 비었거나 모르는 키(옛 키 등)는 null — 자동으로 정하게 한다. */
function knownColorKey(value: string | null | undefined): string | null {
  return value && (FEED_COLOR_KEYS as readonly string[]).includes(value) ? value : null
}

export interface FeedColorTriple {
  bg: string
  chip: string
  box: string
}

/**
 * 통과하는 조합이 하나도 없을 때 쓰는 안전한 기본 조합(노랑 바탕·초록 박스·분홍 칩).
 * 쓰임 표(바탕·박스·값 칩)와 배제 표를 모두 통과하고 일반 조합 9개 중 하나다(시험이 확인한다).
 */
export const FEED_FALLBACK_COLORS: FeedColorTriple = { bg: 'yellow', chip: 'pink', box: 'green' }

/** 짙은 초록 바탕을 «`everyMin`장째»에 낮은 확률로 뽑는 확률. `everyMax`장 이후에는 반드시 뽑는다. */
export const DEEP_GREEN_CHANCE_AT_MIN = 0.3

/** 사용자가 검수 화면에서 제외한 색 조합(순서 무관). 저장은 6회차이고 이 함수는 입력으로만 받는다. */
export type ExcludedColorPair = readonly [string, string]

export interface FeedColorAssignInput {
  /** 카드 id 등. 같은 시드는 같은 배정이다. */
  seed: BoxSeed
  /** 사용자가 지정한 색 키. 비었거나 null이면 자동으로 정한다. */
  fixed?: { bg?: string | null; chip?: string | null; box?: string | null }
  /**
   * 같은 시기 카드의 바탕 키를 «등록 순서»로 늘어놓은 목록(가장 최근 카드가 마지막, 티켓 20261122_2224 결정 2). 바로 앞 카드(마지막 값)와 같은 바탕은 피하고,
   * 마지막 짙은 초록 바탕 이후 장수로 짙은 초록 리듬을 센다. 없으면 빈 목록과 같다(짙은 초록 바탕은 뽑지 않는다).
   */
  recentBgKeys?: readonly string[]
  /** 박스에 글자가 들어가는 카드인가. 참(기본)이면 자동으로 고르는 박스는 `boxAllowedFor`에 걸려 짙은 초록을 쓰지 않는다. */
  boxHasText?: boolean
  /**
   * 이 카드 이미지의 대표 색 hex(저장된 최대 3개, 티켓 20261121_1828). 비었거나 없으면 이미지 규칙을 쓰지 않는다.
   * 있으면 자동으로 고르는 배경 후보는 규칙 ⑤(그림과 배경)를 통과해야 한다. 지정값은 걸러 내지 않는다(경고만, 7-7).
   */
  imageHexes?: readonly string[]
  /** 칩이 이미지 위에 걸치는 유형인가. 참이면 자동으로 고르는 칩 후보도 규칙 ⑥(그림과 칩)을 통과해야 한다. `imageHexes`가 없으면 아무 일도 하지 않는다. */
  chipOnImage?: boolean
}

export interface FeedColorAssignOptions {
  /** 색 키 → hex. 그림 색 규칙(⑤·⑥)이 읽는다. 기본은 9키 표. */
  palette?: FeedPalette
  excludedPairs?: readonly ExcludedColorPair[]
  /** 통과하는 조합이 없을 때 쓸 기본 조합. 기본은 `FEED_FALLBACK_COLORS`. */
  fallback?: FeedColorTriple
}

export interface FeedColorAssignment extends FeedColorTriple {
  /** 통과하는 조합이 없어 안전한 기본 조합으로 되돌렸으면 true. 되돌린 값은 지정값이 아닌 칸에만 들어간다. */
  usedFallback: boolean
  /**
   * 이미지 규칙(⑤·⑥)까지 통과하는 조합이 하나도 없어 이미지 규칙을 건너뛰고 정했으면 true.
   * 이미지 규칙을 쓰지 않았거나 건너뛰지 않았으면 이 칸은 없다(이미지 입력이 없을 때 결과가 같도록). `usedFallback`과 별개다 —
   * 건너뛴 뒤에도 조합이 없으면 둘 다 true다.
   */
  imageRuleSkipped?: boolean
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
}

function pickIndex(rng: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(rng() * length))
}

interface WeightedPair {
  bg: string
  box: string
  weight: number
}

const NORMAL_POOL: readonly WeightedPair[] = FEED_BG_BOX_COMBOS.map(({ bg, box, weight }) => ({ bg, box, weight }))
const DEEP_GREEN_POOL: readonly WeightedPair[] = FEED_DEEP_GREEN_COMBOS.map(({ bg, box }) => ({ bg, box, weight: 1 }))

/**
 * 새 카드가 마지막 짙은 초록 바탕 카드로부터 몇 번째 카드인가(바로 다음이면 1). «다섯~여섯 장에 한 장꼴»은 이 값이 5~6이라는 뜻이다(사이에 4~5장).
 * 짙은 초록이 목록에 없으면 목록 앞에 짙은 초록이 하나 있었던 것으로 본다(목록이 n장이면 n+1).
 */
function cardsSinceDeepGreen(recent: readonly string[]): number {
  const last = recent.lastIndexOf(FEED_DEEP_GREEN_KEY)
  return last < 0 ? recent.length + 1 : recent.length - last
}

/**
 * 배경·칩·박스 색을 통합 팔레트 규칙으로 정한다.
 *
 * 1. 바탕+박스: `FEED_BG_BOX_COMBOS` 9개를 가중치대로 추첨한다. 짙은 초록 바탕 조합(`FEED_DEEP_GREEN_COMBOS`)은 따로 두고 리듬으로만 뽑는다 —
 *    새 카드가 마지막 짙은 초록 바탕 카드로부터 `everyMin`번째 미만이면 빼고, 정확히 `everyMin`번째면 `DEEP_GREEN_CHANCE_AT_MIN` 확률로, `everyMax`번째 이상이면 반드시 뽑는다.
 *    바탕을 지정했으면 리듬은 보지 않는다. 지정값은 존중하고 나머지 칸만 고른다(지정값에 맞는 조합이 없으면 모든 조합의 나머지 칸 중에서 고른다).
 * 2. 자동으로 고르는 바탕은 바로 앞 카드(`recentBgKeys` 마지막)와 같은 바탕을 피한다. 자동으로 고르는 박스는 글자가 들어가는 카드(`boxHasText`)에서 짙은 초록을 피한다.
 * 3. 칩: 값 칩 7색(`FEED_COLOR_USAGE.valueChip`) 중 `chipExclusionRule`에 바탕·박스 어느 쪽으로도 걸리지 않는 색을 시드로 고른다. 제외 목록에 든 쌍은 뺀다. 지정값끼리의 쌍은 검사하지 않는다.
 * 4. 조합이 하나도 없으면 비어 있는 칸만 기본 조합으로 채우고 `usedFallback`을 true로 돌려준다.
 *
 * 그림 대표 색(`imageHexes`, 티켓 20261121_1828)이 있으면 자동 바탕 후보에 규칙 ⑤, `chipOnImage`일 때 자동 칩 후보에 규칙 ⑥을 더한다.
 * 조건을 한꺼번에 못 맞추면 «바로 앞 카드와 같은 바탕 피하기» → «그림 규칙» 순서로 풀고(그림 규칙을 풀면 `imageRuleSkipped`), 그래도 없으면 기본 조합이다.
 */
export function assignFeedColors(
  input: FeedColorAssignInput,
  options: FeedColorAssignOptions = {},
): FeedColorAssignment {
  const palette = options.palette ?? DEFAULT_FEED_PALETTE
  const fallback = options.fallback ?? FEED_FALLBACK_COLORS
  const excluded = new Set((options.excludedPairs ?? []).map(([a, b]) => pairKey(a, b)))
  const fixedBg = knownColorKey(input.fixed?.bg)
  const fixedChip = knownColorKey(input.fixed?.chip)
  const fixedBox = knownColorKey(input.fixed?.box)
  const boxHasText = input.boxHasText ?? true

  // 세 칸을 모두 지정했으면 고를 것이 없다(지정값끼리는 검사하지 않는다)
  if (fixedBg && fixedChip && fixedBox) {
    return { bg: fixedBg, chip: fixedChip, box: fixedBox, usedFallback: false }
  }

  const recent = input.recentBgKeys ?? []
  const previousBg = recent.length > 0 ? recent[recent.length - 1] : null

  // 그림 규칙(⑤·⑥)은 자동으로 고르는 후보에만 건다. 지정값은 덮어쓰지 않는다. 읽을 수 없는 대표 색은 없는 것으로 본다.
  const imageHexes = (input.imageHexes ?? []).filter(isHexColor)
  const bgFiltered = imageHexes.length > 0 && !fixedBg
  const chipFiltered = imageHexes.length > 0 && Boolean(input.chipOnImage) && !fixedChip
  const imageRuleActive = bgFiltered || chipFiltered
  /** 이 색 키가 그림에 묻히는가. hex를 모르는 키(표에 없는 값)는 규칙을 건너뛴다. */
  const buriedMemo = new Map<string, boolean>()
  const buriedInImage = (key: string): boolean => {
    const cached = buriedMemo.get(key)
    if (cached !== undefined) return cached
    const buried = palette[key] !== undefined && violatesImageColorRule(palette[key], imageHexes)
    buriedMemo.set(key, buried)
    return buried
  }

  const rng = createRng(`${input.seed}:feed-colors`)

  // 바탕+박스 후보 묶음의 우선순위. 바탕 지정이 없을 때만 짙은 초록 리듬을 본다(마지막 수단으로 다른 묶음도 연다).
  let pools: ReadonlyArray<readonly WeightedPair[]>
  if (fixedBg) {
    pools = [[...NORMAL_POOL, ...DEEP_GREEN_POOL]]
  } else {
    const since = cardsSinceDeepGreen(recent)
    const { everyMin, everyMax } = FEED_DEEP_GREEN_RHYTHM
    if (since >= everyMax) pools = [DEEP_GREEN_POOL, NORMAL_POOL]
    else if (since === everyMin && rng() < DEEP_GREEN_CHANCE_AT_MIN) pools = [DEEP_GREEN_POOL, NORMAL_POOL]
    else pools = [NORMAL_POOL, DEEP_GREEN_POOL]
  }

  /** 이 칩 색이 이 면(바탕·박스) 위에 올 수 있는가. 지정값끼리의 쌍은 검사하지 않는다. */
  const chipOnBase = (chip: string, base: string, baseFixed: boolean): boolean => {
    if (fixedChip && baseFixed) return true
    if (excluded.has(pairKey(chip, base))) return false
    return chipExclusionRule(chip, base) === null
  }

  interface Candidate {
    bg: string
    box: string
    weight: number
    chips: string[]
  }

  const collect = (pool: readonly WeightedPair[], applyImageRule: boolean, avoidPrevious: boolean): Candidate[] => {
    // 지정값에 맞는 조합만 쓰고, 하나도 없으면(조합에 없는 지정 키, 예: 파랑) 모든 조합의 나머지 칸 중에서 고른다
    const matching = pool.filter((pair) => (!fixedBg || pair.bg === fixedBg) && (!fixedBox || pair.box === fixedBox))
    const base = matching.length > 0 ? matching : pool
    const found: Candidate[] = []
    for (const pair of base) {
      const bg = fixedBg ?? pair.bg
      const box = fixedBox ?? pair.box
      if (!fixedBg) {
        if (applyImageRule && bgFiltered && buriedInImage(bg)) continue
        if (avoidPrevious && previousBg !== null && bg === previousBg) continue
      }
      if (!fixedBox && !boxAllowedFor(box, boxHasText)) continue
      if (!(fixedBg && fixedBox) && excluded.has(pairKey(bg, box))) continue
      const chipPool: readonly string[] = fixedChip ? [fixedChip] : FEED_COLOR_USAGE.valueChip
      const chips = chipPool.filter((chip) => {
        if (!fixedChip && applyImageRule && chipFiltered && buriedInImage(chip)) return false
        return chipOnBase(chip, bg, Boolean(fixedBg)) && chipOnBase(chip, box, Boolean(fixedBox))
      })
      if (chips.length === 0) continue
      found.push({ bg, box, weight: pair.weight, chips })
    }
    return found
  }

  // 풀어 가는 순서: 모든 조건 → 앞 카드 바탕 피하기 풀기 → 그림 규칙 풀기(+앞 카드 바탕 피하기) → 둘 다 풀기
  const levels: ReadonlyArray<{ image: boolean; previous: boolean }> = imageRuleActive
    ? [
        { image: true, previous: true },
        { image: true, previous: false },
        { image: false, previous: true },
        { image: false, previous: false },
      ]
    : [
        { image: false, previous: true },
        { image: false, previous: false },
      ]

  let candidates: Candidate[] = []
  let imageRuleSkipped = false
  for (const level of levels) {
    for (const pool of pools) {
      candidates = collect(pool, level.image, level.previous)
      if (candidates.length > 0) break
    }
    if (candidates.length > 0) {
      imageRuleSkipped = imageRuleActive && !level.image
      break
    }
  }
  if (candidates.length === 0) imageRuleSkipped = imageRuleActive

  if (candidates.length === 0) {
    return {
      bg: fixedBg ?? fallback.bg,
      chip: fixedChip ?? fallback.chip,
      box: fixedBox ?? fallback.box,
      usedFallback: true,
      ...(imageRuleSkipped ? { imageRuleSkipped: true } : {}),
    }
  }

  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  let roll = rng() * total
  let picked = candidates[candidates.length - 1]
  for (const candidate of candidates) {
    roll -= candidate.weight
    if (roll < 0) {
      picked = candidate
      break
    }
  }
  const chip = picked.chips[pickIndex(rng, picked.chips.length)]
  return { bg: picked.bg, chip, box: picked.box, usedFallback: false, ...(imageRuleSkipped ? { imageRuleSkipped: true } : {}) }
}

// ── 칩 자리·기울기 ───────────────────────────────────────────

export interface FeedChipPlacement {
  slot: string
  /** 기울기(deg). 자동 배정은 `FEED_TILTS` 여섯 값 중 하나다. */
  tilt: number
}

export interface FeedChipFixedPlacement {
  slot?: string | null
  tilt?: number | null
}

export interface FeedChipPlacementInput {
  seed: BoxSeed
  feedType: FeedType
  /** 카드가 가질 칩 개수. 유형의 한도(`chipLimitOf`)와 카드당 최대 2개를 넘으면 잘린다. */
  chipCount: number
  /** 칩 순서대로 사용자가 지정한 자리·기울기. 지정한 값은 덮어쓰지 않는다. */
  fixed?: ReadonlyArray<FeedChipFixedPlacement | null | undefined>
}

/**
 * 칩마다 자리와 기울기를 정한다. 같은 시드는 같은 값이다.
 *
 * - 칩 개수는 `min(요청 개수, 유형 한도, 2)`다. 자리가 하나뿐인 유형은 1개, «배지만»은 0개다.
 * - 칩이 2개면 서로 대각선 자리다. 한쪽 자리만 지정했으면 그 대각선 맞은편에 두고, 맞은편이 없는 자리(칩 1개 전용 자리)면 다른 자리 중에서 고른다.
 * - 기울기는 `FEED_TILTS` 여섯 값 중 시드로 고른다. 두 번째 칩은 첫 칩과 같은 값(같은 방향·같은 크기)을 피한다.
 */
export function assignChipPlacement(input: FeedChipPlacementInput): FeedChipPlacement[] {
  const { feedType } = input
  const spec = FEED_CHIP_SLOT_SPECS[feedType]
  const requested = Number.isFinite(input.chipCount) ? Math.max(0, Math.floor(input.chipCount)) : 0
  const count = Math.min(requested, chipLimitOf(feedType), MAX_CARD_CHIPS)
  if (count === 0) return []

  const rng = createRng(`${input.seed}:chip-placement`)
  const fixedSlot = (index: number) => input.fixed?.[index]?.slot || null
  const fixedTilt = (index: number) => input.fixed?.[index]?.tilt ?? null

  const slots: string[] = []
  if (count === 1) {
    slots.push(fixedSlot(0) ?? spec.slots[pickIndex(rng, spec.slots.length)])
  } else {
    const first = fixedSlot(0)
    const second = fixedSlot(1)
    if (first && second) {
      slots.push(first, second)
    } else if (first || second) {
      const kept = (first ?? second) as string
      const opposite = diagonalOf(feedType, kept)
      let other: string
      if (opposite) {
        other = opposite
      } else {
        const others = spec.slots.filter((slot) => slot !== kept)
        other = others[pickIndex(rng, others.length)]
      }
      if (first) slots.push(kept, other)
      else slots.push(other, kept)
    } else {
      const pair = spec.diagonalPairs[pickIndex(rng, spec.diagonalPairs.length)]
      if (rng() < 0.5) slots.push(pair[0], pair[1])
      else slots.push(pair[1], pair[0])
    }
  }

  const tilts: number[] = []
  for (let index = 0; index < count; index += 1) {
    const fixed = fixedTilt(index)
    if (fixed !== null) {
      tilts.push(fixed)
      continue
    }
    const choices: readonly number[] = index === 0 ? FEED_TILTS : FEED_TILTS.filter((tilt) => tilt !== tilts[0])
    tilts.push(choices[pickIndex(rng, choices.length)])
  }

  return slots.map((slot, index) => ({ slot, tilt: tilts[index] }))
}
