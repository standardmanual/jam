/**
 * JAM! 에셋 제너레이터 — 텍스트 오른쪽 여백 넘침 검사 (티켓 20260926_2346, 테스트를 위해 분리 20261007_1600)
 *
 * `apply-mission-images.mjs`는 import하면 바로 실행되므로, 단위 테스트가 부를 수 있게 검사 함수만 이 파일로 옮겼다. 동작은 같다.
 */
import { drawTextLayer } from '../../src/lib/asset-generator/render'
import { isSystemDefaultFont, resolveStageSize } from '../../src/app/admin/asset-generator/assetGeneratorHelpers'

import { createServerFontLoader } from './fonts.mjs'
import { applyLayerValues } from './applyLayerValues.mjs'
import { serverCanvasFactory, getServerContext } from './serverCanvas'

/** 텍스트 오른쪽 여백 검사 폭(가로 비율) — 이 안에 글자가 닿으면 넘친 것으로 본다(티켓 20260926_2346). */
const RIGHT_MARGIN_RATIO = 0.03

/**
 * 텍스트 레이어만 빈 캔버스에 그려 오른쪽 여백(가로 3%)에 불투명 픽셀이 닿는지 본다.
 * 리본·이미지 레이어는 그리지 않아 글자 위치만 알파로 남는다.
 */
export function createTextOverflowDetector(loadPreset) {
  const loadFont = createServerFontLoader()
  return async ({ presetId, values }) => {
    const preset = await loadPreset(presetId)
    const { width, height } = resolveStageSize(preset.stageRatio)
    const canvas = serverCanvasFactory(width, height)
    const ctx = getServerContext(canvas)
    const layers = applyLayerValues(preset.layers, values).layers.filter((layer) => layer.type === 'text')
    for (const layer of layers) {
      if (!isSystemDefaultFont(layer.font)) await loadFont(layer.font)
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      drawTextLayer(ctx, {
        content: layer.content,
        font: layer.font,
        sizePct: layer.sizePct,
        letterSpacing: layer.letterSpacing,
        lineHeight: layer.lineHeight,
        align: layer.align,
        color: layer.color,
        xPct: layer.xPct,
        yPct: layer.yPct,
        rotationDeg: layer.rotationDeg,
        opacityPct: layer.opacityPct,
        stageWidth: width,
        stageHeight: height,
      })
    }
    const marginStart = Math.floor(width * (1 - RIGHT_MARGIN_RATIO))
    const data = ctx.getImageData(marginStart, 0, width - marginStart, height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 8) return true
    }
    return false
  }
}
