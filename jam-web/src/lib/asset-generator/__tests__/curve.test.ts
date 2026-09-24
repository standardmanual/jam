/**
 * asset-generator/curve — 이동 곡선 결정성·품질 테스트
 *
 * 완료 조건(티켓 20260924_2155): 같은 시드 → 같은 좌표, 화면 밖 길이 비율 15%±1%p,
 * 슬라이더 0·100에서 최소 회전 반경이 짧은 변의 5% 이상, 곡선이 화면 중앙을 지난다.
 */
import { describe, expect, it } from 'vitest';
import { buildPath, type PathTable } from '../curve';

const W = 1280;
const H = 1280;
const SEED = 42;

// candidateStats(curve.ts)와 같은 방식(성긴 점으로 회전 반경·중앙 체류 비율 계산)을
// 완성된 경로(buildPath 출력, N=6000)에 그대로 적용한다. 점이 너무 촘촘하면 인접 각도가
// 작아져 곡률 잡음이 커지므로 약 240등분으로 줄여서 본다.
function pathQualityStats(path: PathTable) {
  const { xs, ys, N } = path;
  const S = Math.min(W, H);
  const stride = Math.max(1, Math.floor(N / 240));
  const idx: number[] = [];
  for (let i = 0; i < N; i += stride) idx.push(i);
  const M = idx.length;
  let kMax = 0;
  let inside = 0;
  let all = 0;
  for (let i = 0; i < M; i++) {
    const i0 = idx[(i - 1 + M) % M];
    const i1 = idx[i];
    const i2 = idx[(i + 1) % M];
    const v1x = xs[i1] - xs[i0];
    const v1y = ys[i1] - ys[i0];
    const v2x = xs[i2] - xs[i1];
    const v2y = ys[i2] - ys[i1];
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    all += l2;
    if (Math.abs(xs[i1] - W / 2) < 0.2 * W && Math.abs(ys[i1] - H / 2) < 0.2 * H) inside += l2;
    const turn = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
    const kappa = turn / Math.max(1e-6, (l1 + l2) / 2);
    if (kappa > kMax) kMax = kappa;
  }
  return { radius: kMax > 0 ? 1 / kMax / S : Infinity, center: all > 0 ? inside / all : 0 };
}

// 곡선 길이 중 스테이지(0~W, 0~H) 밖에 있는 구간의 비율. 각 구간은 시작점 기준으로 판정한다.
function outsideFraction(path: PathTable): number {
  const { xs, ys, N, total } = path;
  let out = 0;
  for (let i = 0; i < N; i++) {
    const seg = Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]);
    if (xs[i] < 0 || xs[i] > W || ys[i] < 0 || ys[i] > H) out += seg;
  }
  return total > 0 ? out / total : 0;
}

describe('asset-generator/curve — buildPath 결정성', () => {
  it('같은 시드·같은 입력이면 완전히 같은 좌표를 낸다', () => {
    const a = buildPath(SEED, 35, W, H);
    const b = buildPath(SEED, 35, W, H);
    expect(Array.from(a.xs)).toEqual(Array.from(b.xs));
    expect(Array.from(a.ys)).toEqual(Array.from(b.ys));
    expect(a.total).toBe(b.total);
  });

  it('시드가 다르면 다른 좌표를 낸다', () => {
    const a = buildPath(SEED, 35, W, H);
    const b = buildPath(SEED + 1, 35, W, H);
    expect(Array.from(a.xs)).not.toEqual(Array.from(b.xs));
  });
});

describe.each([0, 100])('불규칙성 슬라이더 %i%%', (irreg) => {
  const path = buildPath(SEED, irreg, W, H);
  const stats = pathQualityStats(path);

  it('화면 밖 길이 비율이 15%±1%p 안에 있다', () => {
    const frac = outsideFraction(path);
    expect(frac).toBeGreaterThanOrEqual(0.14);
    expect(frac).toBeLessThanOrEqual(0.16);
  });

  it('최소 회전 반경이 짧은 변의 5% 이상이다', () => {
    expect(stats.radius).toBeGreaterThanOrEqual(0.05);
  });

  it('곡선 길이의 10% 이상이 화면 중앙(가운데 40%)을 지난다', () => {
    expect(stats.center).toBeGreaterThanOrEqual(0.1);
  });
});
