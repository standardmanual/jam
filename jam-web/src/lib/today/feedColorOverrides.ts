/**
 * 홈피드 컬러셋 교체의 순수 함수 (티켓 20261121_2145, 상위 20261120_2026 후속).
 *
 * 색 키 15개는 그대로 두고, 키가 가리키는 hex만 덮어쓴다. 덮어쓴 값은 카드 전용 CSS 변수(`--feed-color-<키>`)로 홈·어드민에 내려가고
 * (`feedColorVar`가 이 변수를 먼저 읽고 없으면 기존 변수를 읽는다), 자동 색 배정·색 규칙·어드민 경고는 덮어쓴 hex로 합친 팔레트(`buildFeedPalette`)를 입력으로 받는다.
 * 디자인 시스템 토큰(`--jam-*`)은 건드리지 않는다.
 *
 * 시각·서버 값을 읽지 않는 순수 파일이다(번들 경계: 클라이언트·서버 어디서든 가져올 수 있다).
 */
import { DEFAULT_FEED_PALETTE, type FeedPalette } from './feedAssign'
import { FEED_COLOR_KEYS, type FeedColorKey } from './feedConstants'

/** 덮어쓴 색: 색 키 → `#rrggbb`(소문자). 덮어쓰지 않은 키는 들어 있지 않다. */
export type FeedColorOverrides = Readonly<Partial<Record<FeedColorKey, string>>>

/** 카드 전용 CSS 변수 이름의 머리말. `feedColorVar`와 `feedColorOverrideCss`가 같은 이름을 쓴다. */
export const FEED_COLOR_VAR_PREFIX = '--feed-color-'

/** 덮어쓰는 값으로 받는 형식: `#rrggbb`(대소문자 무관, 3자리 줄임·`#` 생략은 받지 않는다). */
export function isOverrideHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function isFeedColorKey(value: unknown): value is FeedColorKey {
  return typeof value === 'string' && (FEED_COLOR_KEYS as readonly string[]).includes(value)
}

/**
 * 표에서 읽은 값·요청 본문 같은 믿을 수 없는 입력을 덮어쓰기 표로 정리한다.
 * 배열(`{ color_key, hex }` 행들)이나 키 → hex 객체를 받는다. 모르는 키와 잘못된 hex는 버리고, hex는 소문자로 정규화한다.
 * 같은 키가 여럿이면 나중 것을 쓴다.
 */
export function normalizeOverrides(input: unknown): FeedColorOverrides {
  const result: Partial<Record<FeedColorKey, string>> = {}
  const put = (key: unknown, hex: unknown): void => {
    if (isFeedColorKey(key) && isOverrideHex(hex)) result[key] = hex.toLowerCase()
  }
  if (Array.isArray(input)) {
    for (const row of input) {
      if (typeof row === 'object' && row !== null) put((row as Record<string, unknown>).color_key, (row as Record<string, unknown>).hex)
    }
  } else if (typeof input === 'object' && input !== null) {
    for (const [key, hex] of Object.entries(input)) put(key, hex)
  }
  return result
}

/** 15색 기본 hex에 덮어쓴 값을 합친 팔레트. 덮어쓰기가 비어 있으면 기본 팔레트와 값이 같다. */
export function buildFeedPalette(overrides: FeedColorOverrides | null | undefined): FeedPalette {
  if (!overrides) return DEFAULT_FEED_PALETTE
  return { ...DEFAULT_FEED_PALETTE, ...normalizeOverrides(overrides) }
}

/**
 * 덮어쓴 키만 `:root{--feed-color-<키>:#rrggbb;…}`로 만든다. 덮어쓴 키가 없으면 빈 문자열이다.
 * 키는 15개 목록에서, 값은 `#rrggbb` 형식에서만 받아 정규화하므로 입력에 무엇이 들어와도 CSS 주입이 불가능하다.
 */
export function feedColorOverrideCss(overrides: FeedColorOverrides | null | undefined): string {
  if (!overrides) return ''
  const normalized = normalizeOverrides(overrides)
  const declarations = FEED_COLOR_KEYS.filter((key) => normalized[key] !== undefined).map(
    (key) => `${FEED_COLOR_VAR_PREFIX}${key}:${normalized[key]}`,
  )
  return declarations.length === 0 ? '' : `:root{${declarations.join(';')}}`
}
