'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * SlotOutline — 슬롯 칸의 «점선 외곽선». 티켓 20261112_1627 (컬렉션 슬롯·믹스 슬롯 캔버스 반영, 2회차).
 *
 * 이미지를 그리지 않는다. 배지 이미지의 알파 윤곽을 따라가는 점선 SVG 한 장만 그린다.
 * 서비스 `BadgeGridCard`와 DS `BadgeGridCard`가 함께 쓴다(추적 코드를 한 벌로 두려고 DS에 둔다).
 *
 * 추적 방식(클라이언트): `src`를 `new Image()`로 받아 180px 캔버스에 inset을 두고 contain으로 그린 뒤,
 * alpha 128 이상을 마칭 스퀘어로 따라가 바깥 윤곽만 SVG path로 만든다. 안쪽 구멍과 전체 면적 0.5% 미만의
 * 잔 조각은 버린다. Douglas-Peucker ε 0.35로 줄이고 좌표는 소수 1자리다. 시작점은 항상 맨 위 맨 왼쪽이다.
 * - `src`는 있는 그대로 쓴다. `/_next/image`를 거치는 같은 출처 주소를 넘기면 canvas가 오염되지 않는다.
 *   변환본을 새로 만들지 않으려면 호출부가 폭 90 이미지의 2x 후보와 같은 w=256, q=75를 써야 한다(서비스는 `slotOutlineTraceSrc`).
 *   w=192는 쓸 수 없다 — next 기본 sizes(deviceSizes + imageSizes)에 없어 `/_next/image`가 400을 돌려준다.
 * - 모듈 수준 캐시(Map<키, Promise>)라 같은 이미지는 한 번만 추적하고, 실패도 기억해 재시도 루프를 막는다.
 * - 화면 근처(rootMargin 200px)에 들어올 때만 시작한다. 30칸이 한꺼번에 이미지를 받는 것을 막는다.
 *
 * 모양: viewBox 0 0 90 90, fill none, stroke var(--muted) 불투명 100%, 굵기 2, 선 3 · 간격 4, round join, butt cap.
 * `vector-effect: non-scaling-stroke`라 칸이 80px · 60px로 줄어도 굵기와 점선 길이가 같다.
 * 움직이지 않는다(마칭 앤츠 없음). 등장은 150ms 페이드 인이고 reduced-motion이면 바로 보인다.
 *
 * 상태: 추적 중 — 아무것도 그리지 않는다(칸 크기는 svg가 잡고 있다). 성공 — 윤곽 점선.
 * 실패·주소 없음 — fallback='box'이면 둥근 사각형 점선(inset, 반경 12), 'none'이면 아무것도 그리지 않는다.
 * 이미지가 함께 보이는 칸(넣을 수 있는 칸)은 'none', 이미지를 안 그리는 칸(비어 있는 칸)은 'box'를 쓴다.
 *
 * svg는 폭 100% · aspect-ratio 1 · maxWidth size의 정사각형이다. 이미지 위에 겹치려면 호출부가
 * `className`/`style`로 `position: absolute; inset: 0`을 준다.
 */

/** 점선 굵기 · 선 길이 · 간격 · 사각형 반경 — 토큰이 아니라 이 부품의 이름 붙은 상수다 */
const STROKE_WIDTH = 2;
const DASH = 3;
const GAP = 4;
const BOX_RADIUS = 12;

/** 캔버스 해상도 배율 — size 90이면 180px 캔버스 */
const CANVAS_SCALE = 2;
const ALPHA_THRESHOLD = 128;
/** 전체 면적 대비 이 비율 미만의 조각은 버린다 */
const MIN_PIECE_RATIO = 0.005;
const SIMPLIFY_EPSILON = 0.35;

/**
 * 마칭 스퀘어 한 칸의 방향 있는 선분. 비트: 1=좌상, 2=우상, 4=우하, 8=좌하.
 * 선분은 [시작, 끝] 변 이름이고, 진행 방향의 오른쪽(화면 기준)에 채워진 쪽이 오게 잡았다.
 * 그래서 바깥 윤곽은 시계 방향(면적 양수), 구멍은 반시계 방향(면적 음수)이 된다.
 */
const SEGMENTS = {
  1: [['T', 'L']],
  2: [['R', 'T']],
  3: [['R', 'L']],
  4: [['B', 'R']],
  5: [['T', 'L'], ['B', 'R']],
  6: [['B', 'T']],
  7: [['B', 'L']],
  8: [['L', 'B']],
  9: [['T', 'B']],
  10: [['R', 'T'], ['L', 'B']],
  11: [['R', 'B']],
  12: [['L', 'R']],
  13: [['T', 'R']],
  14: [['L', 'T']],
};

