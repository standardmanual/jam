/**
 * 챕터 게이지 카드 수치 — 순수 로직 (티켓 20261127_1733, 채원 사전 판정 2026-11-28)
 *
 * `ChapterGaugeCard`의 채움 길이·숫자 자리·진입 모션 시간을 정한다. 화면·타이머를 모르는 순수 모듈이고 아무것도 가져오지 않는다.
 * 옛 캡슐 게이지(`@/lib/capsule/capsule-gauge`)의 진입 상수와 이동 시간 식을 옮겨 왔다. 정본 폴더가 `@/lib/capsule/*`에 기대지 않게 하고,
 * 캡슐을 지울 때 이 파일이 그대로 남도록 하려는 것이다. 옛 파일은 건드리지 않는다.
 */

/** 칩 폭(px) — 토큰이 아니라 이 카드 안의 상수다(사용자 승인 2026-11-28). 채움은 칩 폭에서 시작해 트랙 안쪽 끝까지 늘어난다 */
export const CHAPTER_CHIP_WIDTH_PX = 44
/** 트랙 높이(px) */
export const CHAPTER_TRACK_HEIGHT_PX = 36
/** 트랙 안쪽 여백(px) — 채움·칩이 앉는 높이는 트랙 높이에서 이 값의 두 배를 뺀 32px다 */
export const CHAPTER_TRACK_PADDING_PX = 2
/** JAM 워드마크 폭(px) — 높이는 로고 원본 비율(2610×865)을 지킨다 */
export const CHAPTER_WORDMARK_WIDTH_PX = 26

/** 숫자를 채움 안에 둘 수 있는지 재는 값 — 칩과 숫자 사이 간격(px), 글자 하나의 폭(px, 추정; 두 숫자 모두 16px 글자라 필요 잼 숫자와 같은 값), 채움 오른쪽 끝에서 띄우는 간격(px, = --spacing-12) */
export const NUMBER_CHIP_GAP_PX = 4
export const NUMBER_CHAR_WIDTH_PX = 10
export const NUMBER_FILL_END_GAP_PX = 12
/** 필요 잼 숫자(16px 글자) 글자 하나의 폭(px, 추정) — 쉼표가 좁아 넉넉한 쪽으로 어림한 값이다. 글자 배율은 호출부가 곱해 넘긴다 */
export const NUMBER_REQUIRED_CHAR_WIDTH_PX = 10
/** 채움 오른쪽 바깥에 놓는 모은 잼 숫자와 채움 끝 사이 간격(px, = --spacing-8). 필요 잼 영역 오른쪽 안쪽 간격과 같은 값이다 */
export const NUMBER_OUTSIDE_GAP_PX = 8
/** 필요 잼 숫자의 오른쪽 여백(px, = --spacing-12) */
export const REQUIRED_NUMBER_END_GAP_PX = 12

/** 진입 모션: 트랙이 이만큼(0~1) 이상 보이면 «화면에 보인다»로 친다 */
export const ENTRY_VISIBLE_RATIO = 0.5
/** 진입 모션: 하단 플로팅 탭바가 가리는 높이(px) — 관찰 영역의 아래쪽을 이만큼 줄인다 */
export const ENTRY_TABBAR_CLEARANCE_PX = 72
/** 진입 모션: 화면에 들어온 뒤 채움이 시작되기까지의 쉼(ms) */
export const ENTRY_DELAY_MS = 260
/** 진입 모션: 칩 아래에서 끝 길이까지 늘어나는 시간(ms) */
export const ENTRY_MS = 1500
/** 같은 화면에서 값이 바뀔 때 이동 시간의 하한·상한(ms) */
export const MOVE_MIN_MS = 700
export const MOVE_MAX_MS = 1500

export type NumberPlacement = 'inside' | 'outside'

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** 채움 정도(0~1). 필요량이 없으면(챕터 10) 가득이다. 필요량이 0 이하이거나 숫자가 아니면 0이다 */
export function chapterFillRatio(filled: number, required: number | null): number {
  if (required === null) return 1
  if (!(required > 0)) return 0
  return clamp(filled, 0, required) / required
}

