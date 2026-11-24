/**
 * 배지 픽셀 분석 — RGBA 바이트 배열만 받는 순수 함수 (티켓 20261124_1743).
 * 브라우저·서버 캔버스가 같은 결과를 내도록 `ctx.filter`·sharp에 기대지 않는다.
 */
import { rgbToHsl, srgbToOklab } from './color';

type Bytes = ArrayLike<number>;

/** 불투명 픽셀(알파 128 이상)로 주된 색상(OKLab a·b 평균 각도)과 선화 여부를 판정한다 */
export function analyzeBadgePixels(data: Bytes): { okHue: number | null; lineArt: boolean } {
  let n = 0;
  let sat = 0;
  let ox = 0;
  let oy = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const c = [data[i], data[i + 1], data[i + 2]];
    const [, s, l] = rgbToHsl(c);
    n++;
    if (s > 0.25 && l > 0.12 && l < 0.9) {
      const [, oa, ob] = srgbToOklab(c);
      ox += oa;
      oy += ob;
      sat++;
    }
  }
  const chromatic = n > 0 && sat / n > 0.12;
  return {
    okHue: chromatic ? ((Math.atan2(oy, ox) * 180) / Math.PI + 360) % 360 : null,
    lineArt: !chromatic,
  };
}

/** 투명 여백을 뺀 영역(알파 10 초과). 보이는 픽셀이 없으면 null */
export function alphaBounds(data: Bytes, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 10) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 외곽선 안쪽 마스크(1=안쪽). 알파 24 초과를 벽으로 보고 가장자리에서 바깥을 채운 나머지다.
 * 선화처럼 속이 빈 배지도 고리 안쪽까지 안쪽으로 잡힌다.
 */
export function outlineInteriorMask(data: Bytes, w: number, h: number): Uint8Array {
  const total = w * h;
  const outside = new Uint8Array(total);
  const stack = new Int32Array(total);
  let sp = 0;
  const push = (i: number) => {
    if (outside[i] || data[i * 4 + 3] > 24) return;
    outside[i] = 1;
    stack[sp++] = i;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (sp > 0) {
    const i = stack[--sp];
    const px = i % w;
    const py = (i - px) / w;
    if (px > 0) push(i - 1);
    if (px < w - 1) push(i + 1);
    if (py > 0) push(i - w);
    if (py < h - 1) push(i + w);
  }
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) mask[i] = outside[i] ? 0 : 1;
  return mask;
}

const SIGMA = 4;
const RADIUS = SIGMA * 3;
const KERNEL = (() => {
  const k: number[] = [];
  let sum = 0;
  for (let i = -RADIUS; i <= RADIUS; i++) {
    const v = Math.exp(-(i * i) / (2 * SIGMA * SIGMA));
    k.push(v);
    sum += v;
  }
  return k.map((v) => v / sum);
})();

/** 흐림이 번지는 거리(px). 호출부가 마스크 둘레에 이만큼 이상 여백을 둬서 넘긴다 */
export const DILATE_PAD = RADIUS + 4;

/**
 * «표준편차 4px 가우시안 흐림 뒤 알파 8 초과(8/255)»와 같은 결과를 JS로 낸다.
 * 가장자리 바깥으로 번지는 만큼은 호출부가 마스크 둘레에 `DILATE_PAD` 이상 여백을 둔다.
 */
export function dilateMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -RADIUS; k <= RADIUS; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w && mask[y * w + xx]) acc += KERNEL[k + RADIUS];
      }
      tmp[y * w + x] = acc;
    }
  }
  const out = new Uint8Array(w * h);
  const threshold = 8 / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -RADIUS; k <= RADIUS; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) acc += tmp[yy * w + x] * KERNEL[k + RADIUS];
      }
      out[y * w + x] = acc > threshold ? 1 : 0;
    }
  }
  return out;
}
