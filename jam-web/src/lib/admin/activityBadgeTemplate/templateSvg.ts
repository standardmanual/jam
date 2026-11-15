/**
 * 액티비티 배지 템플릿 SVG를 정화하고 이름 자리·값 자리를 읽는 순수 모듈 (티켓 20261116_0234).
 * `@xmldom/xmldom`으로 읽고 써서 서버·브라우저·시험(node)에서 같은 코드가 돈다.
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

export const TEMPLATE_SLOT_NAMES = ['name', 'value'] as const
export type TemplateSlotName = (typeof TEMPLATE_SLOT_NAMES)[number]

/** 템플릿 SVG 최대 크기(바이트) */
export const TEMPLATE_SVG_MAX_BYTES = 1_000_000

export type TemplateSvgErrorCode = 'INVALID_XML' | 'NOT_SVG'

export class TemplateSvgError extends Error {
  readonly code: TemplateSvgErrorCode
  constructor(code: TemplateSvgErrorCode, message: string) {
    super(message)
    this.name = 'TemplateSvgError'
    this.code = code
  }
}

export interface SanitizeResult {
  svg: string
  removed: string[]
}

export interface TemplateSlot {
  found: boolean
  isText: boolean
  x: number | null
  y: number | null
  fontFamily: string | null
  fontSize: number | null
  fontWeight: string | null
  fill: string | null
  letterSpacing: string | null
  textAnchor: string | null
  transform: string | null
  placeholder: string | null
}

export interface TemplateSlots {
  viewBoxWidth: number | null
  viewBoxHeight: number | null
  name: TemplateSlot
  value: TemplateSlot
}

const REMOVED_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'link', 'meta'])

// xmldom 타입은 DOM 전체가 아니라 필요한 만큼만 구조적으로 쓴다.
interface XNode {
  nodeType: number
  localName?: string | null
  nodeName: string
  textContent: string | null
  childNodes: ArrayLike<XNode>
  removeChild(child: XNode): XNode
}
interface XAttr {
  name: string
  value: string
}
interface XElement extends XNode {
  attributes: ArrayLike<XAttr>
  getAttribute(name: string): string | null
  removeAttribute(name: string): void
  setAttribute(name: string, value: string): void
}

const ELEMENT_NODE = 1

function isElement(n: XNode): n is XElement {
  return n.nodeType === ELEMENT_NODE
}

const lname = (n: XNode) => (n.localName ?? n.nodeName).toLowerCase()

function parseSvg(svgText: string): XElement {
  const errors: string[] = []
  const parser = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level === 'error' || level === 'fatalError') errors.push(msg)
    },
  })
  let root: XElement | null
  try {
    const doc = parser.parseFromString(svgText, 'image/svg+xml')
    root = (doc?.documentElement as unknown as XElement | null) ?? null
  } catch (e) {
    throw new TemplateSvgError('INVALID_XML', e instanceof Error ? e.message : 'XML 읽기 실패')
  }
  if (errors.length > 0 || !root) {
    throw new TemplateSvgError('INVALID_XML', errors[0] ?? 'XML 읽기 실패')
  }
  if (lname(root) !== 'svg') {
    throw new TemplateSvgError('NOT_SVG', '뿌리 요소가 svg가 아님')
  }
  return root
}

function isSafeHref(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v.startsWith('#') || v.startsWith('data:image/')
}