/** 채움 길이(px) = 칩 폭 + (트랙 안쪽 폭 - 칩 폭) × 채움 정도 */
export function fillWidthPx(innerWidthPx: number, ratio: number): number {
  const rest = Math.max(0, innerWidthPx - CHAPTER_CHIP_WIDTH_PX)
  return CHAPTER_CHIP_WIDTH_PX + rest * clamp(ratio, 0, 1)
}

/** 숫자 글자(천 단위 쉼표). 소수는 버리고 음수·숫자가 아닌 값은 0이다 */
export function formatGemCount(value: number): string {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)).toLocaleString('ko-KR')
}

/**
 * 채움 안에 숫자가 들어가려면 필요한 채움 길이(px) = 칩 + 간격 + 글자 수 × 글자 폭 + 오른쪽 간격.
 * 숫자 글자는 rem 단위라 기준 글자 크기가 커지면 같이 커지므로, 글자 폭은 `charWidthPx`로 배율을 반영해 받는다.
 */
export function insideNumberNeededPx(charCount: number, charWidthPx: number = NUMBER_CHAR_WIDTH_PX): number {
  return CHAPTER_CHIP_WIDTH_PX + NUMBER_CHIP_GAP_PX + charCount * charWidthPx + NUMBER_FILL_END_GAP_PX
}

/**
 * 필요 잼 영역 폭(px) = 오른쪽 여백 12 + 글자 수 × 글자 폭 + 모은 잼 숫자와 띄우는 간격 8.
 * 마지막 챕터(0자)는 숫자가 없으므로 영역도 만들지 않는다(0).
 */
export function requiredReservedPx(requiredCharCount: number, requiredCharWidthPx: number = NUMBER_REQUIRED_CHAR_WIDTH_PX): number {
  if (!(requiredCharCount > 0)) return 0
  return REQUIRED_NUMBER_END_GAP_PX + requiredCharCount * requiredCharWidthPx + NUMBER_OUTSIDE_GAP_PX
}

/**
 * 모은 잼 숫자 자리(최종 값 기준). 채움이 안쪽 필요 길이 이상이면 `inside`가 먼저다.
 * 아니면 `채움 끝 + 8 + 숫자 폭`이 필요 잼 영역 왼쪽 끝 이하일 때만 `outside`이고, 닿으면 `inside`(안쪽 클램프)다.
 * 트랙 폭을 아직 모르면(0 이하) `outside`다.
 */
export function collectedNumberPlacement(
  innerWidthPx: number,
  ratio: number,
  charCount: number,
  charWidthPx: number = NUMBER_CHAR_WIDTH_PX,
  requiredCharCount: number = 0,
  requiredCharWidthPx: number = NUMBER_REQUIRED_CHAR_WIDTH_PX
): NumberPlacement {
  if (!(innerWidthPx > 0)) return 'outside'
  const fillEnd = fillWidthPx(innerWidthPx, ratio)
  if (fillEnd >= insideNumberNeededPx(charCount, charWidthPx)) return 'inside'
  const outsideRight = fillEnd + NUMBER_OUTSIDE_GAP_PX + charCount * charWidthPx
  return outsideRight <= innerWidthPx - requiredReservedPx(requiredCharCount, requiredCharWidthPx) ? 'outside' : 'inside'
}

/**
 * 안쪽 모은 잼 숫자의 오른쪽 여백(px). 기본은 12이고, 채움 끝이 필요 잼 영역에 닿으면
 * `채움 끝 - (트랙 폭 - 필요 잼 영역)`까지 키워 숫자의 오른쪽 끝이 필요 잼 영역 왼쪽에서 멈추게 한다.
 */
