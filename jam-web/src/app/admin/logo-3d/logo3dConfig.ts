/**
 * 3D 로고 제너레이터 화면 — 상태 타입·기본값·순수 계산 (티켓 20261103_1352)
 *
 * 형상은 `@/lib/logo-3d`(buildLogoGeometry), 입력 변환은 같은 폴더의 fontToOutline·svgToOutline이 맡는다.
 * 여기에는 캔버스·WebGL에 기대지 않는 계산만 둔다 — 스테이지 크기, 등각 카메라, 배경 칠하기 계획, 팔레트, 드래그·휠 계산.
 * 스테이지 3모드와 비율은 어드민 에셋(`assets/shapeStudioConfig.ts`)의 `BackgroundMode`·`CanvasRatio`와 같은 형태다.
 */
import { resolveStageSize } from '@/app/admin/asset-generator/assetGeneratorHelpers'
import type { BackgroundMode, CanvasRatio } from '@/app/admin/assets/shapeStudioConfig'
import { DEFAULT_LOGO3D_PARAMS, type Logo3DParams } from '@/lib/logo-3d/types'

export type { BackgroundMode, CanvasRatio }

export type Logo3DSource = 'font' | 'svg'
export type Logo3DView = 'perspective' | 'isometric'

export type Logo3DState = {
  // 입력
  source: Logo3DSource
  fontFamily: string
  fontWeight: number
  text: string
  svgText: string
  svgName: string
  // 형상 (1번 티켓의 Logo3DParams 그대로)
  params: Logo3DParams
  // 색
  paletteId: string
  frameColor: string
  tileColor: string
  // 회전(도), 줌(%), 시점
  rotX: number
  rotY: number
  rotZ: number
  zoom: number
  view: Logo3DView
  // 스테이지 (어드민 에셋의 bgMode·bgA·bgB·bgAngle과 같은 의미, 각도는 도)
  bgMode: BackgroundMode
  bgA: string
  bgB: string
  bgAngle: number
  ratio: CanvasRatio
}

export type Logo3DPalette = { id: string; name: string; frame: string; tile: string }

/** 프리셋 팔레트. 틀(금속) 색과 타일(도자기) 색의 쌍이다. 첫 항목이 기본값이다. */
export const PALETTES: readonly Logo3DPalette[] = [
  { id: 'steel-sky', name: '스틸 · 하늘', frame: '#9ba3ab', tile: '#7cc4f0' },
  { id: 'steel-mint', name: '스틸 · 민트', frame: '#9ba3ab', tile: '#7fdcc0' },
  { id: 'steel-rose', name: '스틸 · 로즈', frame: '#a3a0a6', tile: '#f4a3b8' },
  { id: 'gold-cream', name: '골드 · 크림', frame: '#c9a24a', tile: '#f6ecd6' },
  { id: 'graphite-lime', name: '그래파이트 · 라임', frame: '#4b5057', tile: '#c4e56a' },
  { id: 'copper-navy', name: '코퍼 · 네이비', frame: '#b8764f', tile: '#3d5a9e' },
]

/** 어드민 에셋 `INITIAL_STATE`의 배경 각도 기본값과 같다. */
export const DEFAULT_BG_ANGLE = 0

export const DEFAULT_LOGO3D_STATE: Logo3DState = {
  source: 'font',
  fontFamily: 'Poppins',
  fontWeight: 700,
  text: 'JAM',
  svgText: '',
  svgName: '',
  params: { ...DEFAULT_LOGO3D_PARAMS },
  paletteId: PALETTES[0].id,
  frameColor: PALETTES[0].frame,
  tileColor: PALETTES[0].tile,
  rotX: 14,
  rotY: 22,
  rotZ: 3,
  zoom: 100,
  view: 'perspective',
  bgMode: 'gradient',
  bgA: '#d4eefc',
  bgB: '#5fb4ea',
  bgAngle: DEFAULT_BG_ANGLE,
  ratio: '1:1',
}

