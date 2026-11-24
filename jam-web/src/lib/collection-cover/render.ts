/**
 * 컬렉션 표지 그리기 (티켓 20261124_1743, 상위 20261124_1741 «표지 규칙»).
 * 캔버스 생성은 호출부가 주입한다 — 브라우저(미리보기)와 서버(`@napi-rs/canvas`, 시험)가 같은 코드를 쓴다.
 * 글꼴은 호출부가 먼저 등록하고, 이 모듈은 글꼴 이름만 받는다.
 */
import { alphaBounds, analyzeBadgePixels, dilateMask, DILATE_PAD, outlineInteriorMask } from './badge';
import {
  defaultTextColors,
  generateBackground,
  hexToRgb,
  coverSeed,
  type TextColors,
} from './color';
import {
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
  getContext(kind: '2d'): CoverContextLike;
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
  /** 다른 컬렉션 표지 배경의 OKLCH 색상각 */
  usedHues: readonly number[];
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

const W = COVER_SIZE;
const H = COVER_SIZE;
const ANALYZE_MAX = 128;

export function renderCollectionCover(
  canvas: CoverCanvasLike,
  input: CollectionCoverInput,
  deps: CoverDeps
): CollectionCoverResult {
  const { createCanvas, fontFamily = 'Sour Gummy' } = deps;
  if (canvas.width !== W || canvas.height !== H) throw new Error(`표지 캔버스는 ${W}×${H}여야 해요`);
  const x = canvas.getContext('2d');
  const img = input.badgeImage;

  // 배지 분석(128px 안으로 줄여서)과 투명 여백 계산
  const ak = Math.min(1, ANALYZE_MAX / Math.max(img.width, img.height));
  const aw = Math.max(1, Math.round(img.width * ak));
  const ah = Math.max(1, Math.round(img.height * ak));
  const ac = createCanvas(aw, ah);
  ac.getContext('2d').drawImage(img, 0, 0, aw, ah);
  const analysis = analyzeBadgePixels(ac.getContext('2d').getImageData(0, 0, aw, ah).data);

  const fc = createCanvas(img.width, img.height);
  fc.getContext('2d').drawImage(img, 0, 0);
  const bounds = alphaBounds(fc.getContext('2d').getImageData(0, 0, img.width, img.height).data, img.width, img.height);
  if (!bounds) throw new Error('대표 배지에 보이는 픽셀이 없어요');

  // 배경색과 글자색
  let bgHex: string;
  let bgSource: 'generated' | 'override';
  let relaxStep: number | null = null;
  if (input.bgOverride) {
    bgHex = input.bgOverride.toLowerCase();
    bgSource = 'override';
  } else {
    const bg = generateBackground({
      seed: coverSeed(input.seed, input.rerolls),
      badge: analysis,
      usedHues: input.usedHues,
    });
    bgHex = bg.hex;
    bgSource = 'generated';
    relaxStep = bg.relaxStep;
  }
  const textColors: TextColors = { ...defaultTextColors(hexToRgb(bgHex)), ...input.textColorOverrides };

  // 1) 바탕색 + 그라데이션
  x.fillStyle = bgHex;
  x.fillRect(0, 0, W, H);
  let g = x.createRadialGradient(W * 0.28, H * 0.18, 0, W * 0.28, H * 0.18, W * 1.05);
  g.addColorStop(0, 'rgba(255,250,240,0.12)');
  g.addColorStop(0.55, 'rgba(255,250,240,0.03)');
  g.addColorStop(1, 'rgba(255,250,240,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.01)');
  g.addColorStop(1, 'rgba(20,10,0,0.07)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  // 2) 종이 얼룩
  const mc = createCanvas(40, 40);
  const mx = mc.getContext('2d');
  const md = mx.createImageData(40, 40);
  for (let i = 0; i < md.data.length; i += 4) {
    const v = 110 + Math.random() * 36;
    md.data[i] = md.data[i + 1] = md.data[i + 2] = v;
    md.data[i + 3] = 255;
  }
  mx.putImageData(md, 0, 0);
  x.save();
  x.globalCompositeOperation = 'soft-light';
  x.globalAlpha = 0.3;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(mc, 0, 0, W, H);
  x.restore();

  const bgSnap = createCanvas(W, H);
  bgSnap.getContext('2d').drawImage(canvas, 0, 0);

  // 글자 측정(잉크 경계, textAlign left)
  const measure = (text: string, px: number): InkMetrics => {
    x.font = `${px}px "${fontFamily}"`;
    x.textAlign = 'left';
    const m = x.measureText(text);
    return {
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
    };
  };

  // 3) 제목
  const title = layoutTitle(measure, input.titleEn);
  x.fillStyle = textColors.title;
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.font = `${title.fontPx}px "${fontFamily}"`;
  for (const line of title.lines) x.fillText(line.text, line.x, line.y);

  // 4) 하단(트라이브 이름 + JOIN AND MOVE)
  const bottom = layoutBottom(measure, input.tribeEn);
  x.textAlign = 'center';
  x.fillStyle = textColors.tribe;
  x.font = `${bottom.tribePx}px "${fontFamily}"`;
  x.fillText(input.tribeEn, W / 2, bottom.tribeY);
  x.fillStyle = textColors.join;
  x.font = `${bottom.joinPx}px "${fontFamily}"`;
  x.fillText(JOIN_TEXT, W / 2, bottom.joinY);

  // 5) 대표 배지: 여백을 잘라 긴 변 450px, 외곽선 안쪽을 바탕 사본으로 먼저 덮는다
  const place = placeBadge(bounds.w, bounds.h, title.bottom, bottom.top);
  const bc = createCanvas(place.width, place.height);
  const bx = bc.getContext('2d');
  bx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, place.width, place.height);
  const bd = bx.getImageData(0, 0, place.width, place.height).data;
  const interior = outlineInteriorMask(bd, place.width, place.height);

  const pad = DILATE_PAD;
  const pw = place.width + pad * 2;
  const ph = place.height + pad * 2;
  const padded = new Uint8Array(pw * ph);
  for (let yy = 0; yy < place.height; yy++) {
    for (let xx = 0; xx < place.width; xx++) padded[(yy + pad) * pw + xx + pad] = interior[yy * place.width + xx];
  }
  const grown = dilateMask(padded, pw, ph);
  const hc = createCanvas(pw, ph);
  const hx = hc.getContext('2d');
  const hd = hx.createImageData(pw, ph);
  for (let i = 0; i < grown.length; i++) {
    hd.data[i * 4] = hd.data[i * 4 + 1] = hd.data[i * 4 + 2] = 255;
    hd.data[i * 4 + 3] = grown[i] ? 255 : 0;
  }
  hx.putImageData(hd, 0, 0);
  // 마스크 모양 그대로 바탕 사본을 잘라 붙인다
  hx.globalCompositeOperation = 'source-in';
  hx.drawImage(bgSnap, place.x - pad, place.y - pad, pw, ph, 0, 0, pw, ph);
  x.drawImage(hc, place.x - pad, place.y - pad);
  x.drawImage(bc, place.x, place.y);

  // 6) 고운 그레인
  const id = x.getImageData(0, 0, W, H);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() + Math.random() + Math.random() - 1.5) * 11;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  x.putImageData(id, 0, 0);

  return {
    bgHex,
    bgSource,
    textColors,
    layout: { title, bottom, badge: place },
    badgeOkHue: analysis.okHue,
    lineArt: analysis.lineArt,
    relaxStep,
  };
}
