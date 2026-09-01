/**
 * 배지·컬렉션 이미지 카드 배경 블롭(blob) 애니메이션 — 파라미터 정의 + Canvas 2D 렌더러
 * (티켓 20260901_1944)
 *
 * 기존 배경 시스템(background_color / background_image_url / background_video_url)이 **상세화면
 * 전체를 덮는 고정 배경 레이어**에 그려지는 것과 달리, 이 애니메이션은 이미지가 놓인 **정사각형
 * Hero 카드 안**에서만 실행된다(사용자 확정 설계).
 *
 * 티켓 20260819_012의 애니메이션 배경(어드민에서 MP4로 굽고 `<video>`로 재생)과도 다르다 —
 * 파라미터만 DB(jsonb)에 저장하고 서비스에서 Canvas 2D로 라이브 실행한다. 저장 후 재편집이
 * 가능하고, 영상 파일 다운로드가 없어 페이로드가 수백 바이트로 작다. 대신 `ctx.filter`의 blur가
 * 모바일에서 비용이 있어 성능 가드(reduced-motion·뷰포트 밖 정지·DPR 캡)를 렌더링 컴포넌트
 * (`BlobAnimationBackground`)가 반드시 함께 구현한다.
 *
 * 이 모듈은 React·DOM에 의존하지 않는 순수 모듈이라 서버 컴포넌트·어드민 폼·테스트가 모두
 * 그대로 import할 수 있다.
 */

/** 현재 지원하는 유일한 애니메이션 타입. 향후 타입이 늘어나도 컬럼을 늘리지 않기 위해 값에 담는다. */
export const BLOB_ANIMATION_TYPE = 'blob' as const

/** 블롭 하나를 구성하는 꼭짓점 수 (참조 스크립트 고정값) */
const BLOB_POINTS = 10

/** 화면에 동시에 떠 있는 블롭 개수 (참조 스크립트 고정값) */
const BLOB_COUNT = 6

/** 색상은 4개 고정 — 6개 블롭에 [c1, c2, c3, c4, c1, c2] 순으로 순환 배치된다. */
export const BLOB_COLOR_COUNT = 4

export interface BlobAnimationParams {
  type: typeof BLOB_ANIMATION_TYPE
  /** 블롭 색상 4개 (#rrggbb) */
  colors: string[]
  /** 블롭 뒤에 깔리는 카드 배경색 (#rrggbb) */
  bgColor: string
  speed: number
  seed: number
  blur: number
  scale: number
}

/** 어드민 슬라이더 범위 = 저장 시 클램프 범위. 두 곳이 어긋나지 않도록 한 곳에서 정의한다. */
export const BLOB_ANIMATION_RANGES = {
  speed: { min: 0.1, max: 5, step: 0.1 },
  seed: { min: 0, max: 100, step: 1 },
  blur: { min: 0.01, max: 0.8, step: 0.01 },
  scale: { min: 0.1, max: 1, step: 0.01 },
} as const

