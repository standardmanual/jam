import { describe, it, expect } from 'vitest'
import { dropMarkerGlyphSvg } from './dropMarkerGlyph'
import { dropMarkerIconHtml } from './MapView'

describe('dropMarkerGlyphSvg (티켓 20261114_2347)', () => {
  it('크기를 style로 박고 기본 Tailwind 크기 클래스를 남기지 않는다', () => {
    const html = dropMarkerGlyphSvg({ filled: true, size: 14 })
    expect(html).toContain('viewBox="0 0 48 48"')
    expect(html).toContain('width:14px')
    expect(html).not.toContain('w-6')
  })

  it('채움과 라인은 mask id가 겹치지 않는다', () => {
    const fill = dropMarkerGlyphSvg({ filled: true, size: 14 })
    const line = dropMarkerGlyphSvg({ filled: false, size: 14 })
    const ids = (h: string) => [...h.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    for (const id of ids(fill)) expect(ids(line)).not.toContain(id)
  })

  it('마커 원 색 규칙은 그대로다: 드랍 있음=초록+검정 글리프, 없음=muted+snow 글리프', () => {
    const on = dropMarkerIconHtml({ hasDrops: true, inRange: true, size: 24 })
    expect(on).toContain('background:var(--map-drop-marker-active)')
    expect(on).toContain('color:var(--foreground)')
    const off = dropMarkerIconHtml({ hasDrops: false, inRange: false, size: 24 })
    expect(off).toContain('background:var(--muted)')
    expect(off).toContain('color:var(--snow)')
    expect(off).toContain('opacity:0.5')
  })

  it('서클 안 아이콘은 서클 지름의 0.8배다(24px 서클이면 19.2px)', () => {
    const html = dropMarkerIconHtml({ hasDrops: true, inRange: true, size: 24 })
    expect(html).toContain('width:19.2px')
    expect(html).toContain('height:19.2px')
  })
})
