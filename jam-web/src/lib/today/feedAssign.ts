/**
 * 홈피드 새 카드의 자동 배정 — 색(배경·칩·박스)과 칩 자리·기울기를 카드 id 시드로 정한다 (티켓 20261121_0012, 상위 20261120_2026 4회차-1).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격」의 «색 → 자동 배정»·«칩 → 자리와 기울기»·«구현 때 지킬 점 → 무작위 값»이다.
 *
 * - 같은 입력(시드·지정값·사용 빈도·제외 목록)은 언제 어디서 열어도 같은 값이다. `Math.random`은 쓰지 않고 `boxShape.ts`의 `createRng`를 쓴다.
 * - 시각·서버 값을 읽지 않는 순수 함수다. 결과를 카드에 저장하는 일은 호출하는 쪽(등록 경로, 6회차)이 한다.
 * - 사용자가 지정한 값(NULL이 아닌 칸)은 덮어쓰지 않는다. 지정값끼리 규칙에 걸려도 막지 않는다(PRD «수동 지정»: 경고만).
 * - 규칙 판정은 hex를 입력으로 받는 `feedColorRules.ts`가 하고, 이 파일은 색 키 → hex 표(`palette`)를 인자로 받는다(기본값은 `FEED_COLORS`).
 */
import { createRng, type BoxSeed } from './boxShape'
import { passesColorRules } from './feedColorRules'
import { FEED_COLORS, FEED_TILTS } from './feedConstants'
import { chipLimitOf, diagonalOf, FEED_CHIP_SLOT_SPECS, MAX_CARD_CHIPS, type FeedType } from './feedChipSlots'

// ── 색 ────────────────────────────────────────────────────────

/** 색 키 → hex 표. 키는 색 키 15개 말고도 지정값으로 들어온 흰색 같은 키를 담을 수 있다. */
export type FeedPalette = Readonly<Record<string, string>>

/** 기본 표: `FEED_COLORS`의 15색. */
export const DEFAULT_FEED_PALETTE: FeedPalette = Object.fromEntries(
  Object.entries(FEED_COLORS).map(([key, color]) => [key, color.hex]),
)

/** 자동 배정이 쓰지 않는 색 키. PRD: «흰색은 자동 배정에 쓰지 않는다(사용자가 직접 지정할 때만 쓴다)». */
export const FEED_AUTO_EXCLUDED_KEYS: readonly string[] = ['white']

export interface FeedColorTriple {
  bg: string
  chip: string
  box: string
}

/**
 * 통과하는 조합이 하나도 없을 때 쓰는 안전한 기본 조합(연한 레드 배경·레드 칩·참조 라임 박스).
 * 기본 15색 표에서 규칙 ①~④를 모두 통과하는 조합이다(시험이 확인한다). 컬러셋을 바꾸면 이 값도 다시 고른다.
 */
export const FEED_FALLBACK_COLORS: FeedColorTriple = { bg: 'red-soft', chip: 'red', box: 'ref-lime' }

/** 사용자가 검수 화면에서 제외한 색 조합(순서 무관). 저장은 6회차이고 이 함수는 입력으로만 받는다. */
export type ExcludedColorPair = readonly [string, string]

export interface FeedColorAssignInput {
  /** 카드 id 등. 같은 시드는 같은 배정이다. */
  seed: BoxSeed
  /** 사용자가 지정한 색 키. 비었거나 null이면 자동으로 정한다. */
  fixed?: { bg?: string | null; chip?: string | null; box?: string | null }
  /** 같은 시기 노출 카드의 배경색 사용 빈도(색 키 → 장수). 없는 키는 0이다. */
  bgUsage?: Readonly<Record<string, number>>
}

export interface FeedColorAssignOptions {
  /** 색 키 → hex. 기본은 15색 표. */
  palette?: FeedPalette
  /** 자동으로 고를 색 키 후보. 기본은 표의 키에서 `FEED_AUTO_EXCLUDED_KEYS`를 뺀 것. */
  autoKeys?: readonly string[]
  excludedPairs?: readonly ExcludedColorPair[]
  /** 통과하는 조합이 없을 때 쓸 기본 조합. 기본은 `FEED_FALLBACK_COLORS`. */
  fallback?: FeedColorTriple
}

