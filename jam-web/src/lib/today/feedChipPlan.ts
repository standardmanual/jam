/**
 * 한 카드의 칩·스티커 배치 계획(순수 계산) — 티켓 20261122_2228 R4, 상위 20261122_2217 §3·§4·§6·§7.
 *
 * `chipPlanCandidates`가 «물러서기까지 반영한 후보 계획 목록»을 시드로 섞어 돌려주고, `planCardChips`는 그 첫 계획이다.
 * 피드 순서(앞 카드와 같은 배치 금지·같은 값 연속 2장 한도)는 R5가 이 후보와 `signatureOf`를 보고 고른다. 여기서는 후보만 만든다.
 * 같은 입력(시드 포함)이면 항상 같은 결과다(`Math.random`·`Date` 없음). 기하(크기 추정·피할 영역·겹침)는 `feedChipGeometry.ts`다.
 *
 * 규칙:
 * - 분류 칩의 절반 정도(시드)를 스티커로 바꾼다. 값 칩은 알약만이고 분류 알약 칩은 검정이다. 스티커는 한 카드에 한 개(드랍·픽업의 둘째 칩은 검정 알약, 결정 5).
 * - 각도는 3~12°이고 두 칩은 반대 방향이다. 자리·기울기 방향·모양·색은 서로 묶지 않고 각자 고른다. 어드민이 정한 자리·기울기는 처음에 존중한다(결정 3).
 * - 제목·설명 글자와 그림 안전 구역을 가리지 않는다. 자리를 못 찾으면 이 순서로 물러선다(`BackoffLevel`):
 *   1 기울기 3° → 2 스티커 80% → 3 스티커를 검정 알약 분류 칩으로 → 4 값 칩을 작게 → 5 분류 칩 빼기. 칩이 하나뿐이면 1~3 뒤에 그 칩만 작게(6) 한다.
 *   고정한 자리는 물러서기에서도 옮기지 않는다(자리 이동은 단계가 아니다).
 * - 드랍·픽업만 «제목 옆 가장자리» 자리(`TITLE_EDGE`)가 후보에 더해진다: 한 칩은 위쪽 모서리, 다른 칩은 카드 오른쪽 가장자리의 제목 줄 높이(칩 가운데가 카드 높이의 62~78%).
 *   제목 글자(보정한 추정 폭)가 카드 폭의 60%를 넘으면 빠지고, 어드민이 자리를 정한 칩이 있으면 쓰지 않는다. 다른 유형의 후보는 그대로다.
 * - 목록형(`gallery_list`)은 제목 위 흐름 줄이라 이 계산 대상이 아니다(`flow: true`, 결정 6). 칩이 없는 카드(`[]`)는 빈 계획이다.
 * - 계획은 폭 343 카드(아이폰 최소 화면 375의 카드 폭)에서 겹치지 않아야 맞는 것으로 본다(서버는 실제 폭을 모른다, `PLAN_WIDTHS`).
 */
import { createRng, type BoxSeed } from './boxShape'
import type { ChipCorner } from './feedChipLayout'
import type { FeedType } from './feedChipSlots'
import {
  CHIP_GAP,
  CHIP_GEOMETRY_TYPES,
  FEED_CHIP_TYPE_TABLE,
  LOWER_BAND,
  PLAN_WIDTHS,
  TITLE_EDGE,
  cardGeometryOf,
  chipHeightOf,
  chipWidthOf,
  cornerOffsetLimits,
  cornerRect,
  overlapArea,
  overlapWithAll,
  sameRow,
  stickerSizeOf,
  tiltedBounds,
  type CardGeometry,
  type ChipGeometryType,
  type ChipTextSize,
  type CornerOffset,
  type Rect,
  type StickerShapeName,
} from './feedChipGeometry'
import { FEED_CORNER_TILT_RANGE } from './feedConstants'
import { STICKER_COLOR_PAIRS, type CategoryStickerPair } from '@ds/components/cards/CategorySticker'

/** 분류 칩 중 스티커가 되는 몫(카드마다 시드로 정한다). */
export const STICKER_SHARE = 0.5
/** 물러서기 2단계의 스티커 배율. */
export const STICKER_BACKOFF_SCALE = 0.8
/** 한 카드에 둘 수 있는 스티커 수. */
export const MAX_STICKERS_PER_CARD = 1
/** 후보 계획 수의 상한(자리 배치 × 기울기 방향 조합 중 시드로 섞은 앞부분). */
const MAX_CANDIDATES = 8
const POSITION_SAMPLES = 6
const SAME_ROW_COST = 1e5
const LETTERS = ['J', 'a', 'm'] as const
const PAIR_KEYS = Object.keys(STICKER_COLOR_PAIRS) as CategoryStickerPair[]

