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
 * 가능하고, 영상 파일 다운로드가 없어 페이로드가 수백 바이트로 작다.
 *
 * 블러는 (티켓 20260902_0629부터) Canvas 2D 컨텍스트의 `ctx.filter`가 아니라 캔버스 **엘리먼트**의
 * CSS `filter`(`canvas.style.filter`)로 건다 — `ctx.filter`는 iOS Safari 17.4 이전에서 조용히
 * 무시돼(블러 없이 선명하게만 그려짐) 실기기에서 블러 옵션이 아예 동작하지 않는 버그가 있었다.
 * CSS `filter`는 iOS Safari 9부터 지원되고 GPU 합성이라 도형 개수·복잡도에 비용이 비례하지
 * 않으므로, 예전에 있던 오프스크린 축소 렌더링(scratch canvas) 최적화도 함께 걷어냈다. 성능
 * 가드(reduced-motion·뷰포트 밖 정지·DPR 캡)는 렌더링 컴포넌트(`BlobAnimationBackground`)가
 * 여전히 함께 구현한다.
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
 * 뷰포트 안에서는 애니메이션이 계속 재생되므로(사용자 결정) "정지 구도"는 이 값 하나뿐이다.
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
 * 블롭별 스케일 펄스 주파수.
 *
 * 궤도(`axisWobble`)는 무리수 하모닉으로 루프감을 없앴는데 펄스는 6개가 **전부 같은 0.8**이라
 * (위상만 어긋나 있었다) speed 1 기준 약 15.7초마다 여섯 개가 함께 부풀었다 줄어드는 신호가
 * 남았다 — 루프감이 가장 지각되기 쉬운 지점이다. 황금비의 소수부(`(i·PHI) mod 1`)로 0.8~1.2배를
 * 흩어 서로 공약수를 갖지 않게 한다. **진폭(`BLOB_PULSE`)은 그대로**라 형태가 커지는 범위는
 * 달라지지 않는다.
 */
const BLOB_PULSE_FREQS = Array.from(
  { length: BLOB_COUNT },
  (_, i) => 0.8 * (1 + ((i * PHI) % 1) * 0.5)
)

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
 * `prefers-reduced-transparency: reduce`에서 쓸 블롭 채움색을 계산한다.
 *
 * 예전에는 이 신호에서 **알파만 0.7 → 1.0으로 올렸다.** 그런데 이 카드의 전경 텍스트는 흰색
 * (`--color-text`)이고 팔레트에 `#ffe5d1` 같은 밝은 색이 있어, 알파를 올리면 그 색이 더 밝아져
 * 배지명 뒤 대비가 오히려 **1.91:1 → 1.21:1로 악화**됐다. 접근성 신호를 켠 사용자가 더 나쁜
 * 화면을 받는 역행이다. apple-design §14의 의도는 "반투명 재질을 **불투명하게**"이지
 * "**더 밝게**"가 아니다.
 *
 * 그래서 알파는 1.0으로 올리되(= 겹침부에서 색이 적층되지 않는다) 색 자체를 `bgColor` 쪽으로
 * `BLOB_ALPHA`만큼 미리 섞는다. 결과 색은 "일반 경로에서 블롭 한 장이 배경 위에 놓였을 때의
 * 합성색"과 정확히 같으므로, 밝기가 일반 경로보다 올라가지 않는다(겹침으로 더 밝아지던 경우는
 * 오히려 사라진다). 즉 흰 텍스트 대비가 일반 경로보다 나빠지지 않는다.
 */
export function opaqueBlobFill(colorHex: string, bgColorHex: string): { r: number; g: number; b: number } {
  const c = hexToRgb(colorHex)
  const bg = hexToRgb(bgColorHex)
  const mix = (fg: number, back: number) => Math.round(back + (fg - back) * BLOB_ALPHA)
  return { r: mix(c.r, bg.r), g: mix(c.g, bg.g), b: mix(c.b, bg.b) }
}

/**
 * blur 반경(px). `minDim`은 **그리는 캔버스의** 짧은 변이다.
 *
 * 이제 이 값은 `paintBlobs`(Canvas 2D `ctx.filter`)가 아니라 `BlobAnimationBackground`가
 * `canvas.style.filter`(CSS `filter: blur()`, DOM 엘리먼트 단위)에 그대로 쓴다 — 계산식 자체는
 * 렌더링 경로가 바뀌어도 동일하게 유효하다.
 *
 * `opaque`(reduced-transparency)에서 반경을 절반으로 줄이는 것은 그대로 유지한다 — 반투명 적층
 * 완화라는 원 취지에 부합하고, 위 `opaqueBlobFill`과 달리 밝기를 건드리지 않는다.
 */
