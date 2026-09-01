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

/**
 * 어드민 슬라이더 범위 = 저장 시 클램프 범위. 두 곳이 어긋나지 않도록 한 곳에서 정의한다.
 *
 * speed는 원래 0.1~5였다. 선형 슬라이더에 50배 범위라 쓸모 있는 구간이 중앙에 뭉쳐 있었고,
 * 0.1은 한 바퀴가 약 126초라 사실상 정지로 보였다. 0.25~2.5(10배)로 좁혀 슬라이더 전 구간이
 * 의미를 갖게 한다. 범위 밖으로 이미 저장된 값이 있어도 `parseBlobAnimation`이 이 범위로
 * 클램프하므로 렌더링·슬라이더가 어긋나지 않는다.
 */
export const BLOB_ANIMATION_RANGES = {
  speed: { min: 0.25, max: 2.5, step: 0.05 },
  seed: { min: 0, max: 100, step: 1 },
  blur: { min: 0.01, max: 0.8, step: 0.01 },
  scale: { min: 0.1, max: 1, step: 0.01 },
} as const

export const DEFAULT_BLOB_ANIMATION: BlobAnimationParams = {
  type: BLOB_ANIMATION_TYPE,
  colors: ['#ff6d30', '#a8aded', '#ffe5d1', '#ff4c00'],
  // 카드 안 텍스트(배지명·희귀도)는 `--color-text`(= #ffffff)라, 기본 배경색이 흰색이면
  // '애니메이션'을 고르는 즉시 배지명이 사라졌다. #555555는 흰 텍스트와 명도대비 약 7.46:1로
  // WCAG AA·AAA를 통과하고, 서비스가 다크 테마인데 기본값만 라이트였던 불일치도 함께 없앤다.
  // 블롭 팔레트 4색은 사용자가 지정한 브랜드 색이라 그대로 둔다.
  bgColor: '#555555',
  speed: 1,
  seed: 21,
  blur: 0.54,
  scale: 0.66,
}

/**
 * 애니메이션 위상 t가 1초에 얼마나 나아가는지(rad/s). 렌더러와 주기 계산이 같은 값을 쓰도록
 * 한 곳에 둔다.
 */
export const BLOB_PHASE_RATE = 0.5

/**
 * 저작자가 대략적인 체감 속도를 가늠하도록 슬라이더 라벨에 노출하는 "한 바퀴" 시간(초).
 *
 * 실제 궤도는 무리수 배 하모닉이 겹쳐 정확히 닫히지 않지만(아래 `axisWobble` 참조), 기본
 * 주파수가 1.0인 블롭 기준 2π rad을 도는 데 걸리는 시간이 체감 주기와 가장 가깝다.
 */
export function blobCycleSeconds(speed: number): number {
  return (2 * Math.PI) / (BLOB_PHASE_RATE * speed)
}

/**
 * `prefers-reduced-motion: reduce` 환경의 정지 프레임에서 쓰는 고정 위상.
 *
 * 예전에는 이 정지 프레임이 항상 t=0이었다. t=0은 모든 블롭의 하모닉 위상이 seed에만 의존해
 * 시드에 따라 6개가 한곳에 뭉치는 구도가 나왔고, 저작자가 그 화면을 미리 확인할 방법도 없었다.
 * 궤도가 충분히 흩어진 시점 하나를 고정값으로 잡아 항상 같은 구도를 보장한다.
 *
 * (감속 후 정지는 이 값을 쓰지 않는다 — 방금까지 움직이던 위상 그대로 멈춰야 자연스럽다.)
 */
export const BLOB_STILL_T = 6

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
  if (raw.type !== BLOB_ANIMATION_TYPE) {
    // 값은 들어 있는데 타입만 모르는 경우 — 조용히 null을 돌려주면 애니메이션이 사라지는 동시에
    // 전체 배경 레이어(CSS·영상)가 예고 없이 되살아난다. 원인을 화면만 보고 짚기 어려우므로
    // 개발 모드에서만 로그를 남긴다(프로덕션 콘솔은 오염시키지 않는다).
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[blobAnimation] 알 수 없는 배경 애니메이션 타입이라 무시했어요:', raw.type)
    }
    return null
  }

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
 * 세 주기의 sin/cos를 겹쳐 반지름을 흔들어 원이 아닌 형태를 만든다.
 *
 * `radius * 0.1` 하한은 **현재 상수 조합에서는 한 번도 발동하지 않는다** — 세 항의 진폭 합이
 * 0.4+0.2+0.15 = 0.75라 `1 + variance`의 최솟값이 0.25이기 때문이다(예전 주석은 이 하한이
 * 실제로 형태 뒤집힘을 막고 있는 것처럼 읽혔다). 그럼에도 남겨두는 이유는, 진폭 상수를 나중에
 * 키웠을 때 합이 1을 넘으면 반지름이 음수가 되어 형태가 안팎으로 뒤집히기 때문이다. 즉 지금은
 * 동작하지 않는 방어선이고, 상수를 손댈 때만 의미를 갖는다.
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

