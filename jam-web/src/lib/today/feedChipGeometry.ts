/**
 * 칩·스티커 배치의 기하(순수 계산) — 티켓 20261122_2228 R3, 상위 20261122_2217 §3·§4·§6·§7.
 *
 * 서버 컴포넌트는 DOM을 잴 수 없다. 그래서 위치는 «카드 폭(px) + 카드 비율(%) + 고정 px + 글자 길이 추정»으로만 계산한다.
 * 카드 폭은 고정이 아니다(390 화면에서 358, 320 화면에서 288). 안전 구역은 이미지 픽셀을 읽지 않고 «그림 상자의 가운데 비율»만 피한다.
 * 모든 함수는 입력 → 출력뿐이다(`Math.random`·`Date`·DOM 없음). 기존 카드 부품·`feedLook`은 이 파일을 아직 쓰지 않는다(R6에서 연결).
 *
 * 좌표: 카드 왼쪽 위가 (0, 0)인 px. 비율(0~1)이 필요하면 `toRatioRect`로 바꾼다. 칩의 자리는 «기울어진 칩의 바깥 끝이 카드 가장자리에서 떨어진 정도»(`CornerOffset`)다.
 */
import type { ChipCorner } from './feedChipLayout'
import type { FeedType } from './feedChipSlots'
import {
  FEED_BADGE_AREA_HEIGHT,
  FEED_BADGE_SIZE,
  FEED_BURST,
  FEED_CARD_MIN_HEIGHT,
  FEED_CORNER_CHIP,
  FEED_CORNER_INSET,
  FEED_CORNER_OVERHANG,
  dropPickupAreaHeightOf,
  FEED_DROP_PICKUP,
  dropPickupFrameOf,
  FEED_HERO_IMAGE_HEIGHT,
  FEED_OUTLINE_WIDTH,
  FEED_STAMP_INSET,
  FEED_STAMP_SIZE,
  FEED_STAMP_TILT,
  FEED_TEXT_BOX_TITLE_STEPS,
} from './feedConstants'
import { PEBBLE_SIZE, WAVE_SIZE } from '@ds/components/cards/CategorySticker'

/** 칩 배치 계산 대상 유형 7개. 전체 배경 이미지(`full_image`)는 서비스에서 꺼져 있어 뺀다. */
export const CHIP_GEOMETRY_TYPES = [
  'hero_box',
  'badge_intro',
  'text_box',
  'drop_pickup',
  'collection_intro',
  'gallery_list',
  'badge_only',
] as const satisfies readonly FeedType[]
export type ChipGeometryType = (typeof CHIP_GEOMETRY_TYPES)[number]

/** 카드 안쪽 여백(`FeedCardShell`의 `p-4`). */
const PAD = 16
/** 칩 자리 후보가 달라붙는 가장자리: 글자가 아래에 있으면 위(`top`), 글자가 위에 있으면 아래(`bottom`), 글자가 가운데면 네 모서리(`all`), 목록형은 흐름 줄(`flow`). */
export type ChipEdge = 'top' | 'bottom' | 'all' | 'flow'

export interface ChipTypeSpec {
  /** 칩·스티커가 놓일 수 있는 모서리 후보. 목록형은 비어 있다(제목 위 흐름 줄, 결정 6). */
  readonly corners: readonly ChipCorner[]
  readonly edge: ChipEdge
  /** 칩이 둘일 때 대각선 모서리에 두는가(텍스트형). 아니면 같은 가장자리의 좌우 모서리에 두고 둘째를 높이 12~22%(`LOWER_BAND`)로 내린다. */
  readonly diagonal: boolean
}

/**
 * 유형별 모서리 후보 표(상위 §3·§6·§7). 글자가 아래에 있는 카드(히어로·배지 소개·드랍·픽업·컬렉션)는 위쪽 두 모서리, 텍스트형은 네 모서리다.
 * 배지만은 제목이 위에 있어 아래 두 모서리다. 피할 영역(글자·그림 가운데·도장·퍼진 배지)은 `cardGeometryOf`가 폭에 맞춰 만든다.
 */
