import { FEED_COLOR_KEYS, FEED_COLORS, type FeedColorKey } from '@/lib/today/feedConstants'
import { hexToHsl, violatesImageColorRule } from '@/lib/today/feedColorRules'
import { contrastRatio, hexToRgb, maxChroma, oklchToRgb, rgbToHex, srgbToOklab } from '@/lib/collection-cover/color'

/**
 * 배지 상세 티켓의 색 규칙 (티켓 20261122_1222 → 통합 팔레트 4, 20261122_2226).
 * 후보는 통합 팔레트 일곱 색이다(짙은 초록 `green-deep`·흰색 `white`은 후보가 아니다).
 * `--jam-*`를 그대로 가리킨다.
 */
export const TICKET_COLOR_KEYS = ['yellow', 'green', 'pink', 'sky', 'red', 'purple', 'blue'] as const
export type TicketColorKey = (typeof TICKET_COLOR_KEYS)[number]

/**
 * 홈 카드가 상세로 넘기는 색 키. 티켓색 일곱 개와 짙은 초록(이어받을 때 `green`으로 접는다)만 허용한다.
 * 흰색·옛 키는 «모르는 값»이라 넘기지도 읽지도 않는다.
 */
type TicketInheritKey = TicketColorKey | 'green-deep'
const INHERIT_KEYS: readonly string[] = FEED_COLOR_KEYS.filter((key) => key !== 'white')

/** 미획득 실루엣 색(키별 hex). 사진 자리 바탕(티켓색 70%+흰색 30%)과 3:1 이상 구분되는 같은 색상의 어두운 색이다 — 시험이 고정한다. 노랑만 오렌지로 돌렸다. */
export const TICKET_SILHOUETTE: Record<TicketColorKey, string> = {
  yellow: '#B4600F',
  green: '#2E6B17',
  pink: '#8E2C69',
  sky: '#1D6F8E',
  red: '#8A1414',
  purple: '#5E3E92',
  blue: '#0B4E80',
}

export function ticketSilhouetteColor(key: TicketColorKey): string {
  return TICKET_SILHOUETTE[key]
}

export interface TicketColor {
  key: TicketColorKey
  /** `--jam-red` 같은 CSS 변수 이름 */
  cssVar: string
  hex: string
  /** 아래 블록 그라데이션의 끝색(CSS 문자열) */
  endColor: string
  /** 미획득 배지 실루엣 색(hex) */
  silhouette: string
}

/** 노랑 계열 판정: HSL 색상 40~70° */
export function isYellowHue(hex: string): boolean {
  const { h } = hexToHsl(hex)
  return h >= 40 && h <= 70
}

/** 끝색: 검정을 겹치지 않고 명도만 낮추고 채도를 올린다. 노랑은 오렌지 쪽으로 20° 돌려 탁해지지 않게 한다 */
export function ticketEndColor(hex: string): string {
  return isYellowHue(hex)
    ? 'oklch(from var(--ticket) calc(l - 0.03) calc(c * 1.15) calc(h - 20))'
    : 'oklch(from var(--ticket) calc(l - 0.08) calc(c * 1.2) h)'
}

function buildTicketColor(key: TicketColorKey): TicketColor {
  const { cssVar, hex } = FEED_COLORS[key]
  return { key, cssVar, hex, endColor: ticketEndColor(hex), silhouette: ticketSilhouetteColor(key) }
}

// ── 컬렉션 상세: 표지색에서 파생하는 티켓색 (티켓 20261124_2253, 상위 20261124_2252) ──

const HEX_RE = /^#[0-9a-fA-F]{6}$/
const DEG = 180 / Math.PI

/** 컬렉션 표지 배경색보다 티켓을 어둡게 하는 OKLCH 명도 차(사용자 확정 0.10) */
const COVER_TICKET_L_DELTA = 0.1
/** 티켓색 명도 하한 — 아주 어두운 표지도 검정 덩어리가 되지 않게 한다 */
const COVER_TICKET_L_MIN = 0.2
/** 카드 바탕에 섞는 티켓색 기본 비율(%)과 보조 바탕 비율. 배지 상세와 같은 값이다 */
const CARD_MIX_DEFAULT = 70
const CARD_MIX_SECONDARY_DEFAULT = 45
/** 글자색 후보 순서 — 짙은 회색, 흰색, 안 되면 순수 검정 */
const TEXT_CANDIDATES = ['#171717', '#ffffff', '#000000'] as const
const CARD_INK = '#171717'
const MIN_CONTRAST = 4.5

