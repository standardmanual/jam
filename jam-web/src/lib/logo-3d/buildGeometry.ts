// 티켓 20261103_1350 — 윤곽(LogoOutline)에서 외곽선(스틸 틀)·타일·바닥판 형상을 만든다.
// WebGL 없이 three의 BufferGeometry만 다룬다(렌더러·재질은 범위 밖).
//
// z 배치(앞이 +z, 로고 높이 1 기준):
//   틀    : 윗면 z=0, 아랫면 z=-depth
//   타일  : 윗면 z=-frameFrontProtrusion, 두께 tileThickness
//   바닥판: 윗면이 타일 아랫면에 닿고, 아랫면은 틀 아랫면보다 위(틀이 뒤로 더 튀어나옴)

import { triangulateD, TriangulateResult, type PathsD } from 'clipper2-ts';
import { Box3, BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape, Vector2 } from 'three';
import {
  cleanOutline,
  minGapWidth,
  minThickness,
  offsetOutline,
  resampleOutline,
  roundCorners,
  subtractOutline
} from './polygonOps';
import type { LogoOutline, Logo3DParams, Ring } from './types';

export type LogoGeometry = {
  /** 스틸 틀: 바깥 윤곽에서 틀 폭만큼 안쪽을 뺀 고리 */
  frame: BufferGeometry;
  /** 도자기 면 */
  tile: BufferGeometry;
  /** 틀 안쪽을 막는 판 */
  backPlate: BufferGeometry;
  /** 틀 기준 경계 상자 */
  bounds: Box3;
  /** 값을 자동으로 줄였거나 모서리를 건너뛴 사유 */
  warnings: string[];
};

const BEVEL_SEGMENTS = 4;
/** 들로네 삼각분할이 좌표를 정수로 바꿀 때 쓰는 소수 자릿수(clipper2-ts 최대치) */
const LID_DECIMALS = 8;
/** 윤곽 점 사이 최대 간격 */
const MAX_SEGMENT = 0.04;
/** 틈·두께에 비해 둥글림 반지름이 이 비율을 넘으면 틈이 막히거나 획이 지워진다 */
const ROUND_LIMIT = 0.45;
/** 베벨이 곡률 반지름·두께를 넘지 않도록 두는 여유 */
const BEVEL_LIMIT = 0.95;
const HALF_LIMIT = 0.49;
/**
 * 틀 윗면(평평한 띠)의 최소 폭. 베벨이 틀 폭의 절반에 가까우면 띠가 0에 가까워져 윗면 삼각형이 넓이 0으로 납작해진다.
 * 값은 실측으로 정했다(티켓 20261103_1352 재작업): 이보다 크면 기본 틀 베벨(0.0145)이 깎여 기본 모양이 바뀐다.
 */
const MIN_LID_BAND = 0.0003;

function toShapes(outline: LogoOutline): Shape[] {
  const v = (ring: Ring) => ring.map(([x, y]) => new Vector2(x, y));
  return outline.map((polygon) => {
    const shape = new Shape(v(polygon.outer));
    shape.holes = polygon.holes.map((hole) => new Path(v(hole)));
    return shape;
  });
}

function emptyGeometry(): BufferGeometry {
  return new BufferGeometry();
}

/**
 * ExtrudeGeometry의 윗면·아랫면(earcut)을 들로네 삼각분할로 바꾼다(함정 3).
 * earcut은 가는 고리에서 넓이가 거의 0인 납작한 삼각형을 만들어 렌더에 이음선이 보인다.
 * 옆면·베벨은 그대로 두고, 삼각분할에 실패하면 earcut 결과를 그대로 쓴다.
 */
