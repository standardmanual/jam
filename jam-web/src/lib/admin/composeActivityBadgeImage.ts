/**
 * 액티비티 배지 이미지 — 클라이언트 Canvas 2D 합성 (티켓 20260902_1613)
 *
 * 피그마 node `8:33`(540×540)을 그대로 캔버스에 옮긴다. 서버 렌더(next/og·satori)로는 Canvas 2D
 * 블롭 배경도 backdrop-blur 글래스도 그릴 수 없어, 이미 두 번 검증된 클라이언트 캔버스 합성
 * 패턴을 따른다(`bakePreviewToBlob.ts` 20260819_008, `buildBadgeShareBlob.ts` 20260821_004).
 *
 * ## 좌표계
 * 모든 상수는 **피그마 원본 540 좌표계**로 정의하고, 출력 해상도는 배율 `S = size / 540` 하나로만
 * 환산한다. 고정 px을 흩어 두면 해상도를 바꿀 때 라운드·패딩만 어긋난다.
 *
 * ## 그리는 순서
 *   1. 블롭 정지 프레임(배경) — 라운드 60px(비율 0.111) 안으로 클리핑
 *   2. 글래스 노치 판 — 배경을 한 번 더 블러(21px)해 깔고 방사형 그라디언트 채움·테두리를 얹는다
 *   3. 등급 칩(common이면 그리지 않는다) → 배지 이름 → 설명
 *
 * ## 모서리 바깥 픽셀
 * 라운드 밖은 **투명하게 둔다**(티켓 선택지 1). 서비스 Hero 카드 배경이 그 자리로 비쳐
 * 자연스럽게 섞이고, 배경색으로 사각형을 꽉 채우면 카드 라운드(16px)와 이미지 라운드가 어긋난
 * 이중 모서리로 보인다.
 *
 * ## 블러
 * `drawBlobFrame`은 블러를 걸지 않는다 — 서비스는 캔버스 **엘리먼트**의 CSS filter로 건다
 * (`ctx.filter`가 iOS Safari 17.4 미만에서 무시되는 버그 때문, 20260902_0629). 굽기 경로에서는
 * CSS filter를 쓸 수 없으므로 여기서는 `ctx.filter`를 쓴다. 어드민은 데스크톱 브라우저에서만
 * 쓰는 화면이라 그 iOS 버그의 사정권 밖이고, 이 경로 말고는 대안이 없다.
 */
import { blobBlurRadiusPx, drawBlobFrame } from '@/lib/blobAnimation'
import {
  DESIGN_SIZE,
  type ActivityBadgeImageParams,
} from '@/lib/admin/activityBadgeImage'
import type { BadgeRarity } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// 피그마 실측값 (node 8:33 — 540×540 좌표계)
// ─────────────────────────────────────────────────────────────────────────────

/** `bg`(8:34)의 라운드. 540 기준 60px = 11.1% — 해상도에 비례 환산한다. */
const BG_RADIUS = 60
/** `glass`(1:7) 500×500, bg 기준 상하좌우 20px 인셋 */
const GLASS_INSET = 20
/** 콘텐츠 프레임(8:4)의 패딩 */
const CONTENT_PADDING = 58

/** `RarityBadge`(8:29) — 라벨 13px Bold / 패딩 6.5 × 14.625 / 라운드 999(= pill) / 자간 0.3 */
const CHIP_FONT_SIZE = 13
const CHIP_TRACKING = 0.3
const CHIP_PADDING_Y = 6.5
const CHIP_PADDING_X = 14.625
/** `badgename`(8:30) — Pretendard Bold 64px, 자간 -2.56, line-height: normal */
const NAME_FONT_SIZE = 64
const NAME_TRACKING = -2.56
/**
 * 등급 칩과 배지 이름 사이 간격.
 *
 * 피그마(node 8:28의 flex gap)는 10이지만, 실제로 구운 이미지에서 칩과 이름이 붙어 보인다는
 * 사용자 피드백으로 10을 더해 20으로 올렸다 (티켓 20260902_1732). 피그마 값을 그대로 두지
 * 않은 유일한 수치라 여기 근거를 남긴다 — 나머지 치수는 전부 node 8:33 실측값이다.
 */
const NAME_GAP = 20
/**
 * `condition`(8:2) — 설명 텍스트.
 *
 * 피그마는 Pretendard Bold **20px** / line-height 30px(=1.5배)이나, 사용자 요청으로
 * **30px / 행간 1.2배(36px)** 로 바꿨다 (티켓 20260902_1732). 피그마보다 촘촘한 행간이며
 * 사용자가 실제 렌더 결과를 보고 지정한 값이다. 자간(-0.8)은 피그마 값을 유지한다.
 */
