/** 배경테마 제너레이터 스파이크 — 공용 타입 (20260819_001) */

export type Mode = 'pattern' | 'animation'

/**
 * 실제 서비스에서 배경테마가 적용되는 앱 컬럼 폭(px) — `(main)/layout.tsx`의
 * `max-w-[430px] mx-auto`, `badges/[id]/page.tsx`의 고정 배경 레이어와 동일한 값.
 * 패턴 모드의 렌더링 좌표계(타일 캔버스 계산, 평면화 출력 크기)는 스파이크 UI의 임의 프리뷰
 * 박스 크기가 아니라 항상 이 값을 기준으로 삼는다 (20260819_006).
 */
export const SERVICE_WIDTH = 430

export interface PatternParams {
  /** 오프셋 — 행 사이 간격 (px, 세로 방향 여백) */
  rowGap: number
  /** 오프셋 — 열 사이 간격 (px, 가로 방향 여백) */
  colGap: number
  /** 대칭반복(mirror) — 격자를 2x2로 뒤집어 이어붙인다 */
  mirror: boolean
  /**
   * 이미지 크기 — 실제 서비스 폭(SERVICE_WIDTH) 기준 절대 px 값. "이 이미지가 실제 화면에서
   * 몇 px로 보일지"를 직접 의미한다(상대 배율이 아니다). 그리드 수 개념은 폐지됐다(20260819_006)
   * — 반복 개수는 (SERVICE_WIDTH + colGap) / (imageSize + colGap)로 자연 파생될 뿐, 별도 상태로
   * 관리하지 않는다.
   */
  imageSize: number
  /** 행 스태거(벽돌쌓기) — 홀수 행을 가로로 절반 밀어서 배치 */
  rowStagger: boolean
  /** 열 스태거(벽돌쌓기) — 홀수 열을 세로로 절반 밀어서 배치 */
  colStagger: boolean
  /** 이미지 회전 (deg) */
  rotation: number
}

/** 기본 이미지 크기 = "가로로 5개가 들어가는 크기" = SERVICE_WIDTH ÷ 5 (20260819_006 확정) */
export const DEFAULT_PATTERN_PARAMS: PatternParams = {
  rowGap: 0,
  colGap: 0,
  mirror: false,
  imageSize: SERVICE_WIDTH / 5,
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
