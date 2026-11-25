/**
 * 박스 모양 5종의 마스크·경로 계산 — 순수 함수 (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정).
 *
 * 값만 받는 순수 함수다(DB·조회·훅 없음, 무작위는 시드로만 정한다). `FeedBox` 부품이 이 함수의 결과를 CSS `mask`로 건다.
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격」 «박스 모양 5가지». 3회차-1의 상수 파일(`feedConstants.ts`)은 고치지 않고 읽기만 한다.
 *
 * ## 모양 × 방향 (박스에는 외곽선이 없다)
 * | 모양      | text(텍스트 박스)             | image(이미지 마스크)           | item(아이템 배지 박스, 작은 칸)         |
 * |-----------|-------------------------------|--------------------------------|-----------------------------------------|
 * | round     | 모서리 12px                   | 모서리 12px                    | 모서리 12px                             |
 * | ticket    | 양쪽 변 홈 2개씩, 지름 56     | 위·아래 변 홈 2개씩, 지름 40   | 양쪽 변 홈 2개씩, 지름 20(줄인 값)      |
 * | stamp     | 위·아래 변 홈 8개씩, 지름 24  | 양쪽 변 홈 5개씩, 지름 20      | 위·아래 변 홈 5개씩, 지름 12(줄인 값)   |
 * | wave      | 22마디, 높낮이 12~22          | 22마디, 높낮이 12~22           | 22마디, 높낮이 6~11(줄인 값)            |
 * | bump      | 양쪽으로 반지름 28(제안 값)   | 양쪽으로 반지름 52             | 위·아래로 반지름 28                     |
 *
 * PRD가 치수를 정한 것은 위 표의 «지름 56·40·24·20», «반지름 28(아이템)·52(이미지)», «22마디·높낮이 12~22», 이미지 우표 홈 5개뿐이다.
 * 나머지는 이 파일이 정한 값이며 모두 **채원 확인 필요**다(완료 기록 「잔여 이슈」):
 * - `item` 방향의 줄인 홈 치수(ticket 20·stamp 12×5·wave 6~11): 아이템 배지 칸이 작아서 PRD의 텍스트·이미지 치수를 그대로 쓸 수 없다.
 * - 텍스트 박스 우표 홈 개수 8: PRD가 «줄지음»이라고만 했다. 카드 폭 288~398px에서 홈 사이 간격이 12~26px이 되는 수다.
 * - 텍스트 박스 반원 돌출 반지름 28: PRD가 아이템·이미지만 정했다. 텍스트 박스는 아이템과 같은 28을 제안한다.
 *
 * ## 픽셀 고정 치수와 카드 폭 288~398px 비율 변환 (PRD 「구현 때 지킬 점」)
 * - 홈 지름·돌출 반지름·모서리는 **픽셀 고정**이다(카드 폭이 바뀌어도 홈이 같은 크기). 홈의 **위치**만 변 길이의 비율(%)이다.
 *   홈은 마스크 겹침(`mask-composite`)으로, 돌출은 합침으로 만든다. 마스크 층마다 요소 전체(`100% 100%`)를 덮어 폭이 바뀌어도 이음새가 생기지 않는다.
 * - 물결은 **비율 변환**이다. 방향마다 기준 viewBox(`WAVE_VIEWBOX`)에 경로를 그리고 `preserveAspectRatio="none"` SVG를 마스크 이미지(`100% 100%`)로 늘린다.
 *   그래서 박스가 기준 크기와 다른 비율이면 물결 높낮이도 같은 비율로 늘고 줄어든다(카드 폭 288~398px에서 모양은 같고 높낮이가 ±20% 달라진다).
 *
 * ## 반원 돌출의 바깥 여백
 * 마스크는 요소 밖을 그리지 못한다. 그래서 돌출 모양은 **요소 상자 안에** 돌출 영역을 포함한다: 요소 상자 = 몸통 + 돌출 반지름×양쪽.
 * 몸통은 돌출 반지름만큼 안쪽에서 시작한다. `boxProtrusion()`이 그 여백(px)을 돌려주고 `FeedBox`가 같은 값을 안쪽 여백(padding)으로 걸어
 * `children`이 몸통 안에 놓이게 한다. 부모는 같은 값을 써서 몸통을 격자에 맞춘다(예: 음수 바깥 여백으로 돌출 영역을 이웃 영역에 겹친다).
 *
 * ## 시드 없는 물결
 * 물결은 시드가 있어야 그린다(같은 시드는 같은 경로). 시드가 없으면(`undefined`·빈 문자열) 오류를 내지 않고 **라운드로 대신한다**(`resolveBoxShape`).
 * 시드 0은 유효한 시드다.
 *
 * 색을 쓰지 않는다: 마스크는 알파 값만 읽으므로 `black`·`transparent` 키워드만 쓴다(hex 없음).
 */