const CONDITION_FONT_SIZE = 30
const CONDITION_TRACKING = -0.8
/** 폰트 크기의 **1.2배**(사용자 지정, 티켓 20260902_1732). 30 × 1.2 = 36. */
const CONDITION_LINE_HEIGHT = 36

/**
 * 글래스 판(`glass` 1:7)의 실측값. 피그마에서 받은 SVG를 직접 읽어 확정한 값이며 추정치가 아니다.
 *
 * ## 좌표 환산
 * 글래스 SVG의 viewBox는 502×502이고 path는 1px 인셋(1..501)이다. 판은 540 캔버스 안 (20,20)에
 * 놓인 500×500이므로 **SVG 좌표 (x,y) → 540 좌표 = (x+19, y+19)** 다.
 *
 * ## 형태
 * - 모서리 라운드 48
 * - 좌우 변의 세로 중앙(540 기준 y=270)을 중심으로 반지름 39.4737 원호가 파인다.
 *   SVG 근거: 우변이 y=211.526에서 x=461.526까지 들어갔다가 y=290.474에서 x=501로 복귀
 *   → 반지름 501−461.526 = 39.474 = 세로 폭 78.947의 절반.
 * - MODULAR `makePath('ticket-h')`를 쓰지 않는다. 그 함수는 노치 반지름에 `min(h*0.07, 13)`
 *   **절대 상한**이 있어 500px 판에서 13px로 잘린다(피그마와 3배 차이). 그래서 여기서 직접 정의한다.
 */
const GLASS_RADIUS = 48
const GLASS_NOTCH_RADIUS = 39.4737
/** 글래스 SVG(viewBox 502) 좌표를 540 좌표로 옮기는 평행이동 */
const GLASS_SVG_OFFSET = 19
/** `backdrop-filter: blur(21px)` — 판 뒤 배경을 추가로 흐리는 반경(540 좌표계 px) */
const GLASS_BACKDROP_BLUR = 21
/**
 * 판 채움·테두리에 쓰는 방사형 그라디언트의 `gradientTransform`
 * (`paint0_radial_0_4` / `paint1_radial_0_4`가 **같은 행렬**을 공유한다).
 * `gradientUnits="userSpaceOnUse"`, cx=0 cy=0 r=1 이므로 단위원을 이 행렬로 밀어 넣은 모양이다.
 */
const GLASS_GRADIENT_MATRIX: readonly [number, number, number, number, number, number] = [
  487.831, 472.314, -472.866, 1053.76, 5.49738, 15.876,
]
/** 채움(paint0): 좌상단 흰색 40% → 우하단 투명 */
const GLASS_FILL_STOPS: readonly (readonly [number, string])[] = [
  [0, 'rgba(255, 255, 255, 0.4)'],
  [1, 'rgba(255, 255, 255, 0)'],
]
/** 테두리(paint1): 채움과 반대 방향 — 좌상단 투명 → 우하단 흰색 100% */
const GLASS_STROKE_STOPS: readonly (readonly [number, string])[] = [
  [0, 'rgba(255, 255, 255, 0)'],
  [1, 'rgba(255, 255, 255, 1)'],
]
/** SVG의 `fill-opacity="0.48"` — 테두리 그라디언트 전체에 곱해진다 */
const GLASS_STROKE_OPACITY = 0.48
/** 1px 아웃사이드 스트로크(540 좌표계) */
const GLASS_STROKE_WIDTH = 1

/**
 * 서비스 `--font-family-base`와 동일한 폰트 스택. 실제 로드되는 패밀리는 static Pretendard다
 * (globals.css가 CDN static 번들을 import한다).
 */
const FONT_FAMILY = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
/** `document.fonts.load`에 넘길 때 쓰는 실제 패밀리명 — 스택 전체를 넘기면 매칭되지 않는다. */
const FONT_LOAD_FAMILY = 'Pretendard'

const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  mystic: 'Mystic',
}

// ─────────────────────────────────────────────────────────────────────────────
// 폰트 / 색상 토큰
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 웹폰트 로딩을 기다린다. 기다리지 않으면 폴백 폰트로 구워진다
 * (`buildBadgeShareBlob.ts`의 `waitForFonts`와 같은 이유·같은 방식).
 */