export const FEED_CHIP_TYPE_TABLE: Readonly<Record<ChipGeometryType, ChipTypeSpec>> = {
  hero_box: { corners: ['top-left', 'top-right'], edge: 'top', diagonal: false },
  badge_intro: { corners: ['top-left', 'top-right'], edge: 'top', diagonal: false },
  drop_pickup: { corners: ['top-left', 'top-right'], edge: 'top', diagonal: false },
  collection_intro: { corners: ['top-left', 'top-right'], edge: 'top', diagonal: false },
  text_box: { corners: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], edge: 'all', diagonal: true },
  badge_only: { corners: ['bottom-left', 'bottom-right'], edge: 'bottom', diagonal: false },
  gallery_list: { corners: [], edge: 'flow', diagonal: false },
}

/** 같은 가장자리의 둘째 칩을 내리는 높이 범위(카드 높이 대비, 상위 §3). */
export const LOWER_BAND = { min: 0.12, max: 0.22 } as const
/** 그림 상자의 «가운데» 비율: 가로·세로 각각 이 비율만큼 가운데 영역을 피한다(안전 구역 방식, 상위 §6). */
export const ART_SAFE_RATIO = { x: 0.5, y: 0.5 } as const
/** 글자·피할 영역 둘레 여유 px. */
export const AVOID_PAD = 4
/** 두 칩 사이 여유 px(같은 줄 판정과 겹침에 쓴다). */
export const CHIP_GAP = 6
/**
 * 계획이 맞춰 보는 카드 폭들(px): 아이폰 최소 화면 375의 카드 폭 343 하나다. 서버는 실제 폭을 모르지만, 343에서 겹치지 않으면 더 넓은 화면은 모두 안전하다
 * (칩 폭은 고정 px이고 안쪽 한도는 카드 비율이라 넓어질수록 여유가 늘어난다). 구형 320 화면(카드 폭 288)은 맞춰 보지 않는다(티켓 20261122_2228 결정, 카리나 2026-11-23).
 */
export const PLAN_WIDTHS = [343] as const
/** 기울기 상한(deg): `FEED_CORNER_TILT_RANGE.max`. 보수적 경계 상자는 이 각도로 잰다. */
const WORST_TILT = 12

export interface Rect {
  l: number
  t: number
  r: number
  b: number
}
export type ChipTextSize = 'lg' | 'sm'
export type StickerShapeName = 'pebble' | 'wave'

// ── 칩·스티커 크기 추정 ─────────────────────────────────────

/**
 * 굵기 900 한 글자 폭(em). `design-system/components/cards/CategorySticker.jsx`의 `CHAR_EM`과 같은 방식(실측 + 여유 4%)이다.
 * 그 표는 내보내지 않아 대문자·공백만 같은 값을 옮겼고, 숫자·소문자·기호는 이 파일이 보수적으로 정했다(한글 1.02).
 */
const CHAR_EM: Readonly<Record<string, number>> = {
  A: 0.69, B: 0.72, C: 0.69, D: 0.76, E: 0.66, F: 0.63, G: 0.76, H: 0.8, I: 0.37, J: 0.61, K: 0.74, L: 0.62, M: 0.91,
  N: 0.79, O: 0.82, P: 0.71, Q: 0.82, R: 0.74, S: 0.66, T: 0.67, U: 0.79, V: 0.67, W: 0.97, X: 0.68, Y: 0.63, Z: 0.64,
  ' ': 0.29, '·': 0.37, '.': 0.32, ',': 0.32, '+': 0.62, '-': 0.4,
}

function charEm(ch: string): number {
  const known = CHAR_EM[ch]
  if (known !== undefined) return known
  if (/[0-9]/.test(ch)) return 0.62
  if (/[a-z]/.test(ch)) return 0.68
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch)) return 1.02
  return 0.84
}

