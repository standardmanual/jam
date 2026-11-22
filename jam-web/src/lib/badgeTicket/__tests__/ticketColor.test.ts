import { describe, expect, it } from 'vitest'
import { formatTicketDate, isYellowHue, pickTicketColor, ticketEndColor, TICKET_COLOR_KEYS } from '../ticketColor'

const keysFor = (hexes: string[]) => {
  const seen = new Set<string>()
  for (let i = 0; i < 50; i++) seen.add(pickTicketColor(hexes, () => i / 50).key)
  return seen
}

describe('pickTicketColor', () => {
  it('이미지 색이 없으면 원색 5개가 모두 후보다', () => {
    expect([...keysFor([])].sort()).toEqual([...TICKET_COLOR_KEYS].sort())
  })

  it('이미지 색이 빨강 계열이면 red가 후보에서 빠진다', () => {
    expect(keysFor(['#FF1D1D']).has('red')).toBe(false)
  })

  it('5개가 모두 빠져도 5개 중 하나를 돌려준다', () => {
    const all = ['#FF1D1D', '#FEC100', '#34EF5A', '#BA8AF7', '#0695EC']
    const picked = pickTicketColor(all, () => 0.5)
    expect(TICKET_COLOR_KEYS).toContain(picked.key)
  })

  it('rand 주입으로 결정적이다', () => {
    expect(pickTicketColor([], () => 0).key).toBe('red')
    expect(pickTicketColor([], () => 0.999).key).toBe('blue')
  })

  it('--jam-yellow만 노랑 끝색을 받는다', () => {
    const results = TICKET_COLOR_KEYS.map((_, i) => pickTicketColor([], () => (i + 0.5) / 5))
    const yellowEnd = results.filter((r) => r.endColor.includes('h - 20'))
    expect(yellowEnd.map((r) => r.cssVar)).toEqual(['--jam-yellow'])
  })
})

describe('isYellowHue·ticketEndColor', () => {
  it('#FEC100은 노랑, 나머지 원색은 아니다', () => {
    expect(isYellowHue('#FEC100')).toBe(true)
    for (const hex of ['#FF1D1D', '#34EF5A', '#BA8AF7', '#0695EC']) expect(isYellowHue(hex)).toBe(false)
  })

  it('일반 끝색은 명도 -0.08·채도 ×1.2', () => {
    expect(ticketEndColor('#FF1D1D')).toBe('oklch(from var(--ticket) calc(l - 0.08) calc(c * 1.2) h)')
  })
})

describe('formatTicketDate', () => {
  it('한국 시각 YYYY.MM.DD로 바꾼다', () => {
    expect(formatTicketDate('2026-11-21T16:00:00Z')).toBe('2026.11.22')
  })
  it('값이 없으면 null', () => {
    expect(formatTicketDate(null)).toBeNull()
    expect(formatTicketDate('x')).toBeNull()
  })
})
