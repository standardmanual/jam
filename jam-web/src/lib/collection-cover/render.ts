/**
 * 컬렉션 표지 그리기 (티켓 20261124_1743, 상위 20261124_1741 «표지 규칙»).
 * 캔버스 생성은 호출부가 주입한다 — 브라우저(미리보기)와 서버(`@napi-rs/canvas`, 시험)가 같은 코드를 쓴다.
 * 글꼴은 호출부가 먼저 등록하고, 이 모듈은 글꼴 이름만 받는다.
 */
import { alphaBounds, analyzeBadgePixels, dilateMask, DILATE_PAD, outlineInteriorMask } from './badge';
import {
  defaultTextColors,
  hexToRgb,
  resolveCoverBackground,
  type TextColors,
} from './color';
import {
  badgeDisplaySize,
  COVER_SIZE,
  JOIN_TEXT,
  layoutBottom,
  layoutTitle,
  placeBadge,
  type BadgePlacement,
  type BottomLayout,
  type InkMetrics,
  type TitleLayout,
} from './layout';

export interface CoverImageSource {
  readonly width: number;
  readonly height: number;
}

export interface CoverGradient {
  addColorStop(offset: number, color: string): void;
}

export interface CoverImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** 이 모듈이 실제로 쓰는 2D 컨텍스트 메서드·속성만 담은 최소 인터페이스 */
export interface CoverContextLike {
  drawImage(image: CoverImageSource, dx: number, dy: number): void;
  drawImage(image: CoverImageSource, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: CoverImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CoverGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CoverGradient;
  createImageData(w: number, h: number): CoverImageData;
  getImageData(x: number, y: number, w: number, h: number): CoverImageData;
  putImageData(data: CoverImageData, x: number, y: number): void;
  save(): void;
  restore(): void;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): {
    width: number;
    actualBoundingBoxLeft: number;
    actualBoundingBoxRight: number;
    actualBoundingBoxAscent: number;
    actualBoundingBoxDescent: number;
  };
  fillStyle: string | CoverGradient;
  globalCompositeOperation: string;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality?: string;
}

export interface CoverCanvasLike extends CoverImageSource {
  getContext(kind: '2d', options?: { willReadFrequently?: boolean }): CoverContextLike;
}

export type CoverCanvasFactory = (width: number, height: number) => CoverCanvasLike;

export interface CoverDeps {
  createCanvas: CoverCanvasFactory;
  /** 호출부가 미리 등록한 글꼴 이름. 기본 Sour Gummy(굵기 800 파일) */
  fontFamily?: string;
}

export interface CollectionCoverInput {
  titleEn: string;
  tribeEn: string;
  /** 로드가 끝난 대표 배지 이미지(투명 PNG) */
  badgeImage: CoverImageSource;
  /** 컬렉션 id. 배경색 시드는 `${seed}#${rerolls}` */
  seed: string;
  rerolls: number;
  /** 다른 컬렉션 표지 배경색(#rrggbb) 목록 */
  usedColors: readonly string[];
  /** 지정하면 생성 대신 이 색(#rrggbb)을 쓴다 */
  bgOverride?: string;
  textColorOverrides?: Partial<TextColors>;
}

export interface CollectionCoverResult {
  bgHex: string;
  bgSource: 'generated' | 'override';
  textColors: TextColors;
  layout: { title: TitleLayout; bottom: BottomLayout; badge: BadgePlacement };
  badgeOkHue: number | null;
  lineArt: boolean;
  /** 생성한 경우만. 0이면 조건 완화 없이 찾은 것. bgOverride면 null */
  relaxStep: number | null;
}

export interface PreparedCoverBadge {
  analysis: { okHue: number | null; lineArt: boolean };
  bounds: { x: number; y: number; w: number; h: number };
  badgeWidth: number;
  badgeHeight: number;
  badgeCanvas: CoverCanvasLike;
  haloMaskCanvas: CoverCanvasLike;
  haloPad: number;
}

export interface PreparedCoverDrawInput {
  titleEn: string;
  tribeEn: string;
  preparedBadge: PreparedCoverBadge;
  bgHex: string;
  bgSource: 'generated' | 'override';
  relaxStep: number | null;
  textColors: TextColors;
  /** 'skip': 드래그 중 빠른 GPU 합성, 'exact': 정착·저장용 정밀 그레인 포함(기본값) */
  grain?: 'skip' | 'exact';
}