export async function ensureBadgeImageFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await Promise.all([
      document.fonts.load(`700 ${NAME_FONT_SIZE}px ${FONT_LOAD_FAMILY}`),
      document.fonts.load(`700 ${CONDITION_FONT_SIZE}px ${FONT_LOAD_FAMILY}`),
      document.fonts.load(`700 ${CHIP_FONT_SIZE}px ${FONT_LOAD_FAMILY}`),
    ])
    await document.fonts.ready
  } catch {
    // 로딩에 실패해도 폴백 폰트로 계속 진행한다(그리지 않는 것보다 낫다).
  }
}

/**
 * 등급 색을 **MODULAR 토큰에서만** 읽는다. 캔버스에는 CSS 변수를 넣을 수 없으므로
 * `getComputedStyle`로 해석한다 — hex를 이 파일에 복사해 두 번째 출처를 만들지 않는다
 * (`design-system/tokens/colors.css`가 바뀌면 여기도 같이 바뀐다).
 *
 * 토큰을 읽지 못하면 `null`을 돌려주고 호출부가 칩을 그리지 않는다. 임의의 대체 hex로 메우면
 * 토큰과 어긋난 색이 조용히 구워지는 편이 더 나쁘다 — 미리보기에서 칩이 사라지므로 운영자가
 * 바로 알아챈다.
 */
export function readRarityColors(rarity: BadgeRarity): { bg: string; text: string } | null {
  if (typeof window === 'undefined') return null
  const style = getComputedStyle(document.documentElement)
  const bg = style.getPropertyValue(`--color-rarity-${rarity}`).trim()
  const text = style.getPropertyValue(`--color-rarity-${rarity}-text`).trim()
  if (!bg || !text) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[composeActivityBadgeImage] 등급 색상 토큰을 읽지 못해 칩을 그리지 않았어요:', rarity)
    }
    return null
  }
  return { bg, text }
}