/** 글자 한 줄의 폭(em). */
export function textEm(text: string): number {
  return [...text].reduce((sum, ch) => sum + charEm(ch), 0)
}

/** 코너 알약 칩의 가로폭(px): 글자 + 가로 여백 2개 + 외곽선 2개. 높이는 `FEED_CORNER_CHIP[size].height`다. */
const cornerSpecOf = (size: ChipTextSize) => (size === 'lg' ? FEED_CORNER_CHIP.large : FEED_CORNER_CHIP.small)

export function chipWidthOf(text: string, size: ChipTextSize): number {
  const spec = cornerSpecOf(size)
  return Math.ceil(textEm(text.trim()) * spec.fontSize + spec.paddingX * 2 + FEED_OUTLINE_WIDTH * 2)
}

export function chipHeightOf(size: ChipTextSize): number {
  return cornerSpecOf(size).height
}

/** 스티커 기본 크기(`CategorySticker.jsx`의 `PEBBLE_SIZE`·`WAVE_SIZE`)에 배율을 곱한 크기. */
export function stickerSizeOf(shape: StickerShapeName, scale = 1): { w: number; h: number } {
  const base = shape === 'wave' ? WAVE_SIZE : PEBBLE_SIZE
  return { w: base.width * scale, h: base.height * scale }
}

/** 기울어진 직사각형(w×h, 각도 deg)이 차지하는 경계 상자. 각도의 부호는 상관없다. */
export function tiltedBounds(w: number, h: number, deg: number): { w: number; h: number } {
  const t = (Math.abs(deg) * Math.PI) / 180
  return { w: w * Math.cos(t) + h * Math.sin(t), h: w * Math.sin(t) + h * Math.cos(t) }
}

/** 기울기를 모를 때 쓰는 보수적 경계 상자(최악 12°). */
export function worstCaseBounds(w: number, h: number): { w: number; h: number } {
  return tiltedBounds(w, h, WORST_TILT)
}

// ── 카드 크기·피할 영역 ─────────────────────────────────────

export interface CardTextInput {
  /** 제목 줄마다의 글자 수(데이터의 줄바꿈 기준). 줄바꿈이 없으면 `[길이]`. */
  titleLines: readonly number[]
  descriptionLength: number
  descriptionVisible: boolean
}

export interface CardGeometryInput extends CardTextInput {
  feedType: ChipGeometryType
  /** 카드 폭 px */
  width: number
  /** 그림(배지 그림·대표 그림)이 실제로 있는가. 없으면 그림 가운데를 피하지 않는다. 히어로의 사진 박스는 가운데 구역이 없어 이 값과 무관하다. 드랍·픽업은 그림이 없는 배지도 이름 글자가 읽혀야 해서 이 값과 무관하게 늘 피한다. */
  hasImage: boolean
  /** 드랍·픽업의 배지 수(1~5, 기본 5). 수가 배치 틀을 정하고, 배지마다 기울인 상자의 가운데를 피한다. */
  imageCount?: number
  /** 컬렉션 소개의 퍼진 배지 자리(`look.burst`와 같은 모양: x·y는 −1~1, size px). 기준 영역은 326×240이다. */
  burst?: ReadonlyArray<{ x: number; y: number; size: number }>
  /** 도장이 놓이는 모서리(없으면 도장 없음). */
  stampCorner?: ChipCorner | null
  /** 추가로 피할 영역(카드 비율 0~1). */
  extraAvoid?: readonly Rect[]
}

export interface CardGeometry {
  width: number
  height: number
  spec: ChipTypeSpec
  /** 피할 영역 전부(px): 글자·그림 가운데·퍼진 배지·도장·추가 영역. */
  avoid: Rect[]
  /** 이 중 글자 영역(테스트·진단용). */
  textRects: Rect[]
}