export interface CoverRenderer {
  render(canvas: CoverCanvasLike, input: PreparedCoverDrawInput): CollectionCoverResult;
}

const W = COVER_SIZE;
const H = COVER_SIZE;
const ANALYZE_MAX = 128;

/**
 * 배지 이미지당 1회만 수행하는 무거운 분석·여백·외곽 마스크 준비 단계(티켓 20261124_2159).
 * 색이나 제목이 바뀌어도 배지 이미지가 같으면 그대로 재사용한다.
 */
export function prepareCoverBadge(
  badgeImage: CoverImageSource,
  createCanvas: CoverCanvasFactory
): PreparedCoverBadge {
  const ak = Math.min(1, ANALYZE_MAX / Math.max(badgeImage.width, badgeImage.height));
  const aw = Math.max(1, Math.round(badgeImage.width * ak));
  const ah = Math.max(1, Math.round(badgeImage.height * ak));
  const ac = createCanvas(aw, ah);
  const ax = ac.getContext('2d', { willReadFrequently: true });
  ax.drawImage(badgeImage, 0, 0, aw, ah);
  const analysis = analyzeBadgePixels(ax.getImageData(0, 0, aw, ah).data);

  const fc = createCanvas(badgeImage.width, badgeImage.height);
  const fx = fc.getContext('2d', { willReadFrequently: true });
  fx.drawImage(badgeImage, 0, 0);
  const bounds = alphaBounds(fx.getImageData(0, 0, badgeImage.width, badgeImage.height).data, badgeImage.width, badgeImage.height);
  if (!bounds) throw new Error('대표 배지에 보이는 픽셀이 없어요');

  const { width: badgeWidth, height: badgeHeight } = badgeDisplaySize(bounds.w, bounds.h);
  const badgeCanvas = createCanvas(badgeWidth, badgeHeight);
  const bx = badgeCanvas.getContext('2d', { willReadFrequently: true });
  bx.drawImage(badgeImage, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, badgeWidth, badgeHeight);
  const bd = bx.getImageData(0, 0, badgeWidth, badgeHeight).data;
  const interior = outlineInteriorMask(bd, badgeWidth, badgeHeight);

  const haloPad = DILATE_PAD;
  const pw = badgeWidth + haloPad * 2;
  const ph = badgeHeight + haloPad * 2;
  const padded = new Uint8Array(pw * ph);
  for (let yy = 0; yy < badgeHeight; yy++) {
    const dst = (yy + haloPad) * pw + haloPad;
    const src = yy * badgeWidth;
    for (let xx = 0; xx < badgeWidth; xx++) padded[dst + xx] = interior[src + xx];
  }
  const grown = dilateMask(padded, pw, ph);
  const haloMaskCanvas = createCanvas(pw, ph);
  const hx = haloMaskCanvas.getContext('2d');
  const hd = hx.createImageData(pw, ph);
  for (let i = 0; i < grown.length; i++) {
    const o = i * 4;
    hd.data[o] = hd.data[o + 1] = hd.data[o + 2] = 255;
    hd.data[o + 3] = grown[i] ? 255 : 0;
  }
  hx.putImageData(hd, 0, 0);

  return {
    analysis,
    bounds,
    badgeWidth,
    badgeHeight,
    badgeCanvas,
    haloMaskCanvas,
    haloPad,
  };
}

function createMottleCanvas(createCanvas: CoverCanvasFactory): CoverCanvasLike {
  const mc = createCanvas(40, 40);
  const mx = mc.getContext('2d');
  const md = mx.createImageData(40, 40);
  for (let i = 0; i < md.data.length; i += 4) {
    const v = 110 + Math.random() * 36;
    md.data[i] = md.data[i + 1] = md.data[i + 2] = v;
    md.data[i + 3] = 255;
  }
  mx.putImageData(md, 0, 0);
  return mc;
}

function createGrainDeltas(): Int8Array {
  const deltas = new Int8Array(W * H);
  for (let i = 0; i < deltas.length; i++) {
    deltas[i] = Math.round((Math.random() + Math.random() + Math.random() - 1.5) * 11);
  }
  return deltas;
}

