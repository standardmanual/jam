/**
 * JAM! 에셋 제너레이터 — 그리기 모듈 (캔버스 추상화)
 *
 * 원본: jam-doc/assets/prototypes/20260924_jam-asset-generator.html
 * (buildStamp 297줄, drawScene 676줄). 캔버스 생성·이미지 로드는 주입받는다 —
 * 브라우저에서는 DOM 캔버스를 그대로 넘기고, 서버(하위 티켓 2201)에서는 캔버스 라이브러리
 * (예: @napi-rs/canvas)의 구현체를 넘긴다. 이 티켓에서는 새 의존성을 추가하지 않으므로
 * 서버 쪽 실제 구현체는 없고, 아래 인터페이스만 둔다.
 */

import { posAt, type PathTable, type PathPoint } from './curve';
import type { GradientDirection } from './types';

/** drawImage로 그릴 수 있는 대상(캔버스 또는 불러온 이미지)이 갖춰야 할 최소 형태. */
export interface ImageSourceLike {
  readonly width: number;
  readonly height: number;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

/** 이 모듈이 실제로 쓰는 2D 컨텍스트 메서드/속성만 담은 최소 인터페이스. */
export interface Canvas2DContextLike {
  drawImage(image: ImageSourceLike, dx: number, dy: number): void;
  drawImage(image: ImageSourceLike, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: ImageSourceLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /** 텍스트 레이어(PRD §4.3)가 쓴다. 글자 단위로 직접 배치하므로 `fillText`는 항상
   *  `textAlign: 'left'` 상태로 호출한다(drawTextLayer 참고) — 정렬(좌/중/우)은 이 모듈이
   *  줄 폭을 재서 시작 x를 계산해 구현한다. */
  font: string;
  textAlign: string;
  textBaseline: string;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  fillStyle: string | CanvasGradientLike;
  globalCompositeOperation: string;
  /** 블러 등 CSS 필터. 미지원 환경(구형 Safari 등)에서는 대입해도 반영되지 않는다 */
  filter: string;
  /** 0~1. 이미지·텍스트 레이어 불투명도(PRD §4.2·§4.3)에 쓴다 */
  globalAlpha: number;
  imageSmoothingQuality?: string;
}

export interface CanvasLike extends ImageSourceLike {
  readonly width: number;
  readonly height: number;
  getContext(kind: '2d'): Canvas2DContextLike;
}

/** 캔버스 생성 함수. 브라우저: `(w, h) => document.createElement('canvas')`에 크기를 채운 것. */
export type CanvasFactory = (width: number, height: number) => CanvasLike;

/**
 * 서버 렌더링(하위 티켓 2201)에서 업로드 PNG/SVG를 읽어 오는 함수의 인터페이스.
 * 이 티켓에는 구현체가 없다 — 실제 캔버스 라이브러리 도입은 사용자 승인 항목이다.
 */
export type ImageLoaderInput = { url: string } | { data: Uint8Array; mimeType: string };
export type ImageLoader = (input: ImageLoaderInput) => Promise<ImageSourceLike>;

/**
 * 텍스트 레이어 글꼴 로드 함수의 인터페이스(PRD §4.3, 티켓 20260924_2158). 실행 뒤에는 해당
 * 글꼴로 그릴 준비가 끝나 있어야 한다(브라우저: 다운로드·파싱 완료, 서버: 폰트 파일 등록).
 * 브라우저 구현은 어드민 화면(`assetGeneratorHelpers.ts`)이
 * `src/lib/admin/googleFonts.ts`의 `ensureGoogleFontLoaded`·`waitForGoogleFontLoaded`를
 * 가지고 만든다. 서버 구현(하위 티켓 2201)은 이 티켓에 없다.
 */
export type FontLoader = (font: { family: string; weight: number }) => Promise<void>;

function supportsCanvasFilter(factory: CanvasFactory): boolean {
  try {
    const probe = factory(1, 1).getContext('2d');
    probe.filter = 'blur(1px)';
    return probe.filter === 'blur(1px)';
  } catch {
    return false;
  }
}

// ctx.filter 미지원(구형 Safari 등) 환경에서는 축소 후 확대로 흐림을 근사한다
function blurCanvas(factory: CanvasFactory, src: CanvasLike, px: number): CanvasLike {
  const out = factory(src.width, src.height);
  const octx = out.getContext('2d');
  if (supportsCanvasFilter(factory)) {
    octx.filter = `blur(${px}px)`;
    octx.drawImage(src, 0, 0);
    octx.filter = 'none';
    return out;
  }
  const k = Math.max(2, Math.round(px));
  const sw = Math.max(1, Math.round(src.width / k));
  const sh = Math.max(1, Math.round(src.height / k));
  const small = factory(sw, sh);
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, sw, sh);
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, src.width, src.height);
  return out;
}