function withDelaunayLids(geometry: ExtrudeGeometry, input: LogoOutline, topZ: number, bottomZ: number): BufferGeometry {
  const rings: PathsD = [];
  for (const polygon of input) {
    for (const ring of [polygon.outer, ...polygon.holes]) rings.push(ring.map(([x, y]) => ({ x, y })));
  }
  const { result, solution } = triangulateD(rings, LID_DECIMALS, true);
  // ExtrudeGeometry는 글자(Shape)마다 옆면 그룹을 하나씩 만든다 — 첫 그룹만 쓰면 둘째 글자부터 옆면이 사라진다.
  const lid = geometry.groups.find((g) => g.materialIndex === 0);
  const sideGroups = geometry.groups.filter((g) => g.materialIndex === 1);
  if (result !== TriangulateResult.success || solution.length === 0 || !lid || sideGroups.length === 0) return geometry;

  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const sides of sideGroups) {
    for (let i = sides.start; i < sides.start + sides.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
    }
  }
  const lidStart = positions.length / 3;
  const push = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    uvs.push(x, y);
  };
  for (const tri of solution) {
    if (tri.length !== 3) continue;
    const [a, b, c] = tri;
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (area === 0) continue;
    // 윗면은 앞(+z)에서 봤을 때 반시계, 아랫면은 시계
    const [p, q, r] = area > 0 ? [a, b, c] : [a, c, b];
    push(p.x, p.y, topZ);
    push(q.x, q.y, topZ);
    push(r.x, r.y, topZ);
    push(p.x, p.y, bottomZ);
    push(r.x, r.y, bottomZ);
    push(q.x, q.y, bottomZ);
  }
  const rebuilt = new BufferGeometry();
  rebuilt.setAttribute('position', new Float32BufferAttribute(positions, 3));
  rebuilt.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  rebuilt.addGroup(0, lidStart, 1);
  rebuilt.addGroup(lidStart, positions.length / 3 - lidStart, 0);
  rebuilt.computeVertexNormals();
  geometry.dispose();
  return rebuilt;
}

/**
 * 윤곽(footprint)을 두께 `height`의 둥근 베벨 덩어리로 만든다. 윗면이 z=topZ.
 * ExtrudeGeometry의 베벨은 윤곽을 바깥으로 bevel만큼 키우므로 입력 윤곽을 그만큼 줄여 넘긴다.
 */
function extrude(footprint: LogoOutline, height: number, bevel: number, topZ: number): BufferGeometry {
  // 점 정리 → 긴 변 나누기: 일직선상의 점을 지운 뒤 간격을 고르게 해야 납작한 삼각형이 안 생긴다(함정 3).
  const trimmed = bevel > 0 ? cleanOutline(offsetOutline(footprint, -bevel)) : cleanOutline(footprint);
  const input = resampleOutline(trimmed, MAX_SEGMENT);
  if (input.length === 0) return emptyGeometry();
  const bodyDepth = height - 2 * bevel;
  const geometry = new ExtrudeGeometry(toShapes(input), {
    depth: bodyDepth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: BEVEL_SEGMENTS,
    curveSegments: 1,
    steps: 1
  });
  // three는 z=-bevel ~ bodyDepth+bevel에 만든다 → 윗면(bodyDepth+bevel)을 topZ로 옮긴다.
  geometry.translate(0, 0, topZ - (bodyDepth + bevel));
  return withDelaunayLids(geometry, input, topZ, topZ - height);
}

/** 둥글림 반지름을 틈·두께 한도 안으로 줄여 모서리를 둥글린다. */
function safeRound(
  outline: LogoOutline,
  convex: number,
  concave: number,
  label: string,
  warn: (message: string) => void
): { outline: LogoOutline; convex: number; concave: number } {
  const thickness = minThickness(outline);
  const gap = minGapWidth(outline);
  let c1 = convex;
  let c2 = concave;
  if (c1 > thickness * ROUND_LIMIT) {
    c1 = thickness * ROUND_LIMIT;
    warn(`${label} 볼록 모서리 반지름을 ${convex}에서 ${c1.toFixed(4)}로 줄임(획 두께 ${thickness.toFixed(4)})`);
  }
  if (c2 > gap * ROUND_LIMIT) {
    c2 = gap * ROUND_LIMIT;
    warn(`${label} 오목 모서리 반지름을 ${concave}에서 ${c2.toFixed(4)}로 줄임(틈 폭 ${gap.toFixed(4)})`);
  }
  const rounded = roundCorners(outline, { convex: c1, concave: c2 });
  rounded.warnings.forEach(warn);
  return { outline: cleanOutline(rounded.outline), convex: c1, concave: c2 };
}

