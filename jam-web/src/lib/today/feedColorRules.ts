/**
 * 홈피드 색 자동 규칙 — 두 색이 한 카드에서 짝을 이룰 수 있는지 판정한다 (티켓 20261121_0012, 상위 20261120_2026 4회차-1).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격」의 «색 → 자동으로 거르는 규칙» 1~4번이다.
 * 기준값은 카리나의 초안이고 사용자가 검수표에서 다듬는다(PRD). 그래서 임계값은 아래 이름 있는 상수 한곳에 모은다.
 *
 * **hex를 입력으로 받는 순수 함수다.** 색 키 표(`FEED_COLORS`)에 묶이지 않는다 — 컬러셋 교체 어드민(6회차)이 hex를 바꿔도 그대로 쓴다.
 * 키 표를 기본값으로 쓰는 편의 함수(`summarizeFeedColors`)만 아래쪽에 따로 있다.
 * 서버 모듈·사전·난수·시각을 읽지 않는다(서버와 브라우저가 같은 값을 낸다).
 */
import { FEED_COLORS, FEED_LEGACY_COLOR_KEYS } from './feedConstants'

// ── 임계값 (PRD §6 «자동으로 거르는 규칙», 2026-11-20 샘플 계산) ─────────────────────────

export const COLOR_RULE_THRESHOLDS = {
  /** 규칙 ② 대비: «밝기 대비(상대 휘도 비)가 1.15 미만이면 제외» */
  minLuminanceRatio: 1.15,
  /** 규칙 ② 대비: «색상 차이가 30도 미만이면서 밝기(HSL 명도) 차이가 0.09 미만이면 제외» */
  closeHueDegrees: 30,
  closeLightnessDiff: 0.09,
  /** 규칙 ② 대비·③ 키즈: «채도가 높은 원색(채도 0.85 초과, 명도 0.4~0.62)» */
  vividMinSaturation: 0.85,
  vividMinLightness: 0.4,
  vividMaxLightness: 0.62,
  /** 규칙 ② 대비: «원색 둘이 색상 차이 90도를 넘으면 제외» */
  vividMaxHueDegrees: 90,
  /** 규칙 ③ 키즈: «밝은 색(명도 0.7 초과) 둘이 색상 차이 40도를 넘는 조합을 제외» */
  paleMinLightness: 0.7,
  paleMaxHueDegrees: 40,
  /** 규칙 ④ 명도: «눈에 보이는 밝기(L*) 차이가 15 이상이거나 색상 차이가 150도 이상(보색)이어야 한다» */
  minCieLightnessDiff: 15,
  complementaryHueDegrees: 150,
} as const

// ── 색 계산 (hex 입력) ───────────────────────────────────────

export type Rgb = readonly [number, number, number]

export interface Hsl {
  /** 색상 0~360 (무채색은 0) */
  h: number
  /** 채도 0~1 */
  s: number
  /** 명도 0~1 */
  l: number
}

/** `#RRGGBB` 또는 `#RGB`(대소문자 무관, `#` 생략 가능)로 읽을 수 있는 문자열인가. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

/** `#RRGGBB` 또는 `#RGB`(대소문자 무관) → 0~255 세 값. 읽을 수 없으면 던진다(규칙 입력이 깨진 채 통과하지 않게). */
export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`hex 색을 읽을 수 없습니다: ${hex}`)
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ]
}

function linearChannel(value255: number): number {
  const c = value255 / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** 상대 휘도(WCAG 2.x 공식, sRGB). 0(검정)~1(흰색). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b)
}

/** 두 색의 상대 휘도 비(WCAG 대비 비). 1(같음)~21. 순서와 무관하다. */
export function luminanceRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA)
  const b = relativeLuminance(hexB)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** 표준 HSL. 색상은 0~360, 채도·명도는 0~1. */