/** 황금비 — 2차 하모닉의 주파수 배수. 무리수라 두 성분의 궤도가 영원히 닫히지 않는다. */
const PHI = 1.618033988749895

const HALF_PI = Math.PI / 2

/**
 * 한 축(x 또는 y)의 이동 성분.
 *
 * 예전에는 축마다 순수 sin/cos 하나였다. 그러면 각 블롭이 눈에 보이는 8자·타원 레일 위를
 * 왕복하고, 6개가 같은 t를 공유해 은근히 동기화된 채 같은 구도로 되돌아온다("루프감").
 * 기본 주파수에 **무리수 배(황금비) 2차 하모닉**을 0.35 비중으로 겹치면 두 성분의 주기가
 * 공약수를 갖지 않아 궤도가 닫히지 않는다. 진폭 합은 0.65 + 0.35 = 1.0으로 예전과 같아
 * 블롭이 카드 밖으로 더 나가지 않는다.
 */
function axisWobble(t: number, freq: number, phase: number): number {
  return 0.65 * Math.sin(freq * t + phase) + 0.35 * Math.sin(PHI * freq * t + phase * 1.7 + 0.9)
}

/**
 * 블롭 6개의 궤도 상수 — `f`는 기본 주파수, `s`는 seed 배수, `o`는 고정 위상 오프셋이다.
 * 예전 구현의 `sin`/`cos` 쌍을 그대로 옮긴 것으로(cos = sin + π/2), 블롭별 배치 성격은 유지하고
 * 하모닉만 얹었다.
 */
const BLOB_ORBITS: { fx: number; sx: number; ox: number; fy: number; sy: number; oy: number }[] = [
  { fx: 1.0, sx: 1.1, ox: 0, fy: 0.7, sy: 1.2, oy: HALF_PI },
  { fx: 0.8, sx: 2.1, ox: HALF_PI, fy: 1.1, sy: 0.5, oy: 0 },
  { fx: 0.9, sx: 3.3, ox: 0, fy: 0.6, sy: 1.8, oy: 0 },
  { fx: 1.2, sx: 0.9, ox: HALF_PI, fy: 0.5, sy: 2.7, oy: HALF_PI },
  { fx: 1.5, sx: 1.5, ox: 0, fy: 0.9, sy: 1.4, oy: HALF_PI },
  { fx: 0.6, sx: 2.5, ox: HALF_PI, fy: 1.3, sy: 0.8, oy: 0 },
]

/**
 * 축별 스케일 펄스 진폭. 예전 값 0.5는 극점에서 X 0.5배 / Y 1.5배까지 벌어져 "호흡"이 아니라
 * "펌핑"으로 읽혔다. 0.28로 낮춘다.
 */
const BLOB_PULSE = 0.28

/**
 * 두 축 펄스의 위상차(rad). 예전에는 sin/cos 조합이라 정확히 π/2(≈1.571)로 어긋나 X가 줄면
 * Y가 커지는 반대 위상이 됐다. π/2보다 좁은 1.0으로 두면 두 축이 살짝 커플링돼 형태가 함께
 * 부풀었다 줄어드는 호흡에 가까워진다.
 */
const BLOB_PULSE_AXIS_PHASE = 1.0

/**
 * 블롭 채움 알파. 예전 0.85는 6개가 겹칠수록 색이 탁해져 팔레트가 죽었다. 0.7로 낮춰
 * 겹침부에서 아래 색이 비쳐 보이게 한다.
 */
const BLOB_ALPHA = 0.7

/**
 * 오프스크린 축소 배율 — 블롭은 이 비율로 줄인 캔버스에 그린 뒤 확대 합성한다(G1).
 * `ctx.filter`의 blur는 반경 제곱에 비례하는 비용이 프레임당 6번 든다(blur 0.8·DPR 2·430px면
 * 반경 약 103px × 6회). 1/3 해상도에서는 반경도 1/3이라 비용이 약 1/9로 떨어진다. 결과물이
 * 어차피 강한 블러라 확대해도 육안 차이가 사실상 없다.
 */
const BLOB_SCRATCH_SCALE = 1 / 3

export interface BlobFrameOptions {
  /**
   * `prefers-contrast: more` — 블롭을 그리지 않고 배경색 단색으로 평탄화한다. 카드 안 텍스트가
   * 변하는 배경 대신 고정 단색 위에 놓여 대비가 항상 보장된다.
   */
  flatten?: boolean
  /**
   * `prefers-reduced-transparency: reduce` — 블롭 알파를 1.0으로 올리고 blur를 절반으로 줄여
   * 반투명·흐림 표현을 최소화한다.
   */
  opaque?: boolean
  /**
   * 블롭을 축소 렌더링할 오프스크린 캔버스(G1). 넘기지 않으면 예전처럼 대상 캔버스에 직접
   * 그린다 — 테스트·SSR 등 `document`를 쓸 수 없는 환경을 위한 폴백이다.
   */
  scratch?: HTMLCanvasElement | null
}

