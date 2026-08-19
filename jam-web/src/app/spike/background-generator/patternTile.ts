/**
 * 패턴 모드 타일 합성 유틸 (20260819_001 스파이크, 20260819_003에서 오프셋 재정의).
 *
 * 6종 옵션 중 "그리드 수"만 순수 CSS(background-size)로 라이브 적용하고, 나머지("오프셋" —
 * 행간격/열간격, "대칭반복", "이미지 크기", "Row/Column stagger", "회전")는 반복 가능한 최소
 * 단위(repeat unit)를 캔버스에 한 번 구운 뒤 그 타일을 `background-repeat: repeat`로 반복시킨다.
 * — CSS의 background-repeat만으로는 한 레이어 안에서 행마다 다른 가로 오프셋을 줄 수 없어(벽돌쌓기),
 *   반복 단위 자체를 2칸 폭/높이로 구워 넣는 방식을 택했다. (완료 기록에 기술적 판단으로 기록)
 *   "오프셋"(행 사이 간격·열 사이 간격)도 타일을 밀어내는 대신 이 그룹에 편입해, 셀 안에서
 *   이미지가 그려지는 크기를 줄여 여백을 만드는 방식으로 굽는다 — 이전에 별도 CSS
 *   background-position으로 타일 전체를 라이브 이동시키던 방식은 제거했다.
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
  const { mirror, rowGap, colGap, rotation, imageScale, rowStagger, colStagger } = params
  const unitCols = (mirror ? 2 : 1) * (colStagger ? 2 : 1)
  const unitRows = (mirror ? 2 : 1) * (rowStagger ? 2 : 1)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(tilePitchX * unitCols))
  canvas.height = Math.max(1, Math.round(tilePitchY * unitRows))
  const ctx = canvas.getContext('2d')
  if (!ctx || image.naturalWidth === 0) return canvas

  // 열 사이 간격(colGap)은 셀 가로폭을, 행 사이 간격(rowGap)은 셀 세로폭을 줄여 여백을 만든다.
  // 주의: drawW는 오직 cellW(→ colGap)에서만, drawH는 오직 cellH(→ rowGap)에서만 파생돼야 두 슬라이더가
  // 서로 독립적으로 동작한다. 과거에는 image.naturalWidth/naturalHeight 비율을 유지하며 cellW/cellH
  // 박스에 맞춰 넣는(letterbox fit) 방식을 썼는데, 그 경우 두 축 중 더 좁은 쪽(min)이 실제 그려지는
  // 크기를 "동시에" 결정해버려 — 예를 들어 rowGap만 늘려도 cellH가 좁아지며 세로 축이 fit을 제한하게
  // 되면 그 비율을 유지하기 위해 drawW까지 함께 줄어들었다(20260819_004에서 발견한 버그의 원인).
  // 두 슬라이더 독립성을 보장하기 위해 종횡비를 보존하지 않고 각 축을 셀 크기에 그대로 맞춘다.
  const cellW = Math.max(1, tilePitchX - colGap)
  const cellH = Math.max(1, tilePitchY - rowGap)

  const drawW = cellW * imageScale
  const drawH = cellH * imageScale

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

export function flattenPattern(tileCanvas: HTMLCanvasElement, outWidth: number, outHeight: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(outWidth))
  canvas.height = Math.max(1, Math.round(outHeight))
  const ctx = canvas.getContext('2d')
  if (!ctx || tileCanvas.width === 0 || tileCanvas.height === 0) return canvas

  const tw = tileCanvas.width
  const th = tileCanvas.height

  for (let y = 0; y < canvas.height; y += th) {
    for (let x = 0; x < canvas.width; x += tw) {
      ctx.drawImage(tileCanvas, x, y)
    }
  }

  return canvas
}
