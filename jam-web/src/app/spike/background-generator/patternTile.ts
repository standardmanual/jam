/**
 * 패턴 모드 타일 합성 유틸 (20260819_001 스파이크).
 *
 * 7종 옵션 중 "그리드 수"와 "오프셋"은 순수 CSS(background-size/background-position)로 라이브
 * 적용하고, 나머지("대칭반복", "이미지 크기", "Gap", "Row/Column stagger", "회전")는 반복 가능한
 * 최소 단위(repeat unit)를 캔버스에 한 번 구운 뒤 그 타일을 `background-repeat: repeat`로 반복시킨다.
 * — CSS의 background-repeat만으로는 한 레이어 안에서 행마다 다른 가로 오프셋을 줄 수 없어(벽돌쌓기),
 *   반복 단위 자체를 2칸 폭/높이로 구워 넣는 방식을 택했다. (완료 기록에 기술적 판단으로 기록)
 *
 * `flattenPattern`은 동일한 타일을 미리보기 박스 크기만큼 반복해서 한 장의 평면 이미지로 만든다.
 * Paper 필터(@paper-design/shaders-react)는 image prop 하나만 받으므로, CSS 미리보기와 동일한
 * 결과물을 필터에 그대로 흘려보내기 위해 사용한다.
 */
import type { PatternParams } from './types'

export function buildTileCanvas(
  image: HTMLImageElement,
  tilePitchX: number,
  tilePitchY: number,
  params: PatternParams
): HTMLCanvasElement {
  const { mirror, gap, rotation, imageScale, rowStagger, colStagger } = params
  const unitCols = (mirror ? 2 : 1) * (colStagger ? 2 : 1)
  const unitRows = (mirror ? 2 : 1) * (rowStagger ? 2 : 1)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(tilePitchX * unitCols))
  canvas.height = Math.max(1, Math.round(tilePitchY * unitRows))
  const ctx = canvas.getContext('2d')
  if (!ctx || image.naturalWidth === 0) return canvas

  const cellW = Math.max(1, tilePitchX - gap)
  const cellH = Math.max(1, tilePitchY - gap)
  const aspect = image.naturalWidth / image.naturalHeight

  let drawW = cellW
  let drawH = cellW / aspect
  if (drawH > cellH) {
    drawH = cellH
    drawW = cellH * aspect
  }
  drawW *= imageScale
  drawH *= imageScale

  const drawCell = (centerX: number, centerY: number, flipX: boolean, flipY: boolean) => {
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
  }

  for (let j = 0; j < unitRows; j++) {
    for (let i = 0; i < unitCols; i++) {
      const flipX = mirror && i % 2 === 1
      const flipY = mirror && j % 2 === 1
      const shiftX = rowStagger && j % 2 === 1 ? tilePitchX / 2 : 0
      const shiftY = colStagger && i % 2 === 1 ? tilePitchY / 2 : 0

      const baseCenterX = i * tilePitchX + tilePitchX / 2
      const baseCenterY = j * tilePitchY + tilePitchY / 2
      const cx = baseCenterX + shiftX
      const cy = baseCenterY + shiftY

      drawCell(cx, cy, flipX, flipY)
      // 스태거로 유닛 경계를 넘어가는 부분을 반대편에도 그려 이음매 없이 반복되게 한다
      if (shiftX > 0) drawCell(cx - canvas.width, cy, flipX, flipY)
      if (shiftY > 0) drawCell(cx, cy - canvas.height, flipX, flipY)
      if (shiftX > 0 && shiftY > 0) drawCell(cx - canvas.width, cy - canvas.height, flipX, flipY)
    }
  }

  return canvas
}

export function flattenPattern(
  tileCanvas: HTMLCanvasElement,
  outWidth: number,
  outHeight: number,
  offsetX: number,
  offsetY: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(outWidth))
  canvas.height = Math.max(1, Math.round(outHeight))
  const ctx = canvas.getContext('2d')
  if (!ctx || tileCanvas.width === 0 || tileCanvas.height === 0) return canvas

  const tw = tileCanvas.width
  const th = tileCanvas.height
  const offX = ((offsetX % tw) + tw) % tw
  const offY = ((offsetY % th) + th) % th

  for (let y = offY - th; y < canvas.height; y += th) {
    for (let x = offX - tw; x < canvas.width; x += tw) {
      ctx.drawImage(tileCanvas, x, y)
    }
  }

  return canvas
}
