/**
 * 템플릿에 이름·값을 얹는 계산 (티켓 20261116_0535). 순수 모듈 — 서버·브라우저·시험에서 함께 돈다.
 * 캔버스에 실제로 그리는 일은 하지 않는다(글자 폭 재기는 호출하는 쪽 몫).
 */
import { XMLSerializer } from '@xmldom/xmldom'
import type { TextLayerFont } from '@/lib/asset-generator/types'
import type { TextLayerRenderInput } from '@/lib/asset-generator/render'
import { GOOGLE_FONT_CATALOG } from '@/lib/admin/googleFonts'
import { SYSTEM_DEFAULT_FONT } from '@/app/admin/asset-generator/assetGeneratorHelpers'
import { TEMPLATE_SLOT_NAMES, findById, findFirst, lname, parseSvg, type TemplateSlot } from './templateSvg'

/** 이름 자리·값 자리의 샘플 글자(글자 요소든 모양이든)를 걷어 낸 SVG 글자를 돌려준다. 읽지 못하면 TemplateSvgError. */
export function stripSlotText(svgText: string): string {
  const root = parseSvg(svgText)
  for (const id of TEMPLATE_SLOT_NAMES) {
    const el = findById(root, id)
    if (!el) continue
    const tag = lname(el)
    const textEl = tag === 'text' ? el : tag === 'g' ? findFirst(el, 'text') : null
    const target = textEl ?? el
    if (target.parentNode) target.parentNode.removeChild(target)
  }
  return new XMLSerializer().serializeToString(root as never)
}

/** 'bold'→700, 'normal'→400, 숫자→100 단위로 맞춘 100~900, 그 밖·null→400 */
export function parseFontWeight(v: string | null): number {
  if (v === null) return 400
  const t = v.trim().toLowerCase()
  if (t === 'bold') return 700
  if (t === 'normal') return 400
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Math.round(parseFloat(t) / 100) * 100
    return Math.min(900, Math.max(100, n))
  }
  return 400
}

/** 글자 크기 대비 자간 배수. 'em'은 그대로, px·단위 없음은 fontSize로 나눈다. */
export function parseLetterSpacingEm(v: string | null, fontSize: number | null): number {
  if (v === null) return 0
  const t = v.trim().toLowerCase()
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return 0
  if (t.endsWith('em')) return n
  if (!fontSize || fontSize <= 0) return 0
  return n / fontSize
}

export interface ResolvedTemplateFont {
  font: TextLayerFont
  requestedFamily: string | null
  fallback: boolean
}

