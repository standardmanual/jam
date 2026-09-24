'use client'

/**
 * JAM! 에셋 제너레이터 — 스테이지 캔버스 + 재생/정지 + 머리 위치 (티켓 20260924_2156)
 *
 * 원천 이미지 로드(letter/upload → 알파 bbox로 자른 base)와 재생 루프만 이 컴포넌트가 맡는다.
 * 실제 그리기(스탬프 생성·곡선 생성·리본 레이어 합성)는 `jam-web/src/lib/asset-generator/`
 * (티켓 20260924_2155)를 그대로 쓴다 — 화면 안에 중복 구현하지 않는다.
 *
 * 원본: jam-doc/assets/prototypes/20260924_jam-asset-generator.html
 * (LETTERS 154~159줄, setBaseFromCanvas 177줄, normalizeSvg 205줄, loadBlob 226줄,
 * applyAspect 302줄, frame 476줄). `AssetGeneratorExport`가 정밀 인코딩 중 프레임을
 * 하나씩 그리기 위해 `drawAtHead`·`setExporting` 등을 ref로 끌어올려 쓴다.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import {
  buildPath,
  buildStamp,
  drawRibbonLayer,
  fillBackground,
  type Canvas2DContextLike,
  type CanvasFactory,
  type CanvasLike,
  type PathTable,
  type RibbonLayerConfig,
  type StageRatio,
} from '@/lib/asset-generator'
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'
import {
  computeEffectiveStartColor,
  HEAD_POSITION_RANGE,
  resolveStageSize,
  STAGE_MAX_LONG_SIDE_PX,
} from './assetGeneratorHelpers'

export interface AssetGeneratorViewportHandle {
  getCanvas(): HTMLCanvasElement | null
  getPathTotal(): number
  getHead(): number
  setHead(head: number): void
  /** 주어진 머리 위치의 장면 한 장을 그린다(정밀 인코딩·PNG 저장이 재사용, 재생 루프와 독립). */
  drawAtHead(head: number): void
  /** true인 동안 재생 루프가 화면을 다시 그리지 않는다(정밀 인코딩이 프레임을 직접 그리는 동안). */
  setExporting(exporting: boolean): void
}

interface AssetGeneratorViewportProps {
  stageRatio: StageRatio
  layer: RibbonLayerConfig
  play: boolean
  onPlayChange: (play: boolean) => void
}

// 브랜드 글자 원본: jam-doc/assets/brand/{j,a,m}.svg. 프로토타입(154~159줄)과 같은 path 데이터 —
// file://로 여는 프로토타입과 달리 이 화면은 실제 서버에서 뜨지만, 값이 자주 바뀌지 않고
// 이 화면에서만 쓰므로 프로토타입과 같은 방식으로 그대로 둔다.
const BRAND_LETTERS: Record<'J' | 'A' | 'M', { w: number; h: number; d: string }> = {
  J: {
    w: 136,
    h: 205,
    d: 'M135.948 3.43323e-05L0 0V57.7583L59.9254 57.6304V97.4358C59.9254 107.218 51.9984 115.146 42.2176 115.146H0V204.628H59.9126C101.9 204.628 135.948 170.589 135.948 128.585V3.43323e-05Z',
  },
  A: {
    w: 177,
    h: 205,
    d: 'M94.6635 152.087L101.67 204.628H176.311L143.504 0H32.8075L0 204.628H74.6415L81.6479 152.087H94.6763H94.6635ZM88.1557 98.9574C68.7602 98.9574 53.0468 89.7381 53.0468 78.3578C53.0468 66.9775 68.773 57.7582 88.1557 57.7582C107.551 57.7582 123.265 66.9775 123.265 78.3578C123.265 89.7381 107.538 98.9574 88.1557 98.9574Z',
  },
  M: {
    w: 256,
    h: 205,
    d: 'M191.552 0C156.289 0 127.701 17.4924 127.701 52.7713C127.701 17.5052 99.1129 0 63.8506 0C28.5883 0 0 28.5914 0 63.8575V204.628H76.4826V99.2899H89.4726V204.628H165.955V99.2899H178.945V204.628H255.428V63.8575C255.428 28.5914 226.839 0 191.577 0H191.552Z',
  },
}

