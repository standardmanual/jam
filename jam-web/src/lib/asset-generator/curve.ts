/**
 * JAM! 에셋 제너레이터 — 이동 곡선: 시드 기반 폐곡선 + 호 길이 테이블
 *
 * 원본: jam-doc/assets/prototypes/20260924_jam-asset-generator.html
 * (makeCandidate 345줄, unitCurve 367줄, sampleFitted 384줄, candidateStats 411줄,
 * buildPath 437줄, posAt 474줄). 캔버스에 의존하지 않는 순수 계산만 담는다 —
 * 같은 시드·같은 스테이지 크기·같은 불규칙성이면 완전히 같은 좌표를 낸다(PRD §11).
 * 시드에 따라 곡선이 아주 큰 고리(한 바퀴 원)를 한 번 그리는 구간(loop)이 들어간다.
 */

import { mulberry32, type RandomSource } from './random';

export interface CurveCandidate {
  turns: number;
  amp: number[];
  ph: number[];
  /** 큰 고리 구간: u0에서 시작해 width만큼의 길이(곡선 한 바퀴 대비 비율) 동안 sign 방향으로 한 바퀴 돈다. 없으면 null */
  loop: { u0: number; width: number; sign: number } | null;
}

export interface FittedPoints {
  xs: Float32Array;
  ys: Float32Array;
}

export interface PathTable {
  xs: Float32Array;
  ys: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  cum: Float32Array;
  total: number;
  N: number;
}

export interface PathPoint {
  x: number;
  y: number;
  a: number;
}

export interface CandidateStats {
  overlap: number;
  center: number;
  radius: number;
}

/**
 * 곡선 길이 중 스테이지 밖에 있는 비율의 목표값. 곡선 크기를 이 비율에 맞춰 자동으로 조절하므로
 * 불규칙성·비율과 상관없이 곡선이 늘 스테이지 밖으로 크게 나갔다 들어온다.
 */
export const OUT_FRACTION = 0.3;
/** 진행 방향을 흔드는 파형의 개수(곡선 한 바퀴 동안 1~HARMONICS번 흔들림) */
export const HARMONICS = 6;
/** 가장 급하게 도는 곳의 회전 반경 최솟값(짧은 변 대비). 이보다 급하게 꺾이는 곡선은 버린다 */
export const RADIUS_MIN = 0.15;
/** 곡선 길이 중 화면 중앙(가로·세로 가운데 40%)에 머무는 비율의 최솟값 */
export const CENTER_MIN = 0.1;
/** 후보 선택 때 중앙 기준에 곱하는 여유. 후보 평가가 완성 경로의 중앙 체류 비율보다 조금 높게 나오기 때문이다 */
export const CENTER_MARGIN = 1.3;
/** 불규칙성 슬라이더(0~100%)가 매핑되는 내부 굴곡 세기 범위. 슬라이더 0%가 내부 0.6, 100%가 내부 1.5다 */
export const IRR_LO = 0.6;
export const IRR_HI = 1.5;
/** 시드마다 곡선에 큰 고리 구간이 들어갈 확률 */
export const LOOP_CHANCE = 0.5;
/** 고리 구간의 길이 범위(곡선 한 바퀴 대비 비율). 길수록 고리가 크다 */
export const LOOP_WIDTH_MIN = 0.32;
export const LOOP_WIDTH_MAX = 0.45;

const CANDIDATE_TRIES = 40;
const CANDIDATE_EVAL_POINTS = 240;
// buildPath가 완성 경로를 뽑는 점 개수. 테스트(curve.test.ts)가 buildPath를 다시 부르지 않고
// pickCandidate 결과로 sampleFitted를 직접 불러 같은 해상도의 경로를 재현할 때 이 값을 그대로
// 쓰도록 export한다(티켓 20260927_2056) — 값 자체나 계산 로직은 바뀌지 않았다.
export const PATH_SAMPLE_POINTS = 6000;
const CANDIDATE_HARMONIC_BASE = [0, 1.1, 1.3, 0.6, 0.35, 0.2, 0.1];

/** 불규칙성 슬라이더(0~100%)를 내부 굴곡 세기로 바꾼다. */
export function irrValue(sliderPct: number): number {
  return IRR_LO + ((IRR_HI - IRR_LO) * sliderPct) / 100;
}

/**
 * 내부 굴곡 세기(irr)에 따른 흔들림 가중치. 1번은 늘 그대로, 2번은 irr이 낮아도 조금 남기고,
 * 3번 이상은 irr이 오를수록 커진다.
 */
function harmWeight(k: number, irr: number): number {
  if (k === 1) return 1;
  if (k === 2) return 0.4 + 0.6 * irr;
  return Math.pow(irr, k - 2);
}

