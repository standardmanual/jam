/**
 * 템플릿 SVG 위에 이름·값을 캔버스로 그린다 (티켓 20261116_0555). 브라우저 전용.
 * 글자 위치·크기 계산은 composeTemplate.ts(4-1)가, 글자 그리기는 asset-generator의 drawTextLayer가 맡는다.
 */
import {
  applyColorMap,
  buildColorMap,
  extractSvgColors,
} from '@/lib/admin/activityBadgeTemplate/templateColors'
import {
  DEFAULT_TEMPLATE_BADGE_PARAMS,
  isDefaultTemplateColorParams,
  styleArcSlot,
  styleSlot,
  type TemplateBadgeParams,
} from '@/lib/admin/activityBadgeTemplate/templateParams'
import {
  layoutSlotText,
  layoutTemplateContent,
  offsetTextLayerInput,
  parseLetterSpacingEm,
  resolveTemplateFont,
  stripSlotText,
  toTextLayerInput,
} from '@/lib/admin/activityBadgeTemplate/composeTemplate'
import type { TemplateSlot, TemplateSlotName } from '@/lib/admin/activityBadgeTemplate/templateSvg'
import { isArcSlot, type TemplateArcSlot, type TemplateDefSlots } from '@/lib/admin/activityBadgeTemplate/templateDef'
import { layoutArcText } from '@/lib/admin/activityBadgeTemplate/arcText'
import { SYSTEM_DEFAULT_FONT, loadFontInBrowser } from '@/app/admin/asset-generator/assetGeneratorHelpers'
import { drawTextLayer, type Canvas2DContextLike } from '@/lib/asset-generator/render'
import type { TextLayerFont } from '@/lib/asset-generator/types'

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export interface RenderTemplateBadgeResult {
  fontFallbacks: { slot: TemplateSlotName; requestedFamily: string | null }[]
  shrunk: TemplateSlotName[]
  skipped: TemplateSlotName[]
}

export interface RenderTemplateBadgeInput {
  svg: string
  slots: TemplateDefSlots
  name: string
  value: string
  longSidePx: number
  /** 색·글자 조정값. 없으면 기본값(조정 없음)으로 본다. */
  params?: TemplateBadgeParams
}

/** 글자 하나씩 재서 더하고 글자 사이마다 자간을 더한다(drawTextLayer와 같은 방식). */
function measureWidth(ctx: CanvasRenderingContext2D, text: string, letterSpacingPx: number): number {
  const chars = Array.from(text)
  return chars.reduce((sum, ch, i) => sum + ctx.measureText(ch).width + (i < chars.length - 1 ? letterSpacingPx : 0), 0)
}

/**
 * 기준선에서 `textBaseline: 'middle'` 선까지의 거리(글자 크기 배수).
 * 같은 글자를 두 기준선으로 재서 잉크 윗변의 차이로 구한다. 글꼴 상자 값(fontBoundingBox)으로 어림하면
 * 브라우저가 실제로 쓰는 가운데 선과 어긋난다(IBM Plex Sans KR 140px에서 6px, 카리나 실측 2026-11-16).
 */
function measureMiddleOffsetEm(ctx: CanvasRenderingContext2D, fontSize: number): number {
  if (!(fontSize > 0)) return 0.35
  ctx.textBaseline = 'alphabetic'
  const fromAlphabetic = ctx.measureText('가').actualBoundingBoxAscent
  ctx.textBaseline = 'middle'
  const fromMiddle = ctx.measureText('가').actualBoundingBoxAscent
  ctx.textBaseline = 'alphabetic'
  const offset = (fromAlphabetic - fromMiddle) / fontSize
  return Number.isFinite(offset) ? offset : 0.35
}

/**
 * 그릴 글자가 든 글꼴 조각까지 불러온다. 구글 폰트의 한글은 여러 조각으로 나뉘어 있어서,
 * 글자를 주지 않고 불러오면 한글 조각이 오기 전에 그려져 다른 글꼴로 보인다.
 */