/** 표지색에서 파생한(또는 팔레트로 대신한) 티켓색. `BadgeTicket`이 팔레트 키 없이 받는다 */
export interface DerivedTicketColor {
  key: 'cover'
  /** 티켓색 `#rrggbb` */
  hex: string
  /** 아래 블록 그라데이션의 끝색(CSS 문자열, 배지 상세와 같은 식) */
  endColor: string
  /** 컬렉션 상세는 미획득 실루엣을 쓰지 않는다 — 글자색과 같은 값을 넣어 둔다 */
  silhouette: string
  /** 티켓 면 위 글자색(머리·글자 상자·진행 글자·이야기 글) */
  text: string
  /** 카드 바탕에 섞는 티켓색 비율(%) — `--card-bg`·`--surface` */
  cardMix: number
  /** 보조 카드 바탕 비율(%) — `--background-secondary` */
  cardMixSecondary: number
}

/**
 * 미션 현황 티켓색 (티켓 20261127_1145). 색은 컴포넌트 토큰 `--mission-ticket`(= `--jam-coral`)이 정하고, 이 값은 대비 계산과 끝색 파생에 쓰는 같은 hex다
 * (`primitive.css`의 `--jam-coral`과 같은지는 시험이 고정한다). 통합 팔레트 일곱 색에는 섞지 않는다.
 */
export interface MissionTicketColor {
  key: 'mission'
  cssVar: '--mission-ticket'
  hex: string
  endColor: string
  /** 미션 현황은 미획득 실루엣을 쓰지 않는다 — 글자색과 같은 값을 넣어 둔다 */
  silhouette: string
  /** 티켓 면 위 글자색 — 순수 검정 */
  text: string
}

export type TicketPaint = TicketColor | DerivedTicketColor | MissionTicketColor

function hexToOklch(hex: string): { L: number; C: number; h: number } {
  const [L, a, b] = srgbToOklab(hexToRgb(hex))
  const h = Math.atan2(b, a) * DEG
  return { L, C: Math.hypot(a, b), h: h < 0 ? h + 360 : h }
}

/** 명도·채도·색상각으로 hex를 만든다. 색역 밖이면 채도만 줄인다 */
function oklchToHex(L: number, C: number, h: number): string {
  return rgbToHex(oklchToRgb(L, Math.min(C, maxChroma(L, h)), h))
}

/** 표지 배경색 → 티켓색: OKLCH 명도를 `max(0.2, L - delta)`로 낮추고 채도·색상은 유지한다(색역 밖이면 채도만 줄임) */
export function deriveCoverTicketHex(bgHex: string, delta: number = COVER_TICKET_L_DELTA): string {
  const { L, C, h } = hexToOklch(bgHex)
  return oklchToHex(Math.max(COVER_TICKET_L_MIN, L - delta), C, h)
}

/** `ticketEndColor`의 CSS 상대색과 같은 식을 JS로 계산한 끝색 hex(대비 판정용). 브라우저 계산과 한두 단계 어긋날 수 있다 */
export function ticketEndHex(hex: string): string {
  const { L, C, h } = hexToOklch(hex)
  return isYellowHue(hex) ? oklchToHex(L - 0.03, C * 1.15, h - 20) : oklchToHex(L - 0.08, C * 1.2, h)
}

const mixRgb = (a: readonly number[], b: readonly number[], ratioA: number): number[] =>
  a.map((v, i) => v * ratioA + b[i] * (1 - ratioA))

/**
 * 티켓 면 위 글자색. `#171717`·`#fff` 중 «티켓색»과 «티켓색·끝색 중간색» 둘 다에서 대비 4.5 이상인 쪽을 쓴다(먼저 통과한 쪽).
 * 둘 다 안 되면 순수 `#000`을 허용하고, 그것도 안 되면 두 곳 대비의 작은 쪽이 가장 큰 후보를 쓴다.
 */