export const DEFAULT_BLOB_ANIMATION: BlobAnimationParams = {
  type: BLOB_ANIMATION_TYPE,
  colors: ['#ff6d30', '#a8aded', '#ffe5d1', '#ff4c00'],
  bgColor: '#ffffff',
  speed: 1,
  seed: 21,
  blur: 0.54,
  scale: 0.66,
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 유한한 number가 아니면(문자열·null·NaN 등) 기본값으로 되돌리고, 맞으면 범위로 클램프한다.
 * `Number(value)`로 강제 변환하지 않는다 — `Number(null)`은 0이라 `blur: null`이 기본값이 아니라
 * 최솟값 0.01로 눌리는 등 "값이 없음"과 "0"이 뒤섞인다.
 */
function normalizeNumber(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(value, range.min, range.max)
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback
}

/**
 * DB의 jsonb 값(`background_animation`)을 렌더링 가능한 파라미터로 정규화한다.
 *
 * 관용적으로 동작한다 — 값이 없거나 형식이 어긋나면 예외를 던지지 않고 `null`(애니메이션 없음)을
 * 반환하고, 개별 필드만 깨져 있으면 기본값으로 메운다. 배경은 장식이라 잘못된 데이터 하나로
 * 상세화면 전체가 죽으면 안 된다.
 */
export function parseBlobAnimation(value: unknown): BlobAnimationParams | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.type !== BLOB_ANIMATION_TYPE) return null

  const rawColors = Array.isArray(raw.colors) ? raw.colors : []
  const colors = Array.from({ length: BLOB_COLOR_COUNT }, (_, i) =>
    normalizeColor(rawColors[i], DEFAULT_BLOB_ANIMATION.colors[i])
  )

  return {
    type: BLOB_ANIMATION_TYPE,
    colors,
    bgColor: normalizeColor(raw.bgColor, DEFAULT_BLOB_ANIMATION.bgColor),
    speed: normalizeNumber(raw.speed, BLOB_ANIMATION_RANGES.speed, DEFAULT_BLOB_ANIMATION.speed),
    seed: Math.round(normalizeNumber(raw.seed, BLOB_ANIMATION_RANGES.seed, DEFAULT_BLOB_ANIMATION.seed)),
    blur: normalizeNumber(raw.blur, BLOB_ANIMATION_RANGES.blur, DEFAULT_BLOB_ANIMATION.blur),
    scale: normalizeNumber(raw.scale, BLOB_ANIMATION_RANGES.scale, DEFAULT_BLOB_ANIMATION.scale),
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/**
 * 유기적인 블롭 하나를 `quadraticCurveTo`로 부드럽게 그린다.
 * 세 주기의 sin/cos를 겹쳐 반지름을 흔들어 원이 아닌 형태를 만든다. 흔들림 합이 -1 아래로
 * 내려가면 반지름이 음수가 되어 형태가 뒤집히므로 `radius * 0.1`을 하한으로 둔다.
 */
function drawSmoothBlob(ctx: CanvasRenderingContext2D, radius: number, t: number, seed: number): void {
  const vertices: { x: number; y: number }[] = []
  for (let i = 0; i < BLOB_POINTS; i++) {
    const angle = (i / BLOB_POINTS) * Math.PI * 2
    const variance =
      Math.sin(angle * 2 + t * 1.3 + seed) * 0.4 +
      Math.cos(angle * 3 - t * 0.8 + seed * 2) * 0.2 +
      Math.sin(angle * 1.5 + t * 1.5 + seed * 3) * 0.15
    const r = Math.max(radius * 0.1, radius * (1 + variance))
    vertices.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
  }

  ctx.beginPath()
  let xc = (vertices[BLOB_POINTS - 1].x + vertices[0].x) / 2
  let yc = (vertices[BLOB_POINTS - 1].y + vertices[0].y) / 2
  ctx.moveTo(xc, yc)
  for (let i = 0; i < BLOB_POINTS; i++) {
    const next = (i + 1) % BLOB_POINTS
    xc = (vertices[i].x + vertices[next].x) / 2
    yc = (vertices[i].y + vertices[next].y) / 2
    ctx.quadraticCurveTo(vertices[i].x, vertices[i].y, xc, yc)
  }
  ctx.closePath()
  ctx.fill()
}

/**
 * 한 프레임을 캔버스 전체에 그린다. `width`/`height`는 캔버스 백킹 스토어 픽셀 크기다.
 *
 * 참조 스크립트에 있던 원형 aperture 마스크(aperture_size / edge_softness)는 채택하지 않았다 —
 * 카드 전체 영역을 채우도록 사용자가 요청했고, 카드의 라운드 클리핑은 호출부의
 * `overflow-hidden`이 담당한다.
 *
 * 배경색은 `destination-over`로 블롭을 그린 **뒤에** 깔아 블롭의 blur 가장자리가 배경색과 자연히
 * 섞이게 한다(먼저 칠하면 blur가 배경색까지 함께 번져 결과가 달라진다).
 */
export function drawBlobFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: BlobAnimationParams,
  elapsedMs: number
): void {
  const t = elapsedMs * 0.001 * params.speed * 0.5
  const { seed } = params
  const minDim = Math.min(width, height)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, width, height)

  // ctx.filter를 지원하지 않는 구형 브라우저에서는 대입이 무시돼 경계가 선명한 블롭이 그려진다
  // (렌더링이 깨지지는 않는다).
  ctx.filter = `blur(${params.blur * minDim * 0.15}px)`

  const positions = [
    { x: Math.sin(t + seed * 1.1), y: Math.cos(t * 0.7 + seed * 1.2) },
    { x: Math.cos(t * 0.8 + seed * 2.1), y: Math.sin(t * 1.1 + seed * 0.5) },
    { x: Math.sin(t * 0.9 + seed * 3.3), y: Math.sin(t * 0.6 + seed * 1.8) },
    { x: Math.cos(t * 1.2 + seed * 0.9), y: Math.cos(t * 0.5 + seed * 2.7) },
    { x: Math.sin(t * 1.5 + seed * 1.5), y: Math.cos(t * 0.9 + seed * 1.4) },
    { x: Math.cos(t * 0.6 + seed * 2.5), y: Math.sin(t * 1.3 + seed * 0.8) },
  ]
  // 색상 4개를 블롭 6개에 순환 배치
  const blobColors = [
    params.colors[0], params.colors[1], params.colors[2],
    params.colors[3], params.colors[0], params.colors[1],
  ]
  const baseRadius = minDim * params.scale * 0.35

  for (let i = 0; i < BLOB_COUNT; i++) {
    const cx = width / 2 + positions[i].x * minDim * 0.3
    const cy = height / 2 + positions[i].y * minDim * 0.3
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(t * (0.2 + i * 0.1) + seed * i)
    ctx.scale(
      1.0 + 0.5 * Math.sin(t * 0.8 + i * 2.1 + seed),
      1.0 + 0.5 * Math.cos(t * 0.9 + i * 1.7 + seed)
    )
    const c = hexToRgb(blobColors[i])
    ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.85)`
    drawSmoothBlob(ctx, baseRadius, t, seed + i * 10)
    ctx.restore()
  }

  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = params.bgColor
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'
}