export type PlanChipKind = 'label' | 'value'
/** 물러서기 단계: 0 = 물러서지 않음, 1~5 = 위 규칙의 순서, 6 = 칩 하나만 남았을 때 그 칩 작게. */
export type BackoffLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface ChipPlanDraft {
  kind: PlanChipKind
  text: string
  /** 첫 칩은 보통 `lg`, 둘째는 `sm`(`FeedLookChip.size`) */
  size: ChipTextSize
  /** 어드민이 정한 값. 있으면 처음에 존중한다(자리는 끝까지, 기울기는 3°로 물러서기 전까지). */
  fixed?: { corner?: ChipCorner | null; tilt?: number | null }
}

export interface ChipPlanInput {
  feedType: FeedType
  /** 카드 시드(`look.seed`) */
  seed: BoxSeed
  chips: readonly ChipPlanDraft[]
  titleLines: readonly number[]
  descriptionLength: number
  descriptionVisible: boolean
  hasImage: boolean
  imageCount?: number
  burst?: ReadonlyArray<{ x: number; y: number; size: number }>
  stampCorner?: ChipCorner | null
  extraAvoid?: readonly Rect[]
  /** 맞춰 볼 카드 폭들(기본 `PLAN_WIDTHS`) */
  widths?: readonly number[]
  /**
   * 스티커 여부를 시드가 아니라 호출한 쪽이 정한다(R5의 «같은 꼴 3연속 금지»가 쓴다). 생략하면 `auto`(시드, 분류 칩의 절반 정도).
   * `sticker`는 첫 분류 칩을 스티커로, `pill`은 모두 알약으로 한다. 난수 소비는 `auto`와 같아 다른 값(자리·기울기·글자·짝)은 모드와 무관하게 같다.
   */
  stickerMode?: 'auto' | 'sticker' | 'pill'
}

/** `CategorySticker`에 그대로 넘기는 인자. 색 짝은 R5가 카드 바탕·앞 스티커와 겹치지 않게 바꿀 수 있다. */
export interface StickerArgs {
  shape: StickerShapeName
  pair: CategoryStickerPair
  letter: 'J' | 'a' | 'm'
  seed: string
  label: string
}

export interface PlannedChip {
  /** 입력 칩 순서 */
  index: number
  kind: PlanChipKind
  presentation: 'pill' | 'sticker'
  text: string
  corner: ChipCorner
  /** 기울어진 칩의 바깥 끝이 카드 가장자리에서 안쪽으로 떨어진 정도(% of 카드 폭·높이, 음수는 카드 밖). */
  inset: { x: number; y: number }
  /** 같은 가장자리의 둘째 칩이라 내려 앉았는가(높이 12~22%). */
  lowered: boolean
  /** 드랍·픽업만: «제목 옆 가장자리»(카드 오른쪽 가장자리, 칩 가운데가 카드 높이의 62~78%)에 놓인 칩인가. 아니면 생략한다. */
  edge?: boolean
  /** 부호 있는 기울기(deg), 절댓값 3~12 */
  tilt: number
  size: ChipTextSize
  scale: number
  /** 분류 알약 칩은 검정 */
  black: boolean
  sticker: StickerArgs | null
  /** 기울이기 전 칩·스티커 크기(px) */
  box: { w: number; h: number }
}

export interface ChipPlan {
  feedType: FeedType
  chips: PlannedChip[]
  backoff: BackoffLevel
  /** 모든 계획 폭에서 가릴 영역과 겹치지 않고 두 칩이 같은 줄에 서지 않으면 참 */
  fit: boolean
  /** 겹침 넓이 합(px², 폭별 합). fit이면 0 */
  overlap: number
  /** 목록형처럼 모서리 배치 대상이 아님(제목 위 흐름 줄) */
  flow: boolean
}

// ── 작업 상태와 물러서기 사다리 ────────────────────────────

