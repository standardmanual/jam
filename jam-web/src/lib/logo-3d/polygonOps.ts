// 티켓 20261103_1350 — 3D 로고 형상 엔진의 2D 윤곽 연산.
// 입출력은 모두 LogoOutline(높이 1 기준). 오프셋은 Clipper2(clipper2-ts, 순수 JS)로 한다.
// 바깥 고리는 반시계(넓이 > 0), 구멍은 시계(넓이 < 0) 방향으로 돌려준다.

import {
  FillRule,
  JoinType,
  EndType,
  PointInPolygonResult,
  differenceD,
  inflatePathsD,
  pointInPolygonD,
  type PathD,
  type PathsD
} from 'clipper2-ts';
import type { LogoOutline, OutlinePolygon, Point, Ring } from './types';

/** Clipper가 좌표를 정수로 바꿀 때 쓰는 소수 자릿수 */
const PRECISION = 6;
/** 둥근 연결의 호 근사 허용 오차(로고 높이 1 기준) */
const ARC_TOLERANCE = 0.0003;
/** 두께·틈 측정 때 변을 쪼개는 간격 */
const SAMPLE_STEP = 0.02;

// ---------- 고리 기본 연산 ----------

/** 부호 있는 넓이. 반시계(y가 위로 향하는 좌표)가 양수다. */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** 바깥 고리 넓이의 합에서 구멍 넓이의 합을 뺀 값 */
export function outlineArea(outline: LogoOutline): number {
  let total = 0;
  for (const polygon of outline) {
    total += Math.abs(ringArea(polygon.outer));
    for (const hole of polygon.holes) total -= Math.abs(ringArea(hole));
  }
  return total;
}

function reverseRing(ring: Ring): Ring {
  return [...ring].reverse();
}

/** 마지막 점이 첫 점과 같으면 떼어낸다. */
function dropClosingPoint(ring: Ring): Ring {
  if (ring.length > 1) {
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx === lx && fy === ly) return ring.slice(0, -1);
  }
  return ring;
}

function ringToPath(ring: Ring): PathD {
  return ring.map(([x, y]) => ({ x, y }));
}

function pathToRing(path: PathD): Ring {
  return path.map((p): Point => [p.x, p.y]);
}

function polygonToPaths(polygon: OutlinePolygon): PathsD {
  const outer = ringArea(polygon.outer) < 0 ? reverseRing(polygon.outer) : polygon.outer;
  const paths: PathsD = [ringToPath(outer)];
  for (const hole of polygon.holes) {
    paths.push(ringToPath(ringArea(hole) > 0 ? reverseRing(hole) : hole));
  }
  return paths;
}

function outlineToPaths(outline: LogoOutline): PathsD {
  return outline.flatMap(polygonToPaths);
}

function pathArea(path: PathD): number {
  let sum = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Clipper 결과(평평한 경로 목록)를 바깥 고리와 구멍으로 묶는다. */
function pathsToOutline(paths: PathsD): LogoOutline {
  const outers: { path: PathD; area: number; holes: Ring[] }[] = [];
  const holes: PathD[] = [];
  for (const path of paths) {
    if (path.length < 3) continue;
    const area = pathArea(path);
    if (Math.abs(area) < 1e-10) continue;
    if (area > 0) outers.push({ path, area, holes: [] });
    else holes.push(path);
  }
  for (const hole of holes) {
    let best: (typeof outers)[number] | null = null;
    for (const outer of outers) {
      if (best && outer.area >= best.area) continue;
      // 꼭짓점 하나가 경계에 걸릴 수 있어 세 점으로 판정한다.
      let inside = 0;
      for (let k = 0; k < 3; k++) {
        const probe = hole[Math.floor((k * hole.length) / 3)];
        if (pointInPolygonD(probe, outer.path, PRECISION) === PointInPolygonResult.IsInside) inside++;
      }
      if (inside >= 2) best = outer;
    }
    if (best) best.holes.push(pathToRing(hole));
  }
  return outers.map((o) => ({ outer: pathToRing(o.path), holes: o.holes }));
}

// ---------- 정규화 ----------

/** 높이를 1로 맞추고 가로·세로를 중앙 정렬한다. 방향(바깥 반시계·구멍 시계)도 맞춘다. */
export function normalizeOutline(raw: LogoOutline): LogoOutline {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const polygon of raw) {
    for (const [x, y] of polygon.outer) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const height = maxY - minY;
  if (!Number.isFinite(height) || height <= 0) return [];
  const scale = 1 / height;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const fix = (ring: Ring): Ring => dropClosingPoint(ring).map(([x, y]): Point => [(x - cx) * scale, (y - cy) * scale]);
  return raw.map((polygon) => {
    const outer = fix(polygon.outer);
    return {
      outer: ringArea(outer) < 0 ? reverseRing(outer) : outer,
      holes: polygon.holes.map((hole) => {
        const h = fix(hole);
        return ringArea(h) > 0 ? reverseRing(h) : h;
      })
    };
  });
}

// ---------- 오프셋 ----------

/** delta < 0이면 안쪽, > 0이면 바깥쪽. 모서리는 둥근 연결이다. 구멍은 반대로 움직인다(재료가 줄면 구멍이 커진다). */
export function offsetOutline(outline: LogoOutline, delta: number): LogoOutline {
  if (outline.length === 0) return [];
  if (delta === 0) return outline;
  // 다른 글자와 겹쳐도 합쳐지지 않게 글자(폴리곤) 하나씩 처리한다.
  return outline.flatMap((polygon) =>
    pathsToOutline(
      inflatePathsD(polygonToPaths(polygon), delta, JoinType.Round, EndType.Polygon, 2, PRECISION, ARC_TOLERANCE)
    )
  );
}

// ---------- 두께·틈 측정 ----------

type Edge = { ax: number; ay: number; bx: number; by: number; nx: number; ny: number };

/** 한 폴리곤의 모든 변과 바깥쪽(재료 반대쪽) 법선. 재료가 항상 진행 방향의 왼쪽에 있다. */
function polygonEdges(polygon: OutlinePolygon): Edge[] {
  const edges: Edge[] = [];
  const rings = polygonToPaths(polygon);
  for (const path of rings) {
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-12) continue;
      edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, nx: dy / len, ny: -dx / len });
    }
  }
  return edges;
}