/**
 * 후보 곡선: 위치가 아니라 "진행 방향(각도)"을 매끄러운 함수로 정하고, 그 방향으로 한 걸음씩 나아가 그린다.
 * 롤러코스터 트랙처럼 방향이 바뀌는 속도(곡률)에 상한이 생겨 한 지점에서 급하게 꺾이지 않는다.
 * - turns: 곡선 한 바퀴 동안 방향이 도는 횟수(±1이면 크게 한 바퀴, ±2면 두 바퀴 감으며 고리가 생긴다)
 * - amp·ph: 진행 방향을 흔드는 파형의 진폭(라디안)과 위상
 * - loop: withLoop이면 곡선 한 곳에서 방향이 한 바퀴 더 도는 큰 고리 구간. 이때 turns는 항상 ±1이다
 */
export function makeCandidate(rnd: RandomSource, withLoop = false): CurveCandidate {
  const r = rnd();
  const sign = rnd() < 0.5 ? -1 : 1;
  const amp: number[] = [];
  const ph: number[] = [];
  for (let k = 1; k <= HARMONICS; k++) {
    amp.push(CANDIDATE_HARMONIC_BASE[k] * (0.3 + 0.7 * rnd()));
    ph.push(rnd() * Math.PI * 2);
  }
  let loop: CurveCandidate['loop'] = null;
  if (withLoop) {
    const u0 = rnd();
    const width = LOOP_WIDTH_MIN + (LOOP_WIDTH_MAX - LOOP_WIDTH_MIN) * rnd();
    loop = { u0, width, sign: rnd() < 0.5 ? -1 : 1 };
  }
  return { turns: sign * (!withLoop && r >= 0.75 ? 2 : 1), amp, ph, loop };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 고리 구간이 진행 방향에 더하는 각도(라디안). 구간 안에서는 0에서 ±2π까지 매끄럽게 늘고, 이후는 ±2π로 유지된다 */
function loopAngle(loop: NonNullable<CurveCandidate['loop']>, u: number): number {
  const d = (((u - loop.u0) % 1) + 1) % 1;
  return loop.sign * 2 * Math.PI * (d < loop.width ? smoothstep(d / loop.width) : 1);
}

/**
 * 정규화된 곡선 좌표 M개. 방향 θ(u)를 따라 나아간 뒤, 평균 진행 벡터를 빼서 끝점이 시작점과 정확히 만나게 한다.
 * 방향 함수가 주기적이므로 이음매에서도 진행 방향이 끊기지 않는다.
 */
export function unitCurve(c: CurveCandidate, irr: number, M: number): { ux: Float32Array; uy: Float32Array } {
  const vx = new Float32Array(M);
  const vy = new Float32Array(M);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < M; i++) {
    const u = (i + 0.5) / M;
    let th = 2 * Math.PI * c.turns * u;
    if (c.loop) th += loopAngle(c.loop, u);
    for (let k = 1; k <= c.amp.length; k++) {
      th += harmWeight(k, irr) * c.amp[k - 1] * Math.sin(2 * Math.PI * k * u + c.ph[k - 1]);
    }
    vx[i] = Math.cos(th);
    vy[i] = Math.sin(th);
    mx += vx[i];
    my += vy[i];
  }
  mx /= M;
  my /= M;
  const ux = new Float32Array(M);
  const uy = new Float32Array(M);
  let x = 0;
  let y = 0;
  for (let j = 0; j < M; j++) {
    ux[j] = x;
    uy[j] = y;
    x += (vx[j] - mx) / M;
    y += (vy[j] - my) / M;
  }
  return { ux, uy };
}

/**
 * 곡선을 M개 점으로 뽑아 스테이지 픽셀 좌표로 바꾼다.
 * 1) 곡선 범위의 가운데를 스테이지 중심에 두고, 가로·세로 범위가 각각 [-1, 1]이 되게 정규화한다
 * 2) 스테이지 중심 기준 배율 s를 정한다. s = 1이면 곡선이 스테이지 안에 딱 맞고, 클수록 밖으로 나간다
 * 3) 곡선 길이 중 스테이지 밖 비율이 OUT_FRACTION이 되는 s를 이분 탐색으로 찾는다
 */
