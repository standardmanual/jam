/**
 * 액티비티 배지 템플릿 SVG를 읽는 순수 모듈 (티켓 20261116_0234, 정리 20261116_1513).
 * `@xmldom/xmldom`으로 읽고 써서 서버·브라우저·시험(node)에서 같은 코드가 돈다.
 */
import { DOMParser } from '@xmldom/xmldom'

export const TEMPLATE_SLOT_NAMES = ['name', 'value'] as const
export type TemplateSlotName = (typeof TEMPLATE_SLOT_NAMES)[number]

export type TemplateSvgErrorCode = 'INVALID_XML' | 'NOT_SVG'

export class TemplateSvgError extends Error {
  readonly code: TemplateSvgErrorCode
  constructor(code: TemplateSvgErrorCode, message: string) {
    super(message)
    this.name = 'TemplateSvgError'
    this.code = code
  }
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
  /** viewBox 단위의 글자 폭 상한. 없으면 가운데 축에서 잰 기본 규칙을 쓴다 */
  maxWidth?: number | null
}

// xmldom 타입은 DOM 전체가 아니라 필요한 만큼만 구조적으로 쓴다.
export interface XNode {
  nodeType: number
  localName?: string | null
  nodeName: string
  textContent: string | null
  childNodes: ArrayLike<XNode>
  parentNode: XNode | null
  removeChild(child: XNode): XNode
}
interface XAttr {
  name: string
  value: string
}
export interface XElement extends XNode {
  attributes: ArrayLike<XAttr>
  getAttribute(name: string): string | null
  removeAttribute(name: string): void
  setAttribute(name: string, value: string): void
}

const ELEMENT_NODE = 1

function isElement(n: XNode): n is XElement {
  return n.nodeType === ELEMENT_NODE
}

export const lname = (n: XNode) => (n.localName ?? n.nodeName).toLowerCase()

export function parseSvg(svgText: string): XElement {
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

export function findById(node: XNode, id: string): XElement | null {
  if (isElement(node) && node.getAttribute('id') === id) return node
  for (const child of Array.from(node.childNodes)) {
    const hit = findById(child, id)
    if (hit) return hit
  }
  return null
}

export function findFirst(node: XNode, name: string): XElement | null {
  for (const child of Array.from(node.childNodes)) {
    if (!isElement(child)) continue
    if (lname(child) === name) return child
    const hit = findFirst(child, name)
    if (hit) return hit
  }
  return null
}
