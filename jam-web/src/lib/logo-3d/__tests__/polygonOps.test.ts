import { describe, expect, it } from 'vitest';
import {
  cleanRing,
  minGapWidth,
  minThickness,
  normalizeOutline,
  offsetOutline,
  outlineArea,
  resampleRing,
  ringArea,
  roundCorners
} from '../polygonOps';
import type { LogoOutline, Ring } from '../types';
import { ALL_OUTLINES, insideMaterial, M_GAP, M_GAP_CENTERS, OUTLINE_A, OUTLINE_J, OUTLINE_M } from './fixtures';

const holeArea = (o: LogoOutline) => o.reduce((sum, pg) => sum + pg.holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0), 0);

describe('normalizeOutline', () => {
  it('높이를 1로 맞추고 가로·세로를 중앙 정렬한다', () => {
    const raw: LogoOutline = [
      {
        outer: [
          [10, 100],
          [30, 100],
          [30, 140],
          [10, 140]
        ],
        holes: []
      }
    ];
    const [pg] = normalizeOutline(raw);
    const xs = pg.outer.map((p) => p[0]);
    const ys = pg.outer.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1, 9);
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...ys) + Math.min(...ys)).toBeCloseTo(0, 9);
  });

  it('바깥 고리는 반시계, 구멍은 시계로 맞추고 마지막 중복 점을 지운다', () => {
    const raw: LogoOutline = [
      {
        outer: [
          [0, 0],
          [0, 4],
          [4, 4],
          [4, 0],
          [0, 0]
        ],
        holes: [
          [
            [1, 1],
            [3, 1],
            [3, 3],
            [1, 3]
          ]
        ]
      }
    ];
    const [pg] = normalizeOutline(raw);
    expect(pg.outer).toHaveLength(4);
    expect(ringArea(pg.outer)).toBeGreaterThan(0);
    expect(ringArea(pg.holes[0])).toBeLessThan(0);
  });
});

describe('offsetOutline', () => {
  it.each(ALL_OUTLINES)('%s: 안쪽 오프셋이 클수록 넓이가 줄어든다', (_name, outline) => {
    const a1 = outlineArea(offsetOutline(outline, -0.01));
    const a2 = outlineArea(offsetOutline(outline, -0.02));
    expect(a1).toBeLessThan(outlineArea(outline));
    expect(a2).toBeLessThan(a1);
  });

  it('안쪽 오프셋은 구멍을 키운다', () => {
    const shrunk = offsetOutline(OUTLINE_A, -0.02);
    expect(holeArea(shrunk)).toBeGreaterThan(holeArea(OUTLINE_A));
  });

  it.each(ALL_OUTLINES)('%s: 바깥으로 d, 안쪽으로 d 되돌리면 넓이가 ±1% 안이다', (_name, outline) => {
    const d = 0.01;
    const roundTrip = offsetOutline(offsetOutline(outline, d), -d);
    const ratio = outlineArea(roundTrip) / outlineArea(outline);
    expect(ratio).toBeGreaterThan(0.99);
    expect(ratio).toBeLessThan(1.01);
  });
});

describe('측정', () => {
  it('minThickness: J의 가장 가는 곳은 0.2', () => {
    expect(minThickness(OUTLINE_J)).toBeCloseTo(0.2, 3);
  });

  it('minGapWidth: M의 좁은 틈 폭을 잰다', () => {
    expect(minGapWidth(OUTLINE_M)).toBeCloseTo(M_GAP, 3);
  });

  it('minGapWidth: 틈이 없는 윤곽은 Infinity', () => {
    expect(minGapWidth([{ outer: [[-0.2, -0.5], [0.2, -0.5], [0.2, 0.5], [-0.2, 0.5]], holes: [] }])).toBe(Infinity);
  });
});

describe('roundCorners', () => {
  it('직각 모서리를 둥글려 점이 늘고 넓이는 조금 준다', () => {
    const { outline, warnings } = roundCorners(OUTLINE_J, { convex: 0.05, concave: 0.04 });
    expect(warnings).toEqual([]);
    expect(outline[0].outer.length).toBeGreaterThan(OUTLINE_J[0].outer.length);
    expect(outlineArea(outline)).toBeLessThan(outlineArea(OUTLINE_J));
  });

  it('M: 오목 반지름이 틈 폭의 절반 미만이면 둥글려도 두 틈이 그대로 남는다', () => {
    const { outline, warnings } = roundCorners(OUTLINE_M, { convex: 0.02, concave: 0.025 });
    expect(warnings).toEqual([]);
    for (const c of M_GAP_CENTERS) expect(insideMaterial(outline, c)).toBe(false);
    // 틈이 막혔다면 넓이가 틈 하나(0.064 x 0.7)만큼 늘어난다
    expect(outlineArea(outline)).toBeLessThan(outlineArea(OUTLINE_M) + 0.01);
  });

  it('M: 오목 반지름이 틈 폭의 절반 이상이면 그 모서리를 건너뛰고 경고하며, 틈은 막히지 않는다', () => {
    const { outline, warnings } = roundCorners(OUTLINE_M, { convex: 0, concave: 0.05 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('오목');
    for (const c of M_GAP_CENTERS) expect(insideMaterial(outline, c)).toBe(false);
    expect(outlineArea(outline)).toBeCloseTo(outlineArea(OUTLINE_M), 6);
  });

  it('A: 둥글린 뒤에도 구멍이 남는다', () => {
    const { outline } = roundCorners(OUTLINE_A, { convex: 0.03, concave: 0.03 });
    expect(outline).toHaveLength(1);
    expect(outline[0].holes).toHaveLength(1);
  });

  it('획 두께의 절반 이상인 볼록 반지름은 건너뛰고 경고한다', () => {
    const { outline, warnings } = roundCorners(OUTLINE_J, { convex: 0.15, concave: 0 });
    expect(warnings).toHaveLength(1);
    expect(outlineArea(outline)).toBeCloseTo(outlineArea(OUTLINE_J), 6);
  });
});

describe('cleanRing', () => {
  const square: Ring = [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1, 0.5],
    [1, 1],
    [0, 1]
  ];

  it('일직선상의 점을 지운다', () => {
    expect(cleanRing(square)).toHaveLength(4);
  });

  it('너무 짧은 선분의 점을 지운다', () => {
    const ring: Ring = [
      [0, 0],
      [1, 0],
      [1, 0.0005],
      [1, 1],
      [0, 1]
    ];
    expect(cleanRing(ring, { minSegment: 0.01, collinearTolerance: 1e-6 })).toHaveLength(4);
  });

  it('호 위의 점은 남긴다', () => {
    const arc: Ring = Array.from({ length: 12 }, (_, i): [number, number] => [
      Math.cos((i / 12) * Math.PI * 2) * 0.5,
      Math.sin((i / 12) * Math.PI * 2) * 0.5
    ]);
    expect(cleanRing(arc)).toHaveLength(12);
  });

  it('점이 3개 미만으로 줄면 빈 배열을 돌려준다', () => {
    expect(
      cleanRing([
        [0, 0],
        [1, 0],
        [2, 0]
      ])
    ).toEqual([]);
  });
});

describe('resampleRing', () => {
  it('긴 변을 나누되 모양(넓이)은 그대로다', () => {
    const square: Ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ];
    const out = resampleRing(square, 0.25);
    expect(out).toHaveLength(16);
    expect(ringArea(out)).toBeCloseTo(1, 12);
  });
});