export function resolveTemplateFont(slot: Pick<TemplateSlot, 'fontFamily' | 'fontWeight'>): ResolvedTemplateFont {
  const weight = parseFontWeight(slot.fontWeight)
  const first = slot.fontFamily?.split(',')[0]?.trim().replace(/^['"]+|['"]+$/g, '').trim() ?? ''
  const requestedFamily = first === '' ? null : first
  if (requestedFamily) {
    const lower = requestedFamily.toLowerCase()
    const hit = GOOGLE_FONT_CATALOG.find((e) => e.family.toLowerCase() === lower)
    if (hit) return { font: { family: hit.family, weight }, requestedFamily, fallback: false }
  }
  return { font: { family: SYSTEM_DEFAULT_FONT.family, weight }, requestedFamily, fallback: true }
}

export interface SlotLayout {
  anchorX: number
  fontSizePx: number
  shrunk: boolean
}

/** 단위는 SVG viewBox 단위. 폭 두 개는 자리의 원래 글자 크기로 잰 값이다. */
export function layoutSlotText(input: {
  slot: Pick<TemplateSlot, 'x' | 'fontSize' | 'textAnchor' | 'maxWidth'>
  viewWidth: number
  placeholderWidth: number
  contentWidth: number
}): SlotLayout | null {
  const { slot, viewWidth, placeholderWidth, contentWidth } = input
  if (slot.x === null || slot.fontSize === null) return null
  const anchorX =
    slot.textAnchor === 'middle'
      ? slot.x
      : slot.textAnchor === 'end'
        ? slot.x - placeholderWidth / 2
        : slot.x + placeholderWidth / 2
  const maxWidth =
    slot.maxWidth != null && slot.maxWidth > 0
      ? slot.maxWidth
      : 2 * Math.min(anchorX, viewWidth - anchorX) * 0.92
  if (maxWidth > 0 && contentWidth > maxWidth) {
    return { anchorX, fontSizePx: (slot.fontSize * maxWidth) / contentWidth, shrunk: true }
  }
  return { anchorX, fontSizePx: slot.fontSize, shrunk: false }
}

export function toTextLayerInput(input: {
  content: string
  font: TextLayerFont
  color: string | null
  letterSpacingEm: number
  layout: SlotLayout
  baselineY: number
  middleOffsetEm: number
  viewWidth: number
  viewHeight: number
  stageWidth: number
  stageHeight: number
}): TextLayerRenderInput {
  const { layout, viewWidth, viewHeight } = input
  return {
    content: input.content,
    font: input.font,
    sizePct: (layout.fontSizePx / Math.min(viewWidth, viewHeight)) * 100,
    letterSpacing: input.letterSpacingEm,
    lineHeight: 1,
    align: 'center',
    color: input.color ?? '#000000',
    xPct: (layout.anchorX / viewWidth) * 100,
    yPct: ((input.baselineY - input.middleOffsetEm * layout.fontSizePx) / viewHeight) * 100,
    rotationDeg: 0,
    opacityPct: 100,
    stageWidth: input.stageWidth,
    stageHeight: input.stageHeight,
  }
}

/** 이미지 생성 메뉴의 규격(normalize.ts의 BOX_PX ÷ CANVAS_PX)과 같은 값이다 */
export const TEMPLATE_CONTENT_BOX_RATIO = 870 / 1024

export interface TemplateContentLayout {
  canvasWidth: number
  canvasHeight: number
  /** viewBox 좌표에 곱하는 배율 */
  scale: number
  offsetX: number
  offsetY: number
  drawWidth: number
  drawHeight: number
}

/**
 * 안쪽 상자(drawWidth×drawHeight) 기준으로 만든 글자 입력을, 캔버스 전체(canvasWidth×canvasHeight) 기준으로 바꾼다.
 * `drawTextLayer`는 `setTransform`으로 위치를 절대 좌표로 정하기 때문에 `ctx.translate`로는 상자의 여백을 더할 수 없다.
 * 그래서 위치와 크기를 퍼센트 단위에서 다시 계산한다.
 */
export function offsetTextLayerInput(
  input: TextLayerRenderInput,
  box: Pick<TemplateContentLayout, 'canvasWidth' | 'canvasHeight' | 'offsetX' | 'offsetY' | 'drawWidth' | 'drawHeight'>
): TextLayerRenderInput {
  const sizePx = (input.sizePct / 100) * Math.min(box.drawWidth, box.drawHeight)
  const cx = box.offsetX + (input.xPct / 100) * box.drawWidth
  const cy = box.offsetY + (input.yPct / 100) * box.drawHeight
  return {
    ...input,
    stageWidth: box.canvasWidth,
    stageHeight: box.canvasHeight,
    sizePct: (sizePx / Math.min(box.canvasWidth, box.canvasHeight)) * 100,
    xPct: (cx / box.canvasWidth) * 100,
    yPct: (cy / box.canvasHeight) * 100,
  }
}

/** 정사각형 캔버스 한가운데의 안쪽 상자에 그림을 맞춘다. 값을 반올림하지 않는다. */
export function layoutTemplateContent(input: {
  viewWidth: number
  viewHeight: number
  longSidePx: number
}): TemplateContentLayout {
  const { viewWidth, viewHeight, longSidePx } = input
  const scale = (longSidePx * TEMPLATE_CONTENT_BOX_RATIO) / Math.max(viewWidth, viewHeight)
  const drawWidth = viewWidth * scale
  const drawHeight = viewHeight * scale
  return {
    canvasWidth: longSidePx,
    canvasHeight: longSidePx,
    scale,
    offsetX: (longSidePx - drawWidth) / 2,
    offsetY: (longSidePx - drawHeight) / 2,
    drawWidth,
    drawHeight,
  }
}