const TITLE_FONT = 30
const TITLE_LINE = 36
const DESC_FONT = 14
const DESC_LINE = 20
const TEXT_GAP = 8

/** 줄 수와 가장 긴 줄의 폭을 어림한다(글자 폭 = 크기 × em, 가운데 정렬이 아닌 왼쪽 정렬 글자). */
function wrapEstimate(lines: readonly number[], charsPerLine: number): { count: number; maxChars: number } {
  let count = 0
  let maxChars = 0
  for (const length of lines) {
    count += Math.max(1, Math.ceil(length / charsPerLine))
    maxChars = Math.max(maxChars, Math.min(length, charsPerLine))
  }
  return { count, maxChars }
}

/** 제목·설명 묶음(카드 아래 또는 위에 붙는 글자 블록)의 높이와 가장 긴 줄의 폭. 폭이 좁으면 줄이 늘어 높아진다. */
export function textBlockOf(text: CardTextInput, width: number, withDescription = true): { height: number; maxWidth: number } {
  const inner = width - PAD * 2
  const title = wrapEstimate(text.titleLines, Math.max(1, Math.floor(inner / (TITLE_FONT * 0.98))))
  let height = title.count * TITLE_LINE
  let maxWidth = Math.min(inner, title.maxChars * TITLE_FONT * 0.98)
  if (withDescription && text.descriptionVisible && text.descriptionLength > 0) {
    const desc = wrapEstimate([text.descriptionLength], Math.max(1, Math.floor(inner / DESC_FONT)))
    height += TEXT_GAP + desc.count * DESC_LINE
    maxWidth = Math.max(maxWidth, Math.min(inner, desc.maxChars * DESC_FONT))
  }
  return { height, maxWidth: Math.ceil(maxWidth) }
}

/** 텍스트형 큰 제목의 글자 크기(px). `FEED_TEXT_BOX_TITLE_STEPS`와 같은 단계 판정이고 크기는 카드 안쪽 폭의 14.7%·11%·9.2%다(`cqw`). */
const TEXT_BOX_FONT_RATIO = [0.147, 0.11, 0.092] as const
export function textBoxTitleFontOf(titleLines: readonly number[], width: number): { fontSize: number; charsPerLine: number } {
  const inner = width - PAD * 2
  const wrapped = (cpl: number) => wrapEstimate(titleLines, cpl).count
  const index = Math.max(
    0,
    FEED_TEXT_BOX_TITLE_STEPS.findIndex((step) => wrapped(step.charsPerLine) <= step.maxLines),
  )
  const step = FEED_TEXT_BOX_TITLE_STEPS[index]
  return { fontSize: inner * TEXT_BOX_FONT_RATIO[index], charsPerLine: step.charsPerLine }
}

const pad = (rect: Rect, d: number): Rect => ({ l: rect.l - d, t: rect.t - d, r: rect.r + d, b: rect.b + d })

/** 상자의 가운데 비율만 남긴 영역(안전 구역). */
function centerZone(box: Rect, ratio: { x: number; y: number } = ART_SAFE_RATIO): Rect {
  const dx = ((box.r - box.l) * (1 - ratio.x)) / 2
  const dy = ((box.b - box.t) * (1 - ratio.y)) / 2
  return { l: box.l + dx, t: box.t + dy, r: box.r - dx, b: box.b - dy }
}

