/**
 * 템플릿 SVG 위에 이름·값을 캔버스로 그린다 (티켓 20261116_0555). 브라우저 전용.
 * 글자 위치·크기 계산은 composeTemplate.ts(4-1)가, 글자 그리기는 asset-generator의 drawTextLayer가 맡는다.
 */
import {
  layoutSlotText,
  parseLetterSpacingEm,
  resolveTemplateFont,
  stripSlotText,
  toTextLayerInput,
} from '@/lib/admin/activityBadgeTemplate/composeTemplate'
import type { TemplateSlotName, TemplateSlots } from '@/lib/admin/activityBadgeTemplate/templateSvg'
import { SYSTEM_DEFAULT_FONT, loadFontInBrowser } from '@/app/admin/asset-generator/assetGeneratorHelpers'
import { drawTextLayer, type Canvas2DContextLike } from '@/lib/asset-generator/render'
import type { TextLayerFont } from '@/lib/asset-generator/types'
import { svgToDataUrl } from './TemplateCard'

export interface RenderTemplateBadgeResult {
  fontFallbacks: { slot: TemplateSlotName; requestedFamily: string | null }[]
  shrunk: TemplateSlotName[]
  skipped: TemplateSlotName[]
}

export interface RenderTemplateBadgeInput {
  svg: string
  slots: TemplateSlots
  name: string
  value: string
  longSidePx: number
}

/** 글자 하나씩 재서 더하고 글자 사이마다 자간을 더한다(drawTextLayer와 같은 방식). */
function measureWidth(ctx: CanvasRenderingContext2D, text: string, letterSpacingPx: number): number {
  const chars = Array.from(text)
  return chars.reduce((sum, ch, i) => sum + ctx.measureText(ch).width + (i < chars.length - 1 ? letterSpacingPx : 0), 0)
}

/** 기준선에서 글자 상자 가운데까지의 거리(글자 크기 배수) */
function measureMiddleOffsetEm(ctx: CanvasRenderingContext2D, fontSize: number): number {
  ctx.textBaseline = 'alphabetic'
  const m = ctx.measureText('가')
  if (m.emHeightAscent !== undefined && m.emHeightDescent !== undefined && fontSize > 0) {
    return (m.emHeightAscent - m.emHeightDescent) / 2 / fontSize
  }
  if (m.fontBoundingBoxAscent !== undefined && m.fontBoundingBoxDescent !== undefined && fontSize > 0) {
    return (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 / fontSize
  }
  return 0.35
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('템플릿 이미지를 불러오지 못했어요.'))
    img.src = src
  })
}

// 같은 캔버스에 그리기가 겹치지 않게 캔버스마다 요청 번호를 둔다. 기다린 뒤 번호가 바뀌었으면 그리지 않는다.
const requestIds = new WeakMap<HTMLCanvasElement, number>()

export async function renderTemplateBadge(
  canvas: HTMLCanvasElement,
  input: RenderTemplateBadgeInput
): Promise<RenderTemplateBadgeResult> {
  const myId = (requestIds.get(canvas) ?? 0) + 1
  requestIds.set(canvas, myId)
  const stale = () => requestIds.get(canvas) !== myId
  const result: RenderTemplateBadgeResult = { fontFallbacks: [], shrunk: [], skipped: [] }

  const { slots, longSidePx } = input
  const img = await loadImage(svgToDataUrl(stripSlotText(input.svg)))
  if (stale()) return result

  const viewWidth = slots.viewBoxWidth ?? img.naturalWidth
  const viewHeight = slots.viewBoxHeight ?? img.naturalHeight
  if (!(viewWidth > 0) || !(viewHeight > 0)) throw new Error('템플릿 크기를 읽지 못했어요.')
  const scale = longSidePx / Math.max(viewWidth, viewHeight)
  const width = Math.max(1, Math.round(viewWidth * scale))
  const height = Math.max(1, Math.round(viewHeight * scale))

  // 글꼴 불러오기는 오래 걸릴 수 있어 캔버스를 건드리기 전에 모두 끝낸다.
  const prepared: { slotName: TemplateSlotName; text: string; font: TextLayerFont }[] = []
  for (const slotName of ['name', 'value'] as const) {
    const resolved = resolveTemplateFont(slots[slotName])
    let font = resolved.font
    let fallback = resolved.fallback
    if (!fallback) {
      try {
        await loadFontInBrowser(font)
      } catch {
        font = { family: SYSTEM_DEFAULT_FONT.family, weight: font.weight }
        fallback = true
      }
    }
    if (fallback) result.fontFallbacks.push({ slot: slotName, requestedFamily: resolved.requestedFamily })
    prepared.push({ slotName, text: slotName === 'name' ? input.name : input.value, font })
  }
  if (stale()) return result

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 만들지 못했어요.')
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  for (const { slotName, text, font } of prepared) {
    const slot = slots[slotName]
    if (slot.fontSize === null || slot.y === null) {
      result.skipped.push(slotName)
      continue
    }
    const letterSpacingEm = parseLetterSpacingEm(slot.letterSpacing, slot.fontSize)
    // 폭은 viewBox 단위 그대로의 글자 크기로 잰다.
    ctx.font = `${font.weight} ${slot.fontSize}px "${font.family}"`
    const spacingPx = letterSpacingEm * slot.fontSize
    const placeholderWidth = measureWidth(ctx, slot.placeholder ?? '', spacingPx)
    const contentWidth = measureWidth(ctx, text, spacingPx)
    const layout = layoutSlotText({ slot, viewWidth, placeholderWidth, contentWidth })
    if (!layout) {
      result.skipped.push(slotName)
      continue
    }
    if (layout.shrunk) result.shrunk.push(slotName)
    const middleOffsetEm = measureMiddleOffsetEm(ctx, slot.fontSize)
    drawTextLayer(
      ctx as unknown as Canvas2DContextLike,
      toTextLayerInput({
        content: text,
        font,
        color: slot.fill,
        letterSpacingEm,
        layout,
        baselineY: slot.y,
        middleOffsetEm,
        viewWidth,
        viewHeight,
        stageWidth: width,
        stageHeight: height,
      })
    )
  }
  return result
}