/** 변 중점의 «두 배 좌표»(정수)를 돌려준다. 칸 (x, y)의 네 모서리 표본은 (x,y) (x+1,y) (x,y+1) (x+1,y+1)이다 */
function edgeMid(edge, x, y) {
  if (edge === 'T') return [2 * x + 1, 2 * y];
  if (edge === 'R') return [2 * x + 2, 2 * y + 1];
  if (edge === 'B') return [2 * x + 1, 2 * y + 2];
  return [2 * x, 2 * y + 1];
}

/** 점 p에서 선분 a-b까지의 거리 (a === b이면 점까지의 거리) */
function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker. 첫 점과 끝 점은 항상 남는다 */
function simplify(points, epsilon) {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let maxDist = 0;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const dist = distToSegment(points[i], points[lo], points[hi]);
      if (dist > maxDist) {
        maxDist = dist;
        idx = i;
      }
    }
    if (idx !== -1 && maxDist > epsilon) {
      keep[idx] = true;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** shoelace 부호 있는 면적 (화면 좌표 기준 시계 방향이 양수) */
function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * RGBA 배열(캔버스 `getImageData().data`와 같은 모양)에서 바깥 윤곽의 SVG path를 만든다. 순수 함수다.
 * - `rgba`: 길이 width * height * 4. alpha가 `alphaThreshold` 이상인 픽셀을 «채워진 곳»으로 본다.
 * - 돌려주는 좌표계는 `0 0 viewSize viewSize`(소수 1자리). 채워진 픽셀이 없거나 남은 조각이 없으면 null.
 */
export function traceAlphaOutline(rgba, width, height, options = {}) {
  const {
    viewSize = 90,
    alphaThreshold = ALPHA_THRESHOLD,
    minPieceRatio = MIN_PIECE_RATIO,
    epsilon = SIMPLIFY_EPSILON,
  } = options;
  if (!rgba || width <= 0 || height <= 0) return null;

  const filled = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : rgba[(y * width + x) * 4 + 3] >= alphaThreshold ? 1 : 0);

  // 방향 있는 선분을 모은다. 시작 변 중점의 키로 찾는다(변 중점마다 나가는 선분은 하나뿐이다)
  const keyOf = (p) => (p[0] + 2) * (2 * height + 8) + (p[1] + 2);
  const segments = [];
  const byStart = new Map();
  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const code = filled(x, y) | (filled(x + 1, y) << 1) | (filled(x + 1, y + 1) << 2) | (filled(x, y + 1) << 3);
      const list = SEGMENTS[code];
      if (!list) continue;
      for (const [from, to] of list) {
        const seg = { start: edgeMid(from, x, y), end: edgeMid(to, x, y), used: false };
        byStart.set(keyOf(seg.start), seg);
        segments.push(seg);
      }
    }
  }
  if (!segments.length) return null;

  // 선분을 이어 닫힌 고리로 만든다. 두 배 좌표 → 표본 좌표 → 이미지 좌표(+0.5) → viewBox 좌표
  const scale = viewSize / width;
  const loops = [];
  for (const first of segments) {
    if (first.used) continue;
    const loop = [];
    let seg = first;
    while (seg && !seg.used) {
      seg.used = true;
      loop.push([(seg.start[0] / 2 + 0.5) * scale, (seg.start[1] / 2 + 0.5) * scale]);
      seg = byStart.get(keyOf(seg.end));
    }
    if (loop.length >= 3) loops.push(loop);
  }

  // 바깥 윤곽(면적 양수)만, 전체 면적 대비 너무 작은 조각은 버린다
  const minArea = viewSize * viewSize * minPieceRatio;
  const parts = [];
  for (const loop of loops) {
    const area = signedArea(loop);
    if (area <= 0 || area < minArea) continue;
    // 시작점: 맨 위, 같으면 맨 왼쪽
    let startIdx = 0;
    for (let i = 1; i < loop.length; i++) {
      const p = loop[i];
      const s = loop[startIdx];
      if (p[1] < s[1] || (p[1] === s[1] && p[0] < s[0])) startIdx = i;
    }
    const ring = loop.slice(startIdx).concat(loop.slice(0, startIdx));
    ring.push(ring[0]);
    const simple = simplify(ring, epsilon);
    simple.pop();
    if (simple.length < 3) continue;
    const fmt = (n) => String(Math.round(n * 10) / 10);
    parts.push(`M${simple.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join('L')}Z`);
  }
  return parts.length ? parts.join('') : null;
}

