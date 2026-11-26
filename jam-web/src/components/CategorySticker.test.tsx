/**
 * MODULAR `CategorySticker`(`@/components/ui/CategorySticker`) 계약 테스트
 * (티켓 20261122_2227). 정원 모양·둘레 글자·로고 벡터·색 참조를 확인한다. 물결 덩어리는 2026-11-27에 걷었다(티켓 20261127_0756).
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
  fitRingText,
  pebbleShape,
} from '@/components/ui/CategorySticker'

const LABELS = ['ACTIVITY', 'ITEM', 'MISSION', 'CHECK IN', 'COLLECTION', 'DROP', 'PICKUP']

describe('조약돌', () => {
  // 사용자 지시(2026-11-27, 티켓 20261127_0746): 배지 바탕을 정확한 원으로 그린다. 모양이 이것 하나뿐이다.
  it('92×92 정원이다: 모든 윤곽점이 중심에서 같은 거리(반지름 45)에 있고 늘 같은 path를 낸다', () => {
    const g = pebbleShape()
    expect([g.width, g.height]).toEqual([92, 92])
    expect(pebbleShape().outlineD).toBe(g.outlineD)
    expect(pebbleShape().ringD).toBe(g.ringD)
    for (const [x, y] of g.points) expect(Math.hypot(x - 46, y - 46)).toBeCloseTo(45, 1)
    for (const [x, y] of g.ringPoints) expect(Math.hypot(x - 46, y - 46)).toBeCloseTo(30, 1)
  })
  it('윤곽과 글자 선은 SVG 호(A)로 그려 곡선 근사가 아니다', () => {
    const g = pebbleShape()
    expect(g.outlineD).toMatch(/^M46 1A45 45 0 1 1 46 91A45 45 0 1 1 46 1Z$/)
    expect(g.ringD).toMatch(/^M46 16A30 30 0 1 1 46 76A30 30 0 1 1 46 16Z$/)
    expect(g.ringLength).toBeCloseTo(2 * Math.PI * 30, 1)
  })
})

describe('둘레 글자', () => {
  it('일곱 문구가 최소 두 번 되풀이되고 하한 이상이다', () => {
    const base = 11
    const g = pebbleShape()
    for (const label of LABELS) {
      const r = fitRingText(label, g.ringLength, base)
      expect(r.repeat).toBeGreaterThanOrEqual(2)
      expect(r.fits).toBe(true)
      expect(r.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE)
      expect(r.fontSize).toBeLessThanOrEqual(base)
      expect(r.content.split(label).length - 1).toBe(r.repeat)
    }
  })
  it('긴 문구는 글자가 기준보다 작아지고 짧은 문구는 기준 크기를 지킨다', () => {
    const g = pebbleShape()
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
  const html = renderToStaticMarkup(<CategorySticker label="MISSION" pair="sky-red" letter="m" />)
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
    const empty = renderToStaticMarkup(<CategorySticker label="" />)
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