export interface PlanWork {
  index: number
  kind: PlanChipKind
  text: string
  size: ChipTextSize
  presentation: 'pill' | 'sticker'
  scale: number
  black: boolean
  /** 기울기 절댓값(deg) */
  mag: number
  sign: 1 | -1
  fixedCorner: ChipCorner | null
  sticker: StickerArgs | null
}

/** 물러서기 사다리: 단계마다 «그 단계까지 누적한 칩 상태». 바꿀 것이 없는 단계는 건너뛴다. 0단계는 처음 상태다. */
export function backoffLadder(base: readonly PlanWork[]): Array<{ level: BackoffLevel; works: PlanWork[] }> {
  const steps: Array<{ level: BackoffLevel; works: PlanWork[] }> = [{ level: 0, works: [...base] }]
  let cur = [...base]
  const push = (level: BackoffLevel) => steps.push({ level, works: cur })
  const hasSticker = () => cur.some((w) => w.presentation === 'sticker')
  const minTilt = FEED_CORNER_TILT_RANGE.min

  if (cur.some((w) => w.mag > minTilt)) {
    cur = cur.map((w) => ({ ...w, mag: minTilt }))
    push(1)
  }
  if (hasSticker()) {
    cur = cur.map((w) => (w.presentation === 'sticker' ? { ...w, scale: STICKER_BACKOFF_SCALE } : w))
    push(2)
  }
  if (hasSticker()) {
    cur = cur.map((w) => (w.presentation === 'sticker' ? { ...w, presentation: 'pill' as const, scale: 1, black: w.kind === 'label', sticker: null } : w))
    push(3)
  }
  const multi = cur.length > 1
  if (multi && cur.some((w) => w.kind === 'value' && w.size === 'lg')) {
    cur = cur.map((w) => (w.kind === 'value' ? { ...w, size: 'sm' as const } : w))
    push(4)
  }
  if (multi && cur.some((w) => w.kind === 'label')) {
    // 분류 칩 빼기: 분류 칩과 값 칩이 섞여 있으면 분류 칩, 분류 칩만(드랍·픽업)이면 둘째 칩
    const dropIndex = cur.some((w) => w.kind === 'value') ? cur.findIndex((w) => w.kind === 'label') : 1
    cur = cur.filter((_, i) => i !== dropIndex)
    push(5)
  }
  if (cur.length === 1 && cur[0].size === 'lg') {
    cur = [{ ...cur[0], size: 'sm' }]
    push(6)
  }
  return steps
}

// ── 자리 배치 후보(조합) ───────────────────────────────────

const mirrorX = (c: ChipCorner): ChipCorner => (c.endsWith('left') ? (c.replace('left', 'right') as ChipCorner) : (c.replace('right', 'left') as ChipCorner))
const diagonalOf = (c: ChipCorner): ChipCorner => mirrorX(c.startsWith('top') ? (c.replace('top', 'bottom') as ChipCorner) : (c.replace('bottom', 'top') as ChipCorner))
const edgeOf = (c: ChipCorner): 'top' | 'bottom' => (c.startsWith('top') ? 'top' : 'bottom')

interface Arrangement {
  corner: Map<number, ChipCorner>
  /** 내려 앉는 칩의 입력 순서(없으면 null) */
  low: number | null
  /** «제목 옆 가장자리»에 놓는 칩의 입력 순서(드랍·픽업만, 없으면 null). 이 칩은 `low`와 같은 칩이 아니다. */
  edge: number | null
}

