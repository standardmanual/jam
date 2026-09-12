/**
 * 쉐이더 텍스트 생성기 — 디졸브 에코 — 클라이언트 Canvas 2D 렌더링 (티켓 20260912_1532)
 *
 * DOM(Canvas 2D API)에 의존하므로 파라미터 정의(`shaderTextDissolve.ts`, DOM 무관 순수 모듈)와
 * 분리했다 — `20260902_1613`(액티비티 배지 이미지 생성기)의
 * `activityBadgeImage.ts` / `composeActivityBadgeImage.ts` 분리 패턴을 그대로 따른다.
 *
 * ## 그리는 순서 (티켓 2절)
 * 텍스트 마스크(여러 줄, 또는 실루엣 이미지) → 에코 N회 합성(오프셋·스케일·회전·페이드·스캐터) →
 * 이중 블러 헤일로(바깥/안쪽) → 그라디언트맵 색상 매핑(4색) → 노이즈 오버레이 → 필름 그레인
 * 오버레이 → (배경 있음이면) 배경색 합성.
 *
 * ## 왜 Canvas 2D 합성 트릭만으로 구현했나 (신규 의존성 금지)
 * - **헤일로/글로우** = `ctx.filter = 'blur() contrast()'` + `globalCompositeOperation = 'lighter'`
 *   로 이중 블러를 겹친다. 새 블러 라이브러리 없이 표준 Canvas 필터 체인만 쓴다.
 * - **노이즈/그레인** = 작은 정사각형에 난수 그레이스케일을 채운 뒤 큰 캔버스로
 *   `drawImage`(bilinear 확대 = 구름형 노이즈 / nearest 확대 = 거친 그레인)한다. 매 프레임
 *   getImageData를 픽셀 단위로 도는 대신 GPU 합성(drawImage)에 맡겨 빠르다.
 * - **그라디언트맵**만 `getImageData`/`putImageData`로 1회 픽셀 순회한다(256단계 LUT를 미리
 *   만들어 인덱싱만 하므로 1280×1280에서도 충분히 빠르다) — Canvas 2D에 내장 그라디언트맵
 *   연산이 없어 이 단계만 픽셀 접근이 필요하다.
 *
 * ## 결정론(재렌더 안정성)
 * 스캐터 지터·노이즈 타일은 `Math.random()`이 아니라 인덱스/시드 기반 해시로 만든다 — 관련
 * 없는 슬라이더를 조정해 리렌더될 때마다 위치가 흔들리면 저작 경험이 어수선해진다. 필름
 * 그레인만 렌더마다 스타일 값 기반 고정 시드를 쓴다(진짜 매 프레임 랜덤은 아니지만 설정을
 * 바꾸지 않는 한 안정적이다).
 */
import {
  CANVAS_SIZE,
  type ShaderTextEchoPattern,
  type ShaderTextGradientMapParams,
  type ShaderTextHaloParams,
  type ShaderTextParams,
} from '@/lib/admin/shaderTextDissolve'
import { buildRingLayer } from '@/lib/admin/shaderTextRingField'

/**
 * `Pretendard Variable`(가변 축)만 쓴다. `globals.css`가 로드하는 static 배포판(`Pretendard`)은
 * 굵기가 9단계 고정이라 이 화면의 연속 슬라이더와 맞지 않는다 — 이 라우트 전용
 * `layout.tsx`가 `PRETENDARD_VARIABLE_CSS_URL`을 별도로 로드해 두므로, 여기서도 같은 폰트
 * 패밀리명으로 로딩 완료를 기다린다(2026-09-12 게이트 재시도 "폰트 굵기 결정 변경").
 */
const FONT_LOAD_FAMILY = 'Pretendard Variable'
const FONT_FAMILY = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"

/**
 * 웹폰트 로딩을 기다린다 — 기다리지 않으면 폴백 폰트로 구워진다(`buildBadgeShareBlob.ts`와 동일
 * 이유). 가변 폰트는 `@font-face`가 파일 1개(`font-weight: 45 920`)만 등록하므로, 요청한 굵기
 * 문자열로 `document.fonts.load()`를 호출하면 그 굵기가 가변 축 범위 안에 있는 한 브라우저가
 * 같은 파일에서 보간해 제공한다(굵기별로 파일이 따로 있는 static 폰트와 다른 점).
 */
