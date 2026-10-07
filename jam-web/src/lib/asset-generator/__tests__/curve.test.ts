/**
 * asset-generator/curve — 이동 곡선 결정성·품질 테스트
 *
 * 완료 조건(티켓 20260924_2155): 같은 시드 → 같은 좌표, 화면 밖 길이 비율 30%±1%p,
 * 슬라이더 0·100에서 최소 회전 반경이 짧은 변의 5% 이상, 곡선이 화면 중앙을 지난다.
 */
import { describe, expect, it } from 'vitest';
import { PATH_SAMPLE_POINTS, buildPath, irrValue, pickCandidate, sampleFitted, type PathTable } from '../curve';
import { mulberry32 } from '../random';

const W = 1280;
const H = 1280;
const SEED = 42;

// candidateStats(curve.ts)와 같은 방식(성긴 점으로 회전 반경·중앙 체류 비율 계산)을
// 완성된 경로(buildPath 출력, N=6000)에 그대로 적용한다. 점이 너무 촘촘하면 인접 각도가
// 작아져 곡률 잡음이 커지므로 약 240등분으로 줄여서 본다.
function pathQualityStats(path: Pick<PathTable, 'xs' | 'ys' | 'N'>) {
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

  // 옛 시드 경계(티켓 20261007_1602, PRD §11): 곡선 알고리즘이 바뀐 뒤에는 옛 시드로 같은 그림이
  // 나오지 않는다. 같은 시드라도 스테이지 크기가 다르면 후보 평가가 달라져 다른 곡선이 나온다는 점으로
  // "시드만으로는 그림이 고정되지 않는다"를 고정한다.
  it('같은 시드라도 스테이지 크기가 다르면 다른 곡선을 낸다', () => {
    const square = buildPath(SEED, 35, W, H);
    const wide = buildPath(SEED, 35, 1280, 720);
    expect(Array.from(square.ys)).not.toEqual(Array.from(wide.ys));
  });

  it('불규칙성 슬라이더 값이 달라도 시드가 같으면 같은 입력에서 같은 결과를 낸다(NaN 없음)', () => {
    for (const irreg of [0, 100]) {
      const path = buildPath(SEED, irreg, W, H);
      expect(Array.from(path.xs).every(Number.isFinite)).toBe(true);
      expect(Array.from(path.ys).every(Number.isFinite)).toBe(true);
    }
  });
});

describe.each([0, 100])('불규칙성 슬라이더 %i%%', (irreg) => {
  const path = buildPath(SEED, irreg, W, H);
  const stats = pathQualityStats(path);

  it('화면 밖 길이 비율이 30%±1%p 안에 있다', () => {
    const frac = outsideFraction(path);
    expect(frac).toBeGreaterThanOrEqual(0.29);
    expect(frac).toBeLessThanOrEqual(0.31);
  });

  it('최소 회전 반경이 짧은 변의 5% 이상이다', () => {
    expect(stats.radius).toBeGreaterThanOrEqual(0.05);
  });

  it('곡선 길이의 10% 이상이 화면 중앙(가운데 40%)을 지난다', () => {
    expect(stats.center).toBeGreaterThanOrEqual(0.1);
  });
});

describe('asset-generator/curve — 큰 고리 구간', () => {
  const seeds = Array.from({ length: 50 }, (_, i) => i);
  // pickCandidate(시드마다 후보 40개를 두 불규칙성으로 평가)가 이 파일에서 가장 비싼 연산이다.
  // 아래 두 테스트가 같은 시드 50개를 각자 다시 계산하면(이전 코드: 첫 테스트가 pickCandidate를
  // 직접 50회, 둘째 테스트가 buildPath를 통해 다시 50회 — buildPath의 내부 캐시는 seed|W|H 키가
  // 시드마다 바뀌어 이 루프에서는 재사용되지 않는다) 총 100회 호출돼 클라우드 세션에서 기본
  // 타임아웃(5초)을 넘긴다(티켓 20260927_2056, 실측 5,060ms/6,236ms). describe 본문은 수집 단계에서
  // 한 번만 실행되고 it()의 실행 시간(타임아웃 대상)에 잡히지 않으므로, 여기서 시드당 한 번만
  // pickCandidate를 불러 두 테스트가 결과를 공유한다.
  const candidates = seeds.map((seed) => pickCandidate(mulberry32(seed), W, H));

  it('시드 0~49 중 30~70%에서 곡선에 큰 고리가 있다', () => {
    const withLoop = candidates.filter((c) => c.loop !== null).length;
    const ratio = withLoop / seeds.length;
    expect(ratio).toBeGreaterThanOrEqual(0.3);
    expect(ratio).toBeLessThanOrEqual(0.7);
  });

  it('고리가 있든 없든 모든 시드의 완성 경로가 회전 반경 5%·중앙 통과 10% 이상이다', () => {
    // buildPath(seed, irreg, W, H)를 다시 부르지 않고, 위에서 구한 candidate로 sampleFitted를
    // 직접 호출한다. buildPath는 내부적으로 `xs[i] = fit.xs[i % N]`처럼 sampleFitted의 출력을
    // 그대로 복사할 뿐이라(curve.ts buildPath 참고) 이 테스트가 보는 인덱스 0~N-1 구간에서는
    // 값이 완전히 같다 — 판정 대상 수치는 이전과 동일하고 pickCandidate 재계산만 없앤다.
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const cand = candidates[i];
      for (const irreg of [0, 100]) {
        const fit = sampleFitted(cand, irrValue(irreg), PATH_SAMPLE_POINTS, W, H);
        const stats = pathQualityStats({ xs: fit.xs, ys: fit.ys, N: PATH_SAMPLE_POINTS });
        expect(stats.radius, `시드 ${seed} 불규칙성 ${irreg} 회전 반경`).toBeGreaterThanOrEqual(0.05);
        expect(stats.center, `시드 ${seed} 불규칙성 ${irreg} 중앙 통과`).toBeGreaterThanOrEqual(0.1);
      }
    }
  });
});
