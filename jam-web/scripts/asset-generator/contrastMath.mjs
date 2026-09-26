/**
 * 홈피드 카드 색 대비 계산 — 순수 함수 (티켓 20260926_1544)
 *
 * 배경·끝색 위에 흰 글자를 올렸을 때의 WCAG 2.x 대비 비율(상대 휘도 기준)을 계산한다.
 * 기준은 큰 글자 3:1, 일반 글자 4.5:1이다. `contrast.mjs`(CLI)가 이 함수를 불러 쓴다.
 */

export const LARGE_TEXT_MIN_RATIO = 3
export const NORMAL_TEXT_MIN_RATIO = 4.5

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** `#rrggbb`를 [r, g, b](0~255)로 바꾼다. 형식이 다르면 한국어 Error를 던진다. */
export function parseHexColor(hex) {
  if (typeof hex !== 'string' || !HEX_COLOR_PATTERN.test(hex)) {
    throw new Error(`색은 #rrggbb 형식이어야 해요(받은 값: ${JSON.stringify(hex)}).`)
  }
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

/** WCAG 상대 휘도(0~1). */
export function relativeLuminance(hex) {
  const [r, g, b] = parseHexColor(hex).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 두 색의 대비 비율(1~21, 반올림하지 않은 값). */
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA)
  const b = relativeLuminance(hexB)
  const [light, dark] = a >= b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * 색 하나를 흰 글자(#ffffff) 기준으로 판정한다.
 * 반환: `{ color, ratio(소수 둘째 자리), large(3:1 이상), normal(4.5:1 이상) }`.
 * 통과 여부는 반올림 전 값으로 가른다(4.499를 4.50으로 올려 통과시키지 않는다).
 */
export function judgeWhiteText(hex) {
  const raw = contrastRatio(hex, '#ffffff')
  return {
    color: hex,
    ratio: Number(raw.toFixed(2)),
    large: raw >= LARGE_TEXT_MIN_RATIO,
    normal: raw >= NORMAL_TEXT_MIN_RATIO,
  }
}

/**
 * CLI 인자(`--bg <hex> --end <hex>`)를 파싱한다. 둘 다 필수이고 형식이 다르면 한국어 Error를 던진다.
 * 알 수 없는 인자는 오타를 걸러내려고 거절한다.
 */
export function parseContrastArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new Error(`인자 형식이 올바르지 않아요: ${token}`)
    const key = token.slice(2)
    if (key !== 'bg' && key !== 'end') throw new Error(`알 수 없는 인자예요: --${key}`)
    flags[key] = argv[i + 1]
    i++
  }
  const missing = ['bg', 'end'].filter((key) => flags[key] === undefined)
  if (missing.length > 0) throw new Error(`다음 인자가 필요해요: ${missing.map((key) => `--${key}`).join(', ')}`)
  parseHexColor(flags.bg)
  parseHexColor(flags.end)
  return { bg: flags.bg, end: flags.end }
}