export function hexToHsl(hex: string): Hsl {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = r8 / 255
  const g = g8 / 255
  const b = b8 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

/** CIE L*(눈에 보이는 밝기, 0~100). 상대 휘도 Y에서 구한다. */
export function cieLightness(hex: string): number {
  const y = relativeLuminance(hex)
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y
}

/** 색상 차이(도, 0~180). 원을 한 바퀴 도는 쪽이 아니라 가까운 쪽 각도다. */
export function hueDifference(hueA: number, hueB: number): number {
  const diff = Math.abs(hueA - hueB) % 360
  return diff > 180 ? 360 - diff : diff
}

/** «채도가 높은 원색»: 채도 0.85 초과이고 명도 0.4~0.62. */
export function isVividPrimary(hsl: Hsl): boolean {
  const t = COLOR_RULE_THRESHOLDS
  return hsl.s > t.vividMinSaturation && hsl.l >= t.vividMinLightness && hsl.l <= t.vividMaxLightness
}

// ── 규칙 판정 (hex 순서쌍) ───────────────────────────────────

/** 규칙 ② 대비에 걸리면 true. */
export function violatesContrastRule(hexA: string, hexB: string): boolean {
  const t = COLOR_RULE_THRESHOLDS
  if (luminanceRatio(hexA, hexB) < t.minLuminanceRatio) return true
  const a = hexToHsl(hexA)
  const b = hexToHsl(hexB)
  const hue = hueDifference(a.h, b.h)
  if (hue < t.closeHueDegrees && Math.abs(a.l - b.l) < t.closeLightnessDiff) return true
  return isVividPrimary(a) && isVividPrimary(b) && hue > t.vividMaxHueDegrees
}

/** 규칙 ③ 키즈에 걸리면 true. */
export function violatesKidsRule(hexA: string, hexB: string): boolean {
  const t = COLOR_RULE_THRESHOLDS
  const a = hexToHsl(hexA)
  const b = hexToHsl(hexB)
  if (isVividPrimary(a) && isVividPrimary(b)) return true
  return a.l > t.paleMinLightness && b.l > t.paleMinLightness && hueDifference(a.h, b.h) > t.paleMaxHueDegrees
}

/** 규칙 ④ 명도에 걸리면 true. 칩과 칩이 아닌 것(배경·박스) 사이에만 쓴다. */
export function violatesLightnessRule(hexA: string, hexB: string): boolean {
  const t = COLOR_RULE_THRESHOLDS
  if (Math.abs(cieLightness(hexA) - cieLightness(hexB)) >= t.minCieLightnessDiff) return false
  return hueDifference(hexToHsl(hexA).h, hexToHsl(hexB).h) < t.complementaryHueDegrees
}

/**
 * 규칙 ⑤ 그림과 배경 · ⑥ 그림과 칩(티켓 20261121_1828, 상위 20261120_2026 7회차-6): 후보 색이 이미지 대표 색과 «색상 차이 30° 미만이고
 * 밝기(CIE L*) 차이 15 미만»이면 이미지에 묻히므로 참이다. 대표 색은 저장된 최대 3개를 모두 본다(밝기 순 저장이라 면적 비중을 모른다 — 보수적).
 * 새 임계값을 만들지 않고 기존 두 값(`closeHueDegrees`·`minCieLightnessDiff`)을 읽는다. 읽을 수 없는 대표 색은 건너뛴다(없는 것과 같다).
 * 규칙 ⑤와 ⑥은 같은 판정이라 함수 하나를 배경 후보와 칩 후보에 각각 쓴다.
 */
export function violatesImageColorRule(candidateHex: string, imageHexes: readonly string[]): boolean {
  const t = COLOR_RULE_THRESHOLDS
  const candidateHue = hexToHsl(candidateHex).h
  const candidateL = cieLightness(candidateHex)
  return imageHexes.some((imageHex) => {
    if (!isHexColor(imageHex)) return false
    return (
      hueDifference(candidateHue, hexToHsl(imageHex).h) < t.closeHueDegrees &&
      Math.abs(candidateL - cieLightness(imageHex)) < t.minCieLightnessDiff
    )
  })
}

/** 걸린 규칙의 이름. 규칙 ①~④는 적용하는 순서 그대로이고, `image`(⑤·⑥)는 쌍 판정이 아니라 `violatesImageColorRule`이 돌려주는 이름이고, `table`은 통합 팔레트의 배제 표(`chipExclusionRule`)가 돌려주는 이름이다. */
export type ColorRuleName = 'same' | 'contrast' | 'kids' | 'lightness' | 'image' | 'table'

export interface ColorPairCheckOptions {
  /** 둘 중 하나가 칩이면 true — 규칙 ④(명도)는 칩과 칩이 아닌 것 사이에만 적용한다. 기본 true. */
  involvesChip?: boolean
}

/**
 * 한 순서쌍이 걸리는 첫 규칙. 규칙 ①→②→③→④ 순서로 보고 하나라도 걸리면 거기서 멈춘다. 모두 통과하면 null.
 * 규칙은 두 색에 대해 대칭이라 순서를 바꿔도 결과가 같다.
 */
export function firstViolatedRule(
  hexA: string,
  hexB: string,
  options: ColorPairCheckOptions = {},
): ColorRuleName | null {
  const involvesChip = options.involvesChip ?? true
  if (hexA.trim().toLowerCase() === hexB.trim().toLowerCase()) return 'same'
  if (violatesContrastRule(hexA, hexB)) return 'contrast'
  if (violatesKidsRule(hexA, hexB)) return 'kids'
  if (involvesChip && violatesLightnessRule(hexA, hexB)) return 'lightness'
  return null
}

/** 두 색이 규칙 ①~④(칩이 끼지 않으면 ①~③)를 모두 통과하는가. */
export function passesColorRules(hexA: string, hexB: string, options: ColorPairCheckOptions = {}): boolean {
  return firstViolatedRule(hexA, hexB, options) === null
}

// ── 배제 표 (통합 팔레트, 티켓 20261122_2224 회차 3) ─────────────────────────

/**
 * 칩과 그 아래 면(바탕·박스)이 서로 어울리지 않는 색 조합 — 상위 티켓 20261122_2217 결정 §5의 «배제 표» 초안.
 * 대비·키즈·명도 계산 규칙을 대체할 표다. 이번 회차는 표와 함수만 만들고 배정은 아직 이 표를 읽지 않는다(5회차).
 * 옛 키가 읽는 컬러셋 메뉴는 위 hex 규칙(`firstViolatedRule`)을 그대로 쓴다.
 *
 * 항목은 색 키 이름으로 적고 hex를 읽지 않는다. 같은 색끼리도 표의 한 항목이다(`chipExclusionRule`이 먼저 본다).
 */
/** 순서와 무관하게 함께 쓰지 않는 두 색: 빨강과 초록·짙은 초록. */
export const CHIP_EXCLUSION_MUTUAL: ReadonlyArray<readonly [string, string]> = [
  ['red', 'green'],
  ['red', 'green-deep'],
]

/** 방향이 있는 항목 [칩 색, 면 색]: 노랑 위 흰 칩, 분홍 위 보라 칩. 반대(흰 면 위 노랑 칩)는 막지 않는다. */
export const CHIP_EXCLUSION_DIRECTED: ReadonlyArray<readonly [string, string]> = [
  ['white', 'yellow'],
  ['purple', 'pink'],
]

/**
 * 칩 색이 그 아래 면(바탕 또는 박스) 색과 배제 표에 걸리면 `'table'`, 아니면 null.
 * 걸리는 경우: ① 같은 색끼리 ② 빨강과 초록·짙은 초록(순서 무관) ③ 노랑 위 흰 칩 ④ 분홍 위 보라 칩.
 */
export function chipExclusionRule(chipKey: string, baseKey: string): ColorRuleName | null {
  if (chipKey === baseKey) return 'table'
  const mutual = CHIP_EXCLUSION_MUTUAL.some(
    ([a, b]) => (chipKey === a && baseKey === b) || (chipKey === b && baseKey === a),
  )
  if (mutual) return 'table'
  return CHIP_EXCLUSION_DIRECTED.some(([chip, base]) => chipKey === chip && baseKey === base) ? 'table' : null
}

// ── 전체 순서쌍 필터 ─────────────────────────────────────────

export interface ColorPairSummary {
  /** 서로 다른 색의 순서쌍 수(n색이면 n×(n−1), 15색이면 210) */
  total: number
  /** 규칙을 순서대로 적용했을 때 그 단계에서 새로 빠진 수(누적 제외 개수의 증분) */
  excludedByContrast: number
  excludedByKids: number
  excludedByLightness: number
  /** 모두 통과한 순서쌍 수 */
  remaining: number
  /** 통과한 순서쌍(입력 목록의 위치 번호) */
  remainingPairs: ReadonlyArray<readonly [number, number]>
}

/**
 * hex 목록의 모든 순서쌍(같은 색 제외)에 규칙 ②→③→④를 순서대로 적용해 단계별로 빠진 개수를 센다.
 * 모든 쌍을 «칩과 칩이 아닌 것»으로 보고 규칙 ④까지 적용한다(PRD의 210→74 샘플 계산과 같은 가정).
 */
export function summarizeColorPairs(hexes: readonly string[]): ColorPairSummary {
  let total = 0
  let excludedByContrast = 0
  let excludedByKids = 0
  let excludedByLightness = 0
  const remainingPairs: Array<readonly [number, number]> = []
  for (let i = 0; i < hexes.length; i += 1) {
    for (let j = 0; j < hexes.length; j += 1) {
      if (i === j) continue
      total += 1
      const failed = firstViolatedRule(hexes[i], hexes[j], { involvesChip: true })
      if (failed === 'contrast') excludedByContrast += 1
      else if (failed === 'kids') excludedByKids += 1
      else if (failed === 'lightness') excludedByLightness += 1
      else if (failed === null) remainingPairs.push([i, j])
      // 'same'은 hex가 같은 서로 다른 위치 쌍이다. 15색 표에는 없다(표의 hex는 모두 다르다)
      else total -= 1
    }
  }
  return {
    total,
    excludedByContrast,
    excludedByKids,
    excludedByLightness,
    remaining: remainingPairs.length,
    remainingPairs,
  }
}

/** 색 키 표(`FEED_COLORS`)의 옛 15색 hex를 키 순서대로 낸다(통합 팔레트 새 키 4개는 옛 규칙의 표본이 아니다). 키 표를 기본값으로 쓰는 편의 함수다. */
export function feedColorHexes(): string[] {
  return FEED_LEGACY_COLOR_KEYS.map((key) => FEED_COLORS[key].hex)
}

/** 15색 전체의 단계별 제외 개수. 키 표를 기본값으로 쓰는 편의 함수다. */
export function summarizeFeedColors(): ColorPairSummary {
  return summarizeColorPairs(feedColorHexes())
}
