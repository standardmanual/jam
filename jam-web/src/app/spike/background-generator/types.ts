/** 배경테마 제너레이터 스파이크 — 공용 타입 (20260819_001) */

export type Mode = 'pattern' | 'animation'

export interface PatternParams {
  /** X축 그리드 반복 수 */
  gridX: number
  /** Y축 그리드 반복 수 */
  gridY: number
  /** 가로 오프셋 (px) */
  offsetX: number
  /** 세로 오프셋 (px) */
  offsetY: number
  /** 대칭반복(mirror) — 격자를 2x2로 뒤집어 이어붙인다 */
  mirror: boolean
  /** 이미지 크기 배율 */
  imageScale: number
  /** 타일 간 간격 (px) */
  gap: number
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
  offsetX: 0,
  offsetY: 0,
  mirror: false,
  imageScale: 1,
  gap: 0,
  rowStagger: false,
  colStagger: false,
  rotation: 0,
}

export interface AnimationParams {
  brushSize: number
  brushDensity: number
  opacity: number
  speed: number
}

export const DEFAULT_ANIMATION_PARAMS: AnimationParams = {
  brushSize: 120,
  brushDensity: 8,
  opacity: 60,
  speed: 12,
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