function brandLetterSvgMarkup(key: 'J' | 'A' | 'M'): string {
  const letter = BRAND_LETTERS[key]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${letter.w}" height="${letter.h}" viewBox="0 0 ${letter.w} ${letter.h}"><path d="${letter.d}" fill="#000"/></svg>`
}

/**
 * render.ts(2155)의 CanvasLike·Canvas2DContextLike는 브라우저·서버(napi-rs/canvas 등) 어느
 * 한쪽에도 치우치지 않도록 일부러 최소 메서드만 선언한 인터페이스다(render.ts 상단 주석) —
 * 그래서 실제 DOM `HTMLCanvasElement`/`CanvasRenderingContext2D`와도 구조적으로 완전히
 * 일치하지 않는다(예: DOM의 `drawImage`는 `CanvasImageSource` 합집합을 받지만 라이브러리는
 * `ImageSourceLike` 하나만 받는다). 런타임에는 이 함수가 실제로 쓰는 메서드를 DOM 쪽이 전부
 * 구현하므로, 여기 두 지점에서만 타입을 좁혀 이어준다.
 */
function toCanvasLike(canvas: HTMLCanvasElement): CanvasLike {
  return canvas as unknown as CanvasLike
}
function toContextLike(ctx: CanvasRenderingContext2D): Canvas2DContextLike {
  return ctx as unknown as Canvas2DContextLike
}

function createRawCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

const makeCanvas: CanvasFactory = (width, height) => toCanvasLike(createRawCanvas(width, height))

// xmlns가 없는 SVG는 <img>로 읽히지 않고, 크기 속성이 없으면 비율이 틀어지므로 보정한다(원본 normalizeSvg, 205줄)
function normalizeSvgMarkup(text: string): string {
  let normalized = text
  if (!/<svg[^>]*\sxmlns\s*=/i.test(normalized)) {
    normalized = normalized.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  if (/xlink:/i.test(normalized) && !/xmlns:xlink\s*=/i.test(normalized)) {
    normalized = normalized.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }
  try {
    const doc = new DOMParser().parseFromString(normalized, 'image/svg+xml')
    const root = doc.documentElement
    if (root && root.nodeName.toLowerCase() === 'svg' && doc.getElementsByTagName('parsererror').length === 0) {
      const widthAttr = root.getAttribute('width') || ''
      const heightAttr = root.getAttribute('height') || ''
      const width = Number.parseFloat(widthAttr)
      const height = Number.parseFloat(heightAttr)
      const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
      if (
        (!(width > 0) || !(height > 0) || /%/.test(widthAttr + heightAttr)) &&
        viewBox.length === 4 &&
        viewBox[2] > 0 &&
        viewBox[3] > 0
      ) {
        const scale = 512 / Math.max(viewBox[2], viewBox[3])
        root.setAttribute('width', String(viewBox[2] * scale))
        root.setAttribute('height', String(viewBox[3] * scale))
      }
      normalized = new XMLSerializer().serializeToString(doc)
    }
  } catch {
    // 파싱에 실패하면 원문 그대로 시도한다
  }
  return normalized
}

/** 알파 bbox로 잘라낸 base 캔버스를 만든다. 불투명 픽셀이 없으면 null(원본 setBaseFromCanvas, 177줄). */
function cropToAlphaBounds(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = source.width
  const h = source.height
  let data: Uint8ClampedArray
  try {
    data = source.getContext('2d')!.getImageData(0, 0, w, h).data
  } catch {
    // 브라우저 보안 정책으로 픽셀을 읽을 수 없으면 투명 여백 자르기만 건너뛴다
    return source
  }
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const cropped = createRawCanvas(bw, bh)
  cropped.getContext('2d')!.drawImage(source, x0, y0, bw, bh, 0, 0, bw, bh)
  return cropped
}

function loadImageFromBlob(blob: Blob, isSvg: boolean): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const iw = img.naturalWidth || 512
      const ih = img.naturalHeight || 512
      const long = Math.max(iw, ih)
      const target = isSvg ? 512 : Math.min(512, long)
      const scale = target / long
      const canvas = createRawCanvas(iw * scale, ih * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지로 읽지 못했어요. PNG 또는 SVG 파일인지 확인해 주세요.'))
    }
    img.src = url
  })
}

