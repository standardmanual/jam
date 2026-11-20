/**
 * BadgeAuraBackground — 글로우 배경: 그라데이션 세 장 + 블러 한 겹 + 안쪽 빛, 격리 루트 (티켓 20261120_0235·20261120_0316)
 *
 * 저장소에 jsdom이 없어(vitest environment: node) 서버 렌더 마크업으로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/__tests__/BadgeAuraBackground.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BadgeAuraBackground from '@/components/BadgeAuraBackground'
import { AURA_GLOW_BASE_COLOR, AURA_GLOW_TUNING, AURA_GRAIN_URL, AURA_MESH_TONES, auraGlowInsetShadow, auraGlowLayers, auraGlowMetrics, auraMeshBase, auraMeshLayers, auraMeshSeed, tuneAuraColors } from '@/lib/badgeAura'

const COLORS = ['#e0e8ff', '#7090e0', '#203a8a']

describe('BadgeAuraBackground', () => {
  it('루트는 카드 안에 갇히는 장식 면이다 — 격리·라운드 상속·aria-hidden·터치 통과, 바탕은 흰색', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)
    const root = /<div[^>]*data-testid="badge-aura-background"[^>]*>/.exec(html)?.[0] ?? ''
    expect(root).toContain('aria-hidden="true"')
    expect(root).toContain('data-variant="glow"')
    expect(root).toContain('absolute inset-0')
    expect(root).toContain('isolate')
    expect(root).toContain('overflow-hidden')
    expect(root).toContain('rounded-[inherit]')
    expect(root).toContain('pointer-events-none')
    expect(AURA_GLOW_BASE_COLOR).toBe('#ffffff')
    expect(root.toLowerCase()).toContain(`background-color:${AURA_GLOW_BASE_COLOR}`)
  })

  it('그라데이션 세 장에 블러 한 겹과 안쪽 빛이다 — 블렌드·입자가 없다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)
    expect(html.match(/linear-gradient\(to bottom/g)).toHaveLength(1)
    expect(html.match(/radial-gradient\(ellipse/g)).toHaveLength(2)
    expect(html).toContain('box-shadow:inset')
    // 블러는 그라데이션 면 한 겹에만 걸고, 가장자리가 옅어지지 않게 위·좌·우로 카드 밖으로 키운다
    expect(html.match(/filter:blur\(28px\)/g)).toHaveLength(1)
    expect(html).toContain('top:-56px')
    expect(html).toContain('left:-56px')
    expect(html).toContain('right:-56px')
    expect(html).not.toContain('mix-blend-mode')
    expect(html).not.toContain('soft-light')
  })

  it('[]이면 대체색으로 그리고, hex가 아닌 값이 섞였으면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<BadgeAuraBackground colors={[]} />)).toContain('badge-aura-background')
    expect(renderToStaticMarkup(<BadgeAuraBackground colors={['#aabbcc', 'nope']} />)).toBe('')
  })

  it('선형은 진한 색이 위, 흰색이 아래이고 맨 아래 구간은 순백이다 — 정지점이 촘촘하다', () => {
    const linear = auraGlowLayers(COLORS).find((l) => l.startsWith('linear-gradient')) ?? ''
    const stops = linear.replace('linear-gradient(to bottom, ', '').replace(/\)$/, '').split(', ')
    expect(stops.length).toBeGreaterThanOrEqual(12)
    expect(stops[0]).not.toContain(AURA_GLOW_BASE_COLOR)
    expect(stops.slice(-3).every((st) => st.startsWith(AURA_GLOW_BASE_COLOR))).toBe(true)
  })

  it('대표색 3개 중 밝은 색은 쓰지 않고 2개(중간·진한 색)만 쓴다', () => {
    const [light] = tuneAuraColors(COLORS, AURA_GLOW_TUNING)
    expect(auraGlowLayers(COLORS).join(' ')).not.toContain(light)
  })

  it('블러 면이 카드 밖으로 커져도 정지점과 타원 중심은 카드 기준이다 — 흰색 구간이 카드 안에 남는다', () => {
    const [inner, top, linear] = auraGlowLayers(COLORS, { bleed: 56 })
    // 카드 높이를 H라 할 때 위치 = 56 + (H - 56) × 비율. 마지막 두 정지점(흰색)은 비율 0.9대·1이다
    expect(linear).toContain('calc(56px + (100% - 56px) * 1)')
    expect(linear.match(/#ffffff calc\(56px \+ \(100% - 56px\) \* (0\.8\d*|0\.9\d*|1)\)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(top).toContain('at 50% calc(56px + (100% - 56px) * 0)')
    expect(inner).toContain('at 50% calc(56px + (100% - 56px) * 0.46)')
    // 타원 크기는 calc(%와 px 혼합)를 쓰지 않는다 — 브라우저가 그라데이션 전체를 무효로 처리한다
    expect([inner, top].join(' ')).not.toMatch(/ellipse calc/)
    // 면이 커지지 않으면 지금처럼 퍼센트다
    expect(auraGlowLayers(COLORS)[2]).not.toContain('calc(')
    // 렌더 결과에도 카드 기준 위치가 들어간다
    expect(renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)).toContain('calc(56px + (100% - 56px)')
  })

  it('auraGlowMetrics는 상세(px 그대로)·숫자(비례 px)·container(cqw) 세 방식으로 길이를 준다', () => {
    const d = auraGlowMetrics()
    expect([d.blur, d.bleed, d.negBleed, d.len(192)]).toEqual(['28px', '56px', '-56px', '192px'])
    const n = auraGlowMetrics(180)
    expect([n.blur, n.bleed, n.len(72)]).toEqual(['14px', '28px', '36px'])
    const c = auraGlowMetrics('container')
    expect([c.blur, c.bleed, c.negBleed]).toEqual(['7.78cqw', '15.56cqw', '-15.56cqw'])
  })

  it('bleed에 CSS 길이 문자열을 줘도 정지점은 그 길이 기준 calc다', () => {
    const [, , linear] = auraGlowLayers(COLORS, { bleed: '15.56cqw' })
    expect(linear).toContain('calc(15.56cqw + (100% - 15.56cqw) * 1)')
  })

  it('glowSize는 렌더 결과의 블러·여유를 면 크기에 맞춘다', () => {
    const px = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} glowSize={90} />)
    expect(px).toContain('filter:blur(7px)')
    expect(px).toContain('top:-14px')
    const cq = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} glowSize="container" />)
    expect(cq).toContain('filter:blur(7.78cqw)')
    expect(cq).toContain('top:-15.56cqw')
  })

  it('위쪽 타원은 진한 색이 위 가운데(at 50% 0%)에서 투명으로 풀린다', () => {
    const radial = auraGlowLayers(COLORS).find((l) => l.includes('at 50% 0%')) ?? ''
    expect(radial.startsWith('radial-gradient')).toBe(true)
    expect(radial).toContain(',0) 100%)')
  })

  it('안쪽 빛은 밝은 색 inset 그림자 두 겹이다', () => {
    const shadow = auraGlowInsetShadow(COLORS)
    expect(shadow.match(/inset/g)).toHaveLength(2)
  })

  it('gray면 대표색 대신 무채색으로 깐다(미획득) — 선형의 모든 정지점이 무채색이다', () => {
    const chroma = (layers: string[]) => {
      const linear = layers.find((l) => l.startsWith('linear-gradient')) ?? ''
      return Math.max(
        ...[...linear.matchAll(/#([0-9a-f]{6})/g)].map((m) => {
          const n = parseInt(m[1], 16)
          const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
          return Math.max(...rgb) - Math.min(...rgb)
        }),
      )
    }
    expect(chroma(auraGlowLayers(COLORS, { gray: true }))).toBeLessThanOrEqual(12)
    expect(chroma(auraGlowLayers(COLORS))).toBeGreaterThan(20)
  })

  it('will-change와 drop-shadow를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} />)
    expect(html).not.toContain('will-change')
    expect(html).not.toContain('drop-shadow')
  })
})

describe('BadgeAuraBackground — mesh 변형 (티켓 20261120_1143, 후보 E)', () => {
  const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const chroma = (hex: string) => Math.max(...rgbOf(hex)) - Math.min(...rgbOf(hex))

  it('블러·안쪽 빛 없이 가운데 하이라이트 radial 하나와 대각선 선형 바탕이고, 입자가 곱하기로 얹힌다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} variant="mesh" seed="a" />)
    expect(html).toContain('data-variant="mesh"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('filter:blur')
    expect(html).not.toContain('box-shadow')
    expect(html.match(/radial-gradient\(/g)).toHaveLength(1)
    expect(html.match(/linear-gradient\(\d+deg,/g)).toHaveLength(1)
    expect(html.lastIndexOf('linear-gradient')).toBeGreaterThan(html.lastIndexOf('radial-gradient'))
    // 입자: 코드로 만든 SVG 노이즈(이미지 파일 없음)를 곱하기로 얹는다
    expect(html).toContain('mix-blend-mode:multiply')
    expect(AURA_GRAIN_URL.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(AURA_GRAIN_URL).toContain('feTurbulence'.replace(/./g, (c) => encodeURIComponent(c)))
    // 바탕이 흰색이 아니다
    expect(html).toContain(`background-color:${auraMeshBase(COLORS)}`)
    expect(auraMeshBase(COLORS)).not.toBe('#ffffff')
  })

  it('선형 바탕은 8단계 smoothstep이다 — 양 끝은 연한 쪽·깊은 쪽 끝색이고 명도가 단조롭게 내려간다', () => {
    const linear = auraMeshLayers(COLORS, { seed: 'a' }).find((l) => l.startsWith('linear-gradient'))!
    const stops = [...linear.matchAll(/#([0-9a-f]{6}) (\d+)%/g)]
    expect(stops).toHaveLength(8)
    expect(stops[0][2]).toBe('0')
    expect(stops[7][2]).toBe('100')
    const light = (m: RegExpMatchArray) => rgbOf('#' + m[1]).reduce((a, b) => a + b, 0)
    for (let i = 1; i < stops.length; i++) expect(light(stops[i])).toBeLessThanOrEqual(light(stops[i - 1]))
    expect(`#${stops[0][1]}`).toBe(auraMeshBase(COLORS))
  })

  it('끝색은 정해진 채도·명도 보정표를 따른다(연한 쪽 s0.5·l0.93, 깊은 쪽 s0.62·l0.8)', () => {
    expect(AURA_MESH_TONES.light).toEqual({ s: 0.5, l: 0.93 })
    expect(AURA_MESH_TONES.deep).toEqual({ s: 0.62, l: 0.8 })
    const linear = auraMeshLayers(COLORS, { seed: 'a' }).find((l) => l.startsWith('linear-gradient'))!
    const hexes = [...linear.matchAll(/#([0-9a-f]{6})/g)].map((m) => '#' + m[1])
    const l = (hex: string) => (Math.max(...rgbOf(hex)) + Math.min(...rgbOf(hex))) / 510
    expect(l(hexes[0])).toBeCloseTo(AURA_MESH_TONES.light.l, 1)
    expect(l(hexes[hexes.length - 1])).toBeCloseTo(AURA_MESH_TONES.deep.l, 1)
  })

  it('같은 시드는 항상 같은 방향이고, 시드가 달라지면 방향이 달라진다', () => {
    expect(auraMeshSeed('냄비')).toBe(auraMeshSeed('냄비'))
    expect(auraMeshLayers(COLORS, { seed: 'x' })).toEqual(auraMeshLayers(COLORS, { seed: 'x' }))
    const angles = new Set(Array.from({ length: 24 }, (_, i) => /(\d+)deg/.exec(auraMeshLayers(COLORS, { seed: `배지 ${i}` }).join('|'))![1]))
    expect(angles.size).toBeGreaterThanOrEqual(3)
    // 시드가 없으면 색 목록이 시드다
    expect(auraMeshLayers(COLORS)).toEqual(auraMeshLayers(COLORS, { seed: COLORS.join(',') }))
  })

  it('주색은 가장 선명한 대표색, 보조색은 그다음 색이다 — 밝기만 높은 흰빛 색은 쓰지 않는다', () => {
    // 첫 색(#f4f4f4)은 거의 흰색이라 선명하지 않다. 둘째·셋째가 주색·보조색이다
    const colors = ['#f4f4f4', '#e8368f', '#2f6fe0']
    const hexes = [...auraMeshLayers(colors, { seed: 'a' }).find((l) => l.startsWith('linear-gradient'))!.matchAll(/#([0-9a-f]{6})/g)].map((m) => '#' + m[1])
    for (const hex of [hexes[0], hexes[hexes.length - 1]]) expect(chroma(hex)).toBeGreaterThan(14)
  })

  it('거의 무채색인 대표색은 색을 입히지 않는다', () => {
    const hexes = [...auraMeshLayers(['#f0f0f0', '#a0a0a0', '#505050'], { seed: 'a' }).find((l) => l.startsWith('linear-gradient'))!.matchAll(/#([0-9a-f]{6})/g)].map((m) => '#' + m[1])
    for (const hex of hexes) expect(chroma(hex)).toBeLessThanOrEqual(12)
  })

  it('gray면 바탕·바탕 그라데이션·하이라이트가 모두 무채색이다', () => {
    const html = renderToStaticMarkup(<BadgeAuraBackground colors={COLORS} variant="mesh" gray />)
    const nums = [...html.matchAll(/rgba\((\d+),(\d+),(\d+),/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])])
    expect(nums.length).toBeGreaterThanOrEqual(2)
    for (const rgb of nums) expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThanOrEqual(12)
    const hexes = [...html.matchAll(/#([0-9a-f]{6})/g)].map((m) => '#' + m[1])
    expect(hexes.length).toBeGreaterThan(8)
    for (const hex of hexes) expect(chroma(hex)).toBeLessThanOrEqual(12)
  })

  it('색이 hex가 아니면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<BadgeAuraBackground colors={['red']} variant="mesh" />)).toBe('')
  })
})
