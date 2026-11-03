// 티켓 20261103_1350 — 형상 엔진 시험에 쓰는 글자 윤곽. 높이 1, 중앙 정렬.
import type { LogoOutline, Point } from '../types';

const pts = (...p: Point[]): Point[] => p;

/** (가) 구멍이 있는 글자 — A 모양 */
export const OUTLINE_A: LogoOutline = [
  {
    outer: pts(
      [-0.42, -0.5],
      [-0.24, -0.5],
      [-0.17, -0.28],
      [0.17, -0.28],
      [0.24, -0.5],
      [0.42, -0.5],
      [0.1, 0.5],
      [-0.1, 0.5]
    ),
    holes: [pts([-0.09, -0.1], [0.09, -0.1], [0, 0.15])]
  }
];

/** 좁은 틈의 폭(M 모양 틈 폭) */
export const M_GAP = 0.064;

/** (나) 폭 0.064의 좁은 틈이 두 개 있는 글자 — M 모양(아래가 열린 두 틈) */
export const OUTLINE_M: LogoOutline = [
  {
    outer: pts(
      [-0.289, -0.5],
      [-0.139, -0.5],
      [-0.139, 0.2],
      [-0.075, 0.2],
      [-0.075, -0.5],
      [0.075, -0.5],
      [0.075, 0.2],
      [0.139, 0.2],
      [0.139, -0.5],
      [0.289, -0.5],
      [0.289, 0.5],
      [-0.289, 0.5]
    ),
    holes: []
  }
];

/** 두 틈의 가운데 점. 재료가 없어야 한다. */
export const M_GAP_CENTERS: Point[] = [
  [-0.107, -0.1],
  [0.107, -0.1]
];

/** (다) 직각 모서리 글자 — J 모양 */
export const OUTLINE_J: LogoOutline = [
  {
    outer: pts([-0.25, -0.5], [0.25, -0.5], [0.25, 0.5], [0.05, 0.5], [0.05, -0.3], [-0.25, -0.3]),
    holes: []
  }
];

export const ALL_OUTLINES: [string, LogoOutline][] = [
  ['A(구멍)', OUTLINE_A],
  ['M(좁은 틈)', OUTLINE_M],
  ['J(직각)', OUTLINE_J]
];

/** 점이 윤곽 재료 안에 있는지(바깥 고리 안 && 구멍 밖) */
export function insideMaterial(outline: LogoOutline, [x, y]: Point): boolean {
  const inRing = (ring: readonly Point[]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return outline.some((pg) => inRing(pg.outer) && !pg.holes.some(inRing));
}
