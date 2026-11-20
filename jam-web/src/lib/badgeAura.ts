/**
 * 배지 글로우 배경 — 색 보정표와 그라데이션 계산 (티켓 20261119_1653·20261120_0235·20261120_0316, 상위 20261119_1650)
 *
 * 배지 이미지의 대표색(`badges.bg_colors`, 밝기 높은 순 hex 최대 3개)을 배경 그라데이션 색으로 바꾸는 순수 함수 모음이다.
 * 배경 부품(`BadgeAuraBackground`)이 상세 히어로와 목록 카드(`BadgeGridCard`)에서 같은 계산을 쓰도록 한 곳에 둔다.
 *
 * 이 파일의 숫자는 모두 사용자가 시안을 보고 확정한 값이다(2026-11-20). 토큰이 아니라 상수로 둔다.
 * 리터럴 색(`#ffffff`·`rgba(...)`)은 이 파일에만 둔다 — `serviceLiteralColors.test.ts`가 어댑터·DS 카드의 리터럴을 막는다.
 * 순서 규칙: `bg_colors`는 밝은 색 → 진한 색 순이고, 글로우는 진한 색을 위쪽에 놓는다.
 * 옛 «세로 띠 두 겹 + 입자» 방식(2026-11-19 샘플)은 글로우로 대체되어 걷어냈다. 이력은 git에 있다.
 */

/** 색 보정표: 한 자리가 아니라 세 자리(밝은·중간·진한 색) 전체를 정한다 */
export interface AuraTuning {
  /** 자리별 명도(HSL L), 밝은 색 → 진한 색 */
  lightness: readonly [number, number, number]
  /** 원래 채도에 곱하는 배율 */
  saturationScale: number
  /** 배율을 곱한 채도의 하한·상한 */
  saturationMin: number
  saturationMax: number
  /** 한계를 적용한 채도에 자리별로 곱하는 배율, 밝은 색 → 진한 색 */
  slotSaturation: readonly [number, number, number]
}

/** `bg_colors`가 `[]`(뽑았는데 색 없음 — 흑백 위주)일 때 대신 쓰는 청회색 3색, 밝은 순. 사용자가 아직 보지 않은 값이라 구현 뒤 확인 대상이다 */
export const AURA_FALLBACK_COLORS: readonly string[] = ['#c9d3de', '#8fa2b8', '#5d7490']

/** 색상 채움 폭: 3색 미만이면 마지막 색에서 색상(hue)을 ±이 각도만큼 돌려 채운다 */
export const AURA_FILL_HUE_DEG = 22

/** 정지색이 없는 무채색(채도 0) 원색의 보정 색상 — 색상이 정의되지 않아 청회색 쪽으로 둔다 */
const ACHROMATIC_HUE = 215

type Rgb = [number, number, number]
type Hsl = { h: number; s: number; l: number }

/** `#rgb`·`#rrggbb`만 받는다. 그 밖의 값은 null */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return `#${hex.toLowerCase()}`
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1]: Rgb = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return rgbToHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255])
}

/** 색상(hue)만 `deg`도 돌린다. 360을 넘거나 0 아래로 가면 감아 돌린다 */
export function rotateHue(hex: string, deg: number): string {
  const hsl = hexToHsl(hex)
  return hslToHex({ ...hsl, h: (((hsl.h + deg) % 360) + 360) % 360 })
}

/**
 * 색을 3개로 맞춘다. 입력은 밝기 높은 순 hex이고 3개를 넘으면 앞 3개만 쓴다.
 * 3색 미만이면 마지막(가장 진한) 색에서 색상을 +22°, -22° 순으로 돌린 색을 뒤에 붙인다 — 같은 명도라 순서가 깨지지 않는다.
 * 빈 배열이면 대체색을 돌려준다.
 */