function arrangementsOf(feedType: ChipGeometryType, works: readonly PlanWork[], titleEdgeOpen: boolean): Arrangement[] {
  const spec = FEED_CHIP_TYPE_TABLE[feedType]
  const make = (corners: ChipCorner[], low: number | null, edge: number | null = null): Arrangement => ({
    corner: new Map(works.map((w, i) => [w.index, corners[i]] as const)),
    low: low === null ? null : works[low].index,
    edge: edge === null ? null : works[edge].index,
  })
  if (works.length === 1) {
    const fixed = works[0].fixedCorner
    return (fixed ? [fixed] : [...spec.corners]).map((c) => make([c], null))
  }
  const [a, b] = works
  const partnerOf = (c: ChipCorner): { corner: ChipCorner; lowered: boolean } =>
    spec.diagonal || edgeOf(c) !== spec.edge ? { corner: diagonalOf(c), lowered: false } : { corner: mirrorX(c), lowered: true }
  if (a.fixedCorner && b.fixedCorner) {
    const sameEdge = edgeOf(a.fixedCorner) === edgeOf(b.fixedCorner) && !spec.diagonal && edgeOf(a.fixedCorner) === spec.edge
    return [make([a.fixedCorner, b.fixedCorner], sameEdge ? 1 : null)]
  }
  if (a.fixedCorner || b.fixedCorner) {
    const fixedFirst = Boolean(a.fixedCorner)
    const f = (fixedFirst ? a.fixedCorner : b.fixedCorner) as ChipCorner
    const { corner, lowered } = partnerOf(f)
    return [fixedFirst ? make([f, corner], lowered ? 1 : null) : make([corner, f], lowered ? 0 : null)]
  }
  const out: Arrangement[] = []
  for (const c0 of spec.corners) {
    if (spec.diagonal) out.push(make([c0, diagonalOf(c0)], null))
    else for (const low of [0, 1]) out.push(make([c0, mirrorX(c0)], low))
  }
  if (feedType === 'drop_pickup' && titleEdgeOpen) {
    // 시안처럼 한 칩은 위쪽 모서리, 다른 칩은 카드 오른쪽 가장자리의 제목 줄 높이에 둔다(기존 «내려 앉히기» 후보는 그대로 두고 후보를 더한다)
    for (const c0 of spec.corners) {
      for (const edge of [0, 1]) out.push(make(edge === 0 ? [TITLE_EDGE.corner, c0] : [c0, TITLE_EDGE.corner], null, edge))
    }
  }
  return out
}

// ── 자리 찾기 ──────────────────────────────────────────────

interface Placed {
  work: PlanWork
  corner: ChipCorner
  offset: CornerOffset
  lowered: boolean
  edge: boolean
  rects: Rect[]
}

interface WidthGeometry {
  geometry: CardGeometry
}

const trunc3 = (v: number) => Math.trunc(v * 1000) / 1000
const padRect = (r: Rect, d: number): Rect => ({ l: r.l - d, t: r.t - d, r: r.r + d, b: r.b + d })

function boxOf(work: PlanWork): { w: number; h: number } {
  if (work.presentation === 'sticker' && work.sticker) return stickerSizeOf(work.sticker.shape, work.scale)
  return { w: chipWidthOf(work.text, work.size), h: chipHeightOf(work.size) }
}

function offsetCandidates(rng: () => number, limits: ReturnType<typeof cornerOffsetLimits>, banded: boolean): CornerOffset[] {
  const lerp = (a: number, b: number) => a + rng() * (b - a)
  const out: CornerOffset[] = []
  for (let i = 0; i < POSITION_SAMPLES; i += 1) {
    out.push({ x: lerp(limits.xMin, limits.xMax), y: banded ? lerp(LOWER_BAND.min, LOWER_BAND.max) : lerp(limits.yMin, limits.yMax) })
  }
  const anchors: CornerOffset[] = banded
    ? [
        { x: limits.xMin, y: LOWER_BAND.min },
        { x: limits.xMin, y: LOWER_BAND.max },
        { x: limits.xMax, y: LOWER_BAND.min },
      ]
    : [
        { x: limits.xMin, y: limits.yMin },
        { x: limits.xMax, y: limits.yMin },
        { x: limits.xMin, y: limits.yMax },
        { x: limits.xMax, y: limits.yMax },
      ]
  return [...out, ...anchors].map((o) => ({ x: trunc3(o.x), y: trunc3(o.y) }))
}

/**
 * «제목 옆 가장자리» 칩의 후보 자리: 칩 가운데가 카드 높이의 62~78%(`TITLE_EDGE.centerBand`)이고, 가로는 바깥 6px에서 안쪽 한도까지다.
 * 세로 오프셋은 칩 경계 상자의 위쪽 끝 기준이라 «가운데 비율 − 경계 상자 높이의 반 / 카드 높이»로 바꾼다.
 */
function edgeOffsetCandidates(rng: () => number, limits: ReturnType<typeof cornerOffsetLimits>, boundsH: number, cardHeight: number): CornerOffset[] {
  const { min, max } = TITLE_EDGE.centerBand
  const lerp = (a: number, b: number) => a + rng() * (b - a)
  const toY = (center: number) => center - boundsH / 2 / cardHeight
  const out: CornerOffset[] = []
  for (let i = 0; i < POSITION_SAMPLES; i += 1) out.push({ x: lerp(limits.xMin, limits.xMax), y: toY(lerp(min, max)) })
  const centers = [min, (min * 2 + max) / 3, (min + max * 2) / 3, max]
  for (const center of centers) out.push({ x: limits.xMin, y: toY(center) }, { x: (limits.xMin + limits.xMax) / 2, y: toY(center) })
  return out.map((o) => ({ x: trunc3(o.x), y: trunc3(o.y) }))
}