/** 카드 높이: 유형별 최소 높이와 «내용이 늘면 늘어난 높이» 중 큰 값. 텍스트형은 정사각이다. */
export function cardHeightOf(input: Omit<CardGeometryInput, 'hasImage'>): number {
  const { feedType: type, width } = input
  const block = textBlockOf(input, width).height
  switch (type) {
    case 'text_box':
      return width
    case 'hero_box':
      return Math.max(FEED_CARD_MIN_HEIGHT.hero_box, PAD + FEED_HERO_IMAGE_HEIGHT + PAD + block + PAD)
    case 'badge_intro':
      return Math.max(FEED_CARD_MIN_HEIGHT.badge_intro, PAD + FEED_BADGE_AREA_HEIGHT + PAD + block + PAD)
    case 'drop_pickup':
      return Math.max(FEED_CARD_MIN_HEIGHT.drop_pickup, PAD + dropPickupAreaHeightOf(width) + PAD + block + PAD)
    case 'collection_intro':
      return Math.max(FEED_CARD_MIN_HEIGHT.collection_intro, PAD + FEED_BURST.areaHeight + PAD + block + PAD)
    case 'badge_only': {
      const title = textBlockOf(input, width, false).height
      return Math.max(FEED_CARD_MIN_HEIGHT.badge_only, PAD + title + PAD + FEED_BADGE_AREA_HEIGHT + PAD)
    }
    case 'gallery_list':
      return FEED_CARD_MIN_HEIGHT.gallery_list
  }
}

/**
 * 드랍·픽업 배지마다 «기울인 상자»(`tiltedBounds`)의 경계(카드 왼쪽 위 기준 px). 배지 수가 틀을 정하고, 영역 폭은 카드 폭 − 32, 높이는 `dropPickupAreaHeightOf`다.
 * 중심 %는 영역 폭·높이 대비, 한 변은 기준 폭 326 대비 비율로 줄어 폭이 달라도 틀 모양이 같다.
 */
export function dropPickupBoundsOf(cardWidth: number, count: number): Rect[] {
  const areaW = cardWidth - PAD * 2
  const areaH = dropPickupAreaHeightOf(cardWidth)
  return dropPickupFrameOf(count).map((item) => {
    const size = (item.size * areaW) / FEED_DROP_PICKUP.refWidth
    const box = tiltedBounds(size, size, item.tilt)
    const cx = PAD + (item.x / 100) * areaW
    const cy = PAD + (item.y / 100) * areaH
    return { l: cx - box.w / 2, t: cy - box.h / 2, r: cx + box.w / 2, b: cy + box.h / 2 }
  })
}

/** 도장이 놓이는 기준 상자(칩의 앵커와 같은 상자). */
function stampAnchorOf(type: ChipGeometryType, width: number, art: Rect | null, textBox: Rect | null): Rect | null {
  if (type === 'hero_box') return { l: PAD, t: PAD, r: width - PAD, b: PAD + FEED_HERO_IMAGE_HEIGHT }
  if (type === 'drop_pickup') return { l: PAD, t: PAD, r: width - PAD, b: PAD + dropPickupAreaHeightOf(width) }
  if (type === 'text_box') return textBox
  if (type === 'badge_intro' || type === 'collection_intro') return art
  return null
}