function createShadeCanvas(createCanvas: CoverCanvasFactory): CoverCanvasLike {
  const sc = createCanvas(W, H);
  const sx = sc.getContext('2d');
  let g = sx.createRadialGradient(W * 0.28, H * 0.18, 0, W * 0.28, H * 0.18, W * 1.05);
  g.addColorStop(0, 'rgba(255,250,240,0.12)');
  g.addColorStop(0.55, 'rgba(255,250,240,0.03)');
  g.addColorStop(1, 'rgba(255,250,240,0)');
  sx.fillStyle = g;
  sx.fillRect(0, 0, W, H);
  g = sx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.01)');
  g.addColorStop(1, 'rgba(20,10,0,0.07)');
  sx.fillStyle = g;
  sx.fillRect(0, 0, W, H);
  return sc;
}

function paintBackground(
  x: CoverContextLike,
  bgHex: string,
  shadeCanvas: CoverCanvasLike,
  mottleCanvas: CoverCanvasLike
): void {
  x.fillStyle = bgHex;
  x.fillRect(0, 0, W, H);
  x.drawImage(shadeCanvas, 0, 0);

  x.save();
  x.globalCompositeOperation = 'soft-light';
  x.globalAlpha = 0.3;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(mottleCanvas, 0, 0, W, H);
  x.restore();
}

/**
 * 반복 미리보기용 캐시 렌더러(티켓 20261124_2159).
 * 종이 얼룩·빛/그늘 레이어·바탕 사본·마스크 합성 버퍼·그레인 작업 버퍼·레이아웃을 재사용해 색 조정 시 GPU 합성만 수행한다.
 */