import { FEED_BOX } from './feedConstants'

export type BoxShape = 'round' | 'ticket' | 'stamp' | 'wave' | 'bump'
/** 박스 방향: `text` 텍스트 박스, `image` 이미지 마스크, `item` 아이템 배지 박스(작은 칸). */
export type BoxOrientation = 'text' | 'image' | 'item'
export type BoxSeed = string | number

export const BOX_SHAPES: readonly BoxShape[] = ['round', 'ticket', 'stamp', 'wave', 'bump']
export const BOX_ORIENTATIONS: readonly BoxOrientation[] = ['text', 'image', 'item']

/** 박스 모서리 px. `rounded-xl`(radius.css, 12px)과 같다. 라운드·티켓·우표는 클래스로, 돌출은 마스크 안에서 같은 값으로 둥글린다. */
const BOX_CORNER_RADIUS = 12

// ── `item` 방향과 PRD가 정하지 않은 치수 (모두 채원 확인 필요, 위 머리말 참고) ──────────

/** 우표 홈 개수(변마다). 이미지 5개는 PRD 규격이고 텍스트 8·아이템 5는 이 파일이 정한 값이다. */
const STAMP_NOTCH_COUNT: Readonly<Record<BoxOrientation, number>> = { text: 8, image: 5, item: 5 }

/** `item` 방향의 줄인 치수. 아이템 배지 칸이 작아서 텍스트·이미지 치수를 줄였다. */
export const ITEM_BOX = {
  ticketNotchDiameter: 20,
  stampNotchDiameter: 12,
  waveAmplitude: { min: 6, max: 11 },
} as const

const TICKET_NOTCH_DIAMETER: Readonly<Record<BoxOrientation, number>> = {
  text: FEED_BOX.ticketNotchDiameter.text,
  image: FEED_BOX.ticketNotchDiameter.image,
  item: ITEM_BOX.ticketNotchDiameter,
}

const STAMP_NOTCH_DIAMETER: Readonly<Record<BoxOrientation, number>> = {
  text: FEED_BOX.stampNotchDiameter.text,
  image: FEED_BOX.stampNotchDiameter.image,
  item: ITEM_BOX.stampNotchDiameter,
}

/** 반원 돌출 반지름. 아이템 28·이미지 52는 PRD 규격, 텍스트 28은 이 파일의 제안 값이다. */
const BUMP_RADIUS: Readonly<Record<BoxOrientation, number>> = {
  text: FEED_BOX.bumpRadius.itemBadge,
  image: FEED_BOX.bumpRadius.image,
  item: FEED_BOX.bumpRadius.itemBadge,
}

/** 물결 경로를 그리는 기준 viewBox(px). 박스 비율과 달라도 `preserveAspectRatio="none"`으로 늘려 맞춘다. */
export const WAVE_VIEWBOX: Readonly<Record<BoxOrientation, { width: number; height: number }>> = {
  text: { width: 320, height: 240 },
  image: { width: 320, height: 180 },
  item: { width: 84, height: 84 },
}

const WAVE_AMPLITUDE: Readonly<Record<BoxOrientation, { min: number; max: number }>> = {
  text: FEED_BOX.waveAmplitude,
  image: FEED_BOX.waveAmplitude,
  item: ITEM_BOX.waveAmplitude,
}

// ── 시드 → 난수열 ────────────────────────────────────────────