/** 한 카드의 폭·높이와 피할 영역(px). 폭이 달라도 같은 규칙으로 비율을 지킨다. */
export function cardGeometryOf(input: CardGeometryInput): CardGeometry {
  const { feedType: type, width: w } = input
  const height = cardHeightOf(input)
  const spec = FEED_CHIP_TYPE_TABLE[type]
  const avoid: Rect[] = []
  const textRects: Rect[] = []
  let art: Rect | null = null
  let textBox: Rect | null = null
  const addText = (rect: Rect) => {
    textRects.push(pad(rect, AVOID_PAD))
    avoid.push(pad(rect, AVOID_PAD))
  }
  const centerX = w / 2

  if (type === 'hero_box' || type === 'badge_intro' || type === 'drop_pickup' || type === 'collection_intro') {
    const block = textBlockOf(input, w)
    addText({ l: PAD, t: height - PAD - block.height, r: PAD + block.maxWidth, b: height - PAD })
  }
  if (type === 'hero_box') {
    // 히어로의 이미지는 칩이 모서리에 걸치도록 만든 사진 박스(박스 전체가 그림)라 가운데 구역을 두지 않는다(사용자가 확정한 캔버스 규칙도 배지 그림만 지킨다).
    // 대신 제목·설명 글자(위에서 추가)만 피한다.
  } else if (type === 'badge_intro') {
    const top = PAD + (FEED_BADGE_AREA_HEIGHT - FEED_BADGE_SIZE) / 2
    art = { l: centerX - FEED_BADGE_SIZE / 2, t: top, r: centerX + FEED_BADGE_SIZE / 2, b: top + FEED_BADGE_SIZE }
    if (input.hasImage) avoid.push(centerZone(art))
  } else if (type === 'badge_only') {
    const title = textBlockOf(input, w, false)
    addText({ l: PAD, t: PAD, r: PAD + title.maxWidth, b: PAD + title.height })
    const top = height - PAD - FEED_BADGE_AREA_HEIGHT + (FEED_BADGE_AREA_HEIGHT - FEED_BADGE_SIZE) / 2
    if (input.hasImage) avoid.push(centerZone({ l: centerX - FEED_BADGE_SIZE / 2, t: top, r: centerX + FEED_BADGE_SIZE / 2, b: top + FEED_BADGE_SIZE }))
  } else if (type === 'drop_pickup') {
    // 그림이 없는 배지도 이름 글자가 읽혀야 해서 `hasImage`와 상관없이 배지마다 기울인 상자의 가운데 구역을 피한다(상자 가장자리·모서리는 피하지 않는다)
    for (const box of dropPickupBoundsOf(w, input.imageCount ?? FEED_DROP_PICKUP.max)) avoid.push(centerZone(box))
  } else if (type === 'collection_intro') {
    const cy = PAD + FEED_BURST.areaHeight / 2
    art = { l: centerX - FEED_BURST.artSize / 2, t: cy - FEED_BURST.artSize / 2, r: centerX + FEED_BURST.artSize / 2, b: cy + FEED_BURST.artSize / 2 }
    if (input.hasImage) avoid.push(centerZone(art))
    // 퍼진 배지: 중심은 영역 가운데에서 (x·영역 폭/2, y·영역 높이/2)만큼, 기울어도 덮이도록 한 변 × 1.2(최대 14°)
    for (const badge of input.burst ?? []) {
      const half = (badge.size * 1.2) / 2
      const bx = centerX + (badge.x * (w - PAD * 2)) / 2
      const by = cy + (badge.y * FEED_BURST.areaHeight) / 2
      avoid.push({ l: bx - half, t: by - half, r: bx + half, b: by + half })
    }
  } else if (type === 'text_box') {
    textBox = { l: PAD, t: PAD, r: w - PAD, b: height - PAD }
    const { fontSize, charsPerLine } = textBoxTitleFontOf(input.titleLines, w)
    const { count, maxChars } = wrapEstimate(input.titleLines, charsPerLine)
    // 글자 층은 박스 안(`max-w-full`)에 갇히고, 글자 둘레 안쪽 여백(`FEED_TEXT_BOX_PADDING`)은 비어 있어 피하지 않는다
    const textW = Math.min(w - PAD * 2, maxChars * fontSize)
    const textH = Math.min(w - PAD * 2, count * fontSize * 1.1)
    addText({ l: centerX - textW / 2, t: height / 2 - textH / 2, r: centerX + textW / 2, b: height / 2 + textH / 2 })
  }

  if (input.stampCorner) {
    const anchor = stampAnchorOf(type, w, art, textBox)
    if (anchor) {
      const grow = (tiltedBounds(FEED_STAMP_SIZE, FEED_STAMP_SIZE, FEED_STAMP_TILT).w - FEED_STAMP_SIZE) / 2
      const left = input.stampCorner.endsWith('left')
      const top = input.stampCorner.startsWith('top')
      const l = left ? anchor.l + FEED_STAMP_INSET : anchor.r - FEED_STAMP_INSET - FEED_STAMP_SIZE
      const t = top ? anchor.t + FEED_STAMP_INSET : anchor.b - FEED_STAMP_INSET - FEED_STAMP_SIZE
      avoid.push(pad({ l, t, r: l + FEED_STAMP_SIZE, b: t + FEED_STAMP_SIZE }, grow + AVOID_PAD))
    }
  }
  for (const extra of input.extraAvoid ?? []) {
    avoid.push({ l: extra.l * w, t: extra.t * height, r: extra.r * w, b: extra.b * height })
  }
  return { width: w, height, spec, avoid, textRects }
}

