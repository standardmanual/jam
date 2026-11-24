import { describe, expect, it } from 'vitest';
import { alphaBounds, analyzeBadgePixels, dilateMask, outlineInteriorMask } from '../badge';

const SIZE = 40;
/** 가운데가 빈 고리 모양(바깥 반지름 16, 안쪽 반지름 10) 알파 이미지 */
function ring(color: [number, number, number] = [0, 0, 0]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = Math.hypot(x - 19.5, y - 19.5);
      if (r <= 16 && r >= 10) {
        const i = (y * SIZE + x) * 4;
        d[i] = color[0];
        d[i + 1] = color[1];
        d[i + 2] = color[2];
        d[i + 3] = 255;
      }
    }
  }
  return d;
}

describe('outlineInteriorMask', () => {
  it('속이 빈 고리의 안쪽까지 포함하고 바깥은 제외한다', () => {
    const m = outlineInteriorMask(ring(), SIZE, SIZE);
    expect(m[20 * SIZE + 20]).toBe(1); // 고리 한가운데(비어 있음)
    expect(m[20 * SIZE + 28]).toBe(1); // 고리 몸통
    expect(m[0]).toBe(0); // 바깥 모서리
  });

  it('가장자리가 불투명으로 막혀 있어도 누락 없이 안쪽을 채운다', () => {
    const w = 5;
    const d = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        if (x === 0 || y === 0 || x === w - 1 || y === w - 1) d[(y * w + x) * 4 + 3] = 255;
      }
    }
    const m = outlineInteriorMask(d, w, w);
    expect(Array.from(m).every((v) => v === 1)).toBe(true);
  });
});

describe('alphaBounds', () => {
  it('투명 여백을 뺀 영역을 돌려주고, 전부 투명이면 null', () => {
    const b = alphaBounds(ring(), SIZE, SIZE);
    expect(b).not.toBeNull();
    expect(b!.w).toBeLessThanOrEqual(33);
    expect(b!.w).toBeGreaterThanOrEqual(31);
    expect(alphaBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});

describe('analyzeBadgePixels', () => {
  it('검정 선화는 lineArt, 채색 이미지는 주된 색상을 낸다', () => {
    expect(analyzeBadgePixels(ring()).lineArt).toBe(true);
    const blue = analyzeBadgePixels(ring([30, 90, 240]));
    expect(blue.lineArt).toBe(false);
    expect(blue.okHue).toBeGreaterThan(240);
    expect(blue.okHue).toBeLessThan(280);
  });
});

describe('dilateMask', () => {
  it('마스크를 가장자리 바깥 몇 픽셀까지 넓히고 멀리는 넓히지 않는다', () => {
    const w = 80;
    const mask = new Uint8Array(w * w);
    for (let y = 30; y < 50; y++) for (let x = 30; x < 50; x++) mask[y * w + x] = 1;
    const out = dilateMask(mask, w, w);
    expect(out[40 * w + 40]).toBe(1);
    expect(out[40 * w + 27]).toBe(1); // 3px 바깥
    expect(out[40 * w + 20]).toBe(0); // 10px 바깥
  });
});