/** 값 안의 url(...) 가운데 안쪽 참조(#…)나 data:image/ 가 아닌 대상이 하나라도 있으면 참 */
export function hasExternalUrl(value: string): boolean {
  const re = /url\(\s*([^)]*)\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    const target = m[1].trim().replace(/^['"\s]+|['"\s]+$/g, '').toLowerCase()
    if (!target.startsWith('#') && !target.startsWith('data:image/')) return true
  }
  return false
}

function isDangerousDeclaration(decl: string): boolean {
  return hasExternalUrl(decl) || /@import|expression\(|javascript:/i.test(decl)
}

function sanitizeNode(el: XElement, removed: string[]): void {
  for (const child of Array.from(el.childNodes)) {
    if (!isElement(child)) continue
    const name = lname(child)
    if (REMOVED_ELEMENTS.has(name)) {
      el.removeChild(child)
      removed.push(`요소 ${name}`)
      continue
    }
    if (name === 'style' && /@import|url\(/i.test(child.textContent ?? '')) {
      el.removeChild(child)
      removed.push('요소 style(바깥 주소 포함)')
      continue
    }
    sanitizeNode(child, removed)
  }
  for (const attr of Array.from(el.attributes)) {
    const attrName = attr.name.toLowerCase()
    const local = attrName.split(':').pop()
    if (attrName.startsWith('on')) {
      el.removeAttribute(attr.name)
      removed.push(`속성 ${attr.name}`)
    } else if (local === 'href' && !isSafeHref(attr.value)) {
      el.removeAttribute(attr.name)
      removed.push(`속성 ${attr.name}(바깥 주소)`)
    } else if (attrName === 'style') {
      const decls = attr.value.split(';').filter((d) => d.trim() !== '')
      const kept: string[] = []
      for (const decl of decls) {
        if (isDangerousDeclaration(decl)) {
          const i = decl.indexOf(':')
          const prop = (i < 0 ? decl : decl.slice(0, i)).trim()
          removed.push(`속성 style의 ${prop}(바깥 주소)`)
        } else {
          kept.push(decl.trim())
        }
      }
      if (kept.length === 0) el.removeAttribute(attr.name)
      else if (kept.length !== decls.length) el.setAttribute(attr.name, kept.join(';'))
    } else if (hasExternalUrl(attr.value)) {
      el.removeAttribute(attr.name)
      removed.push(`속성 ${attr.name}(바깥 주소)`)
    }
  }
}

/** 위험한 요소·속성을 걷어 낸 SVG와 걷어 낸 목록을 돌려준다. 읽지 못하면 TemplateSvgError를 던진다. */
export function sanitizeTemplateSvg(svgText: string): SanitizeResult {
  const root = parseSvg(svgText)
  const removed: string[] = []
  sanitizeNode(root, removed)
  return { svg: new XMLSerializer().serializeToString(root as never), removed }
}

function findById(node: XNode, id: string): XElement | null {
  if (isElement(node) && node.getAttribute('id') === id) return node
  for (const child of Array.from(node.childNodes)) {
    const hit = findById(child, id)
    if (hit) return hit
  }
  return null
}

function findFirst(node: XNode, name: string): XElement | null {
  for (const child of Array.from(node.childNodes)) {
    if (!isElement(child)) continue
    if (lname(child) === name) return child
    const hit = findFirst(child, name)
    if (hit) return hit
  }
  return null
}

function styleMap(el: XElement): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const k = decl.slice(0, i).trim().toLowerCase()
    const v = decl.slice(i + 1).trim()
    if (k && v) out[k] = v
  }
  return out
}

function readProp(el: XElement, prop: string): string | null {
  const fromStyle = styleMap(el)[prop]
  if (fromStyle) return fromStyle
  const attr = el.getAttribute(prop)
  return attr !== null && attr.trim() !== '' ? attr.trim() : null
}

function toNumber(v: string | null): number | null {
  if (v === null) return null
  const n = parseFloat(v.split(/[\s,]+/)[0])
  return Number.isFinite(n) ? n : null
}

const emptySlot = (found: boolean): TemplateSlot => ({
  found,
  isText: false,
  x: null,
  y: null,
  fontFamily: null,
  fontSize: null,
  fontWeight: null,
  fill: null,
  letterSpacing: null,
  textAnchor: null,
  transform: null,
  placeholder: null,
})

function readSlot(root: XElement, id: TemplateSlotName): TemplateSlot {
  const el = findById(root, id)
  if (!el) return emptySlot(false)
  const textEl = lname(el) === 'text' ? el : lname(el) === 'g' ? findFirst(el, 'text') : null
  if (!textEl) return emptySlot(true)
  const tspan = findFirst(textEl, 'tspan')
  const pick = (prop: string) => readProp(textEl, prop)
  const placeholder = (textEl.textContent ?? '').trim()
  return {
    found: true,
    isText: true,
    x: toNumber(pick('x') ?? (tspan ? readProp(tspan, 'x') : null)),
    y: toNumber(pick('y') ?? (tspan ? readProp(tspan, 'y') : null)),
    fontFamily: pick('font-family'),
    fontSize: toNumber(pick('font-size')),
    fontWeight: pick('font-weight'),
    fill: pick('fill'),
    letterSpacing: pick('letter-spacing'),
    textAnchor: pick('text-anchor'),
    transform: textEl.getAttribute('transform'),
    placeholder: placeholder === '' ? null : placeholder,
  }
}

/** 이름 자리(`name`)와 값 자리(`value`), 뿌리의 크기를 읽는다. */
export function readTemplateSlots(svgText: string): TemplateSlots {
  const root = parseSvg(svgText)
  let w: number | null = null
  let h: number | null = null
  const vb = root.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      w = parts[2]
      h = parts[3]
    }
  }
  if (w === null || h === null) {
    const ww = toNumber(root.getAttribute('width'))
    const hh = toNumber(root.getAttribute('height'))
    w = ww !== null && hh !== null ? ww : null
    h = ww !== null && hh !== null ? hh : null
  }
  return { viewBoxWidth: w, viewBoxHeight: h, name: readSlot(root, 'name'), value: readSlot(root, 'value') }
}