export async function ensureShaderTextFonts(weight: number, size: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await document.fonts.load(`${weight} ${Math.round(size)}px ${FONT_LOAD_FAMILY}`)
    await document.fonts.ready
  } catch {
    // 로딩 실패해도 폴백 폰트로 계속 진행한다(그리지 않는 것보다 낫다).
  }
}

/**
 * Source Content의 "실루엣 이미지 사용" 옵션용 이미지 로더.
 *
 * **이미지 자체의 알파 채널을 실루엣으로 쓴다** — 이미 배경이 제거된 로고·실루엣 PNG를
 * 올리는 용도를 가정한다(임의의 사진에서 인물을 자동 분리하는 세그멘테이션은 이 티켓
 * 범위 밖). 업로드한 이미지는 `image_gen_params`에 저장되지 않는다 — 재편집 시 다시
 * 업로드해야 한다(JSON 파라미터 모델에 이미지 바이너리를 넣지 않기 위한 의도된 제약).
 */
export function loadShaderTextSilhouette(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했습니다.'))
    }
    img.src = url
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 결정론적 난수 — Math.random() 대신 인덱스/시드 기반 해시
// ─────────────────────────────────────────────────────────────────────────────

function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function scatterJitter(index: number, scatter: number): [number, number] {
  if (scatter <= 0) return [0, 0]
  const jx = (hash01(index * 2 + 0.37) - 0.5) * 2 * scatter
  const jy = (hash01(index * 2 + 1.91) - 0.5) * 2 * scatter
  return [jx, jy]
}

/** mulberry32 — 노이즈 타일용 시드 PRNG(빠르고 32비트 정수 시드만 있으면 충분히 고르다). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// 스크래치 캔버스 — 프레임마다 새로 할당하지 않도록 재사용
// ─────────────────────────────────────────────────────────────────────────────

const scratchStore = new Map<string, HTMLCanvasElement>()

function scratch(key: string, size: number): HTMLCanvasElement {
  let canvas = scratchStore.get(key)
  if (!canvas) {
    canvas = document.createElement('canvas')
    scratchStore.set(key, canvas)
  }
  if (canvas.width !== size) canvas.width = size
  if (canvas.height !== size) canvas.height = size
  return canvas
}

function resetCtx(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, size, size)
}

function supportsLetterSpacing(ctx: CanvasRenderingContext2D): boolean {
  return 'letterSpacing' in ctx
}

// ─────────────────────────────────────────────────────────────────────────────
// Echo Path 프리셋 — 실제 드로잉 UI가 없어 오프셋 계산식으로 대체(티켓 4-1절)
// ─────────────────────────────────────────────────────────────────────────────

function echoPatternOffset(
  pattern: ShaderTextEchoPattern,
  index: number,
  copies: number,
  offsetX: number,
  offsetY: number
): { dx: number; dy: number } {
  switch (pattern) {
    case 'zigzag': {
      const dir = index % 2 === 0 ? 1 : -1
      return { dx: offsetX * index, dy: offsetY * index * dir }
    }
    case 'circular': {
      const radius = Math.hypot(offsetX, offsetY) || 20
      const angle = (index / Math.max(1, copies)) * Math.PI * 2
      return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius }
    }
    case 'linear':
    default:
      return { dx: offsetX * index, dy: offsetY * index }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 소스 콘텐츠(텍스트 또는 실루엣 이미지) 한 카피 그리기
// ─────────────────────────────────────────────────────────────────────────────

function drawSourceCopy(
  ctx: CanvasRenderingContext2D,
  params: ShaderTextParams,
  silhouetteImage: HTMLImageElement | null,
  offsetX: number,
  offsetY: number,
  scaleFactor: number,
  rotationDeg: number,
  alpha: number
): void {
  const size = CANVAS_SIZE
  const anchorX = (params.font.positionX / 100) * size
  const anchorY = (params.font.positionY / 100) * size

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = clamp01(alpha)
  ctx.translate(anchorX + offsetX, anchorY + offsetY)
  ctx.rotate((rotationDeg * Math.PI) / 180)
  ctx.scale(Math.max(0.01, scaleFactor), Math.max(0.01, scaleFactor))
  ctx.fillStyle = '#ffffff'

  if (params.source.silhouette && silhouetteImage && silhouetteImage.naturalWidth > 0) {
    const maxSide = size * 0.6
    const ratio = Math.min(maxSide / silhouetteImage.naturalWidth, maxSide / silhouetteImage.naturalHeight)
    const w = silhouetteImage.naturalWidth * ratio
    const h = silhouetteImage.naturalHeight * ratio
    ctx.drawImage(silhouetteImage, -w / 2, -h / 2, w, h)
  } else {
    ctx.font = `${params.font.weight} ${params.font.size}px ${FONT_FAMILY}`
    if (supportsLetterSpacing(ctx)) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${params.font.tracking}px`
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lines = params.text.length > 0 ? params.text.split('\n') : ['']
    const lineHeightPx = params.font.size * params.font.lineHeight
    const blockHeight = lines.length * lineHeightPx
    lines.forEach((line, i) => {
      const y = -blockHeight / 2 + lineHeightPx * (i + 0.5)
      ctx.fillText(line, 0, y)
    })
  }
  ctx.restore()
}

/**
 * 에코 N회를 합성한다. `full`(0..copies-1 전체)과 `echoOnly`(1..copies-1, 코어 제외) 두 장을
 * 함께 만든다 — 헤일로 소스를 고를 때 "Preserve Sharp Core" 토글이 코어 포함 여부를 정한다.
 */
