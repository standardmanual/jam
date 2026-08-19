/**
 * 칼레이도스코프(만화경) 애니메이션 엔진.
 *
 * 출처: collidingScopes/collidingScopes.github.io (https://collidingscopes.github.io/) — kaleidoscope.js
 * MIT 라이선스(Alan Ang). 원본 주석에 따르면 삼각형 타일 렌더링 아이디어는 Luke Hannam의
 * "Canvas Kaleidoscope"(https://www.pepperoni.blog/canvas-kaleidoscope/) 글에 기반한다.
 * 원본은 dat.gui 없는 순수 HTML 컨트롤 패널, 파일 업로드 DOM 배선, 비디오 녹화(mp4-muxer,
 * videoExportFunctions.js) 등 데모 사이트 전용 기능을 포함하고 있어 전체를 가져오지 않고,
 * "칼레이도스코프 애니메이션" 렌더링 핵심 로직만 발췌해 TypeScript 클래스로 이식했다
 * (20260819_002 스파이크 — 티켓 20260819_001에서 잘못 이식한 liquify를 교체):
 *   - resizeImage()/generateFlippedImage(): 원본 이미지를 numTiles에 맞춰 축소하고 좌우반전
 *     이미지를 만드는 로직 — 원본 그대로 이식(DOM <img> 대신 오프스크린 캔버스 사용)
 *   - createAnimation()의 fn()/tile()/loop(): 정삼각형 타일을 그리고 -120도 회전을 반복해
 *     6각 대칭을 만든 뒤, 그려진 스트립을 getImageData/putImageData로 캔버스 전체에 복제하는
 *     핵심 렌더링 로직 — 원본 그대로 이식(변수명·연산 순서까지 동일하게 유지)
 * 가져오지 않은 것: HTML 컨트롤 패널 DOM 배선(sticky table, 스크롤 토글 등), 파일 업로드 이벤트
 * 리스너, 비디오 녹화(mp4-muxer 기반 recordVideoMuxer — videoExportFunctions.js), PNG 저장
 * 단축키(saveImage). videoExportFunctions.js는 이 스파이크 범위(브라우저 실시간 미리보기) 밖이라
 * 제외했지만, 향후 정식 기능에서 "어드민이 결과를 반복 영상으로 굽는" 요구사항이 생기면 참고할 만한
 * 자료로 존재 사실을 남겨둔다.
 */

export interface KaleidoscopeParams {
  /** 슬라이스(타일) 수 — 원본 numTilesInput 범위 그대로(2~25). 클수록 삼각형이 작아지고 반복이 촘촘해진다 */
  numTiles: number
  /** 애니메이션 속도 — 원본 speedInput 범위 그대로(1~15) */
  speed: number
}

/** 정삼각형의 높이 계수 (변 길이 대비) — 원본 SqrtOf3_4 */
const SQRT3_4 = Math.sqrt(3) / 2
/** 왕복 애니메이션의 진폭 — 원본 animationLength (고정값, 원본도 사용자 조절 불가) */
const ANIMATION_LENGTH = 600
/** 매 프레임 타일 스트립을 이동시키는 간격 — 원본 animationStep (고정값) */
const ANIMATION_STEP = 1.5