export function blobBlurRadiusPx(blur: number, minDim: number, opaque: boolean): number {
  return blur * minDim * 0.15 * (opaque ? 0.5 : 1)
}

export interface BlobFrameOptions {
  /**
   * `prefers-contrast: more` — 블롭을 그리지 않고 배경색 단색으로 평탄화한다. 카드 안 텍스트가
   * 변하는 배경 대신 고정 단색 위에 놓여 대비가 항상 보장된다.
   */
  flatten?: boolean
  /**
   * `prefers-reduced-transparency: reduce` — 블롭을 알파 1.0으로 칠하고(색은 `opaqueBlobFill`이
   * 배경색 쪽으로 미리 섞어 밝기가 올라가지 않게 한다) blur 반경(`blobBlurRadiusPx`)을 절반으로
   * 줄여 반투명·흐림 적층을 최소화한다. blur 자체는 호출부가 `canvas.style.filter`로 적용하므로
   * 이 함수는 그리기(알파·색)만 담당한다.
   */
  opaque?: boolean
}

/** 투명 배경 위에 블롭 6개만 그린다(필터 없이 선명하게 — 블러는 호출부가 CSS로 건다). */
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

  // 블러는 여기서 걸지 않는다 — 선명하게 그린 뒤, 호출부(BlobAnimationBackground)가 캔버스
  // 엘리먼트 전체에 CSS `filter: blur()`를 건다(`blobBlurRadiusPx` 참조).

  // 색상 4개를 블롭 6개에 순환 배치
  const blobColors = [
    params.colors[0], params.colors[1], params.colors[2],
    params.colors[3], params.colors[0], params.colors[1],
  ]
  const baseRadius = minDim * params.scale * 0.35
  // opaque(reduced-transparency)에서는 알파 1.0 + 배경색 쪽으로 미리 섞은 색을 쓴다.
  // 자세한 근거는 `opaqueBlobFill` 주석 참조 — 알파만 올리면 밝은 팔레트에서 대비가 역행한다.
  const alpha = opaque ? 1 : BLOB_ALPHA

  for (let i = 0; i < BLOB_COUNT; i++) {
    const orbit = BLOB_ORBITS[i]
    const px = axisWobble(t, orbit.fx, seed * orbit.sx + orbit.ox)
    const py = axisWobble(t, orbit.fy, seed * orbit.sy + orbit.oy)
    const cx = width / 2 + px * minDim * 0.3
    const cy = height / 2 + py * minDim * 0.3
    const pulse = BLOB_PULSE_FREQS[i] * t + i * 2.1 + seed
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(t * (0.2 + i * 0.1) + seed * i)
    ctx.scale(
      1.0 + BLOB_PULSE * Math.sin(pulse),
      1.0 + BLOB_PULSE * Math.sin(pulse + BLOB_PULSE_AXIS_PHASE)
    )
    const c = opaque ? opaqueBlobFill(blobColors[i], params.bgColor) : hexToRgb(blobColors[i])
    ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
    drawSmoothBlob(ctx, baseRadius, t, seed + i * 10)
    ctx.restore()
  }
}

/**
 * 한 프레임을 캔버스 전체에 그린다. `width`/`height`는 캔버스 백킹 스토어 픽셀 크기다.
 *
 * `t`는 **경과 시간이 아니라 애니메이션 위상(rad)** 이다. 예전에는 경과 ms를 받아 그리기 시점에
 * `speed`를 곱했는데, 그러면 어드민에서 속도 슬라이더를 움직이는 순간 위상 전체가 재스케일돼
 * (경과 30초에서 speed 1→2면 t가 15→30 rad) 블롭 6개가 순간이동했다. 누적을 호출부로 옮겨
 * "이미 지나온 위상"이 속도 변경에 영향받지 않게 한다. 서비스에서는 speed가 상수라 결과가
 * 동일하다.
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
  const { flatten = false, opaque = false } = options

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, width, height)

  if (flatten) {
    ctx.fillStyle = params.bgColor
    ctx.fillRect(0, 0, width, height)
    return
  }

  // 배경색은 `destination-over`로 블롭을 그린 **뒤에** 깐다(순서 자체는 기존과 동일). 최종
  // 블러(CSS `filter`, 호출부 담당)는 캔버스 엘리먼트 전체 — 블롭 + 배경색 — 를 함께 블러하지만
  // 배경색이 단색이라 내부는 블러해도 동일하게 보인다.
  paintBlobs(ctx, width, height, params, t, opaque)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = params.bgColor
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'
}
