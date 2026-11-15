import { renderToStaticMarkup } from 'react-dom/server'
import { TreasureBoxIcon } from '@/components/ui/icons'

/**
 * 지도 마커 안 보물 상자 그림을 SVG 문자열로 만든다 — 지도 SDK는 마커를 HTML 문자열로 받기 때문이다.
 * 지도 마커(`MapView.dropMarkerIconHtml`)가 쓴다. 드랍 있음 = 채움, 없음 = 라인.
 * 색은 currentColor라 부모의 color를 따른다.
 *
 * 비운 면은 SVG mask로 뚫려 있어 원의 색이 비친다. mask id가 variant마다 겹치지 않도록
 * identifierPrefix를 variant별로 다르게 준다(같은 variant끼리는 정의가 같아 공유해도 같다).
 */
const cache = new Map<string, string>()

export function dropMarkerGlyphSvg(opts: { filled: boolean; size: number }): string {
  const { filled, size } = opts
  const key = `${filled ? 'fill' : 'line'}:${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const html = renderToStaticMarkup(
    <TreasureBoxIcon
      variant={filled ? 'fill' : 'line'}
      width={size}
      height={size}
      // 기본 className(w-6 h-6)이 width/height 속성을 이기지 않도록 비운다
      className=""
      style={{ display: 'block', width: size, height: size }}
    />,
    { identifierPrefix: filled ? 'dmf' : 'dml' },
  )
  cache.set(key, html)
  return html
}