export function fill3(colors: readonly string[]): string[] {
  const base = colors.slice(0, 3)
  if (base.length === 0) return [...AURA_FALLBACK_COLORS]
  const last = base[base.length - 1]
  const offsets = [AURA_FILL_HUE_DEG, -AURA_FILL_HUE_DEG]
  let i = 0
  while (base.length < 3) base.push(rotateHue(last, offsets[i++]))
  return base
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 3색(부족하면 `fill3`로 채움)을 보정표대로 바꾼다. 밝은 색 → 진한 색 hex 3개 */
export function tuneAuraColors(colors: readonly string[], tuning: AuraTuning = AURA_GLOW_TUNING): string[] {
  return fill3(colors).map((hex, slot) => {
    const { h, s } = hexToHsl(hex)
    const saturation = clamp(s * tuning.saturationScale, tuning.saturationMin, tuning.saturationMax) * tuning.slotSaturation[slot]
    return hslToHex({ h: s === 0 ? ACHROMATIC_HUE : h, s: saturation, l: tuning.lightness[slot] })
  })
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** 상세 히어로 «글로우» 면의 바탕색이자 맨 아래 색. 가장 아래는 반드시 흰색이다(사용자 지시, 2026-11-20) */
export const AURA_GLOW_BASE_COLOR = '#ffffff'

/** «글로우» 면의 색 보정표. 자리 순서는 밝은 색 → 진한 색이며, 진한 색이 위쪽에 놓인다 */
export const AURA_GLOW_TUNING: AuraTuning = {
  lightness: [0.94, 0.88, 0.8],
  saturationScale: 0.8,
  saturationMin: 0.4,
  saturationMax: 0.76,
  slotSaturation: [0.85, 1, 0.95],
}

/** 미획득 배지의 «글로우» 색(밝은 → 진한). 대표색 대신 무채색으로 깐다 */
export const AURA_GLOW_GRAY_COLORS: readonly [string, string, string] = ['#f1f2f5', '#e1e4e8', '#cdd1d8']

/** 두 hex를 `t`(0~1) 비율로 섞은 hex. 색 사이 경계가 보이지 않게 중간 정지점을 만들 때 쓴다 */
function mixHex(from: string, to: string, t: number): string {
  return rgbToHex(lerpRgb(hexToRgb(from), hexToRgb(to), t))
}

/** 밝은 색 · 중간 색 · 진한 색 (미획득이면 무채색) */
function glowPalette(colors: readonly string[], options: { gray?: boolean; tuning?: AuraTuning }): [string, string, string] {
  return options.gray ? [...AURA_GLOW_GRAY_COLORS] : (tuneAuraColors(colors, options.tuning ?? AURA_GLOW_TUNING) as [string, string, string])
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 글로우 그라데이션 면에 거는 블러 반경(px)과, 블러로 가장자리가 옅어지지 않게 면을 카드 밖으로 키우는 여유(px) */
export const AURA_GLOW_BLUR_PX = 28
export const AURA_GLOW_BLEED_PX = AURA_GLOW_BLUR_PX * 2
/**
 * 블러 면은 위·좌·우로만 `AURA_GLOW_BLEED_PX`씩 커진다(아래는 흰색이라 키우지 않는다). 타원 크기에는 `%`와 `px`를 섞은 `calc`를 쓸 수 없어서,
 * 키운 만큼 줄인 비율로 카드 크기에 맞춘다. 카드 폭 약 360px, 높이 약 360px 기준의 근사값이다.
 */
/** 상세 카드(약 360px)에서 확정한 값(블러 28px·여유 56px·안쪽 빛)을 면 크기에 비례해 줄일 때의 기준 크기(px) */
const GLOW_REF_PX = 360

export interface AuraGlowMetrics {
  /** 그라데이션 면에 거는 블러 반경(CSS 길이) */
  blur: string
  /** 면을 위·좌·우로 키우는 여유(CSS 길이)와 그 음수 */
  bleed: string
  negBleed: string
  /** 상세 기준 px 값을 이 면 크기에 맞춘 CSS 길이로 바꾼다(안쪽 빛 번짐에 쓴다) */
  len: (refPx: number) => string
}

/**
 * 글로우의 블러·여유·안쪽 빛 길이를 면 크기에 맞춘다. `size`가 없으면 상세 카드(px 그대로), 숫자면 그 변 길이(px)에 비례,
 * `'container'`면 면 폭(`cqw`)에 비례한다 — 면 쪽에 `container-type: inline-size`가 있어야 한다(칸 폭이 기기마다 다른 compact 면).
 */
export function auraGlowMetrics(size?: number | 'container'): AuraGlowMetrics {
  const round = (v: number) => Math.round(v * 100) / 100
  if (size === undefined) {
    return { blur: `${AURA_GLOW_BLUR_PX}px`, bleed: `${AURA_GLOW_BLEED_PX}px`, negBleed: `-${AURA_GLOW_BLEED_PX}px`, len: (px) => `${px}px` }
  }
  if (size === 'container') {
    const cq = (px: number) => `${round((px / GLOW_REF_PX) * 100)}cqw`
    return { blur: cq(AURA_GLOW_BLUR_PX), bleed: cq(AURA_GLOW_BLEED_PX), negBleed: `-${cq(AURA_GLOW_BLEED_PX)}`, len: cq }
  }
  const px = (v: number) => `${round((v * size) / GLOW_REF_PX)}px`
  return { blur: px(AURA_GLOW_BLUR_PX), bleed: px(AURA_GLOW_BLEED_PX), negBleed: `-${px(AURA_GLOW_BLEED_PX)}`, len: px }
}

const GLOW_WIDTH_SCALE = 0.77
const GLOW_HEIGHT_SCALE = 0.86

/** 선형 정지점 개수와 가우시안 번짐 폭(0~1). 클수록 색이 넓게 섞여 경계선이 흐려진다 */
const GLOW_LINEAR_STEPS = 15
const GLOW_BLEND_SIGMA = 0.3

/**
 * 제어색들을 가우시안 가중 평균으로 번지게 섞어 위치 `x`(0~1)의 색을 구한다.
 * 색 사이를 직선으로 잇지 않으므로 제어점마다 기울기가 꺾이지 않아 띠(마하 밴드) 경계가 생기지 않는다.
 */
function blendAt(controls: { pos: number; hex: string }[], x: number): string {
  let wSum = 0
  const acc: Rgb = [0, 0, 0]
  for (const { pos, hex } of controls) {
    const w = Math.exp(-((x - pos) ** 2) / (2 * GLOW_BLEND_SIGMA ** 2))
    const rgb = hexToRgb(hex)
    for (let i = 0; i < 3; i++) acc[i] += rgb[i] * w
    wSum += w
  }
  return rgbToHex([acc[0] / wSum, acc[1] / wSum, acc[2] / wSum])
}

/** 가우시안 모양으로 옅어지는 알파 정지점(`rgba(...) 위치%`). 가운데 `peak`에서 가장자리 0까지 */
function gaussianAlphaStops(rgb: string, peak: number, steps = 9): string {
  return Array.from({ length: steps }, (_, i) => {
    const r = i / (steps - 1)
    const alpha = i === steps - 1 ? 0 : peak * Math.exp(-(r ** 2) / (2 * 0.42 ** 2))
    return `${withAlpha(rgb, Math.round(alpha * 1000) / 1000)} ${Math.round(r * 100)}%`
  }).join(', ')
}

/**
 * 상세 히어로 «글로우» 면의 `background-image` 층 목록(위 → 아래 쌓임). 블러·블렌드 없이 그라데이션만 쓴다.
 * 구성은 사용자가 첨부한 카드 디자인을 따른다(2026-11-20). 색은 대표색 3개 중 2개(중간 색·진한 색)만 쓴다.
 * 1) 안쪽 중앙 하이라이트: 카드 가운데가 넓게 살짝 밝아지는 흰빛
 * 2) 위쪽 타원: 진한 색이 위 가운데에서 가우시안으로 퍼지고 좌우 모서리로 갈수록 옅어진다
 * 3) 세로 선형: 진한 색 → 중간 색 → 흰색. 15개 정지점을 가우시안 번짐으로 계산해 경계선이 보이지 않게 하고, 아래는 순백이다
 * `gray`면 대표색 대신 무채색(미획득)이다.
 */
export function auraGlowLayers(colors: readonly string[], options: { gray?: boolean; tuning?: AuraTuning; bleed?: number | string } = {}): string[] {
  const [, mid, dark] = glowPalette(colors, options)
  // 면이 카드 밖으로 위·좌·우 `bleedPx`씩 커져 있어도 세로 위치는 카드 기준이다. 안 그러면 흰색 구간이 카드 밖으로 밀려난다.
  const bleed = typeof options.bleed === 'number' ? (options.bleed === 0 ? null : `${options.bleed}px`) : (options.bleed ?? null)
  const along = (frac: number) => (bleed === null ? `${Math.round(frac * 100)}%` : `calc(${bleed} + (100% - ${bleed}) * ${Math.round(frac * 1000) / 1000})`)
  const sizeX = (frac: number) => `${Math.round(frac * (bleed === null ? 1 : GLOW_WIDTH_SCALE) * 100)}%`
  const sizeY = (frac: number) => `${Math.round(frac * (bleed === null ? 1 : GLOW_HEIGHT_SCALE) * 100)}%`
  const white = AURA_GLOW_BASE_COLOR
  const controls = [
    { pos: 0, hex: dark },
    { pos: 0.38, hex: mid },
    { pos: 0.62, hex: mixHex(mid, white, 0.6) },
  ]
  const linear = Array.from({ length: GLOW_LINEAR_STEPS }, (_, i) => {
    const x = i / (GLOW_LINEAR_STEPS - 1)
    const hex = mixHex(blendAt(controls, x), white, smoothstep(0.5, 0.88, x))
    return `${hex} ${along(x)}`
  }).join(', ')
  return [
    `radial-gradient(ellipse ${sizeX(2.24)} ${sizeY(1.38)} at 50% ${along(0.46)}, ${gaussianAlphaStops('#ffffff', 0.6)})`,
    `radial-gradient(ellipse ${sizeX(1)} ${sizeY(0.56)} at 50% ${along(0)}, ${gaussianAlphaStops(dark, 0.85)})`,
    `linear-gradient(to bottom, ${linear})`,
  ]
}

/**
 * 카드 안쪽 가장자리를 따라 도는 밝은 빛(inset `box-shadow` 두 겹). 사용자 시안의 밝은 부분 모양을 따른다(2026-11-20).
 * 시안에서 밝은 빛은 카드 윤곽을 따라 감싸고, 모서리와 좌우 가장자리가 가장 밝으며 안쪽으로 갈수록 진한 색에 녹아든다.
 * 1) 넓은 띠: 가장자리에서 불투명에 가깝게 시작해 옆면은 폭의 약 14%(360px 카드 기준 약 50px)까지 번진다.
 *    y 오프셋을 위로 밀어 위쪽 띠는 옆면보다 얇게 하고, 아래는 바탕이 흰색이라 어느 쪽이든 티가 나지 않는다
 * 2) 좁은 테두리 빛: 가장자리 바로 안쪽만 더 하얗게 올려 윤곽에 밝은 림이 생기게 한다
 * 색은 밝은 색 자리를 흰색 쪽으로 섞은 것이다(미획득이면 무채색).
 */
export function auraGlowInsetShadow(colors: readonly string[], options: { gray?: boolean; tuning?: AuraTuning; size?: number | 'container' } = {}): string {
  const [light] = glowPalette(colors, options)
  const { len } = auraGlowMetrics(options.size)
  const rim = mixHex(light, '#ffffff', 0.35)
  const edge = mixHex(light, '#ffffff', 0.7)
  return `inset 0 ${len(-10)} ${len(76)} ${len(14)} ${withAlpha(rim, 0.9)}, inset 0 0 ${len(28)} 0 ${withAlpha(edge, 0.85)}`
}

/**
 * 메시 배경 — 두 색이 대각선으로 부드럽게 번지고, 가운데가 살짝 밝으며, 고운 입자가 깔린 파스텔 배경(사용자 시안, 2026-11-20).
 * 글로우와 달리 아래 흰 띠·안쪽 빛 테두리·블러 면이 없다. 색 덩어리를 여럿 두면 얼룩져 보이고 채도·명암을 죽이면 단색처럼 뭉개지므로
 * (사용자 지시 2026-11-20, 후보 A~E 비교에서 E 선택) 아래 셋으로만 만든다.
 * 1) 대각선 선형 바탕: 보조색(밝고 연함) → 주색(깊음)을 8단계 smoothstep으로 이어 띠(마하 밴드)가 생기지 않게 한다
 * 2) 가운데 흰 하이라이트: 그림이 떠 보이도록 가운데만 살짝 밝힌다
 * 3) 입자: `AURA_GRAIN_URL` 노이즈를 곱하기로 얹어 매끈한 그라데이션이 단색처럼 보이지 않게 한다(컴포넌트가 따로 그린다)
 * 주색은 대표색 셋 중 가장 선명한 색, 보조색은 그다음으로 선명한 색이다. 덩어리 배치 대신 대각선 방향만 시드가 고른다(배지마다 다르되 렌더마다 같다).
 */
const MESH_ANGLES: readonly number[] = [135, 225, 315, 45]

/** 메시의 연한 쪽(보조색)과 깊은 쪽(주색)의 채도·명도 */
export const AURA_MESH_TONES = {
  light: { s: 0.5, l: 0.93 },
  deep: { s: 0.62, l: 0.8 },
} as const

/** 거의 무채색인 대표색은 색을 입히지 않는다(없는 색상을 만들어 내지 않도록). 이 채도 미만이면 무채색으로 본다 */
const MESH_NEUTRAL_SAT = 0.15

/** 입자 하나의 타일 크기(px)와 곱하기로 얹는 세기 */
export const AURA_GRAIN_SIZE_PX = 180
export const AURA_GRAIN_OPACITY = 0.22
const GRAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${AURA_GRAIN_SIZE_PX}" height="${AURA_GRAIN_SIZE_PX}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`
/** 입자 노이즈의 `background-image` 값. 코드로 만든 SVG라 이미지 파일·네트워크 요청이 없다 */
export const AURA_GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`

/** 문자열 → 0 이상의 정수(FNV-1a). 같은 문자열이면 항상 같은 값이다 */
export function auraMeshSeed(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 색의 «선명함»: 채도 × (중간 명도에 가까울수록 큼). 가장 선명한 색을 주색으로 고른다 */
function vividness(hex: string): number {
  const { s, l } = hexToHsl(hex)
  return s * (1 - Math.abs(2 * l - 1))
}

/** 연한 쪽(보조색)·깊은 쪽(주색) 두 끝색. 미획득이면 무채색 두 끝이다 */
function meshEnds(colors: readonly string[], gray: boolean): { light: string; deep: string } {
  if (gray) return { light: AURA_GLOW_GRAY_COLORS[0], deep: AURA_GLOW_GRAY_COLORS[2] }
  const sorted = [...fill3(colors)].sort((a, b) => vividness(b) - vividness(a))
  const main = hexToHsl(sorted[0])
  const second = hexToHsl(sorted[1])
  const mainHue = main.s < MESH_NEUTRAL_SAT ? null : main.h
  const secondHue = second.s < MESH_NEUTRAL_SAT ? mainHue : second.h
  const paint = (hue: number | null, tone: { s: number; l: number }) => hslToHex({ h: hue ?? 0, s: hue === null ? 0.03 : tone.s, l: tone.l })
  return { light: paint(secondHue, AURA_MESH_TONES.light), deep: paint(mainHue, AURA_MESH_TONES.deep) }
}

/** 메시 배경의 바탕색(연한 쪽 끝색). 그라데이션이 그려지기 전·가장자리에 비치는 색이다. 미획득이면 무채색 */
export function auraMeshBase(colors: readonly string[], options: { gray?: boolean } = {}): string {
  return meshEnds(colors, Boolean(options.gray)).light
}

/** 메시 배경의 `background-image` 층(위 → 아래): 가운데 흰 하이라이트, 대각선 선형 바탕(8단계 smoothstep). 대각선 방향은 `seed`가 고른다 */
export function auraMeshLayers(colors: readonly string[], options: { gray?: boolean; seed?: string } = {}): string[] {
  const { light, deep } = meshEnds(colors, Boolean(options.gray))
  const angle = MESH_ANGLES[auraMeshSeed(options.seed ?? colors.join(',')) % MESH_ANGLES.length]
  const stops = Array.from({ length: 8 }, (_, i) => `${mixHex(light, deep, smoothstep(0, 1, i / 7))} ${Math.round((i / 7) * 100)}%`).join(', ')
  return [`radial-gradient(ellipse 80% 70% at 45% 40%, ${withAlpha('#ffffff', 0.4)} 0%, ${withAlpha('#ffffff', 0)} 75%)`, `linear-gradient(${angle}deg, ${stops})`]
}

function lerpRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * t) as Rgb
}

/**
 * DB 값(`badges.bg_colors`)을 Aura에 쓸 색으로 바꾼다.
 * - NULL·undefined(아직 안 뽑음) → null: Aura 없음, 지금의 흰 카드 그대로
 * - `[]`(색 없음) → 대체 청회색 3색
 * - hex가 아닌 값이 섞였으면 → null (예외를 던지지 않고 Aura 없이 되돌린다)
 */
export function resolveAuraColors(bgColors: readonly string[] | null | undefined): string[] | null {
  if (bgColors == null || !Array.isArray(bgColors)) return null
  if (bgColors.length === 0) return [...AURA_FALLBACK_COLORS]
  const normalized = bgColors.slice(0, 3).map(normalizeHex)
  return normalized.every((c): c is string => c !== null) ? normalized : null
}