/** 시드(문자열·숫자) → 32비트 부호 없는 정수. FNV-1a. 같은 시드는 항상 같은 값이다. */
export function hashSeed(seed: BoxSeed): number {
  const text = String(seed)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 시드 → [0, 1) 난수를 차례로 돌려주는 함수. mulberry32. 서버와 브라우저가 같은 열을 만든다. */
export function createRng(seed: BoxSeed): () => number {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 시드 물결 ────────────────────────────────────────────────

type WaveSide = 'top' | 'right' | 'bottom' | 'left'

export interface WaveLobe {
  side: WaveSide
  /** 마디 시작점·끝점(경로 방향은 시계 방향) */
  from: readonly [number, number]
  to: readonly [number, number]
  /** 바깥으로 부푼 높이(px). 범위는 `amplitude.min`~`amplitude.max` */
  depth: number
}

const round2 = (value: number) => Number(value.toFixed(2))

/** 변 길이에 비례해 마디를 나눈다(변마다 최소 1개, 합이 total). 가장 큰 소수부 순으로 남는 마디를 준다. */
function allocateLobes(lengths: readonly number[], total: number): number[] {
  const sum = lengths.reduce((a, b) => a + b, 0)
  const exact = lengths.map((length) => (length / sum) * total)
  const counts = exact.map((value) => Math.max(1, Math.floor(value)))
  let diff = total - counts.reduce((a, b) => a + b, 0)
  while (diff !== 0) {
    if (diff > 0) {
      let best = 0
      for (let i = 1; i < counts.length; i += 1) {
        if (exact[i] - counts[i] > exact[best] - counts[best]) best = i
      }
      counts[best] += 1
      diff -= 1
    } else {
      let best = -1
      for (let i = 0; i < counts.length; i += 1) {
        if (counts[i] > 1 && (best === -1 || counts[i] - exact[i] > counts[best] - exact[best])) best = i
      }
      if (best === -1) break
      counts[best] -= 1
      diff += 1
    }
  }
  return counts
}

/**
 * 시드 물결의 마디 22개. 몸통 사각형(`amplitude.max`만큼 안쪽)의 둘레를 시계 방향으로 돌며 마디를 놓는다.
 * 마디 개수는 변 길이에 비례해 나누고, 마디마다 너비(간격)는 0.7~1.3배, 부푼 높이는 `amplitude` 범위에서 시드로 정한다.
 * 부푼 높이가 `amplitude.max` 이하라 경로가 viewBox 밖으로 나가지 않는다.
 */
export function buildWaveLobes(
  seed: BoxSeed,
  width: number,
  height: number,
  amplitude: { min: number; max: number } = FEED_BOX.waveAmplitude,
  count: number = FEED_BOX.waveCount,
): WaveLobe[] {
  const rng = createRng(seed)
  const inset = amplitude.max
  const left = inset
  const top = inset
  const right = width - inset
  const bottom = height - inset

  const sides: { side: WaveSide; from: [number, number]; to: [number, number] }[] = [
    { side: 'top', from: [left, top], to: [right, top] },
    { side: 'right', from: [right, top], to: [right, bottom] },
    { side: 'bottom', from: [right, bottom], to: [left, bottom] },
    { side: 'left', from: [left, bottom], to: [left, top] },
  ]
  const lengths = sides.map(({ from, to }) => Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]))
  const counts = allocateLobes(lengths, count)

  const lobes: WaveLobe[] = []
  sides.forEach(({ side, from, to }, sideIndex) => {
    const n = counts[sideIndex]
    const weights = Array.from({ length: n }, () => 0.7 + rng() * 0.6)
    const weightSum = weights.reduce((a, b) => a + b, 0)
    let cursor = 0
    for (let i = 0; i < n; i += 1) {
      const t0 = cursor / weightSum
      cursor += weights[i]
      const t1 = cursor / weightSum
      const depth = round2(amplitude.min + rng() * (amplitude.max - amplitude.min))
      lobes.push({
        side,
        from: [round2(from[0] + (to[0] - from[0]) * t0), round2(from[1] + (to[1] - from[1]) * t0)],
        to: [round2(from[0] + (to[0] - from[0]) * t1), round2(from[1] + (to[1] - from[1]) * t1)],
        depth,
      })
    }
  })
  return lobes
}

const OUTWARD: Readonly<Record<WaveSide, readonly [number, number]>> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
}