const AssetGeneratorViewport = forwardRef<AssetGeneratorViewportHandle, AssetGeneratorViewportProps>(
  function AssetGeneratorViewport({ stageRatio, layer, play, onPlayChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const pathRef = useRef<PathTable | null>(null)
    const headRef = useRef(0)
    const exportingRef = useRef(false)
    const lastFrameTimeRef = useRef(0)
    const loadTokenRef = useRef(0)
    const [base, setBase] = useState<HTMLCanvasElement | null>(null)
    const [headPct, setHeadPct] = useState(0)

    const { width: W, height: H } = useMemo(() => resolveStageSize(stageRatio), [stageRatio])
    const effectiveStartColor = computeEffectiveStartColor(layer)

    const stamp = useMemo<CanvasLike | null>(() => {
      if (!base) return null
      return buildStamp(makeCanvas, {
        base: toCanvasLike(base),
        blurPct: layer.blurPct,
        direction: layer.direction,
        startColor: effectiveStartColor,
        endColor: layer.endColor,
      })
    }, [base, layer.blurPct, layer.direction, effectiveStartColor, layer.endColor])

    // 원천 그래픽 로드(원본 loadLetter 255줄·loadFile 261줄) — source가 바뀔 때마다 다시 읽는다
    useEffect(() => {
      const token = ++loadTokenRef.current
      const source = layer.source

      async function load() {
        try {
          let canvas: HTMLCanvasElement
          if (source.kind === 'letter') {
            canvas = await loadImageFromBlob(new Blob([brandLetterSvgMarkup(source.letter)], { type: 'image/svg+xml' }), true)
          } else {
            const response = await fetch(source.assetUrl)
            const blob = await response.blob()
            const isSvg = blob.type === 'image/svg+xml' || blob.type === 'image/svg'
            const normalized = isSvg
              ? new Blob([normalizeSvgMarkup(await blob.text())], { type: 'image/svg+xml' })
              : blob
            canvas = await loadImageFromBlob(normalized, isSvg)
          }
          if (token !== loadTokenRef.current) return
          const cropped = cropToAlphaBounds(canvas)
          if (!cropped) {
            toast.error('불투명한 픽셀이 없는 이미지예요. 투명 배경 위에 그림이 있는 PNG나 SVG 파일을 올려 주세요.')
            return
          }
          setBase(cropped)
        } catch (e) {
          if (token !== loadTokenRef.current) return
          toast.error(e instanceof Error ? e.message : '이미지를 불러오지 못했어요.')
        }
      }

      void load()
    }, [layer.source])

    // 이동 곡선 재생성 — 시드·불규칙성·스테이지 크기가 바뀌면 다시 뽑되, 머리 위치는 진행률(비율)을
    // 유지한다(원본 rebuildPathKeepPhase, 295줄).
    useEffect(() => {
      const prevTotal = pathRef.current?.total
      const fraction = prevTotal ? headRef.current / prevTotal : 0
      const nextPath = buildPath(layer.seed, layer.irregularityPct, W, H)
      pathRef.current = nextPath
      headRef.current = fraction * nextPath.total
      if (!play) setHeadPct(nextPath.total > 0 ? (headRef.current / nextPath.total) * 100 : 0)
      // play는 "정지 중일 때만 표시값을 동기화"하는 조건일 뿐 재생성 트리거가 아니므로 deps에서 뺀다
      // eslint-disable-next-line react-hooks/exhaustive-deps -- play는 조건 판단에만 쓰고 재생성 트리거는 아니다
    }, [layer.seed, layer.irregularityPct, W, H])

    // 재생 중에는 머리 위치를 화면 상태로 옮기지 않다가(불필요한 리렌더 방지), 정지하는
    // 순간에만 실제 위치(headRef)를 슬라이더 표시값에 동기화한다.
    useEffect(() => {
      if (!play) {
        const total = pathRef.current?.total ?? 0
        setHeadPct(total > 0 ? (headRef.current / total) * 100 : 0)
      }
    }, [play])

    // 캔버스 실제 픽셀 크기(스테이지 비율이 바뀔 때만 갱신)
    useEffect(() => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = W
        canvas.height = H
      }
    }, [W, H])

    // 최신 값을 ref에 담아 두고, 재생 루프(rAF)는 마운트 시 한 번만 시작한다 — 슬라이더를 움직일
    // 때마다 루프를 새로 시작하지 않기 위함(원본은 하나의 전역 루프, frame 476줄과 동일한 동작).
    const latestRef = useRef({ play, layer, stamp, base, W, H })
    useEffect(() => {
      latestRef.current = { play, layer, stamp, base, W, H }
    })

    useEffect(() => {
      const canvas = canvasRef.current
      const rawCtx = canvas?.getContext('2d')
      if (!canvas || !rawCtx) return
      const ctx = toContextLike(rawCtx)
      let raf = 0
      lastFrameTimeRef.current = performance.now()

      function frame(now: number) {
        const dt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000)
        lastFrameTimeRef.current = now
        if (!exportingRef.current) {
          const current = latestRef.current
          const path = pathRef.current
          if (path) {
            if (current.play) headRef.current = (headRef.current + current.layer.speed * dt) % path.total
            fillBackground(ctx, current.W, current.H, current.layer.backgroundColor)
            if (current.stamp && current.base) {
              drawRibbonLayer(ctx, {
                stamp: current.stamp,
                baseWidth: current.base.width,
                baseHeight: current.base.height,
                sizePct: current.layer.sizePct,
                rotationDeg: current.layer.rotationDeg,
                followPath: current.layer.followPath,
                path,
                head: headRef.current,
                gap: current.layer.gap,
                count: current.layer.count,
                stageWidth: current.W,
                stageHeight: current.H,
              })
            }
          }
        }
        raf = requestAnimationFrame(frame)
      }

      raf = requestAnimationFrame(frame)
      return () => cancelAnimationFrame(raf)
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        getCanvas: () => canvasRef.current,
        getPathTotal: () => pathRef.current?.total ?? 0,
        getHead: () => headRef.current,
        setHead: (head: number) => {
          headRef.current = head
          const total = pathRef.current?.total ?? 0
          setHeadPct(total > 0 ? (head / total) * 100 : 0)
        },
        drawAtHead: (head: number) => {
          const canvas = canvasRef.current
          const rawCtx = canvas?.getContext('2d')
          const path = pathRef.current
          if (!rawCtx || !path) return
          const ctx = toContextLike(rawCtx)
          headRef.current = head
          fillBackground(ctx, W, H, layer.backgroundColor)
          if (stamp && base) {
            drawRibbonLayer(ctx, {
              stamp,
              baseWidth: base.width,
              baseHeight: base.height,
              sizePct: layer.sizePct,
              rotationDeg: layer.rotationDeg,
              followPath: layer.followPath,
              path,
              head,
              gap: layer.gap,
              count: layer.count,
              stageWidth: W,
              stageHeight: H,
            })
          }
        },
        setExporting: (exporting: boolean) => {
          exportingRef.current = exporting
        },
      }),
      [W, H, layer, stamp, base]
    )

    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center justify-center overflow-hidden rounded-md border border-border bg-neutral-100 p-2">
          <canvas
            ref={canvasRef}
            className="h-auto max-h-[60vh] w-auto max-w-full rounded"
            style={{ aspectRatio: `${W} / ${H}` }}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          출력 {W} × {H}px (긴 변 최대 {STAGE_MAX_LONG_SIDE_PX}px)
        </p>
        <div className="flex w-full items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => onPlayChange(!play)}>
            {play ? <IconPlayerPauseFilled className="h-4 w-4" /> : <IconPlayerPlayFilled className="h-4 w-4" />}
            {play ? '정지' : '재생'}
          </Button>
        </div>
        {!play && (
          <div className="grid w-full grid-cols-[64px_minmax(0,1fr)_56px] items-center gap-2">
            <span className="text-sm text-foreground">머리 위치</span>
            <input
              type="range"
              min={HEAD_POSITION_RANGE.min}
              max={HEAD_POSITION_RANGE.max}
              step={HEAD_POSITION_RANGE.step}
              value={headPct}
              onChange={(e) => {
                const pct = Number(e.target.value)
                setHeadPct(pct)
                const total = pathRef.current?.total ?? 0
                headRef.current = (pct / 100) * total
              }}
              className="w-full cursor-pointer accent-primary"
              aria-label="머리 위치"
            />
            <span className="text-right text-xs font-mono text-muted-foreground tabular-nums">
              {headPct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    )
  }
)

AssetGeneratorViewport.displayName = 'AssetGeneratorViewport'

export default AssetGeneratorViewport
