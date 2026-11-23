import { describe, expect, it } from 'vitest'
import {
  formatTicketDate,
  isYellowHue,
  parseTicketColorParams,
  pickTicketColor,
  resolveTicketColor,
  ticketColorQuery,
  ticketEndColor,
  ticketSilhouetteColor,
  TICKET_COLOR_KEYS,
  TICKET_SILHOUETTE,
  withTicketColorQuery,
} from '../ticketColor'
import { FEED_COLORS } from '@/lib/today/feedConstants'
import { hexToHsl, luminanceRatio } from '@/lib/today/feedColorRules'

const SEVEN = ['yellow', 'green', 'pink', 'sky', 'red', 'purple', 'blue']

const keysFor = (hexes: string[]) => {
  const seen = new Set<string>()
  for (let i = 0; i < 50; i++) seen.add(pickTicketColor(hexes, () => i / 50).key)
  return seen
}

describe('pickTicketColor', () => {
  it('후보는 통합 팔레트 일곱 색이고 짙은 초록·흰색은 없다', () => {
    expect([...TICKET_COLOR_KEYS]).toEqual(SEVEN)
    expect([...keysFor([])].sort()).toEqual([...SEVEN].sort())
  })

  it('이미지 색이 빨강 계열이면 red가 후보에서 빠진다', () => {
    expect(keysFor(['#FF1D1D']).has('red')).toBe(false)
  })

  it('일곱 키 전부에 그림 색 겹침 제외가 적용된다', () => {
    for (const key of TICKET_COLOR_KEYS) {
      expect(keysFor([FEED_COLORS[key].hex]).has(key)).toBe(false)
    }
  })

  it('일곱 색이 모두 빠져도 일곱 색 중 하나를 돌려준다', () => {
    const all = TICKET_COLOR_KEYS.map((key) => FEED_COLORS[key].hex)
    const picked = pickTicketColor(all, () => 0.5)
    expect(TICKET_COLOR_KEYS).toContain(picked.key)
  })

  it('rand 주입으로 결정적이다', () => {
    expect(pickTicketColor([], () => 0).key).toBe('yellow')
    expect(pickTicketColor([], () => 0.999).key).toBe('blue')
  })

  it('--jam-yellow만 노랑 끝색을 받는다', () => {
    const results = TICKET_COLOR_KEYS.map((_, i) => pickTicketColor([], () => (i + 0.5) / 7))
    const yellowEnd = results.filter((r) => r.endColor.includes('h - 20'))
    expect(yellowEnd.map((r) => r.cssVar)).toEqual(['--jam-yellow'])
  })
})

describe('resolveTicketColor — 색 결정 6가지', () => {
  it('① 카드 바탕을 이어받는다', () => {
    expect(resolveTicketColor({ fromBg: 'pink', fromBox: 'sky', imageHexes: [], rand: () => 0 }).key).toBe('pink')
  })

  it('② 짙은 초록 바탕은 초록으로 접는다', () => {
    const color = resolveTicketColor({ fromBg: 'green-deep', imageHexes: [], rand: () => 0 })
    expect(color.key).toBe('green')
    expect(color.cssVar).toBe('--jam-green')
  })

  it('③ 바탕이 그림 색과 겹치면 박스 색을 쓴다', () => {
    const color = resolveTicketColor({ fromBg: 'red', fromBox: 'sky', imageHexes: [FEED_COLORS.red.hex], rand: () => 0 })
    expect(color.key).toBe('sky')
  })

  it('③ 짙은 초록 바탕이 초록 그림과 겹치면 박스 색을 쓴다', () => {
    const color = resolveTicketColor({ fromBg: 'green-deep', fromBox: 'purple', imageHexes: [FEED_COLORS.green.hex], rand: () => 0 })
    expect(color.key).toBe('purple')
  })

  it('④ 바탕·박스가 모두 겹치면 겹치지 않는 색 중 무작위다(같은 rand는 같은 결과)', () => {
    const images = [FEED_COLORS.red.hex, FEED_COLORS.sky.hex]
    const input = { fromBg: 'red', fromBox: 'sky', imageHexes: images } as const
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const a = resolveTicketColor({ ...input, rand: () => i / 40 })
      const b = resolveTicketColor({ ...input, rand: () => i / 40 })
      expect(a.key).toBe(b.key)
      seen.add(a.key)
    }
    expect(seen.has('red')).toBe(false)
    expect(seen.has('sky')).toBe(false)
    expect(seen.size).toBeGreaterThan(1)
  })

  it('⑤ 이어받은 색이 없으면 일곱 색 무작위이고 짙은 초록은 나오지 않는다', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 70; i++) seen.add(resolveTicketColor({ imageHexes: [], rand: () => i / 70 }).key)
    expect([...seen].sort()).toEqual([...SEVEN].sort())
    expect(seen.has('green-deep')).toBe(false)
  })

  it('⑥ 잘못된 쿼리 값은 ⑤와 같다', () => {
    const bad = parseTicketColorParams({ tc: 'nope', tb: 'WHITE' })
    for (let i = 0; i < 7; i++) {
      const rand = () => i / 7
      expect(resolveTicketColor({ ...bad, imageHexes: [], rand }).key).toBe(resolveTicketColor({ imageHexes: [], rand }).key)
    }
  })

  it('이미지 색이 없으면(null) 바탕을 그대로 이어받는다', () => {
    expect(resolveTicketColor({ fromBg: 'blue', imageHexes: null }).key).toBe('blue')
  })

  it('색 객체에 끝색과 실루엣 색이 담긴다', () => {
    const color = resolveTicketColor({ fromBg: 'yellow' })
    expect(color.endColor).toContain('h - 20')
    expect(color.silhouette).toBe(TICKET_SILHOUETTE.yellow)
  })
})