function buildEchoLayers(
  params: ShaderTextParams,
  silhouetteImage: HTMLImageElement | null
): { full: HTMLCanvasElement; echoOnly: HTMLCanvasElement } {
  const size = CANVAS_SIZE
  const full = scratch('echo-full', size)
  const echoOnly = scratch('echo-only', size)
  const fullCtx = full.getContext('2d')
  const echoOnlyCtx = echoOnly.getContext('2d')
  if (!fullCtx || !echoOnlyCtx) return { full, echoOnly }
  resetCtx(fullCtx, size)
  resetCtx(echoOnlyCtx, size)

  const { copies, offsetX, offsetY, fade, scatter, scaleDecay, rotation, pattern } = params.echo
  const phase = params.animation.bakedPhase

  for (let i = 0; i < copies; i++) {
    const { dx, dy } = echoPatternOffset(pattern, i, copies, offsetX, offsetY)
    const [jx, jy] = scatterJitter(i, scatter)
    // i=0(메인 카피)은 항상 완전 불투명 — 에코는 fade%에 따라 지수적으로 옅어진다.
    const alpha = i === 0 ? 1 : Math.pow(1 - clamp01(fade / 100) * 0.99, i)
    const scaleFactor = 1 - (scaleDecay / 100) * (copies > 1 ? i / (copies - 1) : 0)
    const rotationDeg = rotation * i

    let animDx = 0
    let animDy = 0
    if (i === 0) {
      if (params.animation.mainWave.enabled) {
        animDy = params.animation.mainWave.amplitude * Math.sin(phase)
      }
    } else if (params.animation.echoFloat.enabled) {
      animDy = params.animation.echoFloat.amplitude * Math.sin(phase + i * 0.7)
      animDx = params.animation.echoFloat.amplitude * 0.5 * Math.cos(phase * 0.6 + i * 0.7)
    }

    const totalDx = dx + jx + animDx
    const totalDy = dy + jy + animDy

    drawSourceCopy(fullCtx, params, silhouetteImage, totalDx, totalDy, scaleFactor, rotationDeg, alpha)
    if (i > 0) {
      drawSourceCopy(echoOnlyCtx, params, silhouetteImage, totalDx, totalDy, scaleFactor, rotationDeg, alpha)
    }
  }

  return { full, echoOnly }
}

