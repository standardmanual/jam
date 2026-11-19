/**
 * 배지 글로우 배경 순수 함수 시험 (티켓 20261119_1653·20261120_0235)
 *
 * 실행: cd jam-web && npx vitest run src/lib/__tests__/badgeAura.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  AURA_FALLBACK_COLORS,
  AURA_GLOW_TUNING,
  type AuraTuning,
  fill3,
  hexToHsl,
  hslToHex,
  normalizeHex,
  resolveAuraColors,
  rotateHue,
  tuneAuraColors,
} from '@/lib/badgeAura'

const near = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps)

describe('색 변환', () => {
  it('hex ↔ HSL이 왕복한다', () => {
    for (const hex of ['#3366cc', '#e8461f', '#808080', '#fafafa']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex)
    }
  })

  it('normalizeHex는 3·6자리 hex만 받는다', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc')
    expect(normalizeHex('red')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex(null)).toBeNull()
  })

  it('rotateHue는 360도를 감아 돌린다', () => {
    // 색상 350°에 +22° → 12°, 색상 10°에 -22° → 348°
    const at350 = hslToHex({ h: 350, s: 0.6, l: 0.5 })
    near(hexToHsl(rotateHue(at350, 22)).h, 12, 1.5)
    const at10 = hslToHex({ h: 10, s: 0.6, l: 0.5 })
    near(hexToHsl(rotateHue(at10, -22)).h, 348, 1.5)
  })
})

describe('fill3', () => {
  const base = hslToHex({ h: 200, s: 0.5, l: 0.5 })

  it('3색이면 그대로, 3개를 넘으면 앞 3개만 쓴다', () => {
    expect(fill3(['#111111', '#222222', '#333333'])).toEqual(['#111111', '#222222', '#333333'])
    expect(fill3(['#111111', '#222222', '#333333', '#444444'])).toEqual(['#111111', '#222222', '#333333'])
  })

  it('1색이면 같은 색 + 색상 +22° + -22°로 채운다', () => {
    const out = fill3([base])
    expect(out).toHaveLength(3)
    expect(out[0]).toBe(base)
    near(hexToHsl(out[1]).h, 222, 1.5)
    near(hexToHsl(out[2]).h, 178, 1.5)
    // 채도·명도는 그대로다
    near(hexToHsl(out[1]).l, 0.5, 0.01)
    near(hexToHsl(out[2]).s, 0.5, 0.02)
  })

  it('2색이면 마지막 색에서 +22° 한 색을 뒤에 붙인다', () => {
    const second = hslToHex({ h: 350, s: 0.5, l: 0.4 })
    const out = fill3([base, second])
    expect(out.slice(0, 2)).toEqual([base, second])
    near(hexToHsl(out[2]).h, 12, 1.5) // 350 + 22 = 372 → 12
  })

  it('빈 배열이면 대체색이다', () => {
    expect(fill3([])).toEqual([...AURA_FALLBACK_COLORS])
  })
})

describe('tuneAuraColors — 글로우 보정표', () => {
  const sameThree = (hsl: { h: number; s: number; l: number }) => {
    const hex = hslToHex(hsl)
    return [hex, hex, hex]
  }

  it('자리별 명도가 .94 / .88 / .80이다', () => {
    const out = tuneAuraColors(['#ff0000', '#00ff00', '#0000ff']).map((c) => hexToHsl(c).l)
    near(out[0], 0.94)
    near(out[1], 0.88)
    near(out[2], 0.8)
  })

  it('채도는 원채도 ×.8이고 자리별로 ×.85 / 1 / .95이다', () => {
    // 원채도 .9 → ×.8 = .72 (하한 .4·상한 .76 안쪽)
    const out = tuneAuraColors(sameThree({ h: 200, s: 0.9, l: 0.5 }))
    // 명도가 높은 곳(.94)은 hex 양자화 때문에 채도 오차가 커서 허용 폭을 넓힌다
    near(hexToHsl(out[0]).s, 0.72 * 0.85, 0.08)
    near(hexToHsl(out[1]).s, 0.72, 0.04)
    near(hexToHsl(out[2]).s, 0.72 * 0.95, 0.03)
  })

  it('채도 하한 .4, 상한 .76을 건다', () => {
    expect(AURA_GLOW_TUNING.saturationMin).toBe(0.4)
    expect(AURA_GLOW_TUNING.saturationMax).toBe(0.76)
    // 원채도 .05 → ×.8 = .04 → 하한 .4 → 가운데 자리 ×1
    const low = tuneAuraColors(sameThree({ h: 200, s: 0.05, l: 0.5 }))
    near(hexToHsl(low[1]).s, 0.4, 0.04)
    // 상한은 배율을 크게 올려 확인한다: 원채도 1.0 × 2 = 2.0 → 상한 .76
    const wide: AuraTuning = { ...AURA_GLOW_TUNING, saturationScale: 2 }
    const high = tuneAuraColors(['#0000ff', '#0000ff', '#0000ff'], wide)
    near(hexToHsl(high[1]).s, 0.76, 0.04)
  })

  it('색상(hue)은 원색을 따른다', () => {
    const out = tuneAuraColors(sameThree({ h: 120, s: 0.8, l: 0.5 }))
    near(hexToHsl(out[2]).h, 120, 3)
  })

  it('무채색 원색은 청회색 쪽 색상으로 보정한다', () => {
    const out = tuneAuraColors(['#aaaaaa', '#888888', '#555555'])
    near(hexToHsl(out[2]).h, 215, 3)
  })

  it('3색 미만이면 fill3로 채운 뒤 보정한다', () => {
    expect(tuneAuraColors(['#3366cc'])).toHaveLength(3)
  })
})

describe('resolveAuraColors — null·[]·잘못된 값', () => {
  it('NULL·undefined는 null(흰 카드 그대로)', () => {
    expect(resolveAuraColors(null)).toBeNull()
    expect(resolveAuraColors(undefined)).toBeNull()
  })

  it('[]는 청회색 대체색 3색', () => {
    expect(resolveAuraColors([])).toEqual([...AURA_FALLBACK_COLORS])
    expect(AURA_FALLBACK_COLORS).toHaveLength(3)
  })

  it('hex가 아닌 값이 섞였으면 예외 없이 null', () => {
    expect(resolveAuraColors(['#aabbcc', 'oops'])).toBeNull()
    expect(resolveAuraColors([42 as unknown as string])).toBeNull()
    expect(resolveAuraColors('#aabbcc' as unknown as string[])).toBeNull()
  })

  it('정상 값은 정규화해 돌려준다', () => {
    expect(resolveAuraColors(['#ABC', '#112233'])).toEqual(['#aabbcc', '#112233'])
  })
})