/** 오프스크린 캔버스를 목표 크기의 1/3로 맞추고 컨텍스트를 돌려준다. */
function prepareScratch(
  scratch: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null {
  const w = Math.max(1, Math.round(width * BLOB_SCRATCH_SCALE))
  const h = Math.max(1, Math.round(height * BLOB_SCRATCH_SCALE))
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w
    scratch.height = h
  }
  return scratch.getContext('2d')
}

/**
 * 투명 배경 위에 블롭 6개만 그린다. blur 반경·반지름이 모두 `minDim` 비례라, 이 함수를 1/3
 * 크기 캔버스에 그대로 호출하면 blur까지 함께 1/3로 줄어든다(별도 보정 불필요).
 */
function paintBlobs(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: BlobAnimationParams,
  t: number,
  opaque: boolean
): void {
  const { seed } = params
  const minDim = Math.min(width, height)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, width, height)

  // ctx.filter를 지원하지 않는 구형 브라우저에서는 대입이 무시돼 경계가 선명한 블롭이 그려진다
  // (렌더링이 깨지지는 않는다).
  ctx.filter = `blur(${params.blur * minDim * 0.15 * (opaque ? 0.5 : 1)}px)`

  // 색상 4개를 블롭 6개에 순환 배치
  const blobColors = [
    params.colors[0], params.colors[1], params.colors[2],
    params.colors[3], params.colors[0], params.colors[1],
  ]
  const baseRadius = minDim * params.scale * 0.35
  const alpha = opaque ? 1 : BLOB_ALPHA

  for (let i = 0; i < BLOB_COUNT; i++) {
    const orbit = BLOB_ORBITS[i]
    const px = axisWobble(t, orbit.fx, seed * orbit.sx + orbit.ox)
    const py = axisWobble(t, orbit.fy, seed * orbit.sy + orbit.oy)
    const cx = width / 2 + px * minDim * 0.3
    const cy = height / 2 + py * minDim * 0.3
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(t * (0.2 + i * 0.1) + seed * i)
    ctx.scale(
      1.0 + BLOB_PULSE * Math.sin(t * 0.8 + i * 2.1 + seed),
      1.0 + BLOB_PULSE * Math.sin(t * 0.8 + i * 2.1 + seed + BLOB_PULSE_AXIS_PHASE)
    )
    const c = hexToRgb(blobColors[i])
    ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
    drawSmoothBlob(ctx, baseRadius, t, seed + i * 10)
    ctx.restore()
  }

  ctx.filter = 'none'
}

/**
 * 한 프레임을 캔버스 전체에 그린다. `width`/`height`는 캔버스 백킹 스토어 픽셀 크기다.
 *
 * `t`는 **경과 시간이 아니라 애니메이션 위상(rad)** 이다. 예전에는 경과 ms를 받아 그리기 시점에
 * `speed`를 곱했는데, 그러면 어드민에서 속도 슬라이더를 움직이는 순간 위상 전체가 재스케일돼
 * (경과 30초에서 speed 1→2면 t가 15→30 rad) 블롭 6개가 순간이동했다. 누적을 호출부로 옮겨
 * "이미 지나온 위상"이 속도 변경에 영향받지 않게 한다. 서비스에서는 speed가 상수라 결과가
 * 동일하고, 감속(호출부의 뷰포트 진입 후 정지)도 이 구조라야 튀지 않는다.
 *
 * 참조 스크립트에 있던 원형 aperture 마스크(aperture_size / edge_softness)는 채택하지 않았다 —
 * 카드 전체 영역을 채우도록 사용자가 요청했고, 카드의 라운드 클리핑은 호출부의
 * `overflow-hidden`이 담당한다.
 */
export function drawBlobFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: BlobAnimationParams,
  t: number,
  options: BlobFrameOptions = {}
): void {
  const { flatten = false, opaque = false, scratch = null } = options

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'
  ctx.clearRect(0, 0, width, height)

  if (flatten) {
    ctx.fillStyle = params.bgColor
    ctx.fillRect(0, 0, width, height)
    return
  }

  const scratchCtx = scratch ? prepareScratch(scratch, width, height) : null
  if (scratch && scratchCtx) {
    paintBlobs(scratchCtx, scratch.width, scratch.height, params, t, opaque)
    // 축소본은 투명 배경 위에 그려져 있으므로 배경색을 먼저 칠하고 그 위에 확대 합성한다.
    // 알파 합성은 결합법칙이 성립해 예전(destination-over) 방식과 결과가 같다.
    ctx.fillStyle = params.bgColor
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(scratch, 0, 0, width, height)
    return
  }

  // 폴백(오프스크린 캔버스를 만들 수 없는 환경) — 배경색은 `destination-over`로 블롭을 그린
  // **뒤에** 깔아, blur가 켜진 상태에서 배경색 fill이 함께 번지지 않게 한다.
  paintBlobs(ctx, width, height, params, t, opaque)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = params.bgColor
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'
}