export const ROTATION_RANGE = { min: -180, max: 180, step: 1 } as const
export const ZOOM_RANGE = { min: 30, max: 300, step: 1 } as const
export const BG_ANGLE_RANGE = { min: -180, max: 180, step: 1 } as const
export const TEXT_MAX_LENGTH = 24

export const FONT_WEIGHT_OPTIONS: readonly number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900]

export const RATIO_OPTIONS: readonly CanvasRatio[] = ['1:1', '4:5', '9:16', '16:9']

export const BACKGROUND_MODE_OPTIONS: readonly { value: BackgroundMode; label: string }[] = [
  { value: 'gradient', label: 'Gradient' },
  { value: 'solid', label: 'Solid' },
  { value: 'transparent', label: 'Transparent' },
]

/** 모드별로 쓰는 배경 입력. 쓰지 않는 입력은 화면에서 비활성이다. */
export function backgroundInputsFor(mode: BackgroundMode): { bgA: boolean; bgB: boolean; bgAngle: boolean } {
  switch (mode) {
    case 'gradient':
      return { bgA: true, bgB: true, bgAngle: true }
    case 'solid':
      return { bgA: true, bgB: false, bgAngle: false }
    case 'transparent':
      return { bgA: false, bgB: false, bgAngle: false }
  }
}

/** PNG 크기. 어드민 에셋·에셋 제너레이터와 같은 긴 변 고정 규칙(`resolveStageSize`)을 쓴다. */
export function stageSizeFor(ratio: CanvasRatio): { width: number; height: number } {
  return resolveStageSize(ratio)
}

// ───── 시점 ─────

/** 정확한 등각 투영의 고도: atan(1/√2) ≈ 35.264° */
export const ISOMETRIC_ELEVATION_DEG = (Math.atan(1 / Math.SQRT2) * 180) / Math.PI
export const ISOMETRIC_AZIMUTH_DEG = 45

export type CameraPose = {
  kind: 'perspective' | 'orthographic'
  /** 위쪽(y)을 축으로 한 방위각. 0이면 정면(+z)에서 본다 */
  azimuthDeg: number
  /** 수평면에서 올려다보는 각 */
  elevationDeg: number
  /** 대상(원점)에서 카메라까지의 방향 단위벡터 */
  direction: [number, number, number]
}

function directionOf(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
}

/** 등각 시점: 방위각 45°, 고도 약 35.264°의 직교 투영. 세 축이 화면에서 같은 비율로 줄어든다. */
export function isometricCameraPose(): CameraPose {
  return {
    kind: 'orthographic',
    azimuthDeg: ISOMETRIC_AZIMUTH_DEG,
    elevationDeg: ISOMETRIC_ELEVATION_DEG,
    direction: directionOf(ISOMETRIC_AZIMUTH_DEG, ISOMETRIC_ELEVATION_DEG),
  }
}

/** 원근 시점: 정면에서 본다. 보는 각도는 로고 회전으로 정한다. */
export function perspectiveCameraPose(): CameraPose {
  return { kind: 'perspective', azimuthDeg: 0, elevationDeg: 0, direction: directionOf(0, 0) }
}

export function cameraPoseFor(view: Logo3DView): CameraPose {
  return view === 'isometric' ? isometricCameraPose() : perspectiveCameraPose()
}

/** 구(반지름 radius)가 화면에 들어오도록 하는 원근 카메라 거리. zoom 100%일 때의 값이다. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 1.12): number {
  const vHalf = (fovDeg * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * aspect)
  return (radius * margin) / Math.sin(Math.min(vHalf, hHalf))
}

/** 구가 화면에 들어오는 직교 카메라의 가로·세로 절반 길이. zoom 100%일 때의 값이다. */
export function orthoHalfExtent(radius: number, aspect: number, margin = 1.12): { halfW: number; halfH: number } {
  const r = radius * margin
  return aspect >= 1 ? { halfW: r * aspect, halfH: r } : { halfW: r, halfH: r / aspect }
}

