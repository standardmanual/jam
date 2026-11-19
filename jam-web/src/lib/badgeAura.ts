/**
 * 배지 Aura 배경 — 색 보정표와 그라데이션 계산 (티켓 20261119_1653, 상위 20261119_1650)
 *
 * 배지 이미지의 대표색(`badges.bg_colors`, 밝기 높은 순 hex 최대 3개)을 배경 그라데이션 색으로 바꾸는 순수 함수 모음이다.
 * 배경 부품(`BadgeAuraBackground`)과 목록 카드(티켓 20261119_1654)가 같은 계산을 쓰도록 한 곳에 둔다.
 *
 * 이 파일의 숫자는 모두 사용자가 샘플 아티팩트로 확정한 값이다(2026-11-19). 토큰이 아니라 상수로 둔다.
 * 리터럴 색(`#ffffff`·`rgba(...)`)은 이 파일에만 둔다 — `serviceLiteralColors.test.ts`가 어댑터·DS 카드의 리터럴을 막는다.
 * 순서 규칙: 색은 위(틴트) → 중간 → 아래(가장 진한 색) 밝기 순이다.
 */

/** 한 자리(위·중간·아래)가 아니라 보정표 전체. 나중에 «보통»·«진하게»를 `AURA_TUNING`에 항목만 더해 추가한다 */
export interface AuraTuning {
  /** 자리별 명도(HSL L), 위 → 아래 */
  lightness: readonly [number, number, number]
  /** 원래 채도에 곱하는 배율 */
  saturationScale: number
  /** 배율을 곱한 채도의 하한·상한 */
  saturationMin: number
  saturationMax: number
  /** 한계를 적용한 채도에 자리별로 곱하는 배율, 위 → 아래 */
  slotSaturation: readonly [number, number, number]
}

/** 사용자 확정 샘플(2026-11-19), 티켓 20261119_1653: «연하게» */
export const AURA_TUNING: { light: AuraTuning } = {
  light: {
    lightness: [0.92, 0.83, 0.74],
    saturationScale: 0.27,
    saturationMin: 0.07,
    saturationMax: 0.32,
    slotSaturation: [0.65, 0.85, 1],
  },
}

/** 카드·루트 바탕색 (사용자 확정 샘플) */
export const AURA_BASE_COLOR = '#faf8f2'

/** `bg_colors`가 `[]`(뽑았는데 색 없음 — 흑백 위주)일 때 대신 쓰는 청회색 3색, 밝은 순. 사용자가 아직 보지 않은 값이라 구현 뒤 확인 대상이다 */
export const AURA_FALLBACK_COLORS: readonly string[] = ['#c9d3de', '#8fa2b8', '#5d7490']

/** 상세 화면(큰 면)의 블러 반경(px) */
export const AURA_BLUR_DETAIL_PX = 100

/** 상세 카드 높이(px) — 블러 100px을 확정한 면의 크기. 비율의 분모 */
const AURA_DETAIL_FACE_PX = 320

/**
 * 면 한 변 대비 블러 비율(약 0.3125). 상세 카드(높이 약 320px)에서 확정한 100px에서 나왔다.
 * 작은 면(목록 카드)은 면 크기에 이 비율을 곱해 블러를 정한다 — 호출마다 숫자를 복사하지 않는다(티켓 20261119_1654).
 */
export const AURA_BLUR_RATIO = AURA_BLUR_DETAIL_PX / AURA_DETAIL_FACE_PX

/** 면 한 변이 `facePx`일 때의 블러 반경(px). 일반 목록 면 90px이면 약 28px이다 */
export function auraBlurPx(facePx: number): number {
  return Math.round(facePx * AURA_BLUR_RATIO * 100) / 100
}

/**
 * 면 폭에 맞춰 늘고 주는 블러 길이(CSS). 면 쪽에 `container-type: inline-size`가 있어야 한다.
 * 칸 폭이 기기마다 다른 compact 면이 쓴다 — `ResizeObserver` 없이 CSS만으로 같은 비율을 지킨다.
 */
export function auraBlurContainerCss(): string {
  return `calc(${AURA_BLUR_RATIO} * 100cqw)`
}

/** 입자(SVG feTurbulence) — 사용자 확정 샘플 */
export const AURA_GRAIN = {
  baseFrequency: 0.95,
  numOctaves: 2,
  opacity: 0.55,
  blendMode: 'soft-light',
  /** 타일 한 변(px) */
  tilePx: 200,
} as const

/** 색상 채움 폭: 3색 미만이면 마지막 색에서 색상(hue)을 ±이 각도만큼 돌려 채운다 */
export const AURA_FILL_HUE_DEG = 22

/** 틴트(맨 위 색)의 불투명도 */
const TINT_ALPHA = 0.12
const WHITE = '#ffffff'
const GRAY_STOP = 'rgba(219,219,219,0.22)'

/** 정지점 위치(%). 레이어마다 `틴트·흰색·중간·진한색`이다. 레이어1 틴트·흰색은 같은 위치(28%)다 */
export const AURA_STOPS = {
  layer1: { tint: 28, white: 28, mid: 68, dark: 100 },
  layer2: { gray: 34, white: 66, mid: 82, dark: 100 },
} as const

/** 글자색 판정에 쓰는 글자 높이(%) — 설명 글자가 놓이는 약 85% 지점 */
export const AURA_TEXT_SAMPLE_PERCENT = 85

/**
 * 배경 상대 휘도가 이 값 이상이면 어두운 글자(`dark`), 미만이면 밝은 글자(`light`).
 * 흰 글자와 #171717 글자의 대비가 같아지는 휘도(약 0.18)다.
 */
export const AURA_TEXT_LUMINANCE_THRESHOLD = 0.18

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