export class KaleidoscopeEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private image: HTMLImageElement
  private params: KaleidoscopeParams
  private rafId: number | null = null
  private playing = false

  // rebuild()에서만 갱신되는 패턴 상태 (numTiles/이미지/캔버스 크기가 바뀔 때만 재계산)
  private patDim = 0
  private triangleHeight = 0
  private pattern: CanvasPattern | null = null
  private patternR: CanvasPattern | null = null

  // 애니메이션 진행 상태
  private animationSpeed = 1
  private counter = 0

  constructor(canvas: HTMLCanvasElement, image: HTMLImageElement, params: KaleidoscopeParams) {
    this.canvas = canvas
    this.image = image
    this.params = params
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D 캔버스 컨텍스트를 가져올 수 없습니다.')
    this.ctx = ctx
    this.rebuild()
  }

  setParams(params: KaleidoscopeParams): void {
    const numTilesChanged = params.numTiles !== this.params.numTiles
    this.params = params
    if (numTilesChanged) {
      this.rebuild()
    } else {
      this.updateAnimationSpeed()
    }
  }

  /** 원본 getUserInputs()의 animationSpeed 산식 이식 */
  private updateAnimationSpeed(): void {
    this.animationSpeed = (8000 / Math.max(1, this.params.speed)) * (this.params.numTiles / 2.5)
  }

  /**
   * 원본 resizeImage() + generateFlippedImage() + createAnimation() 도입부 이식.
   * numTiles/이미지/캔버스 크기가 바뀔 때 패턴(원본+좌우반전)과 삼각형 치수를 다시 계산하고,
   * ctx 변환을 초기 상태로 되돌린다.
   */
  private rebuild(): void {
    const canvasWidth = this.canvas.width
    const maxImageWidth = Math.ceil(canvasWidth / this.params.numTiles)
    const naturalWidth = this.image.naturalWidth
    const naturalHeight = this.image.naturalHeight

    let scaledWidth: number
    let scaledHeight: number
    if (naturalWidth > maxImageWidth) {
      scaledWidth = maxImageWidth
      const ratio = scaledWidth / naturalWidth
      scaledHeight = naturalHeight * ratio
    } else {
      scaledWidth = naturalWidth
      scaledHeight = naturalHeight
    }
    scaledWidth = Math.max(1, Math.round(scaledWidth))
    scaledHeight = Math.max(1, Math.round(scaledHeight))

    const baseCanvas = document.createElement('canvas')
    baseCanvas.width = scaledWidth
    baseCanvas.height = scaledHeight
    const baseCtx = baseCanvas.getContext('2d')
    if (!baseCtx) throw new Error('오프스크린 캔버스 컨텍스트를 가져올 수 없습니다.')
    baseCtx.drawImage(this.image, 0, 0, scaledWidth, scaledHeight)

    // 원본 generateFlippedImage() — 좌우반전 이미지
    const flippedCanvas = document.createElement('canvas')
    flippedCanvas.width = scaledWidth
    flippedCanvas.height = scaledHeight
    const flippedCtx = flippedCanvas.getContext('2d')
    if (!flippedCtx) throw new Error('오프스크린 캔버스 컨텍스트를 가져올 수 없습니다.')
    flippedCtx.translate(scaledWidth, 0)
    flippedCtx.scale(-1, 1)
    flippedCtx.drawImage(baseCanvas, 0, 0)

    this.patDim = scaledWidth
    this.triangleHeight = SQRT3_4 * scaledWidth

    const pattern = this.ctx.createPattern(baseCanvas, 'repeat')
    const patternR = this.ctx.createPattern(flippedCanvas, 'repeat')
    if (!pattern || !patternR) throw new Error('캔버스 패턴을 생성할 수 없습니다.')
    this.pattern = pattern
    this.patternR = patternR

    this.updateAnimationSpeed()
    this.counter = this.animationSpeed * 0.5 // 원본 기본 애니메이션 시작 지점

    // 원본 createAnimation() 도입부의 ctx.translate(-0.5*patDim, 0) — canvas.width/height 대입은
    // 스펙상 변환을 초기화하므로, 여기서는 명시적으로 초기화한 뒤 동일하게 적용한다.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.translate(-0.5 * this.patDim, 0)

    this.renderOnce()
  }

  /**
   * 원본 createAnimation() 내부 fn() 이식 — 정삼각형 타일을 패턴으로 채우고, -120도 회전을
   * 반복해 6각 대칭 형태로 이어붙인다. alternateMode는 두 번째 행(오프셋 행)을 그릴 때 true.
   */
  private fn(alternateMode: boolean): void {
    const ctx = this.ctx
    const patDim = this.patDim
    const height = this.triangleHeight

    const offset = Math.sin((this.counter / this.animationSpeed) * Math.PI) * ANIMATION_LENGTH
    this.counter++
    let i = 0

    ctx.save()
    ctx.fillStyle = this.pattern as CanvasPattern
    ctx.translate(0, offset)
    while (i <= 3) {
      ctx.beginPath()
      ctx.moveTo(0, -offset)
      ctx.lineTo(patDim, -offset)
      ctx.lineTo(0.5 * patDim, height - offset)
      ctx.closePath()
      ctx.fill()
      if (i % 3 === 0) {
        ctx.translate(patDim, -offset)
        ctx.rotate((-120 * Math.PI) / 180)
        ctx.translate(-patDim, offset)
      } else if (i % 3 === 1) {
        if (alternateMode) {
          ctx.rotate((120 * Math.PI) / 180)
          ctx.translate(-3 * patDim, 0)
          ctx.rotate((-120 * Math.PI) / 180)
        }
        ctx.translate(0.5 * patDim, height - offset)
        ctx.rotate((-120 * Math.PI) / 180)
        ctx.translate(-0.5 * patDim, -height + offset)
      } else if (i % 3 === 2) {
        ctx.translate(0, -offset)
        ctx.rotate((-120 * Math.PI) / 180)
        ctx.translate(0, offset)
      }
      i++
    }
    ctx.restore()

    ctx.save()
    ctx.scale(-1, -1)
    ctx.fillStyle = this.patternR as CanvasPattern
    ctx.translate((-i + (i % 3 === 0 ? 0.5 : i % 3 === 1 ? 1.5 : -0.5)) * patDim, -height + offset)
    ctx.translate(0, -offset)
    ctx.rotate((120 * Math.PI) / 180)
    ctx.translate(0, offset)

    let j = 0
    while (j < i + 1) {
      ctx.beginPath()
      if (j > 0 || !alternateMode) {
        ctx.moveTo(0, -offset)
        ctx.lineTo(patDim, -offset)
        ctx.lineTo(0.5 * patDim, height - offset)
        ctx.closePath()
        ctx.fill()
      }
      if (j % 3 === 1) {
        ctx.translate(patDim, -offset)
        ctx.rotate((-120 * Math.PI) / 180)
        ctx.translate(-patDim, offset)
      } else if (j % 3 === 2) {
        ctx.translate(0.5 * patDim, height - offset)
        ctx.rotate((-120 * Math.PI) / 180)
        ctx.translate(-0.5 * patDim, -height + offset)
      } else if (j % 3 === 0) {
        ctx.translate(0, -offset)
        ctx.rotate((-120 * Math.PI) / 180)
        ctx.translate(0, offset)
      }
      j++
    }
    ctx.restore()
  }

  /** 원본 createAnimation() 내부 tile() 이식 — 그려진 스트립을 캔버스 전체에 복제한다 */
  private tile(): void {
    const ctx = this.ctx
    const patDim = this.patDim
    const canvasWidth = this.canvas.width
    const canvasHeight = this.canvas.height
    const patternHeight = Math.floor(SQRT3_4 * patDim * 2)
    if (patternHeight <= 0) return

    const rowData = ctx.getImageData(0, 0, patDim * 3, patternHeight)
    for (let i = 0; patternHeight * i < canvasHeight + SQRT3_4 * patDim; i++) {
      for (let j = 0; j * patDim < canvasWidth + patDim; j += 3) {
        ctx.putImageData(rowData, j * patDim, i * patternHeight)
      }
    }
  }

  /** 한 프레임 렌더링 — 원본 loop() 내부에서 rAF마다 실행되는 본체 */
  private renderOnce(): void {
    this.fn(false)
    this.ctx.translate(ANIMATION_STEP * this.patDim, this.triangleHeight)
    this.fn(true)
    this.ctx.translate(-ANIMATION_STEP * this.patDim, -this.triangleHeight)
    this.tile()
  }

  private loopStep = (): void => {
    if (!this.playing) return
    this.renderOnce()
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
