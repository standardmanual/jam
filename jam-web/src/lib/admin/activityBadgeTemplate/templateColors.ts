/**
 * 템플릿 SVG의 색을 뽑고 HUE·채도·명도·색 계열로 바꾸는 순수 모듈 (티켓 20261116_0632).
 * 서버·브라우저·시험에서 함께 돈다. 서버 전용 모듈을 들여오지 않는다.
 */
import { XMLSerializer } from '@xmldom/xmldom'
import { parseSvg, type XElement, type XNode } from './templateSvg'

const COLOR_PROPS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'] as const
const COLOR_PROP_SET: ReadonlySet<string> = new Set(COLOR_PROPS)

/** 읽은 색(#RRGGBB)을 새 색으로 대응시키는 표 */
export type ColorMap = Record<string, string>

export interface ColorAdjust {
  hueShift: number
  saturation: number
  lightness: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

export interface ColorCount {
  color: string
  count: number
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase()

/** 색 값을 대문자 #RRGGBB로 읽는다. 읽지 못하면 null. */
export function parseSvgColor(value: string | null | undefined): string | null {
  return parseColorWithAlpha(value)?.hex ?? null
}

/** 색과, #RRGGBBAA일 때 뒤의 투명도 두 자리를 함께 읽는다. */
function parseColorWithAlpha(value: string | null | undefined): { hex: string; alpha: string } | null {
  if (value == null) return null
  const t = value.trim()
  if (t === '') return null
  const lower = t.toLowerCase()
  if (lower === 'white') return { hex: '#FFFFFF', alpha: '' }
  if (lower === 'black') return { hex: '#000000', alpha: '' }
  const h = /^#([0-9a-f]+)$/i.exec(t)
  if (h) {
    const d = h[1]
    if (d.length === 3) return { hex: `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toUpperCase(), alpha: '' }
    if (d.length === 6) return { hex: `#${d}`.toUpperCase(), alpha: '' }
    if (d.length === 8) return { hex: `#${d.slice(0, 6)}`.toUpperCase(), alpha: d.slice(6) }
    return null
  }
  const r = /^rgb\(\s*(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*\)$/i.exec(t)
  if (r) {
    const [a, b, c] = [Number(r[1]), Number(r[2]), Number(r[3])]
    if (a > 255 || b > 255 || c > 255) return null
    return { hex: `#${hex2(a)}${hex2(b)}${hex2(c)}`, alpha: '' }
  }
  return null
}

export function hexToHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{6})/i.exec(hex)
  const v = m ? m[1] : '000000'
  const r = parseInt(v.slice(0, 2), 16) / 255
  const g = parseInt(v.slice(2, 4), 16) / 255
  const b = parseInt(v.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h: h >= 360 ? 0 : h, s, l }
}

const foldHue = (h: number) => ((h % 360) + 360) % 360

export function hslToHex({ h, s, l }: Hsl): string {
  const hh = foldHue(h)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = l - c / 2
  let rgb: [number, number, number]
  if (hh < 60) rgb = [c, x, 0]
  else if (hh < 120) rgb = [x, c, 0]
  else if (hh < 180) rgb = [0, c, x]
  else if (hh < 240) rgb = [0, x, c]
  else if (hh < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return `#${hex2((rgb[0] + m) * 255)}${hex2((rgb[1] + m) * 255)}${hex2((rgb[2] + m) * 255)}`
}

const GRAY_SATURATION = 0.02

/** 양수는 남은 폭(1 - v)의 비율만큼 올리고, 음수는 v의 비율만큼 내린다. */
const moveByRatio = (v: number, pct: number) => (pct >= 0 ? v + ((1 - v) * pct) / 100 : v * (1 + pct / 100))

export function adjustColor(hex: string, { hueShift, saturation, lightness }: ColorAdjust): string {
  const { h, s, l } = hexToHsl(hex)
  const isGray = s < GRAY_SATURATION
  const s2 = isGray && saturation > 0 ? s : moveByRatio(s, saturation)
  const l2 = moveByRatio(l, lightness)
  return hslToHex({ h: foldHue(h + hueShift), s: Math.min(1, Math.max(0, s2)), l: Math.min(1, Math.max(0, l2)) })
}

export function buildColorMap(
  colors: string[],
  opts: ColorAdjust & { overrides?: Record<string, string> },
): ColorMap {
  const map: ColorMap = {}
  for (const c of colors) {
    map[c] = adjustColor(opts.overrides?.[c] ?? c, opts)
  }
  return map
}

// ── SVG 읽고 쓰기 ──

function walk(node: XNode, fn: (el: XElement) => void) {
  if (node.nodeType === 1) fn(node as XElement)
  const kids = node.childNodes
  for (let i = 0; i < kids.length; i++) walk(kids[i], fn)
}

const STYLE_DECL = /(^|;)(\s*)([a-zA-Z-]+)(\s*:\s*)([^;]*)/g

/** 값 뒤의 !important를 떼어 색 부분과 꼬리로 나눈다. */
function splitImportant(raw: string): { value: string; tail: string } {
  const m = /^([\s\S]*?)(\s*!important\s*)?$/.exec(raw)
  return { value: (m?.[1] ?? raw).trim(), tail: m?.[2] ?? '' }
}

export function extractSvgColors(svgText: string): ColorCount[] {
  const root = parseSvg(svgText)
  const order: string[] = []
  const counts = new Map<string, number>()
  const add = (hex: string | null) => {
    if (!hex) return
    if (!counts.has(hex)) order.push(hex)
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  walk(root, (el) => {
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i]
      const name = a.name.toLowerCase()
      if (COLOR_PROP_SET.has(name)) add(parseSvgColor(a.value))
      else if (name === 'style') {
        for (const m of a.value.matchAll(STYLE_DECL)) {
          if (COLOR_PROP_SET.has(m[3].toLowerCase())) add(parseSvgColor(splitImportant(m[5]).value))
        }
      }
    }
  })
  return order.map((color) => ({ color, count: counts.get(color) ?? 0 }))
}

function mapValue(raw: string, map: ColorMap): string | null {
  const parsed = parseColorWithAlpha(raw)
  if (!parsed) return null
  const next = map[parsed.hex]
  return next ? `${next.toUpperCase()}${parsed.alpha}` : null
}

export function applyColorMap(svgText: string, map: ColorMap): string {
  const root = parseSvg(svgText)
  walk(root, (el) => {
    const attrs: { name: string; value: string }[] = []
    for (let i = 0; i < el.attributes.length; i++) attrs.push({ name: el.attributes[i].name, value: el.attributes[i].value })
    for (const a of attrs) {
      const name = a.name.toLowerCase()
      if (COLOR_PROP_SET.has(name)) {
        const next = mapValue(a.value, map)
        if (next !== null) el.setAttribute(a.name, next)
      } else if (name === 'style') {
        const nextStyle = a.value.replace(
          STYLE_DECL,
          (whole: string, sep: string, ws: string, prop: string, colon: string, raw: string) => {
            if (!COLOR_PROP_SET.has(prop.toLowerCase())) return whole
            const { value, tail } = splitImportant(raw)
            const next = mapValue(value, map)
            return next === null ? whole : `${sep}${ws}${prop}${colon}${next}${tail}`
          },
        )
        if (nextStyle !== a.value) el.setAttribute(a.name, nextStyle)
      }
    }
  })
  return new XMLSerializer().serializeToString(root as never)
}

// ── 색 계열 ──

export interface ColorFamily {
  key: string
  label: string
  hue: number
}

export const COLOR_FAMILIES: readonly ColorFamily[] = [
  { key: 'red', label: '빨강', hue: 0 },
  { key: 'orange', label: '주황', hue: 28 },
  { key: 'yellow', label: '노랑', hue: 50 },
  { key: 'green', label: '초록', hue: 135 },
  { key: 'teal', label: '청록', hue: 178 },
  { key: 'blue', label: '파랑', hue: 215 },
  { key: 'purple', label: '보라', hue: 270 },
  { key: 'pink', label: '분홍', hue: 330 },
]

/** 채도 0.1 이상, 명도 0.05 초과 0.95 미만인 색 가운데 count×채도가 가장 큰 색의 색상 */
export function dominantHue(colors: ColorCount[]): number | null {
  let best: number | null = null
  let bestScore = -1
  for (const { color, count } of colors) {
    const { h, s, l } = hexToHsl(color)
    if (s < 0.1 || l <= 0.05 || l >= 0.95) continue
    const score = count * s
    if (score > bestScore) {
      bestScore = score
      best = h
    }
  }
  return best
}

/** 대표 색상을 계열의 색상으로 옮기는 hueShift (-180 초과 180 이하). 대표 색상이 없으면 null. */
export function hueShiftForFamily(colors: ColorCount[], familyHue: number): number | null {
  const dom = dominantHue(colors)
  if (dom === null) return null
  let d = foldHue(familyHue - dom)
  if (d > 180) d -= 360
  return d
}