/** 3색(부족하면 `fill3`로 채움)을 보정표대로 연하게 바꾼다. 위 → 아래 hex 3개 */
export function tuneAuraColors(colors: readonly string[], tuning: AuraTuning = AURA_TUNING.light): string[] {
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

/** 레이어 두 장의 `linear-gradient` 문자열. 둘 다 카드 크기 그대로 깔고 `multiply`로 겹친다 */
export function auraLayers(colors: readonly string[], tuning: AuraTuning = AURA_TUNING.light): [string, string] {
  const [top, mid, dark] = tuneAuraColors(colors, tuning)
  const a = AURA_STOPS.layer1
  const b = AURA_STOPS.layer2
  return [
    `linear-gradient(to bottom, transparent 0%, ${withAlpha(top, TINT_ALPHA)} ${a.tint}%, ${WHITE} ${a.white}%, ${mid} ${a.mid}%, ${dark} ${a.dark}%)`,
    `linear-gradient(to bottom, transparent 0%, ${GRAY_STOP} ${b.gray}%, ${WHITE} ${b.white}%, ${mid} ${b.mid}%, ${dark} ${b.dark}%)`,
  ]
}

/** 상세 히어로 «글로우» 면의 바탕색이자 맨 아래 색. 가장 아래는 반드시 흰색이다(사용자 지시, 2026-11-20) */
export const AURA_GLOW_BASE_COLOR = '#ffffff'

/** «글로우» 면의 색 보정표. 자리 순서는 밝은 색 → 진한 색이며, 진한 색이 위쪽에 놓인다 */
export const AURA_GLOW_TUNING: AuraTuning = {
  lightness: [0.94, 0.88, 0.8],
  saturationScale: 1,
  saturationMin: 0.5,
  saturationMax: 0.95,
  slotSaturation: [0.85, 1, 0.95],
}

/** 미획득 배지의 «글로우» 색(밝은 → 진한). 대표색 대신 무채색으로 깐다 */
export const AURA_GLOW_GRAY_COLORS: readonly [string, string, string] = ['#f3f4f6', '#e6e8ec', '#d8dce2']

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

/** 선형 정지점 개수와 가우시안 번짐 폭(0~1). 클수록 색이 넓게 섞여 경계선이 흐려진다 */
const GLOW_LINEAR_STEPS = 15
const GLOW_BLEND_SIGMA = 0.22

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
export function auraGlowLayers(colors: readonly string[], options: { gray?: boolean; tuning?: AuraTuning } = {}): string[] {
  const [, mid, dark] = glowPalette(colors, options)
  const white = AURA_GLOW_BASE_COLOR
  const controls = [
    { pos: 0, hex: dark },
    { pos: 0.38, hex: mid },
    { pos: 0.62, hex: mixHex(mid, white, 0.6) },
  ]
  const linear = Array.from({ length: GLOW_LINEAR_STEPS }, (_, i) => {
    const x = i / (GLOW_LINEAR_STEPS - 1)
    const hex = mixHex(blendAt(controls, x), white, smoothstep(0.5, 0.88, x))
    return `${hex} ${Math.round(x * 100)}%`
  }).join(', ')
  return [
    `radial-gradient(ellipse 75% 46% at 50% 46%, ${gaussianAlphaStops('#ffffff', 0.55)})`,
    `radial-gradient(ellipse 100% 56% at 50% 0%, ${gaussianAlphaStops(dark, 0.85)})`,
    `linear-gradient(to bottom, ${linear})`,
  ]
}

/** 카드 안쪽 가장자리에 도는 넓고 부드러운 밝은 빛(inset `box-shadow`). 중간 색을 더 희게 올린 색을 쓴다 */
export function auraGlowInsetShadow(colors: readonly string[], options: { gray?: boolean; tuning?: AuraTuning } = {}): string {
  const [, mid] = glowPalette(colors, options)
  const soft = mixHex(mid, '#ffffff', 0.6)
  return `inset 0 0 64px 10px ${withAlpha(soft, 0.7)}, inset 0 0 24px 0 ${withAlpha(mixHex(mid, '#ffffff', 0.78), 0.8)}`
}

function lerpRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * t) as Rgb
}

/** 상대 휘도(WCAG) 0~1 */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * 글자 높이(약 85%)에서 두 레이어를 곱한 밝기로 글자색을 정한다.
 * `dark`는 어두운 글자(`text-foreground`), `light`는 밝은 글자(`text-snow`)다.
 * 이 높이는 두 레이어 모두 «중간 → 진한색» 구간이라 중간·진한색 사이를 보간한다. 바탕·블러는 무시한다.
 */
export function textMode(colors: readonly string[], tuning: AuraTuning = AURA_TUNING.light): 'light' | 'dark' {
  const [, mid, dark] = tuneAuraColors(colors, tuning).map(hexToRgb)
  const at = (stops: { mid: number; dark: number }): Rgb => lerpRgb(mid, dark, (AURA_TEXT_SAMPLE_PERCENT - stops.mid) / (stops.dark - stops.mid))
  const c1 = at(AURA_STOPS.layer1)
  const c2 = at(AURA_STOPS.layer2)
  const product = [0, 1, 2].map((i) => (c1[i] * c2[i]) / 255) as Rgb
  return luminance(product) >= AURA_TEXT_LUMINANCE_THRESHOLD ? 'dark' : 'light'
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

/** 입자 SVG 타일의 `background-image` 값(`data:` URI). 새 이미지 파일을 만들지 않는다 */
export function auraGrainImage(): string {
  const { baseFrequency, numOctaves, tilePx } = AURA_GRAIN
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tilePx}' height='${tilePx}'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='${numOctaves}' stitchTiles='stitch'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
