/**
 * 3D 모드 스테이지 합성 (티켓 20261103_1735)
 *
 * 미리보기와 PNG 저장이 같은 순서로 쌓는다 — Shape 모드의 합성(셰이더가 배경+형상에 그레인을 더한 뒤 오버레이 레이어를 얹음)과 같다.
 *   1) 배경(단색·그라데이션, Transparent면 비움)
 *   2) 3D 이미지(WebGL 캔버스)
 *   3) 그레인(배경과 3D 이미지 모두에. 알파가 0인 픽셀은 건드리지 않아 Transparent 배경은 계속 투명하다)
 *   4) 오버레이 레이어(이미지·텍스트) — 그레인 위에 얹어 글자·이미지에는 그레인이 끼지 않는다
 * 캔버스·WebGL 객체는 받은 컨텍스트로만 다루므로 가짜 컨텍스트로 순서를 시험할 수 있다.
 */
import {
  grainCellPx,
  grainNoise,
  type BackgroundPlan,
  type CanvasRatio,
} from './logo3dConfig'

/**
 * PNG 저장 크기. 에셋 Export 크기(`size`)는 긴 변이고, 짧은 변은 Canvas 비율로 정한다(Shape 모드의 `exportPng`와 같은 식).
 */
export function exportSizeFor(size: number, ratio: CanvasRatio): { width: number; height: number } {
  const [a, b] = ratio.split(':').map(Number)
  return a >= b
    ? { width: size, height: Math.round((size * b) / a) }
    : { width: Math.round((size * a) / b), height: size }
}

/** 배경 계획을 2D 캔버스에 칠한다. 투명이면 지우기만 해 배경 픽셀 알파가 0으로 남는다. */
export function paintBackground(ctx: CanvasRenderingContext2D, plan: BackgroundPlan, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height)
  if (plan.kind === 'transparent') return
  if (plan.kind === 'solid') {
    ctx.fillStyle = plan.color
  } else {
    const gradient = ctx.createLinearGradient(plan.x0, plan.y0, plan.x1, plan.y1)
    for (const stop of plan.stops) gradient.addColorStop(stop.offset, stop.color)
    ctx.fillStyle = gradient
  }
  ctx.fillRect(0, 0, width, height)
}

// 칸(grain cell)별 잡음은 크기·세기가 같으면 매 프레임 같다 — 드래그 중 다시 계산하지 않도록 마지막 한 벌을 들고 있는다.
let cellNoiseCache: { key: string; cols: number; data: Int8Array } | null = null

function cellNoise(width: number, height: number, grainPct: number): { cell: number; cols: number; data: Int8Array } {
  const cell = grainCellPx(height)
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  const key = `${cell}:${cols}:${rows}:${grainPct}`
  if (cellNoiseCache?.key !== key) {
    const data = new Int8Array(cols * rows)
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) data[cy * cols + cx] = Math.round(grainNoise(cx, cy, grainPct) * 255)
    }
    cellNoiseCache = { key, cols, data }
  }
  return { cell, cols: cellNoiseCache.cols, data: cellNoiseCache.data }
}

type ImageDataContext = Pick<CanvasRenderingContext2D, 'getImageData' | 'putImageData'>

/** 그린 결과에 그레인을 더한다. 에셋 셰이더처럼 한 칸마다 같은 잡음을 R·G·B에 더하고, 알파가 0인 픽셀과 알파 값은 그대로 둔다. */
export function addGrain(ctx: ImageDataContext, width: number, height: number, grainPct: number): void {
  if (grainPct <= 0) return
  const { cell, cols, data: noise } = cellNoise(width, height, grainPct)
  const image = ctx.getImageData(0, 0, width, height)
  const px = image.data
  for (let y = 0; y < height; y++) {
    const rowBase = Math.floor(y / cell) * cols
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (px[i + 3] === 0) continue
      const add = noise[rowBase + Math.floor(x / cell)]
      px[i] += add
      px[i + 1] += add
      px[i + 2] += add
    }
  }
  ctx.putImageData(image, 0, 0)
}

export type StageComposeInput = {
  width: number
  height: number
  background: BackgroundPlan
  /** 3D 렌더 결과(WebGL 캔버스). 형상이 아직 없으면 null. */
  logo: CanvasImageSource | null
  /** 에셋 그레인(0~20 %). 0이면 입히지 않는다. */
  grainPct: number
  /** 오버레이 레이어를 그린다. 위치·크기는 받은 (width, height) 기준이다. */
  drawOverlays?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
}

/** 배경 → 3D → 그레인 → 오버레이 순으로 캔버스 한 장을 만든다. */
export function composeStage(ctx: CanvasRenderingContext2D, input: StageComposeInput): void {
  const { width, height } = input
  paintBackground(ctx, input.background, width, height)
  if (input.logo) ctx.drawImage(input.logo, 0, 0, width, height)
  if (input.grainPct > 0) addGrain(ctx, width, height, input.grainPct)
  input.drawOverlays?.(ctx, width, height)
}
