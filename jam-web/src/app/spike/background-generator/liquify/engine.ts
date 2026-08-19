/**
 * 리퀴드 왜곡(liquify) 애니메이션 엔진.
 *
 * 출처: collidingScopes/liquify (https://github.com/collidingScopes/liquify) — liquify.js
 * MIT 라이선스(Alan Ang). 원본은 dat.gui/비디오 녹화/몬드리안 배경 등 데모 사이트 전용 기능을
 * 대량으로 포함하고 있어 전체를 가져오지 않고, "리퀴드 왜곡류 애니메이션"에 필요한 핵심 로직만
 * 발췌해 TypeScript 클래스로 이식했다 (20260819_001 스파이크):
 *   - liquify(x, y): 마우스 속도 기반 픽셀 스미어(smear) — 원본 그대로 이식, 로직 변경 없음
 *   - startGenerativeDraw()의 loop(): Perlin 노이즈로 브러시 중심을 자동으로 소용돌이 이동시키는
 *     제너레이티브 애니메이션 — 원본 그대로 이식, 로직 변경 없음
 *   - generatePerlinData(): 소용돌이 방향을 결정하는 Perlin 노이즈 그리드 사전 계산 — 원본 그대로 이식
 * 가져오지 않은 것: dat.gui 컨트롤 패널, 비디오 녹화(mp4-muxer), 몬드리안/그라디언트 배경 생성,
 * 마우스 드래그 수동 스미어 UI 배선(이 스파이크는 자동 재생 애니메이션만 다룬다).
 */
import { Perlin } from './perlin'

export interface LiquifyParams {
  /** 브러시 크기 (px) */
  brushSize: number
  /** 브러시 밀도 (1~100, %) — 값이 클수록 스미어 전이 반경이 넓어진다 */
  brushDensity: number
  /** 브러시 불투명도 (5~100, %) — 원본 픽셀과 왜곡된 픽셀의 블렌드 비율 */
  opacity: number
  /** 애니메이션 속도 (1~50) */
  speed: number
}

const GRID_SIZE = 3
const RESOLUTION = 128
const NUM_PERLIN_COLS = GRID_SIZE * RESOLUTION
const NUM_PERLIN_ROWS = GRID_SIZE * RESOLUTION

