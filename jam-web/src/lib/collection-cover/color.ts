/**
 * 컬렉션 표지 색 계산 (티켓 20261124_1743, 상위 20261124_1741 «표지 규칙»).
 * 순수 함수만 둔다 — 브라우저·서버에서 같은 시드면 같은 배경색이 나온다.
 */

export type Rgb = [number, number, number];

/** 표지 기본 잉크색(제목 기본색, 흰색이 대비 3 미만일 때 하단 글씨 색) */
export const INK_HEX = '#161412';
/** 배경 채도 하한 — 이보다 칙칙한 색은 버린다 */
export const C_MIN = 0.15;

export const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

export const rgbToHex = (c: readonly number[]): string =>
  '#' +
  c
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('');

const lin = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: readonly number[]): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

export function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [색상각 0~360, 채도 0~1, 명도 0~1] */
export function rgbToHsl([r0, g0, b0]: readonly number[]): [number, number, number] {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** sRGB(0~255) → OKLab [L, a, b] */
export function srgbToOklab([R, G, B]: readonly number[]): [number, number, number] {
  const r = lin(R);
  const g = lin(G);
  const b = lin(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const encode = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const inGamut = (c: readonly number[]): boolean => c.every((v) => v >= -0.0005 && v <= 1.0005);

/** 그 밝기·색상각에서 sRGB 안에 드는 최대 채도 */
export function maxChroma(L: number, h: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function oklchToRgb(L: number, C: number, h: number): Rgb {
  return oklchToLinear(L, C, h).map((v) =>
    Math.round(Math.max(0, Math.min(255, encode(Math.max(0, Math.min(1, v))))))
  ) as Rgb;
}

/** 시드 문자열: 컬렉션 id + 다시 뽑기 횟수 */
export const coverSeed = (collectionId: string, rerolls: number): string => `${collectionId}#${rerolls}`;

/** 문자열 시드 난수(0 이상 1 미만) */
export function rng(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export interface GeneratedBackground {
  hex: string;
  rgb: Rgb;
  oklch: { L: number; C: number; h: number };
  /** 0이면 배지 70°·색 거리 0.08 조건 그대로 찾은 것, 1·2면 50°/0.05, 30°/0으로 완화한 것 */
  relaxStep: number;
}

/** 완화 단계 [배지 색상각 간격, 다른 표지와의 OKLab 색 거리 하한] */
const RELAX_STEPS: ReadonlyArray<readonly [number, number]> = [
  [70, 0.08],
  [50, 0.05],
  [30, 0],
];

/** 그 색상각에서 L 0.30~0.95(0.01 간격) 중 가장 높은 최대 채도 */
export function peakChroma(h: number): number {
  let peak = 0;
  for (let i = 30; i <= 95; i++) peak = Math.max(peak, maxChroma(i / 100, h));
  return peak;
}

const oklabDist = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * 배경색 생성(OKLCH, 티켓 20261124_2102). 색상 h를 먼저 정하고(배지 간격 미만이면 다음 색상),
 * 그 색상 안에서 최대 40번 L(0.30~0.92)·채도 비율 k(0.60~0.96)를 뽑는다. 난수 순서는 h, (L, k) 쌍 순.
 * C = 그 L·h의 최대 채도 × k. 채도 하한 = min(0.15, 0.85 × 그 색상 최고 채도).
 * 다른 표지 배경(usedColors)과 OKLab 거리가 하한 미만이면 버린다.
 * 제목 대비: 선화 배지는 검정 제목 대비 4.5 이상만(어두운 배경 불가), 그 밖에는 검정 또는 흰 제목 대비 4 이상.
 */
export function generateBackground(args: {
  seed: string;
  badge: { okHue: number | null; lineArt: boolean };
  usedColors: readonly string[];
}): GeneratedBackground {
  const { seed, badge, usedColors } = args;
  const r = rng(seed);
  const ink = hexToRgb(INK_HEX);
  const white: Rgb = [255, 255, 255];
  const usedLabs = usedColors.map((c) => srgbToOklab(hexToRgb(c)));
  for (let step = 0; step < RELAX_STEPS.length; step++) {
    const [badgeGap, minDist] = RELAX_STEPS[step];
    for (let i = 0; i < 300; i++) {
      const h = r() * 360;
      if (badge.okHue != null && hueDist(h, badge.okHue) < badgeGap) continue;
      const cMin = Math.min(C_MIN, 0.85 * peakChroma(h));
      for (let j = 0; j < 40; j++) {
        const L = 0.3 + r() * 0.62;
        const k = 0.6 + r() * 0.36;
        const C = maxChroma(L, h) * k;
        if (C < cMin) continue;
        const rgb = oklchToRgb(L, C, h);
        if (minDist > 0) {
          const lab = srgbToOklab(rgb);
          if (usedLabs.some((u) => oklabDist(lab, u) < minDist)) continue;
        }
        const onInk = contrastRatio(rgb, ink);
        if (badge.lineArt ? onInk < 4.5 : onInk < 4 && contrastRatio(rgb, white) < 4) continue;
        return { hex: rgbToHex(rgb), rgb, oklch: { L, C, h }, relaxStep: step };
      }
    }
  }
  throw new Error('배경색 후보를 찾지 못했어요');
}

export interface TextColors {
  title: string;
  tribe: string;
  join: string;
}

/**
 * 제목: 검정(잉크색) 대비 4 이상이면 검정, 아니면 흰색·검정 중 대비가 큰 쪽.
 * 하단 글씨: 배경 대비 3 이상이면 흰색 아니면 잉크색.
 */
export function defaultTextColors(bgRgb: readonly number[]): TextColors {
  const onInk = contrastRatio(hexToRgb(INK_HEX), bgRgb);
  const onWhite = contrastRatio([255, 255, 255], bgRgb);
  const title = onInk >= 4 ? INK_HEX : onWhite > onInk ? '#ffffff' : INK_HEX;
  const bottom = onWhite >= 3 ? '#ffffff' : INK_HEX;
  return { title, tribe: bottom, join: bottom };
}