export function sampleFitted(
  c: CurveCandidate,
  irr: number,
  M: number,
  stageWidth: number,
  stageHeight: number
): FittedPoints {
  const uc = unitCurve(c, irr, M);
  const ux = uc.ux;
  const uy = uc.uy;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < M; i++) {
    if (ux[i] < x0) x0 = ux[i];
    if (ux[i] > x1) x1 = ux[i];
    if (uy[i] < y0) y0 = uy[i];
    if (uy[i] > y1) y1 = uy[i];
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = Math.max(1e-6, (x1 - x0) / 2);
  const hy = Math.max(1e-6, (y1 - y0) / 2);
  for (let j = 0; j < M; j++) {
    ux[j] = (ux[j] - cx) / hx;
    uy[j] = (uy[j] - cy) / hy;
  }
  // 배율 s에서 스테이지 밖 비율: 정규화 좌표가 1/s를 넘는 구간의 길이 비율
  function outsideAt(s: number): number {
    const lim = 1 / s;
    let out = 0;
    let all = 0;
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      const seg = Math.hypot((ux[k2] - ux[k]) * stageWidth, (uy[k2] - uy[k]) * stageHeight);
      all += seg;
      if (Math.abs(ux[k]) > lim || Math.abs(uy[k]) > lim) out += seg;
    }
    return all > 0 ? out / all : 0;
  }
  let lo = 1;
  let hi = 2;
  for (let it = 0; it < 22; it++) {
    const mid = (lo + hi) / 2;
    if (outsideAt(mid) < OUT_FRACTION) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  const xs = new Float32Array(M);
  const ys = new Float32Array(M);
  for (let p = 0; p < M; p++) {
    xs[p] = stageWidth / 2 + s * (stageWidth / 2) * ux[p];
    ys[p] = stageHeight / 2 + s * (stageHeight / 2) * uy[p];
  }
  return { xs, ys };
}

/** 후보 평가: 겹침 점수(서로 다른 구간이 가까이 지나가는 정도), 중앙 체류 비율, 최소 회전 반경 */
export function candidateStats(
  c: CurveCandidate,
  irr: number,
  stageWidth: number,
  stageHeight: number
): CandidateStats {
  const M = CANDIDATE_EVAL_POINTS;
  const p = sampleFitted(c, irr, M, stageWidth, stageHeight);
  const px = p.xs;
  const py = p.ys;
  const S = Math.min(stageWidth, stageHeight);
  const d0 = 0.15 * S;
  const skip = M / 10;
  let overlap = 0;
  for (let a = 0; a < M; a++) {
    for (let b = a + 1; b < M; b++) {
      const gap = Math.min(b - a, M - (b - a));
      if (gap <= skip) continue;
      const dist = Math.hypot(px[a] - px[b], py[a] - py[b]);
      if (dist < d0) overlap += 1 - dist / d0;
    }
  }
  let inside = 0;
  let all = 0;
  let kMax = 0;
  for (let i = 0; i < M; i++) {
    const i0 = (i - 1 + M) % M;
    const i2 = (i + 1) % M;
    const v1x = px[i] - px[i0];
    const v1y = py[i] - py[i0];
    const v2x = px[i2] - px[i];
    const v2y = py[i2] - py[i];
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    all += l2;
    if (Math.abs(px[i] - stageWidth / 2) < 0.2 * stageWidth && Math.abs(py[i] - stageHeight / 2) < 0.2 * stageHeight) {
      inside += l2;
    }
    // 곡률 = 인접한 두 구간 사이의 방향 변화 / 구간 길이
    const turn = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
    const kappa = turn / Math.max(1e-6, (l1 + l2) / 2);
    if (kappa > kMax) kMax = kappa;
  }
  return { overlap, center: all > 0 ? inside / all : 0, radius: kMax > 0 ? 1 / kMax / S : Infinity };
}

/**
 * 시드마다 후보를 여러 개 만들고, 급하게 꺾이지 않으면서 중앙을 충분히 지나는 후보 중 겹침이 가장 적은 곡선을 고른다.
 * 1순위는 회전 반경·중앙 기준을 모두 채운 후보, 없으면 2순위로 회전 반경 기준을 절반으로 낮춘 후보,
 * 그래도 없으면 기준에 가장 가까운 후보를 쓴다. 회전 반경 기준이 높아 1순위가 드물어 2순위가 흔하다.
 * 중앙 기준은 후보 평가(성긴 점)가 완성 경로보다 조금 후하게 나오는 만큼 여유(CENTER_MARGIN)를 둔다.
 * 후보 평가는 불규칙성 슬라이더와 무관하게 슬라이더 양 끝(가장 약한 굴곡·가장 강한 굴곡) 두 경우로 하므로
 * 슬라이더를 움직여도 곡선이 갑자기 바뀌지 않는다.
 */