export function buildLogoGeometry(outline: LogoOutline, params: Logo3DParams): LogoGeometry {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const warn = (message: string) => {
    if (!seen.has(message)) {
      seen.add(message);
      warnings.push(message);
    }
  };
  const empty: LogoGeometry = {
    frame: emptyGeometry(),
    tile: emptyGeometry(),
    backPlate: emptyGeometry(),
    bounds: new Box3(),
    warnings
  };
  if (outline.length === 0) {
    warn('윤곽이 비어 있어 형상을 만들지 못함');
    return empty;
  }

  const { depth, frameWidth, frameFrontProtrusion: protrusion, tileThickness, gap } = params;
  let frameBevel = params.frameBevelRadius;
  let tileBevel = params.tileBevelRadius;

  // 1) 바깥 윤곽: 평면 모서리를 먼저 둥글린다(함정 1). 베벨보다 큰 반지름이어야 겹치지 않는다.
  const outer = safeRound(outline, params.cornerRadiusOuter, params.cornerRadiusOuter, '바깥 윤곽', warn);

  // 2) 틀 안쪽 윤곽: 줄이면 모서리가 다시 뾰족해지므로 오프셋 결과를 따로 둥글린다(함정 2).
  const shrunk = cleanOutline(offsetOutline(outer.outline, -frameWidth));
  const hollow = shrunk.length > 0;
  const inner = hollow
    ? safeRound(shrunk, params.cornerRadiusInner, params.cornerRadiusInner, '틀 안쪽 윤곽', warn)
    : null;
  if (!hollow) warn(`틀 폭 ${frameWidth}이(가) 글자 두께에 비해 커서 안쪽이 비지 않음 — 틀만 만듦`);

  // 3) 틀 고리 = 바깥 - 안쪽
  const ring = inner && inner.outline.length > 0 ? cleanOutline(subtractOutline(outer.outline, inner.outline)) : outer.outline;

  // 4) 베벨 반지름 상한: 틀 폭·두께·평면 곡률 반지름을 넘으면 겹친다.
  const limitFrame = (value: number, limit: number, reason: string) => {
    if (value > limit) {
      warn(`틀 베벨 반지름을 ${frameBevel}에서 ${limit.toFixed(4)}로 줄임(${reason})`);
      frameBevel = limit;
    }
  };
  const frameSpan = Math.min(frameWidth, minThickness(ring));
  limitFrame(frameBevel, Math.min(HALF_LIMIT * frameSpan, (frameSpan - MIN_LID_BAND) / 2), '틀 폭 또는 틀 고리 두께의 절반, 윗면 띠 폭 하한');
  limitFrame(frameBevel, HALF_LIMIT * depth, '압출 두께의 절반');
  if (outer.convex > 0) limitFrame(frameBevel, BEVEL_LIMIT * outer.convex, '바깥 윤곽 모서리 반지름');
  if (inner && inner.concave > 0) limitFrame(frameBevel, BEVEL_LIMIT * inner.concave, '틀 안쪽 윤곽 모서리 반지름');

  const frame = extrude(ring, depth, frameBevel, 0);
  frame.computeBoundingBox();
  const bounds = frame.boundingBox ? frame.boundingBox.clone() : new Box3();

  if (!inner || inner.outline.length === 0) {
    return { ...empty, frame, bounds };
  }

  // 5) 타일·바닥판의 평면 윤곽: 틀 안쪽에서 틈만큼 줄인다.
  const footprint = cleanOutline(offsetOutline(inner.outline, -gap));
  if (footprint.length === 0) {
    warn('틈이 커서 타일을 만들지 못함');
    return { ...empty, frame, bounds };
  }
  const limitTile = (limit: number, reason: string) => {
    if (tileBevel > limit) {
      warn(`타일 베벨 반지름을 ${tileBevel}에서 ${limit.toFixed(4)}로 줄임(${reason})`);
      tileBevel = limit;
    }
  };
  limitTile(HALF_LIMIT * tileThickness, '타일 두께의 절반');
  limitTile(HALF_LIMIT * minThickness(footprint), '타일 윤곽 최소 두께의 절반');
  if (inner.convex > 0) limitTile(BEVEL_LIMIT * Math.max(inner.convex - gap, 0.0005), '틀 안쪽 윤곽 모서리 반지름');

  const tileTop = -protrusion;
  const tileBottom = tileTop - tileThickness;
  const tile = extrude(footprint, tileThickness, tileBevel, tileTop);

  // 6) 바닥판: 윗면이 타일 아랫면에 닿고, 아랫면은 틀 아랫면보다 위 — 틀이 뒤로 더 내려간다.
  const backStick = Math.max(protrusion, frameBevel);
  const plateBottom = -depth + backStick;
  if (tileBottom - plateBottom < 0.002) {
    warn('압출 두께가 타일 두께와 앞뒤 돌출에 비해 얇아 바닥판이 거의 없음');
  }
  const plateHeight = Math.max(tileBottom - plateBottom, 0.002);
  const backPlate = extrude(footprint, plateHeight, 0, tileBottom);

  return { frame, tile, backPlate, bounds, warnings };
}