/**
 * 칩들을 차례로 놓는다(내려 앉는 칩은 마지막). 앞 칩의 자리를 바꿔 가며 뒤 칩까지 모두 겹치지 않는 조합을 처음 찾는 대로 쓰고,
 * 없으면 겹침 합이 가장 작은 조합을 쓴다(앞 칩이 뒤 칩의 자리를 막지 않게 되돌아가며 찾는다).
 */
function placeAll(
  works: readonly PlanWork[],
  arrangement: Arrangement,
  shrunk: boolean,
  feedType: ChipGeometryType,
  geoms: readonly WidthGeometry[],
  rng: () => number,
): { placed: Placed[]; cost: number } {
  const spec = FEED_CHIP_TYPE_TABLE[feedType]
  const lowIndex = works.length > 1 ? arrangement.low : null
  const edgeIndex = works.length > 1 ? arrangement.edge : null
  const order = [...works].sort((a, b) => Number(a.index === lowIndex || a.index === edgeIndex) - Number(b.index === lowIndex || b.index === edgeIndex))
  const limits = cornerOffsetLimits(Math.max(...geoms.map((g) => g.geometry.width)), Math.max(...geoms.map((g) => g.geometry.height)))

  // 칩마다 후보 자리(모서리 × 오프셋)를 미리 만든다
  const candidates = order.map((work) => {
    const first = arrangement.corner.get(work.index) as ChipCorner
    const corners = shrunk && !work.fixedCorner ? [first, ...spec.corners.filter((c) => c !== first)] : [first]
    const lowered = work.index === lowIndex
    const edge = work.index === edgeIndex
    const box = boxOf(work)
    const bounds = tiltedBounds(box.w, box.h, work.mag)
    // 가장자리 칩은 자기 모서리에서만 찾는다(다른 칩의 모서리로 옮겨 앉지 않는다)
    const cornersOf = edge ? [first] : corners
    return cornersOf.flatMap((corner) =>
      (edge
        ? edgeOffsetCandidates(rng, limits, bounds.h, Math.max(...geoms.map((g) => g.geometry.height)))
        : offsetCandidates(rng, limits, lowered)
      ).map((offset) => ({
        work,
        corner,
        offset,
        lowered,
        edge,
        rects: geoms.map(({ geometry: g }) => cornerRect(corner, bounds.w, bounds.h, offset, g.width, g.height)),
      })),
    )
  })

  const costOf = (rects: Rect[], placed: readonly Placed[]): number => {
    let cost = 0
    rects.forEach((rect, gi) => {
      cost += overlapWithAll(rect, geoms[gi].geometry.avoid)
      for (const prev of placed) {
        cost += overlapArea(padRect(rect, CHIP_GAP), prev.rects[gi])
        if (sameRow(rect, prev.rects[gi])) cost += SAME_ROW_COST
      }
    })
    return cost
  }

  let best: { placed: Placed[]; cost: number } | null = null
  const search = (i: number, acc: Placed[], cost: number): boolean => {
    if (i === candidates.length) {
      if (!best || cost < best.cost) best = { placed: acc, cost }
      return cost === 0
    }
    for (const candidate of candidates[i]) {
      const extra = costOf(candidate.rects, acc)
      if (best && cost + extra >= best.cost) continue
      if (search(i + 1, [...acc, candidate], cost + extra)) return true
    }
    return false
  }
  search(0, [], 0)
  const found = best as unknown as { placed: Placed[]; cost: number }
  return { placed: [...found.placed].sort((a, b) => a.work.index - b.work.index), cost: found.cost }
}

// ── 시드로 정하는 값 ───────────────────────────────────────