/** src + size + inset 별 추적 결과. 진행 중 요청은 합치고 실패(null)도 기억한다 */
const traceCache = new Map();

function loadAndTrace(src, size, inset) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    // 같은 출처(/_next/image)면 영향이 없고, 외부 이미지는 CORS 헤더가 있어야 읽힌다. 못 읽으면 실패로 떨어진다
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const px = size * CANVAS_SCALE;
        const canvas = document.createElement('canvas');
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || !img.naturalWidth || !img.naturalHeight) {
          resolve(null);
          return;
        }
        const box = px - inset * CANVAS_SCALE * 2;
        const ratio = Math.min(box / img.naturalWidth, box / img.naturalHeight);
        const w = img.naturalWidth * ratio;
        const h = img.naturalHeight * ratio;
        ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
        resolve(traceAlphaOutline(ctx.getImageData(0, 0, px, px).data, px, px, { viewSize: size }));
      } catch {
        // canvas 오염(SecurityError) 등
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 이미지 한 장의 윤곽 path를 돌려준다(null = 실패). 같은 src · size · inset은 한 번만 추적한다 */
export function traceSlotOutlineImage(src, size = 90, inset = 4) {
  const key = `${src}|${size}|${inset}`;
  let promise = traceCache.get(key);
  if (!promise) {
    promise = loadAndTrace(src, size, inset);
    traceCache.set(key, promise);
  }
  return promise;
}

/** 시험용 — 캐시를 비운다 */
export function clearSlotOutlineCache() {
  traceCache.clear();
}

// 인라인 style은 스타일시트의 prefers-reduced-motion 규칙을 이기므로 등장 애니메이션은 클래스로 둔다(Accordion과 같은 이유)
const STATIC_CSS = `
.ds-slot-outline-path{animation:ds-slot-outline-in var(--duration-quick,150ms) var(--ease-out,ease-out) both}
@keyframes ds-slot-outline-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.ds-slot-outline-path{animation:none}}
`;

export function SlotOutline({
  /** 추적할 이미지 주소 — 있는 그대로 쓴다 */
  src,
  /** 있으면 role="img" + aria-label, 없으면 aria-hidden */
  label,
  /** 좌표계 한 변이자 최대 폭(px) */
  size = 90,
  /** 이미지를 넣을 때 사방 여백. 사각형 대체의 안쪽 여백이기도 하다 */
  inset = 4,
  /** 추적 실패·주소 없음일 때 'box' = 둥근 사각형 점선, 'none' = 아무것도 그리지 않음 */
  fallback = 'box',
  className = '',
  style = {},
}) {
  const ref = useRef(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    const start = () => {
      traceSlotOutlineImage(src, size, inset).then((path) => {
        if (!cancelled) setResult({ key: `${src}|${size}|${inset}`, path });
      });
    };
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      start();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src, size, inset]);

  const settled = result && result.key === `${src}|${size}|${inset}` ? result : null;
  let state;
  if (!src) state = 'failed';
  else if (!settled) state = 'loading';
  else state = settled.path ? 'ready' : 'failed';

  const stroke = {
    fill: 'none',
    stroke: 'var(--muted)',
    strokeWidth: STROKE_WIDTH,
    strokeDasharray: `${DASH} ${GAP}`,
    strokeLinejoin: 'round',
    strokeLinecap: 'butt',
  };

  return (
    <>
    {/* React 19 스타일 리소스: href가 같으면 인스턴스가 30개여도 문서에 한 번만 들어간다(티켓 20261112_1817) */}
    <style href="ds-slot-outline" precedence="medium">{STATIC_CSS}</style>
    <svg
      ref={ref}
      viewBox={`0 0 ${size} ${size}`}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      data-outline-state={state === 'failed' ? (fallback === 'box' ? 'box' : 'none') : state}
      className={className}
      style={{ display: 'block', width: '100%', maxWidth: size, aspectRatio: '1 / 1', flexShrink: 0, ...style }}
    >
      {state === 'ready' && <path className="ds-slot-outline-path" d={settled.path} vectorEffect="non-scaling-stroke" style={stroke} />}
      {state === 'failed' && fallback === 'box' && (
        <rect
          className="ds-slot-outline-path"
          x={inset}
          y={inset}
          width={size - inset * 2}
          height={size - inset * 2}
          rx={BOX_RADIUS}
          vectorEffect="non-scaling-stroke"
          style={stroke}
        />
      )}
    </svg>
    </>
  );
}