/**
 * 변 위의 표본점에서 법선 방향(side=+1, 틈) 또는 반대 방향(side=-1, 두께)으로 쏜 광선이
 * 마주보는 벽에 닿는 거리의 최솟값. 마주보는 벽이 없으면 Infinity.
 */
function minWallDistance(polygon: OutlinePolygon, side: 1 | -1): number {
  const edges = polygonEdges(polygon);
  let best = Infinity;
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    const len = Math.hypot(e.bx - e.ax, e.by - e.ay);
    const n = Math.max(1, Math.ceil(len / SAMPLE_STEP));
    const dirX = e.nx * side;
    const dirY = e.ny * side;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const px = e.ax + (e.bx - e.ax) * t;
      const py = e.ay + (e.by - e.ay) * t;
      for (let fi = 0; fi < edges.length; fi++) {
        if (fi === ei) continue;
        const f = edges[fi];
        // 마주보는 벽: 법선이 광선을 정면으로 마주 본다(틈) / 광선과 같은 방향이다(두께).
        const facing = f.nx * dirX + f.ny * dirY;
        if (side === 1 ? facing < -0.7 : facing > 0.7) {
          const sx = f.bx - f.ax;
          const sy = f.by - f.ay;
          const denom = dirX * sy - dirY * sx;
          if (Math.abs(denom) < 1e-12) continue;
          const qx = f.ax - px;
          const qy = f.ay - py;
          const dist = (qx * sy - qy * sx) / denom;
          const u = (qx * dirY - qy * dirX) / denom;
          if (dist > 1e-9 && u >= 0 && u <= 1 && dist < best) best = dist;
        }
      }
    }
  }
  return best;
}

/** 윤곽이 가장 가는 곳의 두께. 글자(폴리곤)마다 재서 가장 작은 값을 돌려준다. 재료가 없으면 0. */
export function minThickness(outline: LogoOutline): number {
  if (outline.length === 0) return 0;
  return Math.min(...outline.map((polygon) => minWallDistance(polygon, -1)));
}

/** 윤곽의 좁은 틈(오목부·구멍) 중 가장 좁은 폭. 틈이 없으면 Infinity. */
export function minGapWidth(outline: LogoOutline): number {
  if (outline.length === 0) return Infinity;
  return Math.min(...outline.map((polygon) => minWallDistance(polygon, 1)));
}

// ---------- 모서리 둥글림 ----------

export type RoundCornersResult = { outline: LogoOutline; warnings: string[] };

/**
 * 볼록 모서리는 안쪽으로 줄였다 되돌려(opening), 오목 모서리는 늘렸다 되돌려(closing) 둥글린다.
 * 반지름이 틈 폭(오목)·두께(볼록)의 절반 이상이면 틈이 막히거나 획이 지워지므로
 * 그 글자의 해당 모서리는 건너뛰고 경고를 돌려준다.
 */