export function insideNumberRightPaddingPx(
  innerWidthPx: number,
  ratio: number,
  requiredCharCount: number = 0,
  requiredCharWidthPx: number = NUMBER_REQUIRED_CHAR_WIDTH_PX
): number {
  if (!(innerWidthPx > 0)) return NUMBER_FILL_END_GAP_PX
  const overlap = fillWidthPx(innerWidthPx, ratio) - (innerWidthPx - requiredReservedPx(requiredCharCount, requiredCharWidthPx))
  return Math.max(NUMBER_FILL_END_GAP_PX, overlap)
}

/**
 * 두 숫자가 한 트랙에 함께 들어가는가. 필요 잼 숫자와 함께 놓았을 때 모은 잼 숫자가 바깥 자리에 들어가면 들어간다.
 * 안쪽 자리가 되려면 채움이 안쪽 필요 길이 이상이어야 하고, 채움 끝이 필요 잼 영역에 닿아 클램프할 때는 클램프한 왼쪽 끝이 칩과 간격 밖에 있어야 한다.
 * 어느 쪽도 안 되면(채움이 짧아 안쪽에 못 두고 바깥 자리는 필요 잼 영역에 닿는 극단) 들어가지 않는다. 이때 호출부는 필요 잼 숫자를 그리지 않는다
 * (같은 수치를 트랙 접근성 라벨이 읽어 주므로 정보는 잃지 않는다). 폭을 모르거나 필요 잼 숫자가 없으면 들어간다.
 */
export function requiredNumberFits(
  innerWidthPx: number,
  ratio: number,
  charCount: number,
  charWidthPx: number = NUMBER_CHAR_WIDTH_PX,
  requiredCharCount: number = 0,
  requiredCharWidthPx: number = NUMBER_REQUIRED_CHAR_WIDTH_PX
): boolean {
  if (!(innerWidthPx > 0) || !(requiredCharCount > 0)) return true
  if (collectedNumberPlacement(innerWidthPx, ratio, charCount, charWidthPx, requiredCharCount, requiredCharWidthPx) === 'outside') return true
  const fillEnd = fillWidthPx(innerWidthPx, ratio)
  if (fillEnd < insideNumberNeededPx(charCount, charWidthPx)) return false
  const reservedLeft = innerWidthPx - requiredReservedPx(requiredCharCount, requiredCharWidthPx)
  if (fillEnd - NUMBER_FILL_END_GAP_PX <= reservedLeft) return true
  return reservedLeft - charCount * charWidthPx >= CHAPTER_CHIP_WIDTH_PX + NUMBER_CHIP_GAP_PX
}

export type RequiredNumberCover = 'none' | 'partial' | 'full'

/**
 * 채움이 필요 잼 숫자를 덮는 정도. 숫자는 트랙 안 오른쪽 끝(여백 12)에 있다.
 * 렌더링에는 `data-` 속성과 시험에만 쓴다(글자색은 클리핑 복사본이 하드 컷으로 바꾼다). 숫자가 없으면(0자)·폭을 모르면 `none`이다.
 */
export function requiredNumberCover(
  innerWidthPx: number,
  ratio: number,
  requiredCharCount: number,
  requiredCharWidthPx: number = NUMBER_REQUIRED_CHAR_WIDTH_PX
): RequiredNumberCover {
  if (!(innerWidthPx > 0) || !(requiredCharCount > 0)) return 'none'
  const end = innerWidthPx - REQUIRED_NUMBER_END_GAP_PX
  const start = end - requiredCharCount * requiredCharWidthPx
  const fillEnd = fillWidthPx(innerWidthPx, ratio)
  if (fillEnd <= start) return 'none'
  return fillEnd >= end ? 'full' : 'partial'
}

/** 같은 화면에서 값이 바뀔 때의 이동 시간(ms). 옮길 거리에 비례해 늘리되 700~1500ms 안에 둔다 */
export function moveDurationMs(fromRatio: number, toRatio: number): number {
  const distance = Math.abs(clamp(toRatio, 0, 1) - clamp(fromRatio, 0, 1))
  return Math.round(clamp(MOVE_MIN_MS + distance * (MOVE_MAX_MS - MOVE_MIN_MS), MOVE_MIN_MS, MOVE_MAX_MS))
}
