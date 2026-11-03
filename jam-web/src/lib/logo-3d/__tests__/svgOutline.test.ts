// 티켓 20261103_1351 — SVG → 윤곽 변환 시험. 실제 JAM! 로고(J·A·M 세 경로, A에 구멍, even-odd 채움)를 그대로 쓴다.
// vitest는 node 환경이라 DOMParser가 없어, 브라우저가 해 줄 일을 @xmldom/xmldom으로 대신한다.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOMParser as XmlDomParser, XMLSerializer as XmlSerializer } from '@xmldom/xmldom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { svgToOutline } from '../svgOutline';
import { ringArea } from '../polygonOps';
import type { Ring } from '../types';

const LOGO_SVG = readFileSync(path.resolve(__dirname, '../../../../../docs/assets/brand/jam_logo.svg'), 'utf8');

const globals = globalThis as Record<string, unknown>;
const original = { DOMParser: globals.DOMParser, XMLSerializer: globals.XMLSerializer };

beforeAll(() => {
  globals.DOMParser = XmlDomParser;
  globals.XMLSerializer = XmlSerializer;
  // SVGLoader가 지원하지 않는 속성을 만나면 내는 경고 소음을 막는다.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  globals.DOMParser = original.DOMParser;
  globals.XMLSerializer = original.XMLSerializer;
  vi.restoreAllMocks();
});

function bounds(rings: Ring[]) {
  const xs = rings.flatMap((r) => r.map((p) => p[0]));
  const ys = rings.flatMap((r) => r.map((p) => p[1]));
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('svgToOutline — JAM! 로고', () => {
  it('오류 없이 세 글자 영역을 돌려준다', () => {
    const result = svgToOutline(LOGO_SVG);
    expect(result.error).toBeNull();
    expect(result.outline).toHaveLength(3);
  });

  it('구멍은 A 영역에 정확히 1개 있다', () => {
    const result = svgToOutline(LOGO_SVG);
    const holeCounts = result.outline.map((p) => p.holes.length).sort();
    expect(holeCounts).toEqual([0, 0, 1]);
  });

  it('높이가 1이고 가로·세로 중앙에 있다', () => {
    const result = svgToOutline(LOGO_SVG);
    const b = bounds(result.outline.map((p) => p.outer));
    expect(b.maxY - b.minY).toBeCloseTo(1, 6);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 6);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(0, 6);
    // 가로가 세로보다 긴 로고(2610 x 865)
    expect(b.maxX - b.minX).toBeCloseTo(2610 / 865, 2);
  });

  it('바깥은 반시계, 구멍은 시계 방향이다', () => {
    const result = svgToOutline(LOGO_SVG);
    for (const polygon of result.outline) {
      expect(ringArea(polygon.outer)).toBeGreaterThan(0);
      for (const hole of polygon.holes) expect(ringArea(hole)).toBeLessThan(0);
    }
  });

  it('SVG의 위쪽이 +Y가 되도록 Y를 뒤집는다', () => {
    // 맨 왼쪽 글자 J의 윗변은 SVG에서 y=0이다. 뒤집은 뒤에는 로고의 맨 위(+0.5)에 닿는다.
    const result = svgToOutline(LOGO_SVG);
    const leftmost = [...result.outline].sort(
      (a, b) => Math.min(...a.outer.map((p) => p[0])) - Math.min(...b.outer.map((p) => p[0]))
    )[0];
    expect(Math.max(...leftmost.outer.map((p) => p[1]))).toBeCloseTo(0.5, 6);
    // J의 바닥은 SVG에서 y=865(로고의 맨 아래)다.
    expect(Math.min(...leftmost.outer.map((p) => p[1]))).toBeCloseTo(-0.5, 6);
  });
});

describe('svgToOutline — 건너뛰는 입력', () => {
  it('fill="none"만 있는 SVG는 빈 윤곽과 경고를 돌려주고 예외를 던지지 않는다', () => {
    const svg =
      '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0H10V10H0Z" fill="none"/></svg>';
    const result = svgToOutline(svg);
    expect(result.error).toBeNull();
    expect(result.outline).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('선(stroke)만 있는 도형은 건너뛰고 선이라고 알려 준다', () => {
    const svg =
      '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0H10V10H0Z" fill="none" stroke="#000"/>' +
      '<path d="M0 0H5V10H0Z" fill="#000"/></svg>';
    const result = svgToOutline(svg);
    expect(result.outline).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('선(stroke)');
  });

  it('<script>·<image>·<use>가 들어 있어도 읽지 않고, 나머지 도형은 읽는다', () => {
    const svg =
      '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<script>globalThis.__pwned = true</script>' +
      '<image href="https://example.com/a.png" width="10" height="10"/>' +
      '<defs><path id="p" d="M0 0H3V3H0Z"/></defs><use xlink:href="#p"/>' +
      '<path d="M0 0H5V10H0Z" fill="#000"/></svg>';
    const result = svgToOutline(svg);
    expect(result.error).toBeNull();
    expect(result.outline).toHaveLength(1);
    expect(globals.__pwned).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/<script>.*<image>.*<use>/);
  });

  it('transform을 반영한다', () => {
    const svg =
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g transform="translate(50 0)">' +
      '<path d="M0 0H10V10H0Z" fill="#000"/></g><path d="M0 0H10V20H0Z" fill="#000"/></svg>';
    const result = svgToOutline(svg);
    expect(result.outline).toHaveLength(2);
    // 가로 0..60, 세로 0..20 → 높이 1로 정규화하면 가로 폭은 60/20
    const b = bounds(result.outline.map((p) => p.outer));
    expect(b.maxX - b.minX).toBeCloseTo(60 / 20, 3);
  });
});

describe('svgToOutline — 읽을 수 없는 입력', () => {
  it('SVG가 아니면 예외 대신 한국어 오류를 돌려준다', () => {
    const result = svgToOutline('<html><body>안녕</body></html>');
    expect(result.outline).toEqual([]);
    expect(result.error).toContain('SVG를 읽지 못했어요');
  });

  it('DOMParser가 없는 환경이면 오류를 돌려준다', () => {
    const saved = globals.DOMParser;
    globals.DOMParser = undefined;
    try {
      const result = svgToOutline(LOGO_SVG);
      expect(result.error).toContain('SVG를 읽지 못했어요');
    } finally {
      globals.DOMParser = saved;
    }
  });
});
