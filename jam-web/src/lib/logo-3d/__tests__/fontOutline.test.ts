// 티켓 20261103_1351 — 폰트 → 윤곽 변환 시험. 폰트 파일은 저장소에 넣지 않고,
// opentype.js로 시험 안에서 직접 만든 글자(사각형 I, 구멍 있는 O, 곡선 C, 공백)를 쓴다.
import { Font, Glyph, Path, parse } from 'opentype.js';
import { describe, expect, it } from 'vitest';
import { fontToOutline } from '../fontOutline';
import { ringArea } from '../polygonOps';
import type { LogoOutline } from '../types';

// 글리프 좌표는 Y가 위로 향한다. 높이 700, 단위 1000.
function rectPath(path: Path, x0: number, y0: number, x1: number, y1: number, clockwise: boolean) {
  const pts: [number, number][] = clockwise
    ? [[x0, y0], [x0, y1], [x1, y1], [x1, y0]]
    : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  path.moveTo(...pts[0]);
  for (const p of pts.slice(1)) path.lineTo(...p);
  path.close();
}

function buildFont(): Font {
  const notdef = new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() });

  const iPath = new Path();
  rectPath(iPath, 100, 0, 300, 700, true);

  // TrueType 방식: 바깥 시계, 구멍 반시계
  const oPath = new Path();
  rectPath(oPath, 50, 0, 650, 700, true);
  rectPath(oPath, 200, 150, 500, 550, false);

  // 곡선 글자: 베지어 곡선으로 둥글린 도형 하나
  const cPath = new Path();
  cPath.moveTo(0, 350);
  cPath.curveTo(0, 600, 150, 700, 350, 700);
  cPath.quadraticCurveTo(700, 700, 700, 350);
  cPath.curveTo(700, 100, 550, 0, 350, 0);
  cPath.quadraticCurveTo(0, 0, 0, 350);
  cPath.close();

  return new Font({
    familyName: 'Test',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      notdef,
      new Glyph({ name: 'I', unicode: 73, advanceWidth: 400, path: iPath }),
      new Glyph({ name: 'O', unicode: 79, advanceWidth: 700, path: oPath }),
      new Glyph({ name: 'C', unicode: 67, advanceWidth: 750, path: cPath }),
      new Glyph({ name: 'space', unicode: 32, advanceWidth: 300, path: new Path() })
    ]
  });
}

function width(outline: LogoOutline): number {
  const xs = outline.flatMap((p) => p.outer.map((pt) => pt[0]));
  return Math.max(...xs) - Math.min(...xs);
}

function height(outline: LogoOutline): number {
  const ys = outline.flatMap((p) => p.outer.map((pt) => pt[1]));
  return Math.max(...ys) - Math.min(...ys);
}

describe('fontToOutline', () => {
  it('구멍 있는 글자는 구멍 고리를 만들고, 방향은 바깥 반시계·구멍 시계다', () => {
    const { outline, error } = fontToOutline(buildFont().toArrayBuffer(), 'O');
    expect(error).toBeNull();
    expect(outline).toHaveLength(1);
    expect(outline[0].holes).toHaveLength(1);
    expect(ringArea(outline[0].outer)).toBeGreaterThan(0);
    expect(ringArea(outline[0].holes[0])).toBeLessThan(0);
  });

  it('높이는 1로 정규화되고 중앙에 있다', () => {
    const { outline } = fontToOutline(buildFont().toArrayBuffer(), 'OI');
    expect(height(outline)).toBeCloseTo(1, 6);
    const xs = outline.flatMap((p) => p.outer.map((pt) => pt[0]));
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 6);
  });

  it('글자열이 길수록 가로 폭이 늘어난다', () => {
    const buffer = buildFont().toArrayBuffer();
    const w1 = width(fontToOutline(buffer, 'O').outline);
    const w2 = width(fontToOutline(buffer, 'OO').outline);
    const w3 = width(fontToOutline(buffer, 'OOO').outline);
    expect(w2).toBeGreaterThan(w1);
    expect(w3).toBeGreaterThan(w2);
    // O의 어드밴스는 700, 높이는 700 → 한 글자 늘 때마다 폭이 정확히 1씩 늘어난다
    expect(w2 - w1).toBeCloseTo(1, 6);
  });

  it('글자마다 폴리곤이 하나씩 생긴다', () => {
    const { outline } = fontToOutline(buildFont().toArrayBuffer(), 'IOI');
    expect(outline).toHaveLength(3);
  });

  it('공백은 윤곽 없이 간격만 만든다', () => {
    const buffer = buildFont().toArrayBuffer();
    const tight = fontToOutline(buffer, 'II');
    const spaced = fontToOutline(buffer, 'I I');
    expect(spaced.outline).toHaveLength(2);
    // 공백 어드밴스 300, 높이 700
    expect(width(spaced.outline) - width(tight.outline)).toBeCloseTo(300 / 700, 6);
  });

  it('앞뒤 공백은 가로 중앙을 흐트러뜨리지 않는다', () => {
    const buffer = buildFont().toArrayBuffer();
    const { outline } = fontToOutline(buffer, '  I  ');
    const xs = outline.flatMap((p) => p.outer.map((pt) => pt[0]));
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 6);
  });

  it('커닝 값을 글자 사이 간격에 반영한다', () => {
    // 직접 만든 Font는 글자 → 글리프 표(cmap)가 없어 한 번 파일로 내보냈다가 읽은 것을 쓴다.
    const font = parse(buildFont().toArrayBuffer());
    const plain = width(fontToOutline(font, 'II').outline);
    // 글리프 번호: .notdef=0, I=1
    font.kerningPairs = { '1,1': -100 };
    const kerned = width(fontToOutline(font, 'II').outline);
    expect(plain - kerned).toBeCloseTo(100 / 700, 6);
  });

  it('곡선은 선분으로 펴고, 분할 수를 늘리면 점이 늘어난다', () => {
    const buffer = buildFont().toArrayBuffer();
    const coarse = fontToOutline(buffer, 'C', { curveSegments: 4 }).outline[0].outer.length;
    const fine = fontToOutline(buffer, 'C', { curveSegments: 24 }).outline[0].outer.length;
    expect(coarse).toBeGreaterThan(8);
    expect(fine).toBeGreaterThan(coarse);
  });

  it('폰트에 없는 글자는 경고를 돌려주고 예외를 던지지 않는다', () => {
    const { outline, warnings, error } = fontToOutline(buildFont().toArrayBuffer(), 'IX');
    expect(error).toBeNull();
    expect(outline).toHaveLength(1);
    expect(warnings.join(' ')).toContain('폰트에 없는 글자');
  });

  it('공백만 입력하면 빈 윤곽과 경고를 돌려준다', () => {
    const { outline, warnings, error } = fontToOutline(buildFont().toArrayBuffer(), '   ');
    expect(error).toBeNull();
    expect(outline).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('폰트 파일을 읽지 못하면 예외 대신 [현상] → [원인] → [해결책] 한국어 오류를 돌려준다', () => {
    const result = fontToOutline(new ArrayBuffer(64), 'O');
    expect(result.outline).toEqual([]);
    expect(result.error).toBe(
      '글자 윤곽을 만들지 못했어요. 폰트 파일을 읽을 수 없어요(woff2처럼 지원하지 않는 형식일 수 있어요). TTF나 OTF 파일로 다시 시도해 주세요.'
    );
  });
});