export interface StampInput {
  /** 알파 영역만 의미 있는 원천 이미지(투명 여백은 이미 잘려 있다고 가정한다) */
  base: CanvasLike;
  /** 블러 세기(0~100) */
  blurPct: number;
  direction: GradientDirection;
  /** 그라데이션 시작색. link 여부(PRD §6) 판단은 호출자 책임이다 */
  startColor: string;
  endColor: string;
}

/**
 * 스탬프 생성: 모양(투명도)만 블러 처리한 뒤 그 위에 그라데이션을 입힌다.
 * 그라데이션을 먼저 칠하고 흐리면 시작 색과 끝 색이 섞여서, 흐려진 가장자리가 배경색과 달라진다.
 * 모양만 흐린 뒤 색을 입히면 각 픽셀의 색은 그라데이션 위치로만 정해지고 흐림은 투명도에만 남는다.
 */
export function buildStamp(factory: CanvasFactory, input: StampInput): CanvasLike {
  const { base, blurPct, direction, startColor, endColor } = input;
  const bw = base.width;
  const bh = base.height;
  const blurPx = (blurPct / 100) * 0.25 * Math.max(bw, bh);
  const pad = blurPx > 0.3 ? Math.ceil(blurPx * 3) + 2 : 0;
  let canvas = factory(bw + pad * 2, bh + pad * 2);
  canvas.getContext('2d').drawImage(base, pad, pad);
  if (pad > 0) canvas = blurCanvas(factory, canvas, blurPx);
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'source-in';
  let gradient: CanvasGradientLike;
  if (direction === 'h') gradient = ctx.createLinearGradient(pad, 0, pad + bw, 0);
  else if (direction === 'v') gradient = ctx.createLinearGradient(0, pad, 0, pad + bh);
  else gradient = ctx.createRadialGradient(pad + bw / 2, pad + bh / 2, 0, pad + bw / 2, pad + bh / 2, Math.hypot(bw, bh) / 2);
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

export interface RibbonLayerRenderInput {
  stamp: CanvasLike | null;
  /** 스탬프를 만든 원천(base)의 크기 — 배율 계산 기준 */
  baseWidth: number;
  baseHeight: number;
  /** 스테이지 짧은 변 대비 크기(%) */
  sizePct: number;
  rotationDeg: number;
  followPath: boolean;
  path: PathTable;
  /** 현재 머리 위치(호 길이) */
  head: number;
  gap: number;
  count: number;
  stageWidth: number;
  stageHeight: number;
}

/**
 * 장면 그리기(리본 레이어): 곡선을 따라 스탬프를 복사해 그린다.
 * 곡선이 트레일보다 짧아도 머리가 자기 꼬리를 덮지 않도록 곡선 길이의 90%까지만 그리고,
 * 꼬리부터 그려 머리가 가장 위에 오게 한다.
 */
export function drawRibbonLayer(ctx: Canvas2DContextLike, input: RibbonLayerRenderInput): void {
  const { stamp, baseWidth, baseHeight, sizePct, rotationDeg, followPath, path, head, gap, count, stageWidth, stageHeight } =
    input;
  if (!stamp) return;
  const sc = ((sizePct / 100) * Math.min(stageWidth, stageHeight)) / Math.max(baseWidth, baseHeight);
  const dw = stamp.width * sc;
  const dh = stamp.height * sc;
  if (ctx.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = 'high';
  const rad = (rotationDeg * Math.PI) / 180;
  const n = Math.min(count, Math.max(1, Math.floor((0.9 * path.total) / gap)));
  const tmp: PathPoint = { x: 0, y: 0, a: 0 };
  for (let i = n - 1; i >= 0; i--) {
    posAt(path, head - i * gap, tmp);
    const ang = rad + (followPath ? tmp.a : 0);
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    ctx.setTransform(cs, sn, -sn, cs, tmp.x, tmp.y);
    ctx.drawImage(stamp, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * 레이어 합성 훅: 스테이지 배경을 채운다. `fillBackground` → `drawRibbonLayer` → 이후 레이어
 * 순서로 그린다(PRD §4 레이어 순서). 이미지 레이어는 `drawImageLayer`(20260924_2157), 텍스트
 * 레이어는 `drawTextLayer`(20260924_2158)로 이 자리 다음에 이어 그린다.
 */
export function fillBackground(ctx: Canvas2DContextLike, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

export interface ImageLayerRenderInput {
  /** 업로드한 PNG/SVG를 불러온 원본(호출자가 미리 로드해 넘긴다) */
  image: ImageSourceLike;
  /** 스테이지 기준 위치(%). 이미지 중심 좌표 */
  xPct: number;
  yPct: number;
  /** 스테이지 짧은 변 대비 가로 크기(%). 세로는 원본 비율로 계산한다 */
  widthPct: number;
  rotationDeg: number;
  /** 0~100 */
  opacityPct: number;
  stageWidth: number;
  stageHeight: number;
  /** 컬러 오버레이 색. 있으면 이미지의 불투명한 부분에 이 색을 입힌다(알파 모양 유지) */
  overlayColor?: string;
}

/**
 * 이미지 레이어 합성(PRD §4.2): 리본 레이어 위에 업로드한 PNG/SVG를 고정 위치로 얹는다.
 * 위치·크기는 스테이지 기준 비율(%)로 계산해 스테이지 비율이 바뀌어도 상대 위치·크기가
 * 유지된다. 재생 중에도(곡선 진행과 무관하게) 항상 같은 값으로 호출하면 고정된 것처럼 보인다
 * — 곡선을 따라가지 않는 것은 호출자가 매 프레임 같은 인자를 넘기는 것으로 충분하다.
 */
export function drawImageLayer(
  ctx: Canvas2DContextLike,
  input: ImageLayerRenderInput,
  createCanvas?: CanvasFactory
): void {
  const { image, xPct, yPct, widthPct, rotationDeg, opacityPct, stageWidth, stageHeight, overlayColor } = input;
  if (!(image.width > 0) || !(image.height > 0)) return;
  const shortSide = Math.min(stageWidth, stageHeight);
  const dw = (widthPct / 100) * shortSide;
  const dh = (dw * image.height) / image.width;
  const cx = (xPct / 100) * stageWidth;
  const cy = (yPct / 100) * stageHeight;
  const rad = (rotationDeg * Math.PI) / 180;
  const cs = Math.cos(rad);
  const sn = Math.sin(rad);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, opacityPct / 100));
  ctx.setTransform(cs, sn, -sn, cs, cx, cy);
  ctx.drawImage(overlayColor && createCanvas ? tintImage(createCanvas, image, overlayColor) : image, -dw / 2, -dh / 2, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = prevAlpha;
}

/**
 * 원본 크기 임시 캔버스에 이미지를 그린 뒤 `source-in`으로 색을 채운다. 알파 모양은 유지하고
 * 색만 바뀐다. 불투명도는 호출자(drawImageLayer)가 이 결과를 그릴 때 적용한다.
 */
function tintImage(createCanvas: CanvasFactory, image: ImageSourceLike, color: string): CanvasLike {
  const tmp = createCanvas(image.width, image.height);
  const tctx = tmp.getContext('2d');
  tctx.drawImage(image, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, image.width, image.height);
  return tmp;
}

export interface TextLayerRenderInput {
  /** 여러 줄은 개행 문자(\n)로 구분한다 */
  content: string;
  font: { family: string; weight: number };
  /** 스테이지 짧은 변 대비 글자 크기(%) */
  sizePct: number;
  /** 글자 크기 대비 자간 배수(0=기본 간격) */
  letterSpacing: number;
  /** 글자 크기 대비 행간 배수(예: 1.2) */
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  color: string;
  /** 텍스트 앵커의 스테이지 기준 위치(%) — 가로는 정렬 앵커(왼쪽 끝·가운데·오른쪽 끝), 세로는 전체 줄 높이의 중심 */
  xPct: number;
  yPct: number;
  rotationDeg: number;
  /** 0~100 */
  opacityPct: number;
  stageWidth: number;
  stageHeight: number;
}

/**
 * 텍스트 레이어 합성(PRD §4.3): 리본·이미지 레이어 위에 글자를 얹는다. 위치·크기는 이미지
 * 레이어와 같은 방식(스테이지 기준 비율)으로 계산해 스테이지 비율이 바뀌어도 상대 위치·크기가
 * 유지된다. `(xPct, yPct)`의 가로(x)는 정렬 앵커(왼쪽=텍스트 왼쪽 끝, 가운데=가운데, 오른쪽=오른쪽 끝),
 * 세로(y)는 전체 텍스트(여러 줄 포함) 높이의 중심을 가리킨다.
 *
 * 자간은 `ctx.letterSpacing`(브라우저 일부·서버 캔버스 라이브러리 다수가 지원하지 않는다)에
 * 기대지 않고, `measureText`로 각 글자 폭을 재서 글자 단위로 위치를 계산해 그린다 — 이 모듈이
 * 브라우저·서버 어느 쪽에서도 같은 결과를 내야 하기 때문이다(파일 상단 주석).
 */
export function drawTextLayer(ctx: Canvas2DContextLike, input: TextLayerRenderInput): void {
  const { content, font, sizePct, letterSpacing, lineHeight, align, color, xPct, yPct, rotationDeg, opacityPct, stageWidth, stageHeight } =
    input;
  const shortSide = Math.min(stageWidth, stageHeight);
  const fontSizePx = (sizePct / 100) * shortSide;
  if (fontSizePx <= 0) return;
  const letterSpacingPx = letterSpacing * fontSizePx;
  const lineHeightPx = lineHeight * fontSizePx;
  const cx = (xPct / 100) * stageWidth;
  const cy = (yPct / 100) * stageHeight;
  const rad = (rotationDeg * Math.PI) / 180;
  const cs = Math.cos(rad);
  const sn = Math.sin(rad);

  const lines = content.split('\n');
  // 글자 단위로 쪼개 각 글자의 폭을 잰다(서로게이트 페어 등 유니코드 낱글자 단위 — Array.from).
  const lineChars = lines.map((line) => Array.from(line));

  const prevFont = ctx.font;
  const prevAlign = ctx.textAlign;
  const prevBaseline = ctx.textBaseline;
  const prevFillStyle = ctx.fillStyle;
  const prevAlpha = ctx.globalAlpha;

  ctx.font = `${font.weight} ${fontSizePx}px "${font.family}"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.max(0, Math.min(1, opacityPct / 100));

  const lineWidths = lineChars.map((chars) =>
    chars.reduce((sum, ch, i) => sum + ctx.measureText(ch).width + (i < chars.length - 1 ? letterSpacingPx : 0), 0)
  );
  const blockHeight = lineHeightPx * lines.length;

  ctx.setTransform(cs, sn, -sn, cs, cx, cy);
  lineChars.forEach((chars, lineIndex) => {
    const lineWidth = lineWidths[lineIndex];
    const lineY = (lineIndex + 0.5) * lineHeightPx - blockHeight / 2;
    let startX: number;
    // 회전 좌표계 원점이 앵커다. 줄마다 같은 앵커에 왼쪽·가운데·오른쪽으로 맞춘다.
    if (align === 'left') startX = 0;
    else if (align === 'right') startX = -lineWidth;
    else startX = -lineWidth / 2;

    let cursorX = startX;
    chars.forEach((ch) => {
      ctx.fillText(ch, cursorX, lineY);
      cursorX += ctx.measureText(ch).width + letterSpacingPx;
    });
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.font = prevFont;
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBaseline;
  ctx.fillStyle = prevFillStyle;
  ctx.globalAlpha = prevAlpha;
}
