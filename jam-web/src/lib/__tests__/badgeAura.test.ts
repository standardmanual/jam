/**
 * 배지 Aura 배경 순수 함수 시험 (티켓 20261119_1653)
 *
 * 실행: cd jam-web && npx vitest run src/lib/__tests__/badgeAura.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  AURA_BLUR_DETAIL_PX,
  AURA_BLUR_RATIO,
  AURA_FALLBACK_COLORS,
  AURA_TUNING,
  type AuraTuning,
  auraBlurContainerCss,
  auraBlurPx,
  auraGrainImage,
  auraLayers,
  fill3,
  hexToHsl,
  hslToHex,
  normalizeHex,
  resolveAuraColors,
  rotateHue,
  textMode,
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

describe('tuneAuraColors — «연하게» 보정표', () => {
  const sameThree = (hsl: { h: number; s: number; l: number }) => {
    const hex = hslToHex(hsl)
    return [hex, hex, hex]
  }

  it('자리별 명도가 .92 / .83 / .74다', () => {
    const out = tuneAuraColors(['#ff0000', '#00ff00', '#0000ff']).map((c) => hexToHsl(c).l)
    near(out[0], 0.92)
    near(out[1], 0.83)
    near(out[2], 0.74)
  })

  it('채도는 원채도 ×.27이고 자리별로 ×.65 / .85 / 1이다', () => {
    // 원채도 1.0 → ×.27 = .27 (하한·상한 안쪽)
    const out = tuneAuraColors(sameThree({ h: 200, s: 1, l: 0.5 }))
    // 명도가 높은 곳(.92)은 hex 양자화 때문에 채도 오차가 커서 허용 폭을 넓힌다
    near(hexToHsl(out[0]).s, 0.27 * 0.65, 0.06)
    near(hexToHsl(out[1]).s, 0.27 * 0.85, 0.03)
    near(hexToHsl(out[2]).s, 0.27, 0.02)
  })

  it('채도 하한 .07, 상한 .32를 건다', () => {
    const t = AURA_TUNING.light
    expect(t.saturationMin).toBe(0.07)
    expect(t.saturationMax).toBe(0.32)
    // 원채도 .05 → ×.27 = .0135 → 하한 .07 → 아래 자리 ×1
    const low = tuneAuraColors(sameThree({ h: 200, s: 0.05, l: 0.5 }))
    near(hexToHsl(low[2]).s, 0.07, 0.02)
    // 상한은 배율을 크게 올려 확인한다: 원채도 1.0 × 2 = 2.0 → 상한 .32
    const wide: AuraTuning = { ...t, saturationScale: 2 }
    const high = tuneAuraColors(['#0000ff', '#0000ff', '#0000ff'], wide)
    near(hexToHsl(high[2]).s, 0.32, 0.02)
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

describe('auraLayers — 정지점', () => {
  const colors = ['#e0e8ff', '#7090e0', '#203a8a']
  const [top, mid, dark] = tuneAuraColors(colors)
  const rgba = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
  }

  it('레이어1: transparent 0 / 틴트(.12) 28% / 흰색 28% / 중간 68% / 진한색 100%', () => {
    const [layer1] = auraLayers(colors)
    expect(layer1).toBe(`linear-gradient(to bottom, transparent 0%, ${rgba(top, 0.12)} 28%, #ffffff 28%, ${mid} 68%, ${dark} 100%)`)
  })

  it('레이어2: transparent 0 / rgba(219,219,219,.22) 34% / 흰색 66% / 중간 82% / 진한색 100%', () => {
    const [, layer2] = auraLayers(colors)
    expect(layer2).toBe(`linear-gradient(to bottom, transparent 0%, rgba(219,219,219,0.22) 34%, #ffffff 66%, ${mid} 82%, ${dark} 100%)`)
  })
})

describe('textMode — 글자 높이 85%의 밝기', () => {
  it('«연하게» 보정표에서는 어떤 색이든 어두운 글자(dark)다', () => {
    for (const colors of [
      ['#eef4ff', '#5588ee', '#1a2a66'],
      ['#ffeedd', '#ee7733', '#661100'],
      ['#f0f0f0', '#888888', '#111111'],
      ['#000000', '#000000', '#000000'],
      ['#ffff00', '#00ff00', '#00ffff'],
      [],
    ]) {
      expect(textMode(colors)).toBe('dark')
    }
  })

  it('경계: 명도가 낮은 보정표에서는 밝은 글자(light), 높으면 어두운 글자(dark)', () => {
    const dim: AuraTuning = { ...AURA_TUNING.light, lightness: [0.3, 0.2, 0.1] }
    const bright: AuraTuning = { ...AURA_TUNING.light, lightness: [0.95, 0.9, 0.85] }
    expect(textMode(['#3366cc', '#3366cc', '#3366cc'], dim)).toBe('light')
    expect(textMode(['#3366cc', '#3366cc', '#3366cc'], bright)).toBe('dark')
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

describe('입자 이미지', () => {
  it('feTurbulence(.95, 2옥타브)를 담은 data URI다', () => {
    const image = auraGrainImage()
    const prefix = 'url("data:image/svg+xml,'
    expect(image.startsWith(prefix)).toBe(true)
    const svg = decodeURIComponent(image.slice(prefix.length, -2))
    expect(svg).toContain('feTurbulence')
    expect(svg).toContain("baseFrequency='0.95'")
    expect(svg).toContain("numOctaves='2'")
  })
})

describe('면 크기에 비례하는 블러 (티켓 20261119_1654)', () => {
  it('비율은 상세 카드 확정값(높이 320px에서 100px)이다', () => {
    expect(AURA_BLUR_RATIO).toBeCloseTo(0.3125, 6)
    expect(auraBlurPx(320)).toBe(AURA_BLUR_DETAIL_PX)
  })

  it('일반 목록 면 90px은 약 28px, 작은 면은 더 작다', () => {
    expect(auraBlurPx(90)).toBeCloseTo(28.13, 2)
    expect(auraBlurPx(60)).toBeLessThan(auraBlurPx(90))
  })

  it('폭 비례 길이는 같은 비율을 100cqw에 곱한다', () => {
    expect(auraBlurContainerCss()).toBe(`calc(${AURA_BLUR_RATIO} * 100cqw)`)
  })
})
