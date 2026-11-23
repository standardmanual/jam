import { FEED_COLORS } from '@/lib/today/feedConstants'
import { hexToHsl, violatesImageColorRule } from '@/lib/today/feedColorRules'

/**
 * 배지 상세 티켓의 랜덤 색 규칙 (티켓 20261122_1222).
 * 후보는 원색 5개다. `--jam-*`를 그대로 가리킨다.
 */
export const TICKET_COLOR_KEYS = ['red', 'yellow', 'green', 'purple', 'blue'] as const
export type TicketColorKey = (typeof TICKET_COLOR_KEYS)[number]

export interface TicketColor {
  key: TicketColorKey
  /** `--jam-red` 같은 CSS 변수 이름 */
  cssVar: string
  hex: string
  /** 아래 블록 그라데이션의 끝색(CSS 문자열) */
  endColor: string
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

/**
 * 원색 5개 중 하나를 고른다. 배지 이미지 대표 색과 겹치는 색은 뺀다(`violatesImageColorRule`).
 * 모두 빠지면 5개 전체에서 고른다. `rand`는 시험용 주입(기본 Math.random).
 */
export function pickTicketColor(imageHexes: readonly string[] | null | undefined, rand: () => number = Math.random): TicketColor {
  const images = imageHexes ?? []
  const allowed = TICKET_COLOR_KEYS.filter((key) => !violatesImageColorRule(FEED_COLORS[key].hex, images))
  const pool = allowed.length > 0 ? allowed : TICKET_COLOR_KEYS
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  const key = pool[index]
  const { cssVar, hex } = FEED_COLORS[key]
  return { key, cssVar, hex, endColor: ticketEndColor(hex) }
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
