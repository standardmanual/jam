import React, { useId } from 'react';

/**
 * CategorySticker — 홈피드 «분류 스티커». 티켓 20261122_2227(상위 20261122_2217 확정 결정 §4).
 *
 * 문구·시드·색 짝만 받는 정적 장식 SVG다. 조약돌(116×84)과 물결 덩어리(112×92) 두 모양이고,
 * 윤곽은 시드로 정해져 같은 (shape, seed)는 늘 같은 path 문자열이 나온다(Math.random·Date 미사용,
 * 좌표는 소수 둘째 자리 반올림). 계산은 순수 함수 `pebbleShape`·`waveShape`·`fitRingText`로 분리했고
 * 컴포넌트는 그 결과를 그리기만 한다.
 *
 * 기하 수치(116×84 · 112×92 · 글자 선 17px·15px · 혹 4~8.5px · 테두리 2px · 로고 외곽선 1.6px)는
 * 장식 도형의 기하라 간격 토큰 대상이 아니고 아래 상수로 둔다.
 */

/* ───────── 확정 사양 상수 ───────── */
export const PEBBLE_SIZE = { width: 116, height: 84 };
export const WAVE_SIZE = { width: 112, height: 92 };
const PEBBLE_RING_INSET = 17;
const WAVE_RING_INSET = 15;
const PEBBLE_FONT_SIZE = 11;
const WAVE_FONT_SIZE = 10;
/** 글자 크기 하한. 이 밑이면 «하한 미달»(fits=false)로 알린다 — 글자를 압축하거나 자르지 않는다 */
export const MIN_FONT_SIZE = 7;
const BORDER_WIDTH = 2;
const GLYPH_OUTLINE = 1.6;
const PEBBLE_GLYPH_HEIGHT = 30;
const WAVE_GLYPH_HEIGHT = 26;
export const WAVE_HUMP_COUNT = [7, 9];
export const WAVE_HUMP_HEIGHT = [4, 8.5];
const FONT_WEIGHT = 900;
/** 글자가 둘레 글자 선 끝에 닿아 잘리지 않게 두는 여유 비율 */
const RING_USABLE = 0.95;
/** 남는 길이를 자간으로 채울 때의 상한(글자 크기 대비). 넘는 만큼은 꼬리 쪽 빈칸으로 둔다 */
const MAX_LETTER_SPACING_EM = 0.15;

/** 보색 짝 8개. 앞이 바탕, 뒤가 로고 글자. 값은 hex가 아니라 var(--jam-*)로만 참조한다 */
export const STICKER_COLOR_PAIRS = {
  'yellow-purple': { base: 'var(--jam-yellow)', glyph: 'var(--jam-purple)' },
  'purple-yellow': { base: 'var(--jam-purple)', glyph: 'var(--jam-yellow)' },
  'green-pink': { base: 'var(--jam-green)', glyph: 'var(--jam-pink)' },
  'pink-green': { base: 'var(--jam-pink)', glyph: 'var(--jam-green)' },
  'sky-red': { base: 'var(--jam-sky)', glyph: 'var(--jam-red)' },
  'red-sky': { base: 'var(--jam-red)', glyph: 'var(--jam-sky)' },
  'blue-yellow': { base: 'var(--jam-blue)', glyph: 'var(--jam-yellow)' },
  'yellow-blue': { base: 'var(--jam-yellow)', glyph: 'var(--jam-blue)' },
};

/**
 * 로고 글자 — `design-system/assets/logo/jam-logo.svg`(viewBox 0 0 2610 865)의 세 path를 그대로 옮겼다.
 * 원본 순서는 J · m · a(둘째 path가 m, 셋째가 a)이고 bbox는 path 좌표에서 읽은 값이다.
 */
