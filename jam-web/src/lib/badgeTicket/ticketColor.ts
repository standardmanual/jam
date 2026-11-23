import { FEED_COLOR_KEYS, FEED_COLORS, type FeedColorKey } from '@/lib/today/feedConstants'
import { hexToHsl, violatesImageColorRule } from '@/lib/today/feedColorRules'

/**
 * 배지 상세 티켓의 색 규칙 (티켓 20261122_1222 → 통합 팔레트 4, 20261122_2226).
 * 후보는 통합 팔레트 일곱 색이다(짙은 초록 `green-deep`·흰색 `white`은 후보가 아니다).
 * 홈피드의 `--feed-color-*` 덮어쓰기 변수는 쓰지 않고 `--jam-*`를 그대로 가리킨다.
 */
export const TICKET_COLOR_KEYS = ['yellow', 'green', 'pink', 'sky', 'red', 'purple', 'blue'] as const
export type TicketColorKey = (typeof TICKET_COLOR_KEYS)[number]

/**
 * 홈 카드가 상세로 넘기는 색 키. 티켓색 일곱 개와 짙은 초록(이어받을 때 `green`으로 접는다)만 허용한다.
 * 흰색·옛 키는 «모르는 값»이라 넘기지도 읽지도 않는다.
 */
export type TicketInheritKey = TicketColorKey | 'green-deep'
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
