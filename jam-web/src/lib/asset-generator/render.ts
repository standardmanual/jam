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
  fillStyle: string | CanvasGradientLike;
  globalCompositeOperation: string;
  /** 블러 등 CSS 필터. 미지원 환경(구형 Safari 등)에서는 대입해도 반영되지 않는다 */
  filter: string;
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
 * 레이어 합성 훅: 스테이지 배경을 채운다. 후속 티켓에서 이미지·텍스트 레이어를
 * `fillBackground` → `drawRibbonLayer` 다음 순서로 이 자리에 이어 그린다(PRD §4 레이어 순서).
 */
export function fillBackground(ctx: Canvas2DContextLike, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}