export const LOGO_GLYPHS = {
  J: {
    bbox: [0, 0, 574.975, 865],
    d: 'M574.975 543.552C574.974 721.113 430.977 864.999 253.396 865H6.68984e-05V543.552H178.556C219.923 543.552 253.45 510.039 253.45 468.689L253.45 231.373L0 231.913L6.68984e-05 0H574.975V543.552Z',
  },
  m: {
    bbox: [1529.69, 0, 2610, 865],
    d: 'M2339.95 0C2489.09 0 2610 120.861 2610 269.937V865H2286.53V419.717H2231.58V865H1908.11V419.717H1853.17V865H1529.69V269.937C1529.7 120.861 1650.61 0 1799.74 0C1948.88 8.53997e-05 2069.79 73.9985 2069.79 223.075C2069.79 73.9443 2190.7 0 2339.84 0H2339.95Z',
  },
  a: {
    bbox: [645, 0, 1444.58, 865],
    d: 'M1139.15 771.563C1085.51 823.514 1036.69 839.737 962.74 857.985C948.464 861.506 924.242 862.081 913.901 865H878.922C859.432 861.415 837.819 859.194 819.226 853.044C680.347 807.104 618.661 694.265 645.377 555.266C684.373 352.362 868.855 300.529 1050.31 300.961H1156.16V218.959L913.9 218.885C868.433 218.87 820.94 219.684 775.651 218.825C774.8 176.524 774.169 134.218 773.755 91.9114C773.567 64.3044 774.151 27.0514 772.335 0H1163.99C1318.96 0 1444.58 125.602 1444.58 280.54V865H1139.15V771.563ZM1143.52 489.614C1142.72 572.576 1134 623.439 1048.98 650.04C1014.6 660.416 975.792 660.374 944.536 638.103C890.704 599.744 900.846 538.782 952.662 504.215C966.849 494.75 984.607 492.08 1001.57 489.614C1044.74 489.614 1102.26 489.614 1143.52 489.614Z',
    evenodd: true,
  },
};

/* ───────── 시드 ───────── */
const r2 = (n) => Math.round(n * 100) / 100;