function baseWorks(input: ChipPlanInput, rng: () => number): PlanWork[] {
  let stickers = 0
  return input.chips.slice(0, 2).map((draft, index) => {
    let presentation: PlanWork['presentation'] = 'pill'
    const seedWantsSticker = draft.kind === 'label' && rng() < STICKER_SHARE
    const mode = input.stickerMode ?? 'auto'
    const wantsSticker = mode === 'auto' ? seedWantsSticker : mode === 'sticker' && draft.kind === 'label'
    if (wantsSticker && stickers < MAX_STICKERS_PER_CARD) {
      presentation = 'sticker'
      stickers += 1
    }
    // 스티커 인자는 칩마다 항상 뽑아 둔다(스티커 여부에 따라 뒤 난수가 밀리지 않는다)
    const shape: StickerShapeName = rng() < 0.5 ? 'pebble' : 'wave'
    const pair = PAIR_KEYS[Math.floor(rng() * PAIR_KEYS.length)]
    const letter = LETTERS[Math.floor(rng() * LETTERS.length)]
    const fixedTilt = draft.fixed?.tilt ?? null
    return {
      index,
      kind: draft.kind,
      text: draft.text.trim(),
      size: draft.size,
      presentation,
      scale: 1,
      black: draft.kind === 'label' && presentation === 'pill',
      mag: fixedTilt === null ? 0 : Math.abs(fixedTilt),
      sign: fixedTilt !== null && fixedTilt < 0 ? -1 : 1,
      fixedCorner: draft.fixed?.corner ?? null,
      sticker: presentation === 'sticker' ? { shape, pair, letter, seed: `${input.seed}:sticker:${index}`, label: draft.text.trim() } : null,
    } satisfies PlanWork
  })
}