export function roundCorners(
  outline: LogoOutline,
  radii: { convex: number; concave: number }
): RoundCornersResult {
  const warnings: string[] = [];
  const result: LogoOutline = [];
  outline.forEach((polygon, index) => {
    let current: LogoOutline = [polygon];
    const label = `${index + 1}번째 글자`;
    const holeCount = (o: LogoOutline) => o.reduce((n, pg) => n + pg.holes.length, 0);
    // 둥글린 결과가 조각나거나 구멍이 사라졌다면 반지름이 너무 큰 것이다.
    const keepsTopology = (next: LogoOutline) =>
      next.length === current.length && holeCount(next) === holeCount(current);
    if (radii.convex > 0) {
      const thickness = minWallDistance(polygon, -1);
      const next =
        radii.convex >= thickness / 2 ? null : offsetOutline(offsetOutline(current, -radii.convex), radii.convex);
      if (next && keepsTopology(next)) current = next;
      else {
        warnings.push(
          `${label}: 볼록 모서리 반지름 ${radii.convex}이(가) 획 두께(${thickness.toFixed(4)})에 비해 커서 건너뜀`
        );
      }
    }
    if (radii.concave > 0) {
      const gap = minWallDistance(polygon, 1);
      const next =
        radii.concave >= gap / 2 ? null : offsetOutline(offsetOutline(current, radii.concave), -radii.concave);
      if (next && keepsTopology(next)) current = next;
      else {
        warnings.push(
          `${label}: 오목 모서리 반지름 ${radii.concave}이(가) 틈 폭(${gap.toFixed(4)})에 비해 커서 건너뜀`
        );
      }
    }
    result.push(...current);
  });
  return { outline: result, warnings };
}

// ---------- 점 정리 ----------

export type CleanRingOptions = {
  /** 이보다 짧은 선분은 점을 지운다 */
  minSegment: number;
  /** 앞뒤 점을 잇는 직선에서 이 거리 안에 있는 점은 일직선으로 보고 지운다 */
  collinearTolerance: number;
};

export const DEFAULT_CLEAN_OPTIONS: CleanRingOptions = { minSegment: 0.002, collinearTolerance: 0.00005 };

/** 일직선상의 점과 너무 짧은 선분을 지워 점 간격을 고르게 한다. 점이 3개 미만이 되면 빈 배열이다. */
export function cleanRing(ring: Ring, options: CleanRingOptions = DEFAULT_CLEAN_OPTIONS): Ring {
  let pts = dropClosingPoint(ring);
  for (let pass = 0; pass < 8; pass++) {
    const before = pts.length;
    // 1) 짧은 선분: 직전에 남긴 점과 너무 가까운 점을 지운다.
    const spaced: Point[] = [];
    for (const p of pts) {
      const last = spaced[spaced.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= options.minSegment) spaced.push(p);
    }
    while (spaced.length > 1) {
      const first = spaced[0];
      const last = spaced[spaced.length - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < options.minSegment) spaced.pop();
      else break;
    }
    // 2) 일직선상의 점
    const straight: Point[] = [];
    const n = spaced.length;
    for (let i = 0; i < n; i++) {
      const prev = spaced[(i + n - 1) % n];
      const cur = spaced[i];
      const next = spaced[(i + 1) % n];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy);
      const off = len < 1e-12 ? 0 : Math.abs((cur[0] - prev[0]) * dy - (cur[1] - prev[1]) * dx) / len;
      if (off > options.collinearTolerance) straight.push(cur);
    }
    pts = straight;
    if (pts.length < 3) return [];
    if (pts.length === before) break;
  }
  return pts.length >= 3 ? pts : [];
}

/** 윤곽의 모든 고리에 cleanRing을 적용한다. 점이 모자라 사라진 구멍은 버리고, 바깥 고리가 사라지면 그 폴리곤을 버린다. */
export function cleanOutline(outline: LogoOutline, options: CleanRingOptions = DEFAULT_CLEAN_OPTIONS): LogoOutline {
  const result: LogoOutline = [];
  for (const polygon of outline) {
    const outer = cleanRing(polygon.outer, options);
    if (outer.length === 0) continue;
    result.push({ outer, holes: polygon.holes.map((h) => cleanRing(h, options)).filter((h) => h.length > 0) });
  }
  return result;
}

// ---------- 불리언 ----------

/** a - b (재료에서 빼기). 틀 고리를 만들 때 쓴다. */
export function subtractOutline(a: LogoOutline, b: LogoOutline): LogoOutline {
  return pathsToOutline(differenceD(outlineToPaths(a), outlineToPaths(b), FillRule.NonZero, PRECISION));
}