/** 이중 블러 헤일로/글로우. `halo.preserveSharpCore`가 켜져 있으면 코어를 뺀 에코만 흐린다. */
function buildGlow(source: HTMLCanvasElement, halo: ShaderTextHaloParams): HTMLCanvasElement {
  const size = CANVAS_SIZE
  const glow = scratch('glow', size)
  const gctx = glow.getContext('2d')
  if (!gctx) return glow
  resetCtx(gctx, size)

  const contrastPct = clamp(100 + halo.contrast, 0, 300)

  if (halo.outerSpread > 0 && halo.outerIntensity > 0) {
    gctx.save()
    gctx.globalCompositeOperation = 'lighter'
    gctx.globalAlpha = clamp01(halo.outerIntensity / 100)
    gctx.filter = `blur(${halo.outerSpread}px) contrast(${contrastPct}%)`
    gctx.drawImage(source, halo.offsetX, halo.offsetY)
    gctx.restore()
  }
  if (halo.innerSpread > 0 && halo.innerIntensity > 0) {
    gctx.save()
    gctx.globalCompositeOperation = 'lighter'
    gctx.globalAlpha = clamp01(halo.innerIntensity / 100)
    gctx.filter = `blur(${halo.innerSpread}px) contrast(${contrastPct}%)`
    gctx.drawImage(source, halo.offsetX, halo.offsetY)
    gctx.restore()
  }
  return glow
}

// ─────────────────────────────────────────────────────────────────────────────
// 링 텍스처 — 거리장 기반 동심원 링 (티켓 20260912_1742)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `buildRingLayer()`는 480×480로 축소해 2-패스 챔퍼 거리 변환을 도는 무거운 연산이라, 애니메이션
 * 재생 중 매 프레임 다시 구우면 안 된다(`20260912_1532`가 그레인 타일에 적용한 캐시 패턴과 동일
 * 이유). 링 레이어의 소스인 `full`(에코 합성 실루엣)에 영향을 주는 값이 하나라도 바뀔 때만 다시
 * 굽는다. 메인 문구 웨이브·에코 플로트 애니메이션이 켜져 있으면 `bakedPhase`가 매 프레임 `full`
 * 자체를 바꾸므로 그 경우엔 키에 위상을 포함해 매 프레임 재계산이 불가피하다(티켓 3절에서
 * 구현자 재량으로 명시).
 */
let ringLayerCache: { key: string; canvas: HTMLCanvasElement } | null = null

function ringLayerCacheKey(params: ShaderTextParams, silhouetteImage: HTMLImageElement | null): string {
  const phaseMatters = params.animation.mainWave.enabled || params.animation.echoFloat.enabled
  return JSON.stringify({
    text: params.text,
    font: params.font,
    echo: params.echo,
    source: params.source,
    ring: params.ring,
    silhouetteSrc: silhouetteImage?.src ?? null,
    phase: phaseMatters ? params.animation.bakedPhase : 0,
  })
}

function getRingLayer(
  full: HTMLCanvasElement,
  params: ShaderTextParams,
  silhouetteImage: HTMLImageElement | null
): HTMLCanvasElement {
  const key = ringLayerCacheKey(params, silhouetteImage)
  if (ringLayerCache && ringLayerCache.key === key) return ringLayerCache.canvas
  const canvas = buildRingLayer(full, params.ring, CANVAS_SIZE)
  ringLayerCache = { key, canvas }
  return canvas
}

// ─────────────────────────────────────────────────────────────────────────────
// 그라디언트맵 — 256단계 LUT로 밝기(=링 레이어 명암)를 4색 그라디언트로 매핑
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/**
 * 헤일로/코어 위치 슬라이더가 만드는 각 색상 구간이 최소 이 폭(256단계 LUT 기준 약 5%)은
 * 확보하도록 강제한다. 이 하한이 없으면 두 슬라이더를 같은 값(특히 둘 다 0)으로 두는 순간
 * 그 구간 폭이 0이 되어, `그림자`·`헤일로`·`코어` 중 일부 색이 결과물에 전혀 나타나지 않고
 * 사실상 단색으로 뭉개진다(2026-09-12 실사용 중 발견 — 티켓 20260912_1729).
 */
const GRADIENT_STOP_MIN_GAP = 0.05