describe('parseTicketColorParams', () => {
  it('허용 키(짙은 초록 포함)만 통과한다', () => {
    expect(parseTicketColorParams({ tc: 'green-deep', tb: 'sky' })).toEqual({ fromBg: 'green-deep', fromBox: 'sky' })
  })

  it('배열·빈 값·white·옛 키·대소문자 틀림·없음은 undefined다', () => {
    for (const bad of [['pink', 'sky'], '', 'white', 'WHITE', 'Pink', 'orange', 'jam-red', undefined, null, 3]) {
      expect(parseTicketColorParams({ tc: bad, tb: bad })).toEqual({ fromBg: undefined, fromBox: undefined })
    }
  })
})

describe('ticketColorQuery·withTicketColorQuery', () => {
  it('바탕·박스 키를 tc·tb로 싣는다', () => {
    expect(ticketColorQuery('green-deep', 'pink')).toBe('tc=green-deep&tb=pink')
  })

  it('허용되지 않는 키는 싣지 않는다', () => {
    expect(ticketColorQuery('white', 'pink')).toBe('tb=pink')
    expect(ticketColorQuery('white', undefined)).toBe('')
  })

  it('배지 상세 한 건 주소에만 덧붙인다', () => {
    expect(withTicketColorQuery('/badges/b1', { bg: 'green-deep', box: 'pink' })).toBe('/badges/b1?tc=green-deep&tb=pink')
    expect(withTicketColorQuery('/badges/b1?u=god', { bg: 'sky', box: 'red' })).toBe('/badges/b1?u=god&tc=sky&tb=red')
    expect(withTicketColorQuery('/badges/b1?item=i1', { bg: 'sky', box: 'red' })).toBe('/badges/b1?item=i1&tc=sky&tb=red')
  })

  it('다른 목적지·목록·외부 주소·다른 쿼리·해시는 건드리지 않는다', () => {
    const colors = { bg: 'sky', box: 'red' }
    for (const href of [
      '/badges',
      '/badges/',
      '/missions/m1',
      '/badges/b1/extra',
      '/badges/b1?tab=x',
      '/badges/b1#a',
      'https://example.com/badges/b1',
      '//evil.example/badges/b1',
      '',
    ]) {
      expect(withTicketColorQuery(href, colors)).toBe(href)
    }
  })

  it('실을 색이 하나도 없으면 주소 그대로다', () => {
    expect(withTicketColorQuery('/badges/b1', { bg: 'white', box: null })).toBe('/badges/b1')
  })

  it('덧붙인 주소를 page가 읽는 방식으로 되돌리면 같은 색이 나온다', () => {
    const href = withTicketColorQuery('/badges/b1', { bg: 'green-deep', box: 'pink' })
    const q = new URLSearchParams(href.split('?')[1])
    expect(parseTicketColorParams({ tc: q.get('tc'), tb: q.get('tb') })).toEqual({ fromBg: 'green-deep', fromBox: 'pink' })
  })
})

describe('미획득 실루엣 색', () => {
  // 사진 자리 바탕 = BadgeTicket.module.css `--card-bg` = color-mix(in srgb, 티켓색 70%, #fff)
  const photoBg = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.7 + 255 * 0.3))
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }

  it('일곱 키 모두 hex 표가 있고 ticketSilhouetteColor가 같은 값을 준다', () => {
    for (const key of TICKET_COLOR_KEYS) {
      expect(TICKET_SILHOUETTE[key]).toMatch(/^#[0-9A-F]{6}$/)
      expect(ticketSilhouetteColor(key)).toBe(TICKET_SILHOUETTE[key])
    }
  })

  it('일곱 티켓색 모두 사진 자리 바탕과 3:1 이상 구분된다', () => {
    for (const key of TICKET_COLOR_KEYS) {
      expect(luminanceRatio(photoBg(FEED_COLORS[key].hex), TICKET_SILHOUETTE[key]), key).toBeGreaterThanOrEqual(3)
    }
  })

  it('티켓색보다 어둡고 같은 색 가족이다(노랑만 오렌지로 돌린다)', () => {
    for (const key of TICKET_COLOR_KEYS) {
      expect(luminanceRatio('#000000', TICKET_SILHOUETTE[key])).toBeLessThan(luminanceRatio('#000000', FEED_COLORS[key].hex))
      if (key === 'yellow') continue
      const diff = Math.abs(hexToHsl(TICKET_SILHOUETTE[key]).h - hexToHsl(FEED_COLORS[key].hex).h)
      expect(Math.min(diff, 360 - diff), key).toBeLessThan(15)
    }
    const yellowHue = hexToHsl(TICKET_SILHOUETTE.yellow).h
    expect(yellowHue).toBeGreaterThanOrEqual(20)
    expect(yellowHue).toBeLessThanOrEqual(35)
  })
})

describe('isYellowHue·ticketEndColor', () => {
  it('#F9FD69은 노랑, 나머지 원색은 아니다', () => {
    expect(isYellowHue('#F9FD69')).toBe(true)
    for (const hex of ['#FF1D1D', '#59C02B', '#BA8AF7', '#0695EC']) expect(isYellowHue(hex)).toBe(false)
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