export function pickTicketTextColor(ticketHex: string): string {
  const ticket = hexToRgb(ticketHex)
  const mid = mixRgb(ticket, hexToRgb(ticketEndHex(ticketHex)), 0.5)
  let best: string = TEXT_CANDIDATES[0]
  let bestScore = -1
  for (const candidate of TEXT_CANDIDATES) {
    const ink = hexToRgb(candidate)
    const score = Math.min(contrastRatio(ink, ticket), contrastRatio(ink, mid))
    if (score >= MIN_CONTRAST) return candidate
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

/** `color-mix(in srgb, 티켓색 mix%, #fff)`를 JS로 계산한 카드 바탕 rgb */
export function cardBackgroundRgb(ticketHex: string, mix: number): number[] {
  return mixRgb(hexToRgb(ticketHex), [255, 255, 255], mix / 100)
}

/**
 * 카드 바탕에 섞는 티켓색 비율(%). 70%에서 시작해 카드 안 `#171717` 글자 대비가 4.5 이상이 될 때까지 5%씩 낮춘다.
 * 연한 표지는 70% 그대로라 배지 상세와 같다. 보조 바탕은 같은 비율(45/70)로 따라 낮춘다.
 */
export function pickCardMix(ticketHex: string): { cardMix: number; cardMixSecondary: number } {
  const ink = hexToRgb(CARD_INK)
  let mix = CARD_MIX_DEFAULT
  while (mix > 0 && contrastRatio(ink, cardBackgroundRgb(ticketHex, mix)) < MIN_CONTRAST) mix -= 5
  const secondary = mix === CARD_MIX_DEFAULT ? CARD_MIX_SECONDARY_DEFAULT : Math.round((mix * CARD_MIX_SECONDARY_DEFAULT) / CARD_MIX_DEFAULT)
  return { cardMix: mix, cardMixSecondary: secondary }
}

/** `--jam-coral`과 같은 값 */
export const MISSION_TICKET_HEX = '#D3474D'

/**
 * 미션 현황 티켓색. 글자색은 순수 검정이다: 코랄 면 위 대비가 `#000` 4.78, `#fff` 4.39, `#171717` 4.08(계산값)이라
 * 머리의 12px 날짜 줄(AA 4.5)을 넘기는 것은 검정뿐이다. `pickTicketTextColor`는 면과 끝색 사이 중간색까지 보고 흰색을 고르므로 쓰지 않는다.
 */
export function missionTicketColor(): MissionTicketColor {
  return {
    key: 'mission',
    cssVar: '--mission-ticket',
    hex: MISSION_TICKET_HEX,
    endColor: ticketEndColor(MISSION_TICKET_HEX),
    silhouette: '#000000',
    text: '#000000',
  }
}

function paintFromHex(hex: string): DerivedTicketColor {
  const text = pickTicketTextColor(hex)
  return { key: 'cover', hex, endColor: ticketEndColor(hex), silhouette: text, text, ...pickCardMix(hex) }
}

/**
 * 컬렉션 표지 배경색(`item_books.cover_params.bgHex`)에서 티켓색을 정한다(서버에서 한 번 — 클라이언트 훅으로 칠하지 않는다).
 * 값이 없거나 `#rrggbb`가 아니면 `pickTicketColor(null)`로 통합 팔레트 일곱 색 중 하나로 대신하고, 글자색·카드 바탕도 그 색으로 정한다.
 */
export function deriveCoverTicketColor(
  bgHex: unknown,
  delta: number = COVER_TICKET_L_DELTA,
  rand: () => number = Math.random,
): DerivedTicketColor {
  if (typeof bgHex === 'string' && HEX_RE.test(bgHex)) return paintFromHex(deriveCoverTicketHex(bgHex.toLowerCase(), delta))
  return paintFromHex(pickTicketColor(null, rand).hex.toLowerCase())
}

/** 홈 카드에서 넘어온 색 두 개. 모르는 값은 없는 것과 같다(막지 않는다). */
export interface TicketColorParams {
  fromBg?: TicketInheritKey
  fromBox?: TicketInheritKey
}

function parseInheritKey(raw: unknown): TicketInheritKey | undefined {
  // 배열(`?tc=a&tc=b`)·빈 값·대소문자 틀림·`white`·옛 키는 모두 허용 목록에 없어 undefined다
  return typeof raw === 'string' && INHERIT_KEYS.includes(raw) ? (raw as TicketInheritKey) : undefined
}

/** 쿼리 `tc`(카드 바탕 키)·`tb`(박스 키)를 허용 목록으로 검증한다. 신뢰하지 않는 값은 undefined — «다른 경로»로 본다. */
export function parseTicketColorParams(raw: { tc?: unknown; tb?: unknown }): TicketColorParams {
  return { fromBg: parseInheritKey(raw.tc), fromBox: parseInheritKey(raw.tb) }
}

export interface ResolveTicketColorInput extends TicketColorParams {
  /** 배지 이미지 대표 색(최대 3개) */
  imageHexes?: readonly string[] | null
  /** 시험용 주입(기본 Math.random) */
  rand?: () => number
}

/**
 * 티켓색을 정한다. ① 카드 바탕을 이어받는다(짙은 초록→초록). 그림 색과 겹치면(`violatesImageColorRule`) ② 박스 색,
 * 그것도 겹치거나 둘 다 없으면 ③ 일곱 색 중 겹치지 않는 색에서 `rand`로 고른다(모두 겹치면 일곱 색 전체).
 */
export function resolveTicketColor({ fromBg, fromBox, imageHexes, rand = Math.random }: ResolveTicketColorInput = {}): TicketColor {
  const images = imageHexes ?? []
  for (const inherited of [fromBg, fromBox]) {
    if (!inherited) continue
    const key: TicketColorKey = inherited === 'green-deep' ? 'green' : inherited
    if (!violatesImageColorRule(FEED_COLORS[key].hex, images)) return buildTicketColor(key)
  }
  const allowed = TICKET_COLOR_KEYS.filter((key) => !violatesImageColorRule(FEED_COLORS[key].hex, images))
  const pool = allowed.length > 0 ? allowed : TICKET_COLOR_KEYS
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  return buildTicketColor(pool[index])
}

/** 이어받은 색 없이(탭 바·직접 링크 등) 일곱 색 중 하나를 고른다. 그림 색과 겹치는 색은 뺀다. */
export function pickTicketColor(imageHexes: readonly string[] | null | undefined, rand: () => number = Math.random): TicketColor {
  return resolveTicketColor({ imageHexes, rand })
}

/** 카드가 상세로 넘기는 쿼리 문자열(앞의 `?` 없이). 허용 키만 싣고, 하나도 없으면 빈 문자열이다. */
export function ticketColorQuery(bg: FeedColorKey | string | null | undefined, box: FeedColorKey | string | null | undefined): string {
  const parts: string[] = []
  const tc = parseInheritKey(bg)
  const tb = parseInheritKey(box)
  if (tc) parts.push(`tc=${tc}`)
  if (tb) parts.push(`tb=${tb}`)
  return parts.join('&')
}

const BADGE_DETAIL_PATH = /^\/badges\/[^/?#\s]+$/

/**
 * 카드 이동 주소가 배지 상세 한 건(`/badges/{id}`, 쿼리는 없거나 `u`·`item`만)일 때만 티켓색 쿼리를 덧붙인다.
 * 다른 목적지(`/missions`·`/badges` 목록 등)와 외부 주소, 이미 다른 쿼리·해시가 있는 주소는 그대로 돌려준다.
 */
export function withTicketColorQuery(href: string, colors: { bg?: string | null; box?: string | null }): string {
  const [path, query = '', ...rest] = href.split('?')
  if (rest.length > 0 || href.includes('#') || !BADGE_DETAIL_PATH.test(path)) return href
  const keys = [...new URLSearchParams(query).keys()]
  if (keys.some((key) => key !== 'u' && key !== 'item')) return href
  const added = ticketColorQuery(colors.bg, colors.box)
  if (!added) return href
  return `${path}?${query ? `${query}&` : ''}${added}`
}

/** 티켓 머리 날짜 «YYYY.MM.DD»(한국 시각). 값이 없거나 읽을 수 없으면 null — 날짜 줄을 그리지 않는다 */
export function formatTicketDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return null
  const kst = new Date(ms + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth() + 1)}.${pad(kst.getUTCDate())}`
}