function shuffled<T>(rng: () => number, list: readonly T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function toPlanned(item: Placed, work: PlanWork, box: { w: number; h: number }): PlannedChip {
  return {
    index: work.index,
    kind: work.kind,
    presentation: work.presentation,
    text: work.text,
    corner: item.corner,
    inset: { x: Math.round(item.offset.x * 1000) / 10, y: Math.round(item.offset.y * 1000) / 10 },
    lowered: item.lowered,
    ...(item.edge ? { edge: true } : {}),
    tilt: work.sign * work.mag,
    size: work.size,
    scale: work.scale,
    black: work.black,
    sticker: work.sticker,
    box,
  }
}

const EMPTY: Omit<ChipPlan, 'feedType'> = { chips: [], backoff: 0, fit: true, overlap: 0, flow: false }

/**
 * 후보 계획 목록. 앞쪽일수록 좋다: 물러서기 단계가 낮은 계획이 먼저이고, 같은 단계끼리는 시드로 섞은 순서다.
 * 맞는 계획이 하나도 없으면 겹침이 가장 작은 계획들이 (`fit: false`) 뒤따른다. 칩이 없으면 빈 계획 하나, 목록형은 `flow` 계획 하나다.
 */
export function chipPlanCandidates(input: ChipPlanInput): ChipPlan[] {
  const feedType = input.feedType
  if (!(CHIP_GEOMETRY_TYPES as readonly string[]).includes(feedType)) return [{ ...EMPTY, feedType, flow: true }]
  const type = feedType as ChipGeometryType
  const drafts = input.chips.filter((chip) => chip.text.trim().length > 0).slice(0, 2)
  if (FEED_CHIP_TYPE_TABLE[type].edge === 'flow') return [{ ...EMPTY, feedType, flow: true }]
  if (drafts.length === 0) return [{ ...EMPTY, feedType }]

  const rng = createRng(`${input.seed}:chipplan`)
  const works = baseWorks({ ...input, chips: drafts }, rng)
  const geoms: WidthGeometry[] = (input.widths ?? PLAN_WIDTHS).map((width) => ({
    geometry: cardGeometryOf({ ...input, feedType: type, width }),
  }))

  // 조합: 자리 배치 × 첫 칩의 기울기 방향(둘째는 반대). 어드민이 정한 기울기가 있으면 그 방향을 따른다.
  const combos: Array<{ arrangement: Arrangement; sign: 1 | -1 }> = []
  // «제목 옆 가장자리» 자리는 제목 글자(보정한 추정 폭)가 카드 폭의 60% 이하인 계획 폭에서만 쓴다(하나라도 넘으면 뺀다)
  const titleEdgeOpen = geoms.every(({ geometry }) => geometry.titleEdgeOpen)
  for (const arrangement of arrangementsOf(type, works, titleEdgeOpen)) {
    const signs: Array<1 | -1> = works[0].mag > 0 ? [works[0].sign] : works[1] && works[1].mag > 0 ? [works[1].sign === 1 ? -1 : 1] : [1, -1]
    for (const sign of signs) combos.push({ arrangement, sign })
  }
  // 드랍·픽업은 «제목 옆 가장자리» 후보가 더해져 조합이 늘어난다(전부 쓴다). 다른 유형은 그대로 8개다.
  const ordered = shuffled(rng, combos).slice(0, type === 'drop_pickup' ? MAX_CANDIDATES * 2 : MAX_CANDIDATES)

  const results = ordered.map(({ arrangement, sign }, order) => {
    const comboRng = createRng(`${input.seed}:chipplan:${order}`)
    const start = works.map((work) => ({
      ...work,
      sign: (work.mag > 0 ? work.sign : work.index === 0 ? sign : -sign) as 1 | -1,
      mag: work.mag > 0 ? work.mag : Math.round((FEED_CORNER_TILT_RANGE.min + comboRng() * (FEED_CORNER_TILT_RANGE.max - FEED_CORNER_TILT_RANGE.min)) * 10) / 10,
    }))
    let best: { plan: ChipPlan; cost: number } | null = null
    for (const step of backoffLadder(start)) {
      const { placed, cost } = placeAll(step.works, arrangement, step.works.length < start.length, type, geoms, comboRng)
      const plan: ChipPlan = {
        feedType,
        chips: placed.map((item) => toPlanned(item, item.work, boxOf(item.work))),
        backoff: step.level,
        fit: cost === 0,
        overlap: cost,
        flow: false,
      }
      if (!best || cost < best.cost) best = { plan, cost }
      if (cost === 0) break
    }
    return { plan: (best as { plan: ChipPlan }).plan, order }
  })
  const fit = results.filter((r) => r.plan.fit).sort((a, b) => a.plan.backoff - b.plan.backoff || a.order - b.order)
  const unfit = results.filter((r) => !r.plan.fit).sort((a, b) => a.plan.overlap - b.plan.overlap || a.order - b.order)
  return [...fit, ...unfit].map((r) => r.plan)
}

/** 한 카드의 배치 계획: 후보 목록의 첫 계획. */
export function planCardChips(input: ChipPlanInput): ChipPlan {
  return chipPlanCandidates(input)[0]
}

/** 기울기 구간 이름: 3~5° = a, 6~8° = b, 9~12° = c. */
function tiltBandOf(tilt: number): 'a' | 'b' | 'c' {
  const mag = Math.abs(tilt)
  return mag <= 5 ? 'a' : mag <= 8 ? 'b' : 'c'
}

/**
 * 계획의 서명 — «앞 카드와 같은 배치»를 비교하는 문자열. 칩마다 `종류(L분류·V값) + 모양(p알약·sp조약돌·sw물결) : 자리(+내림 ~) : 기울기 방향+구간`.
 * 같은 서명이면 사람이 보기에 같은 배치다(정확한 각도·안쪽 오프셋은 보지 않는다). 칩이 없거나 흐름 줄(목록형)이면 빈 문자열이라 «건너뛰는 카드»를 뜻한다.
 */
export function signatureOf(plan: ChipPlan): string {
  return plan.chips
    .map((chip) => {
      const form = chip.presentation === 'sticker' && chip.sticker ? `s${chip.sticker.shape === 'wave' ? 'w' : 'p'}` : 'p'
      return `${chip.kind === 'label' ? 'L' : 'V'}${form}:${chip.corner}${chip.lowered ? '~' : chip.edge ? '^' : ''}:${chip.tilt < 0 ? '-' : '+'}${tiltBandOf(chip.tilt)}`
    })
    .join('|')
}

/** 계획의 칩마다 기울어진 경계 상자(px)를 이 카드 폭에서 다시 계산한다(검증·화면 연결용). 높이는 이 입력의 글자로 어림한다. */
export function chipRectsOf(plan: ChipPlan, input: ChipPlanInput, width: number): Rect[] {
  const geometry = cardGeometryOf({ ...input, feedType: input.feedType as ChipGeometryType, width })
  return plan.chips.map((chip) => {
    const bounds = tiltedBounds(chip.box.w, chip.box.h, chip.tilt)
    return cornerRect(chip.corner, bounds.w, bounds.h, { x: chip.inset.x / 100, y: chip.inset.y / 100 }, geometry.width, geometry.height)
  })
}