export interface FeedColorAssignment extends FeedColorTriple {
  /** 통과하는 조합이 없어 안전한 기본 조합으로 되돌렸으면 true. 되돌린 값은 지정값이 아닌 칸에만 들어간다. */
  usedFallback: boolean
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
}

function pickIndex(rng: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(rng() * length))
}

/**
 * 배경·칩·박스 색을 정한다.
 *
 * 1. 지정값과 맞는 «규칙을 모두 통과하는 조합»을 모두 센다. 배경↔칩, 칩↔박스는 규칙 ①~④, 배경↔박스는 ①~③(규칙 ④는 칩이 낀 쌍에만 적용)이고,
 *    제외 목록에 든 쌍은 뺀다. 지정값끼리의 쌍은 검사하지 않는다.
 * 2. 배경이 비어 있으면 조합이 남아 있는 배경 중 «같은 시기에 가장 덜 쓰인 색»을 고르고, 동률이면 시드로 고른다.
 * 3. 그 배경으로 남은 조합에서 칩·박스를 시드로 고른다.
 * 4. 조합이 하나도 없으면 비어 있는 칸만 기본 조합으로 채우고 `usedFallback`을 true로 돌려준다.
 */
export function assignFeedColors(
  input: FeedColorAssignInput,
  options: FeedColorAssignOptions = {},
): FeedColorAssignment {
  const palette = options.palette ?? DEFAULT_FEED_PALETTE
  const autoKeys = options.autoKeys ?? Object.keys(palette).filter((key) => !FEED_AUTO_EXCLUDED_KEYS.includes(key))
  const fallback = options.fallback ?? FEED_FALLBACK_COLORS
  const excluded = new Set((options.excludedPairs ?? []).map(([a, b]) => pairKey(a, b)))
  const fixedBg = input.fixed?.bg || null
  const fixedChip = input.fixed?.chip || null
  const fixedBox = input.fixed?.box || null

  const memo = new Map<string, boolean>()
  /** 두 색 키가 한 카드에서 짝을 이룰 수 있는가. 지정값끼리는 검사하지 않고, hex를 모르는 키(표에 없는 지정값)는 규칙을 건너뛴다. */
  const pairOk = (a: string, b: string, involvesChip: boolean, bothFixed: boolean): boolean => {
    if (bothFixed) return true
    const key = `${pairKey(a, b)}\u0000${involvesChip ? 1 : 0}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    let ok: boolean
    if (excluded.has(pairKey(a, b))) ok = false
    else if (palette[a] === undefined || palette[b] === undefined) ok = true
    else ok = passesColorRules(palette[a], palette[b], { involvesChip })
    memo.set(key, ok)
    return ok
  }

  const bgOptions = fixedBg ? [fixedBg] : autoKeys
  const chipOptions = fixedChip ? [fixedChip] : autoKeys
  const boxOptions = fixedBox ? [fixedBox] : autoKeys

  const triples: FeedColorTriple[] = []
  for (const bg of bgOptions) {
    for (const chip of chipOptions) {
      if (!pairOk(bg, chip, true, Boolean(fixedBg && fixedChip))) continue
      for (const box of boxOptions) {
        if (!pairOk(chip, box, true, Boolean(fixedChip && fixedBox))) continue
        if (!pairOk(bg, box, false, Boolean(fixedBg && fixedBox))) continue
        triples.push({ bg, chip, box })
      }
    }
  }

  if (triples.length === 0) {
    return {
      bg: fixedBg ?? fallback.bg,
      chip: fixedChip ?? fallback.chip,
      box: fixedBox ?? fallback.box,
      usedFallback: true,
    }
  }

  const rng = createRng(`${input.seed}:feed-colors`)

  let bg: string
  if (fixedBg) {
    bg = fixedBg
  } else {
    const available = [...new Set(triples.map((triple) => triple.bg))]
    const usageOf = (key: string) => input.bgUsage?.[key] ?? 0
    const least = Math.min(...available.map(usageOf))
    const candidates = available.filter((key) => usageOf(key) === least)
    bg = candidates[pickIndex(rng, candidates.length)]
  }

  const rest = triples.filter((triple) => triple.bg === bg)
  const picked = rest[pickIndex(rng, rest.length)]
  return { bg, chip: picked.chip, box: picked.box, usedFallback: false }
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
