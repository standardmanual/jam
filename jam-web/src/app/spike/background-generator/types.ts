/** 배경테마 제너레이터 스파이크 — 공용 타입 (20260819_001) */

export type Mode = 'pattern' | 'animation'

export interface PatternParams {
  /** X축 그리드 반복 수 */
  gridX: number
  /** Y축 그리드 반복 수 */
  gridY: number
  /** 오프셋 — 행 사이 간격 (px, 세로 방향 여백) */
  rowGap: number
  /** 오프셋 — 열 사이 간격 (px, 가로 방향 여백) */
  colGap: number
  /** 대칭반복(mirror) — 격자를 2x2로 뒤집어 이어붙인다 */
  mirror: boolean
  /** 이미지 크기 배율 */
  imageScale: number
  /** 행 스태거(벽돌쌓기) — 홀수 행을 가로로 절반 밀어서 배치 */
  rowStagger: boolean
  /** 열 스태거(벽돌쌓기) — 홀수 열을 세로로 절반 밀어서 배치 */
  colStagger: boolean
  /** 이미지 회전 (deg) */
  rotation: number
}

export const DEFAULT_PATTERN_PARAMS: PatternParams = {
  gridX: 4,
  gridY: 4,
  rowGap: 0,
  colGap: 0,
  mirror: false,
  imageScale: 1,
  rowStagger: false,
  colStagger: false,
  rotation: 0,
}

export interface AnimationParams {
  /** 슬라이스(타일) 수 — 원본(kaleidoscope.js) numTilesInput 범위 그대로: 2~25 */
  numTiles: number
  /** 애니메이션 속도 — 원본 speedInput 범위 그대로: 1~15 */
  speed: number
}

export const DEFAULT_ANIMATION_PARAMS: AnimationParams = {
  numTiles: 5,
  speed: 3,
}

export type FilterId =
  | 'none'
  | 'fluted-glass'
  | 'image-dithering'
  | 'halftone-dots'
  | 'halftone-cmyk'
  | 'lens-distortion'

export const FILTER_LABELS: Record<FilterId, string> = {
  none: '없음',
  'fluted-glass': 'Fluted Glass',
  'image-dithering': 'Image Dithering',
  'halftone-dots': 'Halftone Dots',
  'halftone-cmyk': 'Halftone CMYK',
  'lens-distortion': 'Lens Distortion',
}