async function loadFontForText(font: TextLayerFont, text: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || text === '') return
  try {
    await document.fonts.load(`${font.weight} 16px "${font.family}"`, text)
  } catch {
    // 실패해도 기본 글꼴로 그려지면 된다.
  }
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
  const params = input.params ?? DEFAULT_TEMPLATE_BADGE_PARAMS
  let svgText = stripSlotText(input.svg)
  const { hueShift, saturation, lightness, overrides } = params.color
  if (!isDefaultTemplateColorParams(params.color)) {
    const colors = extractSvgColors(svgText).map((c) => c.color)
    svgText = applyColorMap(svgText, buildColorMap(colors, { hueShift, saturation, lightness, overrides }))
  }
  const img = await loadImage(svgToDataUrl(svgText))
  if (stale()) return result

  const viewWidth = slots.viewBoxWidth ?? img.naturalWidth
  const viewHeight = slots.viewBoxHeight ?? img.naturalHeight
  if (!(viewWidth > 0) || !(viewHeight > 0)) throw new Error('템플릿 크기를 읽지 못했어요.')
  const { canvasWidth: width, canvasHeight: height, scale, offsetX, offsetY, drawWidth, drawHeight } =
    layoutTemplateContent({ viewWidth, viewHeight, longSidePx })

  // 글꼴 불러오기는 오래 걸릴 수 있어 캔버스를 건드리기 전에 모두 끝낸다.
  type Prepared =
    | { arc: false; slotName: TemplateSlotName; text: string; font: TextLayerFont; originalFont: TextLayerFont; styled: TemplateSlot; slot: TemplateSlot }
    | { arc: true; slotName: TemplateSlotName; text: string; font: TextLayerFont; styled: TemplateArcSlot; slot: TemplateArcSlot }
  const prepared: Prepared[] = []
  for (const slotName of ['name', 'value'] as const) {
    const defSlot = slots[slotName]
    const text = slotName === 'name' ? input.name : input.value
    if (isArcSlot(defSlot)) {
      const styledArc = styleArcSlot(defSlot, params.text[slotName])
      const resolvedArc = resolveTemplateFont(styledArc)
      let arcFont = resolvedArc.font
      let arcFallback = resolvedArc.fallback
      if (!arcFallback) {
        try {
          await loadFontInBrowser(arcFont)
          await loadFontForText(arcFont, text)
        } catch {
          arcFont = { family: SYSTEM_DEFAULT_FONT.family, weight: arcFont.weight }
          arcFallback = true
        }
      }
      if (arcFallback) result.fontFallbacks.push({ slot: slotName, requestedFamily: resolvedArc.requestedFamily })
      prepared.push({ arc: true, slotName, text, font: arcFont, styled: styledArc, slot: defSlot })
      continue
    }
    const styled = styleSlot(defSlot, params.text[slotName])
    // 예시 글자의 폭은 템플릿의 원래 글꼴로 재야 가운데가 옮겨 가지 않는다.
    const original = resolveTemplateFont(defSlot)
    let originalFont = original.font
    if (!original.fallback) {
      try {
        await loadFontInBrowser(originalFont)
        await loadFontForText(originalFont, defSlot.placeholder ?? '')
      } catch {
        originalFont = { family: SYSTEM_DEFAULT_FONT.family, weight: originalFont.weight }
      }
    }
    const resolved = resolveTemplateFont(styled)
    let font = resolved.font
    let fallback = resolved.fallback
    if (!fallback) {
      try {
        await loadFontInBrowser(font)
        await loadFontForText(font, text)
      } catch {
        font = { family: SYSTEM_DEFAULT_FONT.family, weight: font.weight }
        fallback = true
      }
    }
    if (fallback) result.fontFallbacks.push({ slot: slotName, requestedFamily: resolved.requestedFamily })
    prepared.push({ arc: false, slotName, text, font, originalFont, styled, slot: defSlot })
  }
  if (stale()) return result

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 만들지 못했어요.')
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

  for (const item of prepared) {
    const { slotName, text, font } = item
    if (item.arc) {
      const { slot, styled } = item
      if (text === '') continue
      ctx.save()
      ctx.font = `${font.weight} ${styled.fontSize}px "${font.family}"`
      const chars = Array.from(text)
      const advances = chars.map((ch) => ctx.measureText(ch).width)
      const layout = layoutArcText({
        advances,
        fontSize: styled.fontSize,
        letterSpacingEm: slot.letterSpacingEm,
        cx: slot.cx,
        cy: slot.cy,
        baselineRadius: slot.baselineRadius,
        centerDeg: slot.centerDeg,
        facing: slot.facing,
        maxSpanDeg: slot.maxSpanDeg,
      })
      if (!layout) {
        result.skipped.push(slotName)
        ctx.restore()
        continue
      }
      if (layout.shrunk) result.shrunk.push(slotName)
      ctx.fillStyle = styled.fill
      ctx.font = `${font.weight} ${layout.fontSize * scale}px "${font.family}"`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      for (const glyph of layout.glyphs) {
        ctx.save()
        ctx.translate(offsetX + glyph.x * scale, offsetY + glyph.y * scale)
        ctx.rotate((glyph.rotationDeg * Math.PI) / 180)
        ctx.fillText(chars[glyph.index], 0, 0)
        ctx.restore()
      }
      ctx.restore()
      continue
    }
    const { slot, styled, originalFont } = item
    if (slot.fontSize === null || slot.y === null || styled.fontSize === null) {
      result.skipped.push(slotName)
      continue
    }
    const letterSpacingEm = parseLetterSpacingEm(slot.letterSpacing, slot.fontSize)
    // 예시 글자의 폭은 원래 글꼴·크기로, 넣을 글자의 폭은 조정한 글꼴·크기로 잰다(viewBox 단위 그대로).
    ctx.font = `${originalFont.weight} ${slot.fontSize}px "${originalFont.family}"`
    const placeholderWidth = measureWidth(ctx, slot.placeholder ?? '', letterSpacingEm * slot.fontSize)
    ctx.font = `${font.weight} ${styled.fontSize}px "${font.family}"`
    const contentWidth = measureWidth(ctx, text, letterSpacingEm * styled.fontSize)
    const layout = layoutSlotText({
      slot: { x: slot.x, textAnchor: slot.textAnchor, fontSize: styled.fontSize },
      viewWidth,
      placeholderWidth,
      contentWidth,
    })
    if (!layout) {
      result.skipped.push(slotName)
      continue
    }
    if (layout.shrunk) result.shrunk.push(slotName)
    const middleOffsetEm = measureMiddleOffsetEm(ctx, styled.fontSize)
    drawTextLayer(
      ctx as unknown as Canvas2DContextLike,
      offsetTextLayerInput(
        toTextLayerInput({
          content: text,
          font,
          color: styled.fill,
          letterSpacingEm,
          layout,
          baselineY: slot.y,
          middleOffsetEm,
          viewWidth,
          viewHeight,
          stageWidth: drawWidth,
          stageHeight: drawHeight,
        }),
        { canvasWidth: width, canvasHeight: height, offsetX, offsetY, drawWidth, drawHeight }
      )
    )
  }
  return result
}
