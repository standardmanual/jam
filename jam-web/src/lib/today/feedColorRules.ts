/**
 * 홈피드 색 규칙 — 배지 그림 색 겹침(⑤·⑥)과 칩 배제 표 (티켓 20261121_0012·20261121_1828·20261122_2224, 상위 20261122_2217).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6이다. 옛 hex 규칙(대비·키즈·명도)은 컬러셋 메뉴와 함께 걷었다(티켓 20261122_2225) —
 * 통합 팔레트의 칩과 면 조합은 아래 배제 표(`chipExclusionRule`)가 정한다.
 *
 * **그림 색 규칙은 hex를 입력으로 받는 순수 함수다.** 색 키 표(`FEED_COLORS`)에 묶이지 않는다. 배제 표는 색 키 이름으로만 적는다.
 * 서버 모듈·사전·난수·시각을 읽지 않는다(서버와 브라우저가 같은 값을 낸다).
 */

// ── 임계값 (PRD §6 «자동으로 거르는 규칙») ─────────────────────────

export const COLOR_RULE_THRESHOLDS = {
  /** 규칙 ⑤·⑥ 그림 색 겹침: «색상 차이가 30도 미만» */
  closeHueDegrees: 30,
  /** 규칙 ⑤·⑥ 그림 색 겹침: «눈에 보이는 밝기(L*) 차이가 15 미만» */
  minCieLightnessDiff: 15,
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

// ── 그림 색 규칙 (hex 입력) ──────────────────────────────────

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

/** 걸린 규칙의 이름. `same`은 같은 색, `image`(⑤·⑥)는 `violatesImageColorRule`이 판정하는 그림 색 겹침, `table`은 통합 팔레트의 배제 표(`chipExclusionRule`)가 돌려주는 이름이다. */
export type ColorRuleName = 'same' | 'image' | 'table'

// ── 배제 표 (통합 팔레트, 티켓 20261122_2224 회차 3) ─────────────────────────

/**
 * 칩과 그 아래 면(바탕·박스)이 서로 어울리지 않는 색 조합 — 상위 티켓 20261122_2217 결정 §5의 «배제 표» 초안.
 * 옛 대비·키즈·명도 계산 규칙을 대체한 표다. 자동 배정(`assignFeedColors`)과 어드민 폼 경고(`colorRuleWarnings`)가 읽는다.
 *
 * 항목은 색 키 이름으로 적고 hex를 읽지 않는다. 같은 색끼리도 표의 한 항목이다(`chipExclusionRule`이 먼저 본다).
 */
/** 순서와 무관하게 함께 쓰지 않는 두 색: 빨강과 초록·짙은 초록. */
const CHIP_EXCLUSION_MUTUAL: ReadonlyArray<readonly [string, string]> = [
  ['red', 'green'],
  ['red', 'green-deep'],
]

/** 방향이 있는 항목 [칩 색, 면 색]: 노랑 위 흰 칩, 분홍 위 보라 칩. 반대(흰 면 위 노랑 칩)는 막지 않는다. */
const CHIP_EXCLUSION_DIRECTED: ReadonlyArray<readonly [string, string]> = [
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