/** px 영역 → 카드 비율(0~1). */
export function toRatioRect(rect: Rect, width: number, height: number): Rect {
  return { l: rect.l / width, t: rect.t / height, r: rect.r / width, b: rect.b / height }
}

// ── 모서리 자리 ────────────────────────────────────────────

/**
 * 모서리 자리: 기울어진 칩의 «바깥 끝»이 카드 가장자리에서 안쪽으로 떨어진 정도(카드 폭·높이 대비 비율).
 * 음수는 카드 밖으로 나간다는 뜻이다. 안쪽은 가로 6%·세로 5%까지, 바깥은 6px까지(`FEED_CORNER_*`)다.
 */
export interface CornerOffset {
  x: number
  y: number
}

/** 오프셋의 한도(비율). 바깥 한도 6px는 폭·높이로 나눈 값이다(폭은 가장 넓은 계획 폭 기준으로 보수적). */
export function cornerOffsetLimits(width: number, height: number): { xMin: number; xMax: number; yMin: number; yMax: number } {
  return {
    xMin: -FEED_CORNER_OVERHANG / width,
    xMax: FEED_CORNER_INSET.x / 100,
    yMin: -FEED_CORNER_OVERHANG / height,
    yMax: FEED_CORNER_INSET.y / 100,
  }
}

/** 모서리와 오프셋 → 기울어진 칩의 경계 상자(px). `bw`·`bh`는 기울기를 반영한 경계 상자 크기다. */
export function cornerRect(corner: ChipCorner, bw: number, bh: number, offset: CornerOffset, width: number, height: number): Rect {
  const dx = offset.x * width
  const dy = offset.y * height
  const l = corner.endsWith('left') ? dx : width - dx - bw
  const t = corner.startsWith('top') ? dy : height - dy - bh
  return { l, t, r: l + bw, b: t + bh }
}

/** 카드 안쪽·바깥 한도를 지키는가(바깥은 6px까지, 안쪽 한도는 가장자리 기준 가로 6%·세로 5%). */
export function withinCornerLimits(corner: ChipCorner, rect: Rect, width: number, height: number): boolean {
  const eps = 1e-6
  const dx = corner.endsWith('left') ? rect.l : width - rect.r
  const dy = corner.startsWith('top') ? rect.t : height - rect.b
  return (
    dx >= -FEED_CORNER_OVERHANG - eps &&
    dy >= -FEED_CORNER_OVERHANG - eps &&
    dx <= (width * FEED_CORNER_INSET.x) / 100 + eps &&
    dy <= (height * FEED_CORNER_INSET.y) / 100 + eps
  )
}

// ── 겹침 ───────────────────────────────────────────────────

export function overlapArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
}

/** 영역 목록과 겹치는 넓이의 합(px²). 0이면 가리지 않는다. */
export function overlapWithAll(rect: Rect, others: readonly Rect[]): number {
  return others.reduce((sum, other) => sum + overlapArea(rect, other), 0)
}

/** 두 칩이 같은 줄에 서는가: 세로 구간이 `gap` 안으로 겹치면 같은 줄이다. */
export function sameRow(a: Rect, b: Rect, gap = CHIP_GAP): boolean {
  return a.t < b.b + gap && b.t < a.b + gap
}

/** 둘째 칩을 내리는 세로 구간(카드 비율)이 `LOWER_BAND` 안인가. */
export function inLowerBand(offsetY: number): boolean {
  return offsetY >= LOWER_BAND.min - 1e-9 && offsetY <= LOWER_BAND.max + 1e-9
}