/** 컨테이너 안에 비율을 지키며 들어가는 가장 큰 상자(px). 여백은 padding. */
export function fitBox(
  containerW: number,
  containerH: number,
  ratio: CanvasRatio,
  padding = 24
): { width: number; height: number } {
  const stage = stageSizeFor(ratio)
  const availW = Math.max(1, containerW - padding * 2)
  const availH = Math.max(1, containerH - padding * 2)
  const scale = Math.min(availW / stage.width, availH / stage.height)
  return { width: Math.max(1, Math.floor(stage.width * scale)), height: Math.max(1, Math.floor(stage.height * scale)) }
}

// ───── 회전·줌 입력 ─────

/** -180~180 범위로 되감는다. */
export function wrapDegrees(value: number): number {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180
  return Object.is(wrapped, -0) ? 0 : wrapped
}

export function clampZoom(value: number): number {
  return Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, value))
}

/** 마우스 드래그(px)를 회전각으로 바꾼다. 가로 드래그는 y축, 세로 드래그는 x축을 돌린다. */
export const DRAG_DEGREES_PER_PIXEL = 0.5

export function applyDragRotation(
  rot: { rotX: number; rotY: number },
  dxPx: number,
  dyPx: number
): { rotX: number; rotY: number } {
  return {
    rotX: Math.round(wrapDegrees(rot.rotX + dyPx * DRAG_DEGREES_PER_PIXEL)),
    rotY: Math.round(wrapDegrees(rot.rotY + dxPx * DRAG_DEGREES_PER_PIXEL)),
  }
}

/** 휠 한 칸(deltaY)을 줌으로 바꾼다. 위로 굴리면(deltaY < 0) 확대한다. */
export function zoomFromWheel(zoom: number, deltaY: number): number {
  return Math.round(clampZoom(zoom * Math.exp(-deltaY * 0.001)))
}

// ───── 배경 ─────

export type BackgroundPlan =
  | { kind: 'transparent' }
  | { kind: 'solid'; color: string }
  | {
      kind: 'gradient'
      /** 캔버스 좌표(y 아래쪽)의 시작·끝점 */
      x0: number
      y0: number
      x1: number
      y1: number
      stops: { offset: number; color: string }[]
    }

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  const c = ra.map((v, i) => Math.round(v + (rb[i] - v) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const GRADIENT_STOP_COUNT = 9

/**
 * 모드별 배경 칠하기 계획. 그라데이션은 어드민 에셋 셰이더와 같은 규칙이다.
 * 각도 0°면 왼쪽(A) → 오른쪽(B)이고 양수는 반시계 방향(화면 위쪽)으로 돈다.
 * 시작·끝점은 화면 중심에서 긴 변 길이의 절반만큼 떨어진 곳이고, 색은 smoothstep으로 섞는다.
 */
export function composeBackground(
  mode: BackgroundMode,
  bgA: string,
  bgB: string,
  angleDeg: number,
  width: number,
  height: number
): BackgroundPlan {
  if (mode === 'transparent') return { kind: 'transparent' }
  if (mode === 'solid') return { kind: 'solid', color: bgA }
  const angle = (angleDeg * Math.PI) / 180
  const dx = Math.cos(angle)
  const dy = -Math.sin(angle)
  const half = Math.max(width, height) / 2
  const cx = width / 2
  const cy = height / 2
  const stops = Array.from({ length: GRADIENT_STOP_COUNT }, (_, i) => {
    const t = i / (GRADIENT_STOP_COUNT - 1)
    return { offset: t, color: mixHex(bgA, bgB, t * t * (3 - 2 * t)) }
  })
  return { kind: 'gradient', x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half, stops }
}

// ───── 파일명 ─────

/** `logo-3d-{글자열 앞부분}-{ratio}.png`. 비율의 `:`는 파일명에 쓸 수 없는 환경이 있어 `x`로 바꾼다. */
export function logo3dFileName(label: string, ratio: CanvasRatio): string {
  const head = Array.from(label.normalize('NFC'))
    .filter((ch) => /[\p{L}\p{N}_-]/u.test(ch))
    .slice(0, 12)
    .join('')
  return `logo-3d-${head || 'logo'}-${ratio.replace(':', 'x')}.png`
}