/** 시드 물결의 SVG 경로(`d`). 같은 시드·같은 크기는 같은 문자열이다. 마디마다 2차 곡선 하나이고 정점이 `depth`만큼 부푼다. */
export function buildWavePath(
  seed: BoxSeed,
  width: number,
  height: number,
  amplitude: { min: number; max: number } = FEED_BOX.waveAmplitude,
): string {
  const lobes = buildWaveLobes(seed, width, height, amplitude)
  const first = lobes[0].from
  const segments = lobes.map(({ side, from, to, depth }) => {
    const [nx, ny] = OUTWARD[side]
    // 2차 곡선의 정점은 제어점 높이의 절반이라, 정점이 depth가 되도록 제어점을 2×depth 바깥에 둔다.
    const cx = round2((from[0] + to[0]) / 2 + nx * 2 * depth)
    const cy = round2((from[1] + to[1]) / 2 + ny * 2 * depth)
    return `Q${cx} ${cy} ${to[0]} ${to[1]}`
  })
  return `M${first[0]} ${first[1]}${segments.join('')}Z`
}

/** 물결 마스크용 `url("data:…")` 값. SVG는 늘려 맞추고(`preserveAspectRatio="none"`) 알파만 쓰므로 채움 색은 `black`이다. */
export function buildWaveMaskImage(seed: BoxSeed, orientation: BoxOrientation): string {
  const { width, height } = WAVE_VIEWBOX[orientation]
  const path = buildWavePath(seed, width, height, WAVE_AMPLITUDE[orientation])
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
    `<path d="${path}" fill="black"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// ── CSS 마스크 ───────────────────────────────────────────────

interface MaskLayer {
  image: string
  size: string
  position: string
}

export interface BoxMask {
  layers: readonly MaskLayer[]
  /** `intersect`: 층마다 구멍을 뚫어 겹친다(티켓·우표). `add`: 층을 합친다(돌출·물결). */
  composite: 'intersect' | 'add'
}

/** 시드가 없는 물결은 라운드로 대신한다(머리말 「시드 없는 물결」). */
export function resolveBoxShape(shape: BoxShape, seed?: BoxSeed): BoxShape {
  if (shape === 'wave' && (seed === undefined || seed === '')) return 'round'
  return shape
}

const FULL = { size: '100% 100%', position: '0 0' } as const

const percent = (fraction: number) => `${round2(fraction * 100)}%`

/** 변 위 홈 위치(0~1). `even`은 (i+0.5)/n, `thirds`는 (i+1)/(n+1)로 둔다(홈 2개면 1/3·2/3). */
function notchPositions(count: number, mode: 'even' | 'between'): number[] {
  return Array.from({ length: count }, (_, i) => (mode === 'even' ? (i + 0.5) / count : (i + 1) / (count + 1)))
}

/** 반원 홈 한 개: 변 위 한 점을 중심으로 지름 `diameter`의 원을 투명하게 뚫는다. */
function notchLayer(x: string, y: string, diameter: number): MaskLayer {
  const r = diameter / 2
  return { image: `radial-gradient(circle at ${x} ${y}, transparent ${r}px, black ${r + 1}px)`, ...FULL }
}

/** 마주 보는 두 변에 홈을 낸다. `edges`가 `sides`면 왼쪽·오른쪽 변, `topBottom`이면 위·아래 변. */
function notchesOnEdges(edges: 'sides' | 'topBottom', positions: readonly number[], diameter: number): MaskLayer[] {
  const layers: MaskLayer[] = []
  for (const p of positions) {
    if (edges === 'sides') {
      layers.push(notchLayer('0%', percent(p), diameter), notchLayer('100%', percent(p), diameter))
    } else {
      layers.push(notchLayer(percent(p), '0%', diameter), notchLayer(percent(p), '100%', diameter))
    }
  }
  return layers
}

const solid = 'linear-gradient(black, black)'

/**
 * 모서리가 둥근 몸통 사각형(위·오른쪽·아래·왼쪽에서 t·r·b·l만큼 안쪽)을 마스크 층 6개의 합으로 만든다.
 * 주의: `mask-position`의 퍼센트는 «요소 크기 − 층 크기» 기준이라, 모서리 조각(c×c)의 오른쪽·아래 위치는 `calc(100% - r)`로 쓴다(`- (r + c)`가 아니다).
 */
function roundedBodyLayers(l: number, t: number, r: number, b: number, c: number): MaskLayer[] {
  const corner = (center: string, position: string): MaskLayer => ({
    image: `radial-gradient(circle at ${center}, black ${c}px, transparent ${c + 1}px)`,
    size: `${c}px ${c}px`,
    position,
  })
  return [
    { image: solid, size: `calc(100% - ${l + r}px) calc(100% - ${t + b + 2 * c}px)`, position: `${l}px ${t + c}px` },
    { image: solid, size: `calc(100% - ${l + r + 2 * c}px) calc(100% - ${t + b}px)`, position: `${l + c}px ${t}px` },
    corner('100% 100%', `${l}px ${t}px`),
    corner('0 100%', `calc(100% - ${r}px) ${t}px`),
    corner('100% 0', `${l}px calc(100% - ${b}px)`),
    corner('0 0', `calc(100% - ${r}px) calc(100% - ${b}px)`),
  ]
}

/** 반원 돌출이 튀어나오는 축. 텍스트·이미지는 양쪽(좌우), 아이템은 위·아래다. */
function bumpAxis(orientation: BoxOrientation): 'horizontal' | 'vertical' {
  return orientation === 'item' ? 'vertical' : 'horizontal'
}

export interface BoxProtrusion {
  top: number
  right: number
  bottom: number
  left: number
}

/** 돌출 모양의 바깥 여백(px). 돌출이 없는 모양은 모두 0이다. 머리말 「반원 돌출의 바깥 여백」 참고. */
export function boxProtrusion(shape: BoxShape, orientation: BoxOrientation): BoxProtrusion {
  if (shape !== 'bump') return { top: 0, right: 0, bottom: 0, left: 0 }
  const r = BUMP_RADIUS[orientation]
  return bumpAxis(orientation) === 'horizontal'
    ? { top: 0, right: r, bottom: 0, left: r }
    : { top: r, right: 0, bottom: r, left: 0 }
}

function bumpLayers(orientation: BoxOrientation): MaskLayer[] {
  const r = BUMP_RADIUS[orientation]
  const { top, right, bottom, left } = boxProtrusion('bump', orientation)
  const body = roundedBodyLayers(left, top, right, bottom, BOX_CORNER_RADIUS)
  const circle = (x: string, y: string): MaskLayer => ({
    image: `radial-gradient(circle at ${x} ${y}, black ${r}px, transparent ${r + 1}px)`,
    ...FULL,
  })
  const caps =
    bumpAxis(orientation) === 'horizontal'
      ? [circle(`${r}px`, '50%'), circle(`calc(100% - ${r}px)`, '50%')]
      : [circle('50%', `${r}px`), circle('50%', `calc(100% - ${r}px)`)]
  return [...body, ...caps]
}

/**
 * 모양·방향별 CSS 마스크. 라운드(와 시드 없는 물결)는 마스크 없이 모서리 클래스로 그리므로 `null`이다.
 * 마스크 층은 모두 `no-repeat`로 건다(`FeedBox`가 층 수만큼 `no-repeat`를 반복한다).
 */
export function buildBoxMask(shape: BoxShape, orientation: BoxOrientation, seed?: BoxSeed): BoxMask | null {
  switch (resolveBoxShape(shape, seed)) {
    case 'round':
      return null
    case 'ticket': {
      // 텍스트·아이템은 양쪽 변, 이미지는 위·아래 변. 홈 2개는 변 길이의 1/3·2/3 위치.
      const edges = orientation === 'image' ? 'topBottom' : 'sides'
      return {
        layers: notchesOnEdges(edges, notchPositions(2, 'between'), TICKET_NOTCH_DIAMETER[orientation]),
        composite: 'intersect',
      }
    }
    case 'stamp': {
      // 텍스트·아이템은 위·아래 변, 이미지는 양쪽 변. 홈은 변을 같은 폭으로 나눈 칸의 가운데.
      const edges = orientation === 'image' ? 'sides' : 'topBottom'
      return {
        layers: notchesOnEdges(edges, notchPositions(STAMP_NOTCH_COUNT[orientation], 'even'), STAMP_NOTCH_DIAMETER[orientation]),
        composite: 'intersect',
      }
    }
    case 'wave':
      return { layers: [{ image: buildWaveMaskImage(seed as BoxSeed, orientation), ...FULL }], composite: 'add' }
    case 'bump':
      return { layers: bumpLayers(orientation), composite: 'add' }
  }
}