export class LiquifyEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private params: LiquifyParams
  private perlin = new Perlin()
  private perlinData: Float32Array
  private rafId: number | null = null
  private playing = false

  // startGenerativeDraw() 루프 상태
  private cx = 0
  private cy = 0
  private direction = 1
  private counter = 0
  private angle = 0
  private angleBias = Math.random() - 0.5

  // liquify(x, y) 스미어 상태 (마우스 속도 계산용)
  private oldMouseX = 0
  private oldMouseY = 0

  constructor(canvas: HTMLCanvasElement, params: LiquifyParams) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D 캔버스 컨텍스트를 가져올 수 없습니다.')
    this.ctx = ctx
    this.params = params
    this.perlinData = this.generatePerlinData()
    this.randomizeStartPoint()
  }

  setParams(params: LiquifyParams): void {
    this.params = params
  }

  private get animationSpeed(): number {
    return 500 / Math.max(1, this.params.speed)
  }

  private get smudgeSize(): number {
    return (this.params.brushDensity / 100) * this.params.brushSize
  }

  private get contrast(): number {
    return this.params.opacity / 100
  }

  /** 원본 generatePerlinData() 이식 — 소용돌이 방향을 결정하는 노이즈 그리드를 미리 계산한다 */
  private generatePerlinData(): Float32Array {
    this.perlin.seed()
    const data = new Float32Array(NUM_PERLIN_COLS * NUM_PERLIN_ROWS)
    const step = 1 / RESOLUTION
    let i = 0
    for (let y = 0; y < GRID_SIZE; y += step) {
      for (let x = 0; x < GRID_SIZE; x += step) {
        data[i] = this.perlin.get(x, y)
        i++
      }
    }
    return data
  }

  private randomizeStartPoint(): void {
    this.cx = Math.floor(Math.random() * this.canvas.width)
    this.cy = Math.floor(Math.random() * this.canvas.height)
    this.direction = this.cx < this.canvas.width / 2 ? 1 : -1
  }

  private applyContrast(o: number, n: number): number {
    return ~~((1 - this.contrast) * o + this.contrast * n)
  }

  /** 원본 liquify(x, y) 이식 — 마우스(브러시) 속도 기반 픽셀 스미어 */
  private smear(x: number, y: number): void {
    let dx = x - this.oldMouseX
    let dy = y - this.oldMouseY
    this.oldMouseX = x
    this.oldMouseY = y

    if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) return

    const brushSize = this.params.brushSize
    const boxX = x - Math.trunc(brushSize / 2)
    const boxY = y - Math.trunc(brushSize / 2)

    const bitmap = this.ctx.getImageData(boxX, boxY, brushSize, brushSize)

    dx = dx > 0 ? ~~Math.min(bitmap.width / 2, dx) : ~~Math.max(-bitmap.width / 2, dx)
    dy = dy > 0 ? ~~Math.min(bitmap.height / 2, dy) : ~~Math.max(-bitmap.height / 2, dy)

    const buffer = this.ctx.createImageData(bitmap.width, bitmap.height)
    const d = bitmap.data
    const _d = buffer.data
    let bit = 0
    const power = 6
    const smudgeSize = this.smudgeSize

    for (let row = 0; row < bitmap.height; row++) {
      for (let col = 0; col < bitmap.width; col++) {
        const xd = bitmap.width / 2 - col
        const yd = bitmap.height / 2 - row
        const dist = Math.sqrt(xd * xd + yd * yd)

        const xLiquify = (bitmap.width - dist) / bitmap.width
        const yLiquify = (bitmap.height - dist) / bitmap.height

        const skewX = dist > smudgeSize / 2 ? -dx * Math.pow(xLiquify, power) : -dx
        const skewY = dist > smudgeSize / 2 ? -dy * Math.pow(yLiquify, power) : -dy

        let fromX = col + skewX
        let fromY = row + skewY

        if (fromX < 0 || fromX > bitmap.width) fromX = col
        if (fromY < 0 || fromY > bitmap.height) fromY = row

        let oBit = ~~fromX * 4 + ~~fromY * bitmap.width * 4
        if (d[oBit] === undefined) oBit = bit

        _d[bit] = this.applyContrast(d[bit], d[oBit])
        _d[bit + 1] = this.applyContrast(d[bit + 1], d[oBit + 1])
        _d[bit + 2] = this.applyContrast(d[bit + 2], d[oBit + 2])
        _d[bit + 3] = this.applyContrast(d[bit + 3], d[oBit + 3])

        bit += 4
      }
    }

    try {
      this.ctx.putImageData(buffer, boxX, boxY)
    } catch {
      // 원본과 동일하게 캔버스 경계를 벗어난 putImageData 실패는 무시한다
    }
  }

  /** 원본 startGenerativeDraw()의 loop() 이식 — Perlin 노이즈로 브러시 중심을 소용돌이 이동시킨다 */
  private loopStep = (): void => {
    if (!this.playing) return

    const canvasWidth = this.canvas.width
    const canvasHeight = this.canvas.height

    const movementFactor = 0.05 / this.animationSpeed
    const maxXMovement = canvasWidth * movementFactor
    this.angle = (this.angle + Math.PI / 360 / 2000) % (Math.PI * 2)

    const maxRadius = Math.min(canvasWidth, canvasHeight) * 0.1
    const minRadius = ((canvasWidth + canvasHeight) / 2) * 0.6
    const radiusRange = maxRadius - minRadius
    const radius = minRadius + radiusRange * (Math.sin(this.counter / this.animationSpeed) + 1) / 2

    const perlinGridX = Math.floor((this.cx / canvasWidth) * NUM_PERLIN_COLS)
    const perlinGridY = Math.floor((this.cy / canvasHeight) * NUM_PERLIN_ROWS)
    const clampedX = Math.min(NUM_PERLIN_COLS - 1, Math.max(0, perlinGridX))
    const clampedY = Math.min(NUM_PERLIN_ROWS - 1, Math.max(0, perlinGridY))
    const currentSlope = this.perlinData[clampedY * NUM_PERLIN_COLS + clampedX] + this.angleBias

    const xMovement = maxXMovement * this.direction
    const yMovement = xMovement * currentSlope * 3 // movementBoost
    const randomYMovement =
      Math.sin(this.counter / this.animationSpeed) * 2 * (Math.min(canvasWidth, canvasHeight) / 1500)

    this.cx += xMovement
    this.cy += yMovement + randomYMovement

    if (this.cx < 0 || this.cx > canvasWidth) this.randomizeStartPoint()
    if (this.cy < 0 || this.cy > canvasHeight) this.randomizeStartPoint()

    const x = this.cx + radius * Math.cos(this.angle)
    const y = this.cy + radius * Math.sin(this.angle)

    this.angle++
    this.counter++
    this.smear(x, y)

    this.rafId = requestAnimationFrame(this.loopStep)
  }

  start(): void {
    if (this.playing) return
    this.playing = true
    this.rafId = requestAnimationFrame(this.loopStep)
  }

  stop(): void {
    this.playing = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  dispose(): void {
    this.stop()
  }
}