export function pickCandidate(rnd: RandomSource, stageWidth: number, stageHeight: number): CurveCandidate {
  let best = Infinity;
  let pick: CurveCandidate | null = null;
  let softBest = Infinity;
  let softPick: CurveCandidate | null = null;
  let fallback: CurveCandidate | null = null;
  let fallbackScore = -Infinity;
  // 고리 포함 여부는 시드마다 먼저 정한다. 겹침 점수로 고르면 고리 후보가 거의 뽑히지 않는다
  const wantLoop = rnd() < LOOP_CHANCE;
  // 고리 곡선은 고리 안쪽이 원래 촘촘해 회전 반경 기준을 절반으로 낮춘다
  const radiusMin = wantLoop ? RADIUS_MIN * 0.5 : RADIUS_MIN;
  const radiusSoft = RADIUS_MIN * 0.5;
  const centerMin = CENTER_MIN * CENTER_MARGIN;
  for (let n = 0; n < CANDIDATE_TRIES; n++) {
    const cand = makeCandidate(rnd, wantLoop);
    const sa = candidateStats(cand, IRR_LO, stageWidth, stageHeight);
    const sb = candidateStats(cand, IRR_HI, stageWidth, stageHeight);
    const radius = Math.min(sa.radius, sb.radius);
    const center = Math.min(sa.center, sb.center);
    const closeness = Math.min(radius / radiusSoft, center / centerMin);
    if (closeness > fallbackScore) {
      fallbackScore = closeness;
      fallback = cand;
    }
    if (radius < radiusSoft || center < centerMin) continue;
    const score = sa.overlap + sb.overlap;
    if (score < softBest) {
      softBest = score;
      softPick = cand;
    }
    if (radius >= radiusMin && score < best) {
      best = score;
      pick = cand;
    }
  }
  // fallback은 매 반복마다 갱신되므로 CANDIDATE_TRIES(40) > 0인 한 null일 수 없다
  return (pick ?? softPick ?? fallback) as CurveCandidate;
}

// 후보 탐색(pickCandidate)은 시드·스테이지 크기에만 좌우되고 그 자체로 비용이 드는 편이라,
// 슬라이더 조작 등으로 buildPath를 자주 다시 부를 때를 대비해 마지막 결과를 캐시한다.
// 캐시는 buildPath의 출력값에 영향을 주지 않는다(같은 키는 항상 같은 후보를 고른다).
let cachedPick: CurveCandidate | null = null;
let cachedPickKey = '';

/** 시드·불규칙성·스테이지 크기로 완성된 경로 테이블을 만든다. 같은 입력이면 항상 같은 결과를 낸다. */
export function buildPath(seed: number, irregPct: number, stageWidth: number, stageHeight: number): PathTable {
  const key = `${seed}|${stageWidth}|${stageHeight}`;
  if (cachedPickKey !== key) {
    cachedPick = pickCandidate(mulberry32(seed), stageWidth, stageHeight);
    cachedPickKey = key;
  }
  const pick = cachedPick as CurveCandidate;
  const N = PATH_SAMPLE_POINTS;
  const fit = sampleFitted(pick, irrValue(irregPct), N, stageWidth, stageHeight);
  const xs = new Float32Array(N + 1);
  const ys = new Float32Array(N + 1);
  const cum = new Float32Array(N + 1);
  const tx = new Float32Array(N + 1);
  const ty = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    xs[i] = fit.xs[i % N];
    ys[i] = fit.ys[i % N];
    cum[i] = i === 0 ? 0 : cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  // 진행 방향(접선): 이웃 점의 차이로 구하고 닫힌 곡선이므로 양 끝은 순환시킨다
  for (let j = 0; j <= N; j++) {
    const prev = (j - 1 + N) % N;
    const next = (j + 1) % N;
    const dx = xs[next] - xs[prev];
    const dy = ys[next] - ys[prev];
    const len = Math.hypot(dx, dy) || 1;
    tx[j] = dx / len;
    ty[j] = dy / len;
  }
  return { xs, ys, tx, ty, cum, total: cum[N], N };
}

/** 경로 위 호 길이 s(0~total, 순환)에서의 위치·접선 각도. out을 주면 재사용해 할당을 줄인다. */
export function posAt(path: PathTable, s: number, out: PathPoint = { x: 0, y: 0, a: 0 }): PathPoint {
  const L = path.total;
  const sc = ((s % L) + L) % L;
  let lo = 0;
  let hi = path.N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.cum[mid] <= sc) lo = mid;
    else hi = mid;
  }
  const seg = path.cum[hi] - path.cum[lo];
  const f = seg > 0 ? (sc - path.cum[lo]) / seg : 0;
  out.x = path.xs[lo] + (path.xs[hi] - path.xs[lo]) * f;
  out.y = path.ys[lo] + (path.ys[hi] - path.ys[lo]) * f;
  out.a = Math.atan2(path.ty[lo] + (path.ty[hi] - path.ty[lo]) * f, path.tx[lo] + (path.tx[hi] - path.tx[lo]) * f);
  return out;
}
