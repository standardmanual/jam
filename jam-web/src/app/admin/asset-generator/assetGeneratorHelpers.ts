/**
 * JAM! 에셋 제너레이터 어드민 화면 — 기본값·슬라이더 범위·파일명 규칙 (티켓 20260924_2156)
 *
 * 그리기 자체(곡선·스탬프·레이어 합성)는 `jam-web/src/lib/asset-generator/`(티켓 20260924_2155)를
 * 그대로 쓴다. 여기는 그 모듈을 어드민 화면에 붙이는 데 필요한, 캔버스에 의존하지 않는 순수
 * 계산·상수만 둔다 — 테스트는 `__tests__/assetGeneratorHelpers.test.ts`.
 *
 * 원본: jam-doc/assets/prototypes/20260924_jam-asset-generator.html
 * (state 초깃값 161~167줄, applyAspect 302줄, readSeconds 515줄, fileName 503줄,
 * MUXER_URL·MUXER_SRI 492~493줄).
 */
import type { GradientDirection, LetterKey, RibbonLayerConfig, StageRatio } from '@/lib/asset-generator'

/** 스테이지 긴 변 고정 길이(px). 원본 MAX_LONG. */
export const STAGE_MAX_LONG_SIDE_PX = 1280

/** 비율별 스테이지 크기 (원본 applyAspect). */
export function resolveStageSize(ratio: StageRatio): { width: number; height: number } {
  if (ratio === '1:1') return { width: STAGE_MAX_LONG_SIDE_PX, height: STAGE_MAX_LONG_SIDE_PX }
  if (ratio === '4:5') return { width: (STAGE_MAX_LONG_SIDE_PX * 4) / 5, height: STAGE_MAX_LONG_SIDE_PX }
  return { width: Math.round((STAGE_MAX_LONG_SIDE_PX * 9) / 16), height: STAGE_MAX_LONG_SIDE_PX }
}

export const STAGE_RATIO_OPTIONS: { value: StageRatio; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '9:16', label: '9:16' },
]

export const GRADIENT_DIRECTION_OPTIONS: { value: GradientDirection; label: string }[] = [
  { value: 'h', label: '좌 → 우' },
  { value: 'v', label: '상 → 하' },
  { value: 'r', label: '중심 → 바깥' },
]

export const LETTER_KEYS: readonly LetterKey[] = ['J', 'A', 'M']

export const INITIAL_STAGE_RATIO: StageRatio = '1:1'

/** 원본 state 초깃값(161~167줄)과 같다. */
export const INITIAL_RIBBON_LAYER: RibbonLayerConfig = {
  type: 'ribbon',
  source: { kind: 'letter', letter: 'J' },
  sizePct: 22,
  blurPct: 0,
  rotationDeg: 0,
  followPath: false,
  direction: 'h',
  backgroundColor: '#ff1a00',
  startColor: '#ff1a00',
  endColor: '#ff4dff',
  linkStartToBackground: true,
  irregularityPct: 35,
  seed: 7,
  speed: 1500,
  gap: 14,
  count: 260,
}

interface SliderRange {
  min: number
  max: number
  step: number
}

export const SIZE_RANGE: SliderRange = { min: 5, max: 100, step: 1 }
export const BLUR_RANGE: SliderRange = { min: 0, max: 100, step: 1 }
export const ROTATION_RANGE: SliderRange = { min: -180, max: 180, step: 1 }
export const IRREGULARITY_RANGE: SliderRange = { min: 0, max: 100, step: 1 }
export const SPEED_RANGE: SliderRange = { min: 1000, max: 2000, step: 10 }
export const GAP_RANGE: SliderRange = { min: 2, max: 120, step: 1 }
export const COUNT_RANGE: SliderRange = { min: 200, max: 800, step: 5 }
export const HEAD_POSITION_RANGE: SliderRange = { min: 0, max: 100, step: 0.1 }

export const formatPercent = (value: number): string => `${value}%`
export const formatDegree = (value: number): string => `${value}°`
export const formatPxPerSecond = (value: number): string => `${value}px/s`
export const formatPx = (value: number): string => `${value}px`
export const formatCount = (value: number): string => `${value}개`

/** 시작 색 실제 값(PRD §6): 연결이 켜져 있으면 배경색을 그대로 따른다. */
export function computeEffectiveStartColor(
  layer: Pick<RibbonLayerConfig, 'linkStartToBackground' | 'backgroundColor' | 'startColor'>
): string {
  return layer.linkStartToBackground ? layer.backgroundColor : layer.startColor
}

/** 곡선 시드를 새로 뽑는다("무작위" 버튼, 원본 reseed 클릭 처리 398줄). */
export function generateRandomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 1e9)
}

/** 영상 길이(초) 입력값 보정(원본 readSeconds, 515줄): 1~60초로 자르고 정수로 반올림한다. */
export function clampDurationSeconds(raw: number): number {
  const base = Number.isFinite(raw) && raw > 0 ? raw : 5
  return Math.min(60, Math.max(1, Math.round(base)))
}

export const DEFAULT_VIDEO_DURATION_SECONDS = 5

export const VIDEO_FPS = 60
export const VIDEO_BITRATE_BPS = 12_000_000
export const H264_CODEC_CANDIDATES = ['avc1.64002A', 'avc1.4D002A', 'avc1.42002A'] as const

/** MP4 묶음 라이브러리(mp4-muxer, MIT). 프로토타입(492~493줄)과 같은 버전·무결성 해시를 그대로 쓴다. */
export const MP4_MUXER_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js'
export const MP4_MUXER_SCRIPT_INTEGRITY = 'sha384-wr0AQH9RBAKio/g7bHM5245MBCU5B/b0Y9u42cTxRYQQJXKEijZvWEJKL9JG26hs'

/** 저장 파일명(원본 fileName, 503줄): jam-asset_{비율}_{yyyyMMdd-HHmmss}.{ext} */
export function buildExportFileName(ratio: StageRatio, ext: string, date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `jam-asset_${ratio.replace(':', 'x')}_${stamp}.${ext}`
}
