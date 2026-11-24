/**
 * MODULAR `CategorySticker`(`@ds/components/cards/CategorySticker`) 계약 테스트
 * (티켓 20261122_2227). 시드 결정성·모양 범위·둘레 글자·로고 벡터·색 참조를 확인한다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CategorySticker,
  LOGO_GLYPHS,
  MIN_FONT_SIZE,
  STICKER_COLOR_PAIRS,
  WAVE_HUMP_COUNT,
  WAVE_HUMP_HEIGHT,
  fitRingText,
  isSelfIntersecting,
  pebbleShape,
  waveShape,
} from '@ds/components/cards/CategorySticker'

const LABELS = ['ACTIVITY', 'ITEM', 'MISSION', 'CHECK IN', 'COLLECTION', 'DROP', 'PICKUP']
const SEEDS = Array.from({ length: 300 }, (_, i) => `seed-${i}`)

describe('시드 결정성', () => {
  it('같은 (shape, seed)는 늘 같은 path를 낸다', () => {
    expect(pebbleShape('a').outlineD).toBe(pebbleShape('a').outlineD)
    expect(waveShape('a').outlineD).toBe(waveShape('a').outlineD)
    expect(pebbleShape(7).ringD).toBe(pebbleShape('7').ringD)
  })
  it('다른 시드는 다른 모양이다', () => {
    const p = new Set(SEEDS.map((s) => pebbleShape(s).outlineD))
    const w = new Set(SEEDS.map((s) => waveShape(s).outlineD))
    expect(p.size).toBe(SEEDS.length)
    expect(w.size).toBe(SEEDS.length)
  })
})

describe('조약돌', () => {
  it('96×92 상자 안에 있고 윤곽·글자 선이 자기 교차하지 않는다', () => {
    for (const s of SEEDS) {
      const g = pebbleShape(s)
      expect([g.width, g.height]).toEqual([96, 92])
      for (const [x, y] of g.points) {
        expect(x).toBeGreaterThanOrEqual(0.99)
        expect(x).toBeLessThanOrEqual(95.01)
        expect(y).toBeGreaterThanOrEqual(0.99)
        expect(y).toBeLessThanOrEqual(91.01)
      }
      expect(isSelfIntersecting(g.points)).toBe(false)
      expect(isSelfIntersecting(g.ringPoints)).toBe(false)
    }
  })
})

describe('물결 덩어리', () => {
  it('112×92 상자 안, 혹 7~9개, 높이 4~8.5px, 자기 교차 없음', () => {
    for (const s of SEEDS) {
      const g = waveShape(s)
      expect([g.width, g.height]).toEqual([112, 92])
      const humps = g.humps!
      expect(humps.length).toBeGreaterThanOrEqual(WAVE_HUMP_COUNT[0])
      expect(humps.length).toBeLessThanOrEqual(WAVE_HUMP_COUNT[1])
      expect(humps.reduce((a, h) => a + h.span, 0)).toBeCloseTo(Math.PI * 2, 6)
      for (const h of humps) {
        expect(h.h).toBeGreaterThanOrEqual(WAVE_HUMP_HEIGHT[0])
        expect(h.h).toBeLessThanOrEqual(WAVE_HUMP_HEIGHT[1])
      }
      for (const [x, y] of g.points) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(112)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(92)
      }
      expect(isSelfIntersecting(g.points)).toBe(false)
      expect(isSelfIntersecting(g.ringPoints)).toBe(false)
    }
  })
  it('시드마다 혹 개수가 달라진다', () => {
    expect(new Set(SEEDS.map((s) => waveShape(s).humps!.length)).size).toBe(3)
  })
})

describe('둘레 글자', () => {
  it.each(['pebble', 'wave'] as const)('%s: 일곱 문구가 최소 두 번 되풀이되고 하한 이상이다', (shape) => {
    const base = shape === 'pebble' ? 11 : 10
    for (const s of SEEDS.slice(0, 50)) {
      const g = shape === 'pebble' ? pebbleShape(s) : waveShape(s)
      for (const label of LABELS) {
        const r = fitRingText(label, g.ringLength, base)
        expect(r.repeat).toBeGreaterThanOrEqual(2)
        expect(r.fits).toBe(true)
        expect(r.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE)
        expect(r.fontSize).toBeLessThanOrEqual(base)
        expect(r.content.split(label).length - 1).toBe(r.repeat)
      }
    }
  })
  it('긴 문구는 글자가 기준보다 작아지고 짧은 문구는 기준 크기를 지킨다', () => {
    const g = waveShape('x')
    expect(fitRingText('COLLECTION COLLECTION', g.ringLength, 10).fontSize).toBeLessThan(10)
    expect(fitRingText('ITEM', g.ringLength, 10).fontSize).toBe(10)
  })
  it('CHECK IN은 «CHECK IN · CHECK IN ·»으로 읽힌다', () => {
    expect(fitRingText('CHECK IN', 240, 11).content.startsWith('CHECK IN · CHECK IN ·')).toBe(true)
  })
  it('빈 문구는 둘레 글자가 없다', () => {
    expect(fitRingText('', 200, 11).content).toBe('')
  })
})

describe('렌더', () => {
  const html = renderToStaticMarkup(<CategorySticker shape="pebble" seed="s" label="MISSION" pair="sky-red" letter="m" />)
  it('role=img·aria-label·굵기 900·textPath가 있다', () => {
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="MISSION"')
    expect(html).toContain('font-weight="900"')
    expect(html).toContain('<textPath')
  })
  it('색은 var(--jam-*)·--foreground 참조이고 hex가 없다', () => {
    expect(html).toContain('fill="var(--jam-sky)"')
    expect(html).toContain('fill="var(--jam-red)"')
    expect(html).toContain('stroke="var(--foreground)"')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}["']/)
  })
  it('로고 글자는 jam-logo.svg의 path 그대로이고 외곽선은 paint-order stroke다', () => {
    const svg = readFileSync(path.resolve(__dirname, '../../design-system/assets/logo/jam-logo.svg'), 'utf-8')
    for (const k of ['J', 'a', 'm'] as const) expect(svg).toContain(`d="${LOGO_GLYPHS[k].d}"`)
    expect(html).toContain(LOGO_GLYPHS.m.d)
    expect(html).toContain('paint-order="stroke"')
    expect(html).not.toContain('<image')
  })
  it('문구가 비면 둘레 글자 없이 바탕과 로고만 그린다', () => {
    const empty = renderToStaticMarkup(<CategorySticker shape="wave" seed="s" label="" />)
    expect(empty).not.toContain('<text')
    expect(empty.match(/<path/g)).toHaveLength(2)
  })
  it('색 짝은 8개다', () => {
    expect(Object.keys(STICKER_COLOR_PAIRS)).toHaveLength(8)
  })
})

describe('대비(--foreground #171717 글자·테두리)', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  it.each([
    ['빨강', '#FF1D1D'],
    ['파랑', '#0695EC'],
    ['초록', '#59C02B'],
    ['분홍', '#F372C1'],
  ])('%s 바탕 위 본문색 대비가 3:1 이상이다(굵은 글자 기준)', (_n, hex) => {
    expect(ratio('#171717', hex)).toBeGreaterThanOrEqual(3)
  })
})