/** 문자열·숫자 시드를 32비트 정수로(FNV-1a). 같은 입력은 어느 환경에서나 같은 값이다 */
export function stickerSeedOf(seed) {
  const s = String(seed ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — 0 이상 1 미만 난수열 */
export function stickerRandom(seed) {
  let a = stickerSeedOf(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── 기하 도우미 ───────── */
/** 닫힌 점열을 Catmull-Rom → 3차 베지어 path로 */
function smoothClosedPath(pts) {
  const n = pts.length;
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return `${d}Z`;
}

function polylinePath(pts) {
  return `M${pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L')}Z`;
}

function perimeter(pts) {
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** 시계 방향(SVG y 아래) 점열의 안쪽 법선 방향으로 d만큼 들인 점열 */
function insetPoints(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 2 + n) % n];
    const b = pts[(i + 2) % n];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    // 시계 방향 진행에서 안쪽은 진행 방향의 오른쪽(SVG 좌표) = (-ty, tx)
    return [p[0] + (-ty / len) * d, p[1] + (tx / len) * d];
  });
}

/** 선분 둘이 교차하는가(끝점 공유는 제외) */
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** 닫힌 점열이 자기 교차하는가 (시험·검증용 순수 함수) */
export function isSelfIntersecting(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

function bounds(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** 점열을 위쪽 중앙에서 시작하도록 돌린다(둘레 글자가 윗줄 가운데서 읽히게) */
function startAtTop(pts, cx, cy) {
  let best = 0;
  let bestScore = Infinity;
  pts.forEach((p, i) => {
    const score = Math.abs(p[0] - cx) + (p[1] > cy ? 1000 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return [...pts.slice(best), ...pts.slice(0, best)];
}

/* ───────── 모양 ───────── */
const PEBBLE_POINTS = 72;
const WAVE_SAMPLES = 180;

/**
 * 조약돌 — 지수가 시드마다 다른 초타원(굽기)에 낮은 주파수 일그러짐과 살짝 기울임을 더하고,
 * 상자(1px 안쪽)에 꽉 차게 맞춘다. 글자 선은 가장자리에서 17px 안쪽.
 */
export function pebbleShape(seed) {
  const { width, height } = PEBBLE_SIZE;
  const rnd = stickerRandom(`pebble:${seed}`);
  const expX = 2.4 + rnd() * 1.1; // 좌우 호의 굽기
  const expY = 2.4 + rnd() * 1.1; // 위아래 호의 굽기
  const tilt = ((rnd() - 0.5) * 2 * 4 * Math.PI) / 180;
  const wob = [1, 2, 3].map((k) => ({ a: (0.06 / k) * (0.4 + rnd() * 0.6), p: rnd() * Math.PI * 2, k }));
  const raw = [];
  for (let i = 0; i < PEBBLE_POINTS; i++) {
    const t = (i / PEBBLE_POINTS) * Math.PI * 2 - Math.PI / 2; // 위에서 시작, 시계 방향
    const c = Math.cos(t);
    const s = Math.sin(t);
    const k = 1 + wob.reduce((acc, w) => acc + w.a * Math.cos(w.k * t + w.p), 0);
    let x = Math.sign(c) * Math.pow(Math.abs(c), 2 / expX) * k;
    let y = Math.sign(s) * Math.pow(Math.abs(s), 2 / expY) * k;
    x *= width / 2;
    y *= height / 2;
    raw.push([x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  const b = bounds(raw);
  const half = BORDER_WIDTH / 2;
  const sx = (width - BORDER_WIDTH) / (b.x1 - b.x0);
  const sy = (height - BORDER_WIDTH) / (b.y1 - b.y0);
  const pts = raw.map(([x, y]) => [r2(half + (x - b.x0) * sx), r2(half + (y - b.y0) * sy)]);
  const ringPts = startAtTop(insetPoints(pts, PEBBLE_RING_INSET), width / 2, height / 2);
  return finishShape('pebble', width, height, pts, smoothClosedPath(pts), ringPts, PEBBLE_GLYPH_HEIGHT, null);
}

/**
 * 물결 덩어리 — 기저 타원에 혹 7~9개(높이 4~8.5px, 폭·높이 불규칙, 폭 합 360도)를 붙인 구름형.
 * 글자 선은 혹을 뺀 기저 타원에서 15px 안쪽.
 */
export function waveShape(seed) {
  const { width, height } = WAVE_SIZE;
  const rnd = stickerRandom(`wave:${seed}`);
  const [minN, maxN] = WAVE_HUMP_COUNT;
  const [minH, maxH] = WAVE_HUMP_HEIGHT;
  const count = minN + Math.floor(rnd() * (maxN - minN + 1));
  const weights = Array.from({ length: count }, () => 0.7 + rnd() * 0.6);
  const sum = weights.reduce((a, b) => a + b, 0);
  const humps = weights.map((w) => ({ span: (w / sum) * Math.PI * 2, h: r2(minH + rnd() * (maxH - minH)) }));
  const rx = width / 2 - BORDER_WIDTH / 2 - maxH;
  const ry = height / 2 - BORDER_WIDTH / 2 - maxH;
  const cx = width / 2;
  const cy = height / 2;
  const start = -Math.PI / 2 + rnd() * humps[0].span; // 혹 시작 위치도 시드마다 다르다
  const base = (t) => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  const pts = [];
  let edge = 0;
  humps.forEach((hump) => {
    const steps = Math.max(8, Math.round((WAVE_SAMPLES * hump.span) / (Math.PI * 2)));
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const t = start + edge + u * hump.span;
      // 둥근 혹: 정현파의 0.7제곱으로 봉우리를 볼록하게, 이웃과의 사이는 오목한 골
      const lift = hump.h * Math.pow(Math.sin(Math.PI * u), 0.7);
      const nx = Math.cos(t) / rx;
      const ny = Math.sin(t) / ry;
      const nl = Math.hypot(nx, ny);
      const [bx, by] = base(t);
      pts.push([r2(bx + (nx / nl) * lift), r2(by + (ny / nl) * lift)]);
    }
    edge += hump.span;
  });
  const basePts = [];
  for (let i = 0; i < WAVE_SAMPLES; i++) basePts.push(base(-Math.PI / 2 + (i / WAVE_SAMPLES) * Math.PI * 2));
  const ringPts = startAtTop(insetPoints(basePts, WAVE_RING_INSET), cx, cy);
  return finishShape('wave', width, height, pts, polylinePath(pts), ringPts, WAVE_GLYPH_HEIGHT, humps);
}

function finishShape(shape, width, height, points, outlineD, ringPts, glyphHeight, humps) {
  const ringPoints = ringPts.map(([x, y]) => [r2(x), r2(y)]);
  const sparse = ringPoints.filter((_, i) => i % (ringPoints.length > 100 ? 5 : 3) === 0);
  return {
    shape,
    width,
    height,
    points,
    outlineD,
    ringPoints: sparse,
    ringD: smoothClosedPath(sparse),
    ringLength: r2(perimeter(ringPoints)),
    center: [width / 2, height / 2],
    glyphHeight,
    humps,
  };
}

export function stickerShape(shape, seed) {
  return shape === 'wave' ? waveShape(seed) : pebbleShape(seed);
}

/* ───────── 둘레 글자 ───────── */
/**
 * 굵기 900 한 글자 폭(em). Noto Sans KR 900을 실제로 재서(2026-11-23) 4% 여유를 더한 값이다.
 * 예전 추정(평균 0.84em)은 실제보다 25% 넓어 둘레의 70~77%만 채우고 한쪽이 비었다
 */
const CHAR_EM = {
  A: 0.69, B: 0.72, C: 0.69, D: 0.76, E: 0.66, F: 0.63, G: 0.76, H: 0.8, I: 0.37, J: 0.61, K: 0.74, L: 0.62, M: 0.91,
  N: 0.79, O: 0.82, P: 0.71, Q: 0.82, R: 0.74, S: 0.66, T: 0.67, U: 0.79, V: 0.67, W: 0.97, X: 0.68, Y: 0.63, Z: 0.64,
  ' ': 0.29, '·': 0.37,
};
function charEm(ch) {
  if (CHAR_EM[ch] !== undefined) return CHAR_EM[ch];
  if (/[가-힣]/.test(ch)) return 1.02;
  return 0.84;
}
const textEm = (s) => [...s].reduce((a, ch) => a + charEm(ch), 0);

/**
 * 둘레 글자 배치. «LABEL · »을 최소 두 번 되풀이해 한 바퀴(ringLength)를 채운다.
 * 기준 크기에서 두 번이 안 들어가면 글자를 줄이고(fits=false는 하한 7px 미달),
 * 남는 길이는 자간(letterSpacing)으로 나눠 채운다. 글자는 압축하지 않는다.
 */
export function fitRingText(label, ringLength, baseSize) {
  const text = String(label ?? '').trim().toUpperCase();
  if (!text) return { text: '', repeat: 0, fontSize: baseSize, letterSpacing: 0, fits: true, content: '' };
  const unit = `${text} · `;
  const unitEm = textEm(unit);
  const usable = ringLength * RING_USABLE;
  // 가장 가까운 정수만큼 되풀이한다(내림이면 한쪽이 비고, 올림이면 글자가 조금 줄어 맞는다)
  const repeat = Math.max(2, Math.round(usable / (unitEm * baseSize)));
  const fontSize = Math.floor(Math.min(baseSize, usable / (repeat * unitEm)) * 100) / 100;
  const used = repeat * unitEm * fontSize;
  const letterSpacing = r2(
    Math.min(MAX_LETTER_SPACING_EM * fontSize, Math.max(0, usable - used) / (repeat * [...unit].length)),
  );
  return {
    text,
    repeat,
    fontSize,
    letterSpacing,
    fits: fontSize >= MIN_FONT_SIZE,
    content: unit.repeat(repeat).trimEnd(),
  };
}

/* ───────── 컴포넌트 ───────── */
const GLYPH_KEYS = ['J', 'a', 'm'];

/**
 * 비인터랙티브 장식 SVG. `role="img"` + `aria-label`=분류 문구.
 * 문구가 비면 둘레 글자 없이 바탕과 가운데 로고만 그린다(도형 자체는 유효하므로).
 * 크기는 모양별로 고정이라 `size` prop이 없다 — `className`만 호출부에 연다.
 */
export function CategorySticker({
  shape = 'pebble',
  seed = '',
  label = '',
  pair = 'yellow-purple',
  letter = 'J',
  className = '',
  style = {},
  ...rest
}) {
  const pathId = useId();
  const geo = stickerShape(shape, seed);
  const colors = STICKER_COLOR_PAIRS[pair];
  const glyph = LOGO_GLYPHS[GLYPH_KEYS.includes(letter) ? letter : 'J'];
  const ring = fitRingText(label, geo.ringLength, shape === 'wave' ? WAVE_FONT_SIZE : PEBBLE_FONT_SIZE);
  const [bx0, by0, bx1, by1] = glyph.bbox;
  const scale = geo.glyphHeight / (by1 - by0);
  const [cx, cy] = geo.center;
  const tx = cx - ((bx0 + bx1) / 2) * scale;
  const ty = cy - ((by0 + by1) / 2) * scale;
  const labelText = String(label ?? '').trim();
  return (
    <svg
      width={geo.width}
      height={geo.height}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      role={labelText ? 'img' : undefined}
      aria-label={labelText || undefined}
      aria-hidden={labelText ? undefined : true}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...rest}
    >
      <path d={geo.outlineD} fill={colors.base} stroke="var(--foreground)" strokeWidth={BORDER_WIDTH} strokeLinejoin="round" />
      {ring.content ? (
        <>
          <path id={`${pathId}-ring`} d={geo.ringD} fill="none" />
          <text
            fill="var(--foreground)"
            fontFamily="var(--font-family-base)"
            fontWeight={FONT_WEIGHT}
            fontSize={ring.fontSize}
            letterSpacing={ring.letterSpacing}
            xmlSpace="preserve"
          >
            <textPath href={`#${pathId}-ring`}>{ring.content}</textPath>
          </text>
        </>
      ) : null}
      <path
        d={glyph.d}
        fillRule={glyph.evenodd ? 'evenodd' : undefined}
        transform={`translate(${r2(tx)} ${r2(ty)}) scale(${Math.round(scale * 10000) / 10000})`}
        fill={colors.glyph}
        stroke="var(--foreground)"
        strokeWidth={r2((GLYPH_OUTLINE * 2) / scale)}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}