function buildGradientLut(gm: ShaderTextGradientMapParams): Uint8ClampedArray {
  const haloPos = clamp(gm.haloPosition, GRADIENT_STOP_MIN_GAP, 1 - GRADIENT_STOP_MIN_GAP * 2)
  const corePos = clamp(gm.corePosition, haloPos + GRADIENT_STOP_MIN_GAP, 1 - GRADIENT_STOP_MIN_GAP)
  const stops: { pos: number; rgb: [number, number, number] }[] = [
    { pos: 0, rgb: hexToRgb(gm.shadow) },
    { pos: haloPos, rgb: hexToRgb(gm.halo) },
    { pos: corePos, rgb: hexToRgb(gm.core) },
    { pos: 1, rgb: hexToRgb(gm.innerCore) },
  ]
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let a = stops[0]
    let b = stops[stops.length - 1]
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].pos && t <= stops[s + 1].pos) {
        a = stops[s]
        b = stops[s + 1]
        break
      }
    }
    const span = b.pos - a.pos || 1
    const localT = clamp01((t - a.pos) / span)
    lut[i * 3] = a.rgb[0] + (b.rgb[0] - a.rgb[0]) * localT
    lut[i * 3 + 1] = a.rgb[1] + (b.rgb[1] - a.rgb[1]) * localT
    lut[i * 3 + 2] = a.rgb[2] + (b.rgb[2] - a.rgb[2]) * localT
  }
  return lut
}

/**
 * `target`의 RGB를 밝기 기반 LUT로 덮어쓴다(알파는 그대로 유지 — 실루엣 바깥은 계속 투명).
 *
 * 링 레이어(`buildRingLayer()`)는 이미 스스로 명암(그레이스케일, R=G=B)을 인코딩한다 — 예전처럼
 * 알파를 LUT 키로 쓰면 링이 만든 밝고 어두운 무늬가 사라지고 실루엣 알파(거의 균일)만 남아
 * 명암이 뭉개진다(2026-09-12 프로토타입에서 실제로 겪은 문제, 티켓 20260912_1742). 그래서
 * `data[p]`(R 채널, 이미 그레이스케일이므로 R=G=B)를 LUT 인덱스로 쓴다.
 */