// ─────────────────────────────────────────────────────────────────────────────
// 텍스트 유틸 — 자간·줄바꿈·라인박스
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ctx.letterSpacing` 지원 여부. 지원하면 measure/fill이 자간까지 함께 처리해 커닝이 유지된다.
 * 미지원 브라우저에서는 글자를 하나씩 그려 같은 결과를 근사한다(커닝만 사라진다).
 */
function supportsLetterSpacing(ctx: CanvasRenderingContext2D): boolean {
  return 'letterSpacing' in ctx
}

function applyTextStyle(ctx: CanvasRenderingContext2D, fontSize: number, tracking: number): void {
  ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`
  // `letterSpacing`은 비교적 최근 API라 타입 정의가 없는 환경도 있어 좁은 캐스팅으로 접근한다.
  if (supportsLetterSpacing(ctx)) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tracking}px`
}

function measureWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  const base = ctx.measureText(text).width
  // 네이티브 지원 시 measureText가 이미 자간을 반영한다. 미지원이면 직접 더한다
  // (CSS letter-spacing은 마지막 글자 뒤에도 붙으므로 글자 수만큼 더한다 — 그리기와 동일하게).
  return supportsLetterSpacing(ctx) ? base : base + tracking * [...text].length
}

function fillTextWithTracking(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number
): void {
  if (supportsLetterSpacing(ctx)) {
    ctx.fillText(text, x, y)
    return
  }
  let cursor = x
  for (const ch of text) {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + tracking
  }
}

/**
 * `line-height: normal`의 실제 높이. 폰트가 선언한 라인박스(ascent + descent)를 그대로 쓴다 —
 * 임의의 배수(1.2 등)를 상수로 박으면 폰트가 바뀔 때 피그마와 어긋난다.
 */
function normalLineHeight(ctx: CanvasRenderingContext2D, fontSize: number): number {
  const m = ctx.measureText('가Ag')
  const ascent = m.fontBoundingBoxAscent
  const descent = m.fontBoundingBoxDescent
  if (typeof ascent === 'number' && typeof descent === 'number' && ascent + descent > 0) {
    return ascent + descent
  }
  return fontSize * 1.2
}

/**
 * 개행(`\n`)으로 먼저 나누고, 그래도 폭을 넘으면 CSS 블록 텍스트처럼 접는다.
 *
 * 이것은 "자동 축소"가 아니다 — 피그마의 `condition`이 콘텐츠 프레임 폭을 가진 텍스트 박스라
 * 같은 폭에서 같은 방식으로 접히게 하는 것이다. 글자 크기는 절대 줄이지 않는다(사용자 결정).
 * 공백으로 끊을 수 없는 토큰(한글 문장 등)은 글자 단위로 끊어 CSS의 한글 줄바꿈에 맞춘다.
 */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number,
  maxWidth: number
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }
    let current = ''
    // 공백을 유지한 채 토큰으로 자른다(공백 뒤에서 끊기도록).
    for (const token of paragraph.match(/\S+\s*|\s+/g) ?? [paragraph]) {
      const candidate = current + token
      if (current !== '' && measureWidth(ctx, candidate.trimEnd(), tracking) > maxWidth) {
        lines.push(current.trimEnd())
        current = token.trimStart()
      } else {
        current = candidate
      }
      // 토큰 하나가 폭보다 길면 글자 단위로 끊는다.
      while (measureWidth(ctx, current.trimEnd(), tracking) > maxWidth && [...current].length > 1) {
        const chars = [...current]
        let cut = chars.length - 1
        while (cut > 1 && measureWidth(ctx, chars.slice(0, cut).join(''), tracking) > maxWidth) cut--
        lines.push(chars.slice(0, cut).join(''))
        current = chars.slice(cut).join('')
      }
    }
    lines.push(current.trimEnd())
  }
  return lines
}

/**
 * 한 줄을 CSS와 같은 위치에 그린다 — 라인박스 안에서 위아래 half-leading을 나눠 갖고
 * 알파벳 베이스라인에 앉힌다. `textBaseline='top'`으로 쌓으면 `line-height`가 폰트 기본값보다
 * 큰 경우(설명 20px / 30px) 블록 전체가 위로 밀린다.
 */
function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  blockTop: number,
  lineHeight: number,
  tracking: number
): void {
  const m = ctx.measureText('가Ag')
  const ascent = m.fontBoundingBoxAscent ?? 0
  const descent = m.fontBoundingBoxDescent ?? 0
  const halfLeading = (lineHeight - (ascent + descent)) / 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((line, i) => {
    if (line === '') return
    fillTextWithTracking(ctx, line, x, blockTop + i * lineHeight + halfLeading + ascent, tracking)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 합성
// ─────────────────────────────────────────────────────────────────────────────

/** 프레임마다 캔버스를 새로 할당하지 않도록 재사용하는 스크래치 캔버스 2장 */
let blobScratch: HTMLCanvasElement | null = null
let bgScratch: HTMLCanvasElement | null = null

function scratch(which: 'blob' | 'bg', size: number): HTMLCanvasElement {
  const existing = which === 'blob' ? blobScratch : bgScratch
  const canvas = existing ?? document.createElement('canvas')
  if (canvas.width !== size) canvas.width = size
  if (canvas.height !== size) canvas.height = size
  if (which === 'blob') blobScratch = canvas
  else bgScratch = canvas
  return canvas
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): Path2D {
  const path = new Path2D()
  path.roundRect(x, y, w, h, r)
  return path
}

/**
 * 글래스 판 실루엣(540 좌표계) — 라운드 사각형의 좌우 변 중앙을 원호로 파낸 가로 티켓 모양.
 *
 * `expand`만큼 바깥으로 부풀린 경로를 만든다(0이면 실측 그대로). 도형을 바깥으로 밀면
 * 모서리 라운드는 커지고 **안쪽으로 파인 노치 반지름은 작아진다** — 오프셋 곡선의 성질이다.
 * 테두리 링을 even-odd로 잘라낼 때 `expand=1`(1px 아웃사이드) 경로를 함께 쓴다.
 */
function buildGlassPath(expand: number): Path2D {
  const left = GLASS_INSET - expand
  const top = GLASS_INSET - expand
  const right = DESIGN_SIZE - GLASS_INSET + expand
  const bottom = DESIGN_SIZE - GLASS_INSET + expand
  const r = GLASS_RADIUS + expand
  const nr = GLASS_NOTCH_RADIUS - expand
  const cy = DESIGN_SIZE / 2
  const HALF_PI = Math.PI / 2

  const path = new Path2D()
  path.moveTo(left + r, top)
  path.lineTo(right - r, top)
  path.arc(right - r, top + r, r, -HALF_PI, 0)
  path.lineTo(right, cy - nr)
  // 우변 노치 — 중심 (right, cy)의 원을 반시계로 돌아 안쪽(x = right − nr)을 훑는다.
  path.arc(right, cy, nr, -HALF_PI, HALF_PI, true)
  path.lineTo(right, bottom - r)
  path.arc(right - r, bottom - r, r, 0, HALF_PI)
  path.lineTo(left + r, bottom)
  path.arc(left + r, bottom - r, r, HALF_PI, Math.PI)
  path.lineTo(left, cy + nr)
  // 좌변 노치
  path.arc(left, cy, nr, HALF_PI, -HALF_PI, true)
  path.lineTo(left, top + r)
  path.arc(left + r, top + r, r, Math.PI, Math.PI * 1.5)
  path.closePath()
  return path
}

/**
 * 피그마의 기울어진 방사형 그라디언트를 캔버스에 칠한다.
 *
 * Canvas 2D는 skew된 radial gradient를 직접 만들 수 없다. 대신 `gradientTransform`을 CTM에 곱해
 * **그라디언트 좌표계**로 들어간 뒤 단위원 그라디언트(r=1)를 만들고, 그 좌표계에서 클립 영역을
 * 충분히 덮는 사각형을 칠한다. 클립은 CTM을 바꾸기 전(540 좌표계)에 걸어 두므로 영향받지 않는다.
 */
function paintGlassGradient(
  ctx: CanvasRenderingContext2D,
  scale: number,
  clipPath: Path2D,
  fillRule: CanvasFillRule,
  stops: readonly (readonly [number, string])[],
  alpha: number
): void {
  const [a, b, c, d, e, f] = GLASS_GRADIENT_MATRIX
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clip(clipPath, fillRule)
  ctx.globalAlpha = alpha
  // SVG(viewBox 502) → 540 보정을 평행이동에 더한다. 배율 S는 위 setTransform이 이미 반영했다.
  ctx.transform(a, b, c, d, e + GLASS_SVG_OFFSET, f + GLASS_SVG_OFFSET)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  // 그라디언트 좌표계에서 단위 1이 540 좌표계의 500px 이상이라 ±4면 판 전체를 덮고도 남는다.
  ctx.fillRect(-4, -4, 8, 8)
  ctx.restore()
}

/**
 * 대상 캔버스에 배지 이미지 한 장을 그린다. 캔버스의 백킹 스토어 크기(`canvas.width`)를 출력
 * 해상도로 삼는다 — 미리보기 캔버스와 굽는 캔버스가 **같은 캔버스**라 WYSIWYG가 구조적으로
 * 보장된다(20260819_011/014에서 확립한 원칙).
 */
export function drawActivityBadgeImage(
  canvas: HTMLCanvasElement,
  params: ActivityBadgeImageParams
): void {
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const S = size / DESIGN_SIZE

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, size, size)

  // ── 1. 배경: 블롭 정지 프레임 ──────────────────────────────────────────────
  const blobCanvas = scratch('blob', size)
  const blobCtx = blobCanvas.getContext('2d')
  if (blobCtx) {
    drawBlobFrame(blobCtx, size, size, params.background, params.background.phase)
  }

  // 배경 스냅샷은 **라운드로 자르지 않은 정사각형**으로 만든다. 글래스 판의 backdrop-blur가
  // 이 스냅샷을 한 번 더 흐리게 그리는데, 여기서 미리 잘라 두면 판 모서리 근처의 블러가 라운드
  // 바깥의 투명 픽셀을 빨아들여 글래스 네 귀퉁이만 어둡게 빠진다. 라운드는 출력에 옮길 때 건다.
  const bgCanvas = scratch('bg', size)
  const bgCtx = bgCanvas.getContext('2d')
  if (bgCtx) {
    bgCtx.setTransform(1, 0, 0, 1, 0, 0)
    bgCtx.filter = 'none'
    bgCtx.clearRect(0, 0, size, size)
    // 블러 가장자리가 투명으로 빠지는 것을 배경색으로 먼저 메운다(서비스에서 Hero 카드 인라인
    // backgroundColor가 하던 역할).
    bgCtx.fillStyle = params.background.bgColor
    bgCtx.fillRect(0, 0, size, size)
    // `blobBlurRadiusPx`는 그리는 캔버스의 짧은 변을 받는다 → 출력 해상도를 그대로 넘기면
    // 540 기준 비율이 자동으로 환산된다.
    bgCtx.filter = `blur(${blobBlurRadiusPx(params.background.blur, size, false)}px)`
    bgCtx.drawImage(blobCanvas, 0, 0)
    bgCtx.filter = 'none'

    ctx.save()
    ctx.clip(roundedRectPath(0, 0, size, size, BG_RADIUS * S))
    ctx.drawImage(bgCanvas, 0, 0)
    ctx.restore()
  }

  // ── 2. 글래스 노치 판 ─────────────────────────────────────────────────────
  const glassPath = buildGlassPath(0)

  // backdrop-filter: 판 뒤 배경만 한 번 더 흐린다.
  ctx.save()
  ctx.setTransform(S, 0, 0, S, 0, 0)
  ctx.clip(glassPath)
  // 클리핑 영역은 걸어둔 시점의 좌표로 고정되므로, 배경 스냅샷은 원래 배율로 되돌려 그린다.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = `blur(${GLASS_BACKDROP_BLUR * S}px)`
  ctx.drawImage(bgCanvas, 0, 0)
  ctx.filter = 'none'
  ctx.restore()

  // 판 채움 — 좌상단이 밝고 우하단으로 투명해지는 기울어진 방사형 그라디언트.
  paintGlassGradient(ctx, S, glassPath, 'nonzero', GLASS_FILL_STOPS, 1)

  // 테두리 — 채움과 같은 행렬, stop만 반대(우하단이 밝다). 1px 아웃사이드 스트로크를
  // even-odd로 잘라낸 링 영역에만 칠한다(그라디언트는 stroke로 직접 칠할 수 없다).
  const glassBorderRing = buildGlassPath(GLASS_STROKE_WIDTH)
  glassBorderRing.addPath(glassPath)
  paintGlassGradient(ctx, S, glassBorderRing, 'evenodd', GLASS_STROKE_STOPS, GLASS_STROKE_OPACITY)

  // ── 3. 콘텐츠(등급 칩 / 이름 / 설명) ──────────────────────────────────────
  // 텍스트는 클리핑하지 않는다 — 넘치면 넘친 그대로 보여야 운영자가 줄바꿈을 조절할 수 있다
  // (자동 축소·말줄임 없음, 사용자 결정).
  ctx.save()
  ctx.setTransform(S, 0, 0, S, 0, 0)

  const contentLeft = GLASS_INSET + CONTENT_PADDING
  const contentTop = GLASS_INSET + CONTENT_PADDING
  const contentRight = DESIGN_SIZE - GLASS_INSET - CONTENT_PADDING
  const contentBottom = DESIGN_SIZE - GLASS_INSET - CONTENT_PADDING
  const contentWidth = contentRight - contentLeft

  let cursorY = contentTop

  // 등급 칩 — common은 그리지 않는다(RarityBadge·피그마 컴포넌트 설명과 동일).
  if (params.rarity !== 'common') {
    const colors = readRarityColors(params.rarity)
    if (colors) {
      applyTextStyle(ctx, CHIP_FONT_SIZE, CHIP_TRACKING)
      const label = RARITY_LABELS[params.rarity].toUpperCase()
      const labelWidth = measureWidth(ctx, label, CHIP_TRACKING)
      // RarityBadge와 동일하게 line-height 1 — 칩 높이는 글자 크기 + 상하 패딩이다.
      const chipHeight = CHIP_FONT_SIZE + CHIP_PADDING_Y * 2
      const chipWidth = labelWidth + CHIP_PADDING_X * 2
      ctx.fillStyle = colors.bg
      ctx.fill(roundedRectPath(contentLeft, cursorY, chipWidth, chipHeight, chipHeight / 2))
      ctx.fillStyle = colors.text
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      fillTextWithTracking(ctx, label, contentLeft + CHIP_PADDING_X, cursorY + chipHeight / 2, CHIP_TRACKING)
      cursorY += chipHeight + NAME_GAP
    }
  }

  // 배지 이름
  if (params.name.trim() !== '') {
    applyTextStyle(ctx, NAME_FONT_SIZE, NAME_TRACKING)
    ctx.fillStyle = '#ffffff'
    const nameLines = wrapLines(ctx, params.name, NAME_TRACKING, contentWidth)
    drawLines(ctx, nameLines, contentLeft, cursorY, normalLineHeight(ctx, NAME_FONT_SIZE), NAME_TRACKING)
  }

  // 설명 — 콘텐츠 프레임 아래쪽에 붙인다(피그마 세로 양끝 정렬).
  if (params.condition.trim() !== '') {
    applyTextStyle(ctx, CONDITION_FONT_SIZE, CONDITION_TRACKING)
    ctx.fillStyle = '#ffffff'
    const conditionLines = wrapLines(ctx, params.condition, CONDITION_TRACKING, contentWidth)
    const blockTop = contentBottom - conditionLines.length * CONDITION_LINE_HEIGHT
    drawLines(ctx, conditionLines, contentLeft, blockTop, CONDITION_LINE_HEIGHT, CONDITION_TRACKING)
  }

  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
