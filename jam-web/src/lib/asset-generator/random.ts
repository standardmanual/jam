/**
 * JAM! 에셋 제너레이터 — 시드 난수·전체 랜덤 규칙·랜덤 팔레트
 *
 * 원본: docs/assets/prototypes/20260924_jam-asset-generator.html
 * (mulberry32 320줄, rand/randInt/choice/hslHex/hexRgb 595~608줄, randomPalette 610줄,
 * randomBtn 클릭 처리 626줄). 캔버스에 의존하지 않는 순수 계산만 담는다.
 */

import type { GradientDirection } from './types';

export type RandomSource = () => number;

/** 시드 기반 결정적 난수 생성기. 같은 시드는 항상 같은 수열을 낸다. */
export function mulberry32(seed: number): RandomSource {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [a, b) 구간의 실수. rnd를 주지 않으면 Math.random을 쓴다(전체 랜덤 버튼과 동일한 비결정적 동작). */
export function randRange(a: number, b: number, rnd: RandomSource = Math.random): number {
  return a + rnd() * (b - a);
}

/** [a, b] 구간을 step 단위로 끊은 정수 중 하나. */
export function randInt(a: number, b: number, step = 1, rnd: RandomSource = Math.random): number {
  return a + Math.floor(rnd() * (Math.floor((b - a) / step) + 1)) * step;
}

export function choice<T>(list: readonly T[], rnd: RandomSource = Math.random): T {
  return list[Math.floor(rnd() * list.length)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  function f(n: number): string {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    const x = Math.round(v * 255);
    return (x < 16 ? '0' : '') + x.toString(16);
  }
  return '#' + f(0) + f(8) + f(4);
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * 배경(=시작 색)과 끝 색이 충분히 구분되는 조합이 나올 때까지 몇 번 다시 뽑는다.
 * 반환: [배경색, 끝색]
 */
export function randomPalette(rnd: RandomSource = Math.random): [string, string] {
  let best: [string, string] | null = null;
  let bestDist = -1;
  for (let i = 0; i < 12; i++) {
    const h = randRange(0, 360, rnd);
    const bg = hslToHex(h, randRange(70, 100, rnd), randRange(42, 58, rnd));
    const end =
      rnd() < 0.7
        ? hslToHex((h + randRange(90, 270, rnd)) % 360, randRange(65, 100, rnd), randRange(55, 80, rnd))
        : hslToHex((h + randRange(-40, 40, rnd) + 360) % 360, randRange(70, 100, rnd), randRange(18, 32, rnd));
    const a = hexToRgb(bg);
    const b = hexToRgb(end);
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (dist > bestDist) {
      bestDist = dist;
      best = [bg, end];
    }
    if (dist > 190) break;
  }
  // 루프가 항상 최소 한 번은 돌아 best를 채우므로 null이 될 수 없다
  return best as [string, string];
}

/** 전체 랜덤 버튼이 채우는 리본 레이어 속성값 (스테이지 비율 제외 — PRD §3, 출력 규격이라 랜덤에서 뺀다). */
export interface RandomRibbonValues {
  backgroundColor: string;
  endColor: string;
  linkStartToBackground: true;
  sizePct: number;
  blurPct: number;
  rotationDeg: number;
  followPath: boolean;
  direction: GradientDirection;
  irregularityPct: number;
  seed: number;
  speed: number;
  gap: number;
  count: number;
}

const GRADIENT_DIRECTIONS: readonly GradientDirection[] = ['h', 'v', 'r'];

/**
 * 전체 랜덤 규칙 (프로토타입 randomBtn 클릭 처리, 626줄과 값 범위 동일).
 * 수동 경로 전체 랜덤 버튼과 자동 경로(§8, 프리셋 대상 유형의 랜덤 규칙)가 함께 쓴다.
 */
export function randomizeRibbonConfig(rnd: RandomSource = Math.random): RandomRibbonValues {
  const [bg, end] = randomPalette(rnd);
  return {
    backgroundColor: bg,
    endColor: end,
    linkStartToBackground: true, // 랜덤에서는 배경색과 시작 색을 항상 같게 둔다
    sizePct: randInt(12, 40, 1, rnd),
    blurPct: rnd() < 0.6 ? 0 : randInt(5, 35, 1, rnd),
    rotationDeg: randInt(-180, 180, 1, rnd),
    followPath: rnd() < 0.5,
    direction: choice(GRADIENT_DIRECTIONS, rnd),
    irregularityPct: randInt(0, 100, 1, rnd),
    seed: Math.floor(rnd() * 1e9),
    speed: randInt(1000, 2000, 10, rnd),
    gap: randInt(4, 30, 1, rnd),
    count: randInt(200, 800, 5, rnd)
  };
}

/**
 * 마스터 시드 규칙 (PRD §11). 하나의 마스터 시드에서 `randomizeRibbonConfig`의 값 전부
 * (배경색·끝색 포함 리본 속성)와 곡선 시드(반환값의 `seed` 필드, `buildPath`가 쓰는 값)를
 * 결정적으로 뽑는다 — `mulberry32(seed)`로 만든 난수원을 그대로 `randomizeRibbonConfig`에
 * 넘기므로 같은 마스터 시드는 항상 같은 값을 낸다.
 *
 * 에이전트 CLI(`scripts/asset-generator/render.mjs`, 티켓 20260924_2201)와 어드민 화면의
 * "전체 무작위"·"시드 불러오기"가 함께 쓴다 — 같은 마스터 시드를 넣으면 두 경로가 같은 리본을
 * 그린다. 배경색·끝색·텍스트 내용은 이 함수의 대상이 아니다(호출자가 별도 입력으로 받는다,
 * PRD §8).
 */
export function deriveRibbonFromSeed(seed: number): RandomRibbonValues {
  return randomizeRibbonConfig(mulberry32(seed));
}
