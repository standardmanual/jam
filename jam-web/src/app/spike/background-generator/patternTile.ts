/**
 * 패턴 모드 타일 합성 유틸 (20260819_001 스파이크, 20260819_003에서 오프셋 재정의,
 * 20260819_005에서 간격↔이미지 크기 독립성 원칙으로 재수정).
 *
 * 6종 옵션 중 "그리드 수"만 순수 CSS(background-size)로 라이브 적용하고, 나머지("오프셋" —
 * 행간격/열간격, "대칭반복", "이미지 크기", "Row/Column stagger", "회전")는 반복 가능한 최소
 * 단위(repeat unit)를 캔버스에 한 번 구운 뒤 그 타일을 `background-repeat: repeat`로 반복시킨다.
 * — CSS의 background-repeat만으로는 한 레이어 안에서 행마다 다른 가로 오프셋을 줄 수 없어(벽돌쌓기),
 *   반복 단위 자체를 2칸 폭/높이로 구워 넣는 방식을 택했다. (완료 기록에 기술적 판단으로 기록)
 *
 * "오프셋"(행 사이 간격·열 사이 간격)의 원칙(20260819_005): **간격을 조정해도 이미지 자체의
 * 그려지는 크기는 절대 바뀌지 않는다.** 간격은 이미지와 이미지 사이에 여백을 추가/제거하는
 * 것이지, 셀을 줄여서 그 안에 이미지를 다시 맞춰 넣는 것이 아니다. 그래서 간격은 "반복 주기
 * (타일 피치)를 늘리는" 방식으로 구현한다 — 타일 피치 = 이미지 그려지는 크기 + 간격. 이미지는
 * 이 피치 박스 안에서 고정된 크기 그대로 그려지고, 늘어난 만큼의 공간은 투명하게 비워둔다.
 * (20260819_004는 반대로 "간격만큼 셀을 줄이고 그 줄어든 셀에 이미지를 다시 스케일"하는
 * 방식이었는데, 이 경우 간격을 늘릴수록 이미지 자체가 작아지는 근본적인 버그가 있었다.)
 *
 * `flattenPattern`은 동일한 타일을 미리보기 박스 크기만큼 반복해서 한 장의 평면 이미지로 만든다.
 * Paper 필터(@paper-design/shaders-react)는 image prop 하나만 받으므로, CSS 미리보기와 동일한
 * 결과물을 필터에 그대로 흘려보내기 위해 사용한다.
 */
import type { PatternParams } from './types'

export function buildTileCanvas(
  image: HTMLImageElement,
  baseCellW: number,
  baseCellH: number,
  params: PatternParams
): HTMLCanvasElement {
  const { mirror, rowGap, colGap, rotation, imageScale, rowStagger, colStagger } = params
  const unitCols = (mirror ? 2 : 1) * (colStagger ? 2 : 1)
  const unitRows = (mirror ? 2 : 1) * (rowStagger ? 2 : 1)

  // 이미지가 그려지는 크기(drawW/drawH)는 오직 "그리드 수가 정하는 기준 셀 크기(baseCellW/H) ×
  // 이미지 크기 조절(imageScale)"에서만 파생된다. rowGap/colGap은 이 계산에 절대 관여하지 않는다.
  const drawW = baseCellW * imageScale
  const drawH = baseCellH * imageScale

  // 간격은 셀을 줄이는 대신 반복 주기(타일 피치)를 늘리는 방식으로 만든다: 열 방향 피치 =
  // 이미지 가로 크기 + colGap, 행 방향 피치 = 이미지 세로 크기 + rowGap. 두 슬라이더가 서로
  // 다른 축의 피치만 늘리므로 독립적으로 동작하고, 이미지 자체 크기(drawW/drawH)는 두 슬라이더
  // 어느 쪽을 움직여도 변하지 않는다.
  const pitchX = drawW + colGap
  const pitchY = drawH + rowGap

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(pitchX * unitCols))
  canvas.height = Math.max(1, Math.round(pitchY * unitRows))
  const ctx = canvas.getContext('2d')
  if (!ctx || image.naturalWidth === 0) return canvas

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
      const shiftX = rowStagger && j % 2 === 1 ? pitchX / 2 : 0
      const shiftY = colStagger && i % 2 === 1 ? pitchY / 2 : 0

      const baseCenterX = i * pitchX + pitchX / 2
      const baseCenterY = j * pitchY + pitchY / 2
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
