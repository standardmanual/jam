import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { buildLogoGeometry } from '../buildGeometry';
import { DEFAULT_LOGO3D_PARAMS, type Logo3DParams } from '../types';
import { ALL_OUTLINES, OUTLINE_M } from './fixtures';

const MIN_QUALITY = 2e-4;

function zRange(g: BufferGeometry): { min: number; max: number } {
  g.computeBoundingBox();
  return { min: g.boundingBox!.min.z, max: g.boundingBox!.max.z };
}

/** 윗면(가장 높은 z 평면)의 삼각형별 넓이/최장변² */
function topFaceQualities(g: BufferGeometry): number[] {
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const triCount = (index ? index.count : pos.count) / 3;
  const { max } = zRange(g);
  const at = (i: number) => {
    const v = index ? index.getX(i) : i;
    return [pos.getX(v), pos.getY(v), pos.getZ(v)] as const;
  };
  const result: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = at(t * 3);
    const b = at(t * 3 + 1);
    const c = at(t * 3 + 2);
    if (![a, b, c].every((p) => Math.abs(p[2] - max) < 1e-6)) continue;
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    const longest2 = Math.max(
      (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2,
      (c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2,
      (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2
    );
    result.push(area / longest2);
  }
  return result;
}

describe('buildLogoGeometry', () => {
  describe.each(ALL_OUTLINES)('%s', (_name, outline) => {
    const params = DEFAULT_LOGO3D_PARAMS;
    const built = buildLogoGeometry(outline, params);

    it('틀·타일·바닥판이 모두 만들어진다', () => {
      for (const g of [built.frame, built.tile, built.backPlate]) {
        expect(g.getAttribute('position').count).toBeGreaterThan(0);
      }
    });

    it('틀의 z 범위가 타일을 앞으로 frameFrontProtrusion만큼, 뒤로 0보다 크게 넘는다', () => {
      const f = zRange(built.frame);
      const t = zRange(built.tile);
      expect(f.max).toBeCloseTo(0, 6);
      expect(f.min).toBeCloseTo(-params.depth, 6);
      expect(f.max - t.max).toBeCloseTo(params.frameFrontProtrusion, 6);
      expect(t.min - f.min).toBeGreaterThan(0);
      expect(t.max - t.min).toBeCloseTo(params.tileThickness, 6);
    });

    it('바닥판 윗면이 타일 아랫면에 닿고, 틀은 바닥판보다 뒤로 더 내려간다', () => {
      const t = zRange(built.tile);
      const p = zRange(built.backPlate);
      expect(p.max).toBeCloseTo(t.min, 6);
      expect(p.min - zRange(built.frame).min).toBeGreaterThan(0);
    });

    it('틀·타일 윗면에 납작한 삼각형(넓이/최장변² < 2e-4)이 없다', () => {
      for (const g of [built.frame, built.tile]) {
        const q = topFaceQualities(g);
        expect(q.length).toBeGreaterThan(0);
        expect(Math.min(...q)).toBeGreaterThanOrEqual(MIN_QUALITY);
      }
    });

    it('정점·인덱스에 NaN이 없다', () => {
      for (const g of [built.frame, built.tile, built.backPlate]) {
        const arr = g.getAttribute('position').array;
        expect(arr.every((v) => Number.isFinite(v))).toBe(true);
        const idx = g.getIndex();
        if (idx) expect(Array.from(idx.array).every((v) => Number.isFinite(v))).toBe(true);
      }
    });

    it('경계 상자가 틀을 감싼다', () => {
      expect(built.bounds.min.z).toBeCloseTo(-params.depth, 6);
      expect(built.bounds.max.z).toBeCloseTo(0, 6);
    });
  });

  it('A·J: 기본값에서는 경고 없이 만들어진다', () => {
    expect(buildLogoGeometry(ALL_OUTLINES[0][1], DEFAULT_LOGO3D_PARAMS).warnings).toEqual([]);
    expect(buildLogoGeometry(ALL_OUTLINES[2][1], DEFAULT_LOGO3D_PARAMS).warnings).toEqual([]);
  });

  it('M: 기본값은 오목 반지름만 틈 폭에 맞춰 줄이고(경고 1건), 좁은 틈 두 개가 막히지 않는다', () => {
    const built = buildLogoGeometry(OUTLINE_M, DEFAULT_LOGO3D_PARAMS);
    expect(built.warnings).toHaveLength(1);
    expect(built.warnings[0]).toContain('오목 모서리 반지름');
    // 틈 한가운데 x에는 타일 정점이 없어야 한다(틈이 막히면 그 자리에 타일이 생긴다)
    const pos = built.tile.getAttribute('position');
    for (const cx of [-0.107, 0.107]) {
      for (let i = 0; i < pos.count; i++) {
        const inGap = Math.abs(pos.getX(i) - cx) < 0.01 && pos.getY(i) > -0.3 && pos.getY(i) < 0.1;
        expect(inGap).toBe(false);
      }
    }
  });

  it('베벨 반지름이 윤곽보다 커도 예외 없이 줄어든 값으로 만들고 사유를 warnings에 남긴다', () => {
    const huge: Logo3DParams = { ...DEFAULT_LOGO3D_PARAMS, frameBevelRadius: 0.2, tileBevelRadius: 0.2 };
    for (const [, outline] of ALL_OUTLINES) {
      const built = buildLogoGeometry(outline, huge);
      expect(built.warnings.some((w) => w.includes('틀 베벨 반지름'))).toBe(true);
      expect(built.warnings.some((w) => w.includes('타일 베벨 반지름'))).toBe(true);
      for (const g of [built.frame, built.tile, built.backPlate]) {
        expect(g.getAttribute('position').array.every((v) => Number.isFinite(v))).toBe(true);
      }
      // 줄어든 값으로 만들었으므로 높이는 변수 그대로다
      expect(zRange(built.frame).min).toBeCloseTo(-huge.depth, 6);
    }
  });

  it('모서리 반지름이 글자 두께보다 커도 예외 없이 줄여서 만든다', () => {
    const huge: Logo3DParams = { ...DEFAULT_LOGO3D_PARAMS, cornerRadiusOuter: 0.12, cornerRadiusInner: 0.1 };
    const built = buildLogoGeometry(OUTLINE_M, huge);
    expect(built.warnings.length).toBeGreaterThan(0);
    expect(built.frame.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('빈 윤곽은 빈 형상과 경고를 돌려준다', () => {
    const built = buildLogoGeometry([], DEFAULT_LOGO3D_PARAMS);
    expect(built.frame.getAttribute('position')).toBeUndefined();
    expect(built.warnings.length).toBe(1);
  });
});