function applyGradientMap(target: HTMLCanvasElement, gm: ShaderTextGradientMapParams): void {
  const ctx = target.getContext('2d')
  if (!ctx) return
  const lut = buildGradientLut(gm)
  const { width, height } = target
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0) continue
    const v = data[p]
    data[p] = lut[v * 3]
    data[p + 1] = lut[v * 3 + 1]
    data[p + 2] = lut[v * 3 + 2]
  }
  ctx.putImageData(imageData, 0, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 노이즈 텍스처 / 필름 그레인 — 작은 난수 타일을 확대해 GPU 합성에 맡긴다
// ─────────────────────────────────────────────────────────────────────────────

/**
 * (cells, seed) 조합별로 캐시한다. 그레인은 기본값(20%)부터 켜져 있어 애니메이션 재생 중
 * 매 프레임(최대 60fps) 호출되는데, 시드는 그레인 설정이 바뀔 때만 달라진다 — 캐시가 없으면
 * 매 프레임 최대 45,000픽셀짜리 `createImageData`/`putImageData`를 다시 돌려 재생이 끊긴다.
 */
const randomTileCache = new Map<string, HTMLCanvasElement>()

function buildRandomTile(cells: number, seed: number): HTMLCanvasElement {
  const key = `${cells}:${seed}`
  const cached = randomTileCache.get(key)
  if (cached) return cached

  const tile = document.createElement('canvas')
  tile.width = cells
  tile.height = cells
  const ctx = tile.getContext('2d')
  if (!ctx) return tile
  const rand = mulberry32(seed)
  const imageData = ctx.createImageData(cells, cells)
  for (let i = 0; i < cells * cells; i++) {
    const v = Math.floor(rand() * 256)
    imageData.data[i * 4] = v
    imageData.data[i * 4 + 1] = v
    imageData.data[i * 4 + 2] = v
    imageData.data[i * 4 + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  randomTileCache.set(key, tile)
  return tile
}

/**
 * 난수 타일을 `mask`의 알파로 잘라낸 뒤(`destination-in`) `target`에 지정한 블렌드 모드로 겹친다.
 * 실루엣 바깥(투명 배경)에는 노이즈/그레인이 새어나가지 않는다.
 */
function overlayMaskedNoise(
  target: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  cells: number,
  seed: number,
  smooth: boolean,
  blendMode: GlobalCompositeOperation,
  amount: number,
  layerKey: string
): void {
  const size = CANVAS_SIZE
  const tile = buildRandomTile(Math.max(1, Math.round(cells)), seed)
  const layer = scratch(layerKey, size)
  const lctx = layer.getContext('2d')
  if (!lctx) return
  resetCtx(lctx, size)
  lctx.imageSmoothingEnabled = smooth
  lctx.drawImage(tile, 0, 0, tile.width, tile.height, 0, 0, size, size)
  lctx.globalCompositeOperation = 'destination-in'
  lctx.drawImage(mask, 0, 0)

  const tctx = target.getContext('2d')
  if (!tctx) return
  tctx.save()
  tctx.globalCompositeOperation = blendMode
  tctx.globalAlpha = clamp01(amount)
  tctx.drawImage(layer, 0, 0)
  tctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// 합성 진입점
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 대상 캔버스에 디졸브 에코 이미지 한 장을 그린다. 캔버스의 백킹 스토어 크기(`canvas.width`)를
 * 그대로 출력 해상도로 쓴다 — 미리보기 캔버스가 곧 굽는 캔버스라 WYSIWYG가 구조적으로
 * 보장된다(`20260819_011/014`에서 확립한 원칙).
 */
export function drawShaderTextDissolve(
  canvas: HTMLCanvasElement,
  params: ShaderTextParams,
  silhouetteImage: HTMLImageElement | null = null
): void {
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // ── 1~2. 텍스트/실루엣 마스크 + 에코 합성 ─────────────────────────────────
  const { full, echoOnly } = buildEchoLayers(params, silhouetteImage)

  // ── 3. 이중 블러 헤일로 + 거리장 링 텍스처 ─────────────────────────────
  const haloSource = params.halo.preserveSharpCore ? echoOnly : full
  const glow = buildGlow(haloSource, params.halo)
  const ringLayer = getRingLayer(full, params, silhouetteImage)

  const finalMask = scratch('final-mask', size)
  const fctx = finalMask.getContext('2d')
  if (!fctx) return
  resetCtx(fctx, size)
  fctx.drawImage(glow, 0, 0)
  fctx.globalCompositeOperation = 'lighter'
  fctx.drawImage(ringLayer, 0, 0)
  fctx.globalCompositeOperation = 'source-over'

  // ── 4. 그라디언트맵 색상 매핑(4색, 밝기 기반) ──────────────────────────
  applyGradientMap(finalMask, params.gradientMap)

  // ── 5. 노이즈 텍스처 오버레이 ──────────────────────────────────────────
  if (params.noise.enabled && params.noise.intensity > 0) {
    const cells = clamp(Math.round(params.noise.scale), 1, 64)
    const seed = params.animation.noiseAnimated ? Math.floor(params.animation.bakedPhase * 100) + 1 : 1337
    overlayMaskedNoise(
      finalMask,
      finalMask,
      cells,
      seed,
      true,
      params.noise.blendMode,
      params.noise.intensity / 100,
      'noise-layer'
    )
  }

  // ── 6. 필름 그레인 오버레이 ────────────────────────────────────────────
  if (params.grain.amount > 0) {
    const cellsAcross = clamp(Math.round(size / (params.grain.size * 6)), 4, 640)
    // 그레인 크기·양이 바뀌지 않는 한 같은 타일을 유지한다(설정을 그대로 두고 다른 슬라이더를
    // 만졌을 때 그레인 알갱이가 매번 다시 굴러다니지 않도록).
    const seed = 90001 + Math.round(params.grain.size * 977) + Math.round(params.grain.amount * 31)
    overlayMaskedNoise(finalMask, finalMask, cellsAcross, seed, false, 'overlay', params.grain.amount / 100, 'grain-layer')
  }

  // ── 7~8. 가장자리 블러 + 배경 합성 ─────────────────────────────────────
  resetCtx(ctx, size)
  if (params.background.mode === 'color') {
    ctx.fillStyle = params.background.color
    ctx.fillRect(0, 0, size, size)
  }
  ctx.filter = params.edgeBlur > 0 ? `blur(${params.edgeBlur}px)` : 'none'
  ctx.drawImage(finalMask, 0, 0)
  ctx.filter = 'none'
}