export function createCoverRenderer(deps: CoverDeps): CoverRenderer {
  const { createCanvas, fontFamily = 'Sour Gummy' } = deps;
  let mottleCanvas: CoverCanvasLike | null = null;
  let shadeCanvas: CoverCanvasLike | null = null;
  let bgSnap: CoverCanvasLike | null = null;
  let bgSnapHex: string | null = null;
  let haloScratch: CoverCanvasLike | null = null;
  let grainWorkCanvas: CoverCanvasLike | null = null;
  let grainDeltas: Int8Array | null = null;
  let layoutCache: {
    key: string;
    title: TitleLayout;
    bottom: BottomLayout;
    badge: BadgePlacement;
  } | null = null;

  return {
    render(canvas: CoverCanvasLike, input: PreparedCoverDrawInput): CollectionCoverResult {
      if (canvas.width !== W || canvas.height !== H) throw new Error(`표지 캔버스는 ${W}×${H}여야 해요`);
      const grain = input.grain ?? 'exact';
      const displayCtx = canvas.getContext('2d');

      // 정밀 그레인은 willReadFrequently 오프스크린 버퍼에서 처리해 화면 캔버스의 GPU readback을 피한다
      let targetCtx = displayCtx;
      if (grain === 'exact') {
        if (!grainWorkCanvas) grainWorkCanvas = createCanvas(W, H);
        targetCtx = grainWorkCanvas.getContext('2d', { willReadFrequently: true });
      }

      if (!mottleCanvas) mottleCanvas = createMottleCanvas(createCanvas);
      if (!shadeCanvas) shadeCanvas = createShadeCanvas(createCanvas);
      if (!bgSnap) bgSnap = createCanvas(W, H);
      if (bgSnapHex !== input.bgHex) {
        paintBackground(bgSnap.getContext('2d'), input.bgHex, shadeCanvas, mottleCanvas);
        bgSnapHex = input.bgHex;
      }
      targetCtx.drawImage(bgSnap, 0, 0);

      const { bounds, badgeCanvas, haloMaskCanvas, haloPad } = input.preparedBadge;
      const layoutKey = `${input.titleEn}\0${input.tribeEn}\0${bounds.w}\0${bounds.h}`;
      if (!layoutCache || layoutCache.key !== layoutKey) {
        const measure = (text: string, px: number): InkMetrics => {
          targetCtx.font = `${px}px "${fontFamily}"`;
          targetCtx.textAlign = 'left';
          const m = targetCtx.measureText(text);
          return {
            left: m.actualBoundingBoxLeft,
            right: m.actualBoundingBoxRight,
            ascent: m.actualBoundingBoxAscent,
            descent: m.actualBoundingBoxDescent,
          };
        };
        const title = layoutTitle(measure, input.titleEn);
        const bottom = layoutBottom(measure, input.tribeEn);
        const badge = placeBadge(bounds.w, bounds.h, title.bottom, bottom.top);
        layoutCache = { key: layoutKey, title, bottom, badge };
      }
      const { title, bottom, badge: place } = layoutCache;

      // 제목
      targetCtx.fillStyle = input.textColors.title;
      targetCtx.textAlign = 'left';
      targetCtx.textBaseline = 'alphabetic';
      targetCtx.font = `${title.fontPx}px "${fontFamily}"`;
      for (const line of title.lines) targetCtx.fillText(line.text, line.x, line.y);

      // 하단(트라이브 이름 + JOIN AND MOVE)
      targetCtx.textAlign = 'center';
      targetCtx.fillStyle = input.textColors.tribe;
      targetCtx.font = `${bottom.tribePx}px "${fontFamily}"`;
      targetCtx.fillText(input.tribeEn, W / 2, bottom.tribeY);
      targetCtx.fillStyle = input.textColors.join;
      targetCtx.font = `${bottom.joinPx}px "${fontFamily}"`;
      targetCtx.fillText(JOIN_TEXT, W / 2, bottom.joinY);

      // 대표 배지: 캐시된 외곽 마스크로 바탕 사본을 잘라 덮은 뒤 배지를 올린다
      const pw = haloMaskCanvas.width;
      const ph = haloMaskCanvas.height;
      if (!haloScratch || haloScratch.width !== pw || haloScratch.height !== ph) {
        haloScratch = createCanvas(pw, ph);
      }
      const hx = haloScratch.getContext('2d');
      hx.globalCompositeOperation = 'source-over';
      hx.clearRect(0, 0, pw, ph);
      hx.drawImage(haloMaskCanvas, 0, 0);
      hx.globalCompositeOperation = 'source-in';
      hx.drawImage(bgSnap, place.x - haloPad, place.y - haloPad, pw, ph, 0, 0, pw, ph);
      targetCtx.drawImage(haloScratch, place.x - haloPad, place.y - haloPad);
      targetCtx.drawImage(badgeCanvas, place.x, place.y);

      // 고운 그레인(정착·저장 시)
      if (grain === 'exact' && grainWorkCanvas) {
        if (!grainDeltas) grainDeltas = createGrainDeltas();
        const id = targetCtx.getImageData(0, 0, W, H);
        const d = id.data;
        for (let p = 0; p < grainDeltas.length; p++) {
          const n = grainDeltas[p];
          const o = p * 4;
          d[o] += n;
          d[o + 1] += n;
          d[o + 2] += n;
        }
        targetCtx.putImageData(id, 0, 0);
        displayCtx.drawImage(grainWorkCanvas, 0, 0);
      }

      return {
        bgHex: input.bgHex,
        bgSource: input.bgSource,
        textColors: input.textColors,
        layout: { title, bottom, badge: place },
        badgeOkHue: input.preparedBadge.analysis.okHue,
        lineArt: input.preparedBadge.analysis.lineArt,
        relaxStep: input.relaxStep,
      };
    },
  };
}

export function renderCollectionCover(
  canvas: CoverCanvasLike,
  input: CollectionCoverInput,
  deps: CoverDeps
): CollectionCoverResult {
  const preparedBadge = prepareCoverBadge(input.badgeImage, deps.createCanvas);
  const bg = resolveCoverBackground({
    seed: input.seed,
    rerolls: input.rerolls,
    badge: preparedBadge.analysis,
    usedColors: input.usedColors,
    bgOverride: input.bgOverride,
  });
  const textColors: TextColors = { ...defaultTextColors(hexToRgb(bg.bgHex)), ...input.textColorOverrides };
  return createCoverRenderer(deps).render(canvas, {
    titleEn: input.titleEn,
    tribeEn: input.tribeEn,
    preparedBadge,
    bgHex: bg.bgHex,
    bgSource: bg.bgSource,
    relaxStep: bg.relaxStep,
    textColors,
    grain: 'exact',
  });
}
