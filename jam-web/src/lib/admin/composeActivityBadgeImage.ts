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
 *   2. 글래스 노치 판 — 배경을 한 번 더 블러해 깔고 반투명 흰색을 얹는다
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
import { makePath } from '@ds/components/cards/BadgeFrame'
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
const GLASS_SIZE = DESIGN_SIZE - GLASS_INSET * 2
/**
 * 글래스 판의 모서리 라운드. bg 라운드(60)에서 인셋(20)을 뺀 동심(concentric) 값이다 —
 * 안쪽 도형의 라운드를 이렇게 잡아야 바깥 라운드와 곡률이 나란히 보인다.
 */
const GLASS_RADIUS = BG_RADIUS - GLASS_INSET
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
/** 등급 칩과 배지 이름 사이 간격 */
const NAME_GAP = 10
/** `condition`(8:2) — Pretendard Bold 20px, 자간 -0.8, line-height 30px */
const CONDITION_FONT_SIZE = 20
const CONDITION_TRACKING = -0.8
const CONDITION_LINE_HEIGHT = 30

/**
 * 글래스 판의 재질값 — **피그마 수치를 조회하지 못해 추정한 값**이다(이 세션에서 Figma MCP를
 * 쓸 수 없었다). 세 상수만 고치면 재질이 바뀌도록 한곳에 모아 둔다.
 * - `BACKDROP_BLUR`: 판 뒤 배경을 추가로 흐리는 반경(540 좌표계 px)
 * - `FILL`: 판 위에 얹는 반투명 흰색
 * - `STROKE`: 노치 실루엣이 읽히도록 두르는 헤어라인
 */
const GLASS_BACKDROP_BLUR = 20
const GLASS_FILL = 'rgba(255, 255, 255, 0.08)'
const GLASS_STROKE = 'rgba(255, 255, 255, 0.18)'
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
  // 좌우 노치 실루엣은 MODULAR의 `ticket-h`를 그대로 재사용한다(캔버스용 path를 새로 그리지 않음).
  const notchPathD = makePath('ticket-h', GLASS_SIZE, GLASS_SIZE)
  const notchPath = notchPathD ? new Path2D(notchPathD) : null
  ctx.save()
  ctx.setTransform(S, 0, 0, S, 0, 0)
  ctx.translate(GLASS_INSET, GLASS_INSET)
  const glassRound = roundedRectPath(0, 0, GLASS_SIZE, GLASS_SIZE, GLASS_RADIUS)
  // 라운드 사각형 ∩ 티켓 노치 — clip을 두 번 걸면 교집합이 된다.
  ctx.clip(glassRound)
  if (notchPath) ctx.clip(notchPath)

  // 클리핑 영역은 걸어둔 시점의 좌표로 고정되므로, 배경 스냅샷은 원래 배율로 되돌려 그린다.
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = `blur(${GLASS_BACKDROP_BLUR * S}px)`
  ctx.drawImage(bgCanvas, 0, 0)
  ctx.filter = 'none'
  ctx.fillStyle = GLASS_FILL
  ctx.fillRect(0, 0, size, size)
  ctx.restore()

  // 헤어라인 — 클립이 걸린 채로 그려 두 path의 '교집합 외곽선'만 남긴다. 클립이 선의 바깥
  // 절반을 잘라내므로 선폭을 2배로 잡아야 의도한 두께가 안쪽에 남는다(inner stroke 관용법).
  // 두 path를 클립 없이 각각 그리면 교집합이 아닌 두 도형의 외곽선이 겹쳐 보인다.
  ctx.strokeStyle = GLASS_STROKE
  ctx.lineWidth = GLASS_STROKE_WIDTH * 2
  ctx.stroke(glassRound)
  if (notchPath) ctx.stroke(notchPath)
  ctx.restore()

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
