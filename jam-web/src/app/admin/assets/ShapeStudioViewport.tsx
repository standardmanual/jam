'use client'

/**
 * 에셋 스튜디오 프리뷰 뷰포트 — Shape Studio v2(WebGL) + 2D 리본 곡선 엔진 + 이미지·텍스트 오버레이 합성
 * (티켓 20261022_1318)
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import {
  buildPath,
  buildStamp,
  drawImageLayer,
  drawRibbonLayer,
  drawTextLayer,
  fillBackground,
  type Canvas2DContextLike,
  type CanvasFactory,
  type CanvasLike,
  type ImageLayerConfig,
  type OverlayLayerConfig,
  type PathTable,
  type RibbonLayerConfig,
  type TextLayerConfig,
  type TextLayerFont,
} from '@/lib/asset-generator'
import {
  buildFontLoadKey,
  computeEffectiveStartColor,
  HEAD_POSITION_RANGE,
  isSystemDefaultFont,
  loadFontInBrowser,
  resolveStageSize,
} from '@/app/admin/asset-generator/assetGeneratorHelpers'
import { createAssetLoadTracker } from '@/app/admin/asset-generator/assetLoadTracker'
import type { AssetGeneratorViewportHandle } from '@/app/admin/asset-generator/AssetGeneratorViewport'
import {
  buildGlyphSdf,
  computeGeometry,
  FRAGMENT_SHADER,
  GRANGE,
  GT,
  hexToRgb,
  REF,
  VERTEX_SHADER,
  VIDEO_SEC,
  type GlyphDefinition,
  type ShapeStudioState,
  type StudioEngineMode,
} from './shapeStudioConfig'

export interface ShapeStudioViewportHandle extends AssetGeneratorViewportHandle {
  exportPng: (size: number) => Promise<void>
  recordVideo: (longSide: number) => Promise<void>
  cancelVideo: () => void
  resetMotionTime: () => void
}

interface ShapeStudioViewportProps {
  engineMode: StudioEngineMode
  state: ShapeStudioState
  ribbonLayer: RibbonLayerConfig
  overlayLayers: OverlayLayerConfig[]
  glyphsMap: Record<string, GlyphDefinition>
  canUndo: boolean
  onUndo: () => void
  onDropShapeFile: (file: File) => void
  onStatusChange: (status: string) => void
  onExportBusyChange: (busy: boolean) => void
  onVideoRecordingChange: (recording: boolean, label: string) => void
}

type UniformMap = Record<string, WebGLUniformLocation | null>

const BRAND_LETTERS: Record<'J' | 'A' | 'M', { w: number; h: number; d: string }> = {
  J: {
    w: 136.018,
    h: 204.628,
    d: 'M136.018 128.585C136.018 170.589 101.954 204.628 59.944 204.628H0V128.585H42.24C52.026 128.585 59.957 120.657 59.957 110.875L59.957 54.735L0 54.862L0 0H136.018V128.585Z',
  },
  A: {
    w: 195.383,
    h: 204.628,
    d: 'M123.129 182.524C110.44 194.814 98.891 198.652 81.397 202.969C78.02 203.801 72.29 203.937 69.843 204.628H61.568C56.958 203.78 51.845 203.255 47.446 201.8C14.593 190.932 0 164.238 6.32 131.356C15.545 83.356 59.187 71.094 102.113 71.197H127.153V51.798L69.843 51.78C59.087 51.777 47.852 51.969 37.138 51.766C36.937 41.759 36.788 31.751 36.69 21.743C36.645 15.212 36.783 6.399 36.354 0H129.005C165.666 0 195.383 29.713 195.383 66.366V204.628H123.129V182.524ZM124.163 115.825C123.974 135.451 121.911 147.483 101.798 153.776C93.665 156.231 84.484 156.221 77.09 150.952C64.356 141.878 66.755 127.457 79.013 119.279C82.369 117.04 86.57 116.408 90.583 115.825C100.795 115.825 114.402 115.825 124.163 115.825Z',
  },
  M: {
    w: 255.563,
    h: 204.628,
    d: 'M191.678 0C226.96 0 255.563 28.591 255.563 63.857V204.628H179.041V99.29H166.042V204.628H89.521V99.29H76.524V204.628H0V63.857C0.002 28.591 28.605 0 63.884 0C99.165 0 127.768 17.505 127.768 52.772C127.768 17.493 156.371 0 191.652 0H191.678Z',
  },
}

function brandLetterSvgMarkup(key: 'J' | 'A' | 'M'): string {
  const letter = BRAND_LETTERS[key]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${letter.w}" height="${letter.h}" viewBox="0 0 ${letter.w} ${letter.h}"><path d="${letter.d}" fill="#000" fill-rule="evenodd"/></svg>`
}

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

const IMAGE_LAYER_SVG_FALLBACK_LONG_SIDE = 2048
const makeCanvas: CanvasFactory = (width, height) => toCanvasLike(createRawCanvas(width, height))

function normalizeSvgMarkup(text: string, fallbackLongSide = 512): string {
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
        const scale = fallbackLongSide / Math.max(viewBox[2], viewBox[3])
        root.setAttribute('width', String(viewBox[2] * scale))
        root.setAttribute('height', String(viewBox[3] * scale))
      }
      normalized = new XMLSerializer().serializeToString(doc)
    }
  } catch {
    // 파싱 실패 시 원문 유지
  }
  return normalized
}

function cropToAlphaBounds(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = source.width
  const h = source.height
  let data: Uint8ClampedArray
  try {
    data = source.getContext('2d')!.getImageData(0, 0, w, h).data
  } catch {
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

function loadImageLayerFromBlob(blob: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const iw = img.naturalWidth || IMAGE_LAYER_SVG_FALLBACK_LONG_SIDE
      const ih = img.naturalHeight || IMAGE_LAYER_SVG_FALLBACK_LONG_SIDE
      const canvas = createRawCanvas(iw, ih)
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

async function loadImageLayerAsset(url: string): Promise<HTMLCanvasElement> {
  const response = await fetch(url)
  const blob = await response.blob()
  const isSvg = blob.type === 'image/svg+xml' || blob.type === 'image/svg'
  const normalized = isSvg
    ? new Blob([normalizeSvgMarkup(await blob.text(), IMAGE_LAYER_SVG_FALLBACK_LONG_SIDE)], {
        type: 'image/svg+xml',
      })
    : blob
  return loadImageLayerFromBlob(normalized)
}

function drawOverlayLayersOnto(
  ctx: Canvas2DContextLike,
  overlayLayers: OverlayLayerConfig[],
  imageAssets: Record<string, CanvasLike>,
  stageWidth: number,
  stageHeight: number
): void {
  for (let i = overlayLayers.length - 1; i >= 0; i--) {
    const overlayLayer = overlayLayers[i]
    if (overlayLayer.type === 'image') {
      const asset = imageAssets[overlayLayer.assetUrl]
      if (!asset) continue
      drawImageLayer(
        ctx,
        {
          image: asset,
          xPct: overlayLayer.xPct,
          yPct: overlayLayer.yPct,
          widthPct: overlayLayer.widthPct,
          rotationDeg: overlayLayer.rotationDeg,
          opacityPct: overlayLayer.opacityPct,
          stageWidth,
          stageHeight,
          overlayColor: overlayLayer.overlayEnabled ? overlayLayer.overlayColor : undefined,
        },
        makeCanvas
      )
    } else {
      drawTextLayer(ctx, {
        content: overlayLayer.content,
        font: overlayLayer.font,
        sizePct: overlayLayer.sizePct,
        letterSpacing: overlayLayer.letterSpacing,
        lineHeight: overlayLayer.lineHeight,
        align: overlayLayer.align,
        color: overlayLayer.color,
        xPct: overlayLayer.xPct,
        yPct: overlayLayer.yPct,
        rotationDeg: overlayLayer.rotationDeg,
        opacityPct: overlayLayer.opacityPct,
        stageWidth,
        stageHeight,
      })
    }
  }
}

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function pickVideoType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

const ShapeStudioViewport = forwardRef<ShapeStudioViewportHandle, ShapeStudioViewportProps>(
  function ShapeStudioViewport(
    {
      engineMode,
      state,
      ribbonLayer,
      overlayLayers,
      glyphsMap,
      canUndo,
      onUndo,
      onDropShapeFile,
      onStatusChange,
      onExportBusyChange,
      onVideoRecordingChange,
    },
    ref
  ) {
    const stageRef = useRef<HTMLDivElement | null>(null)
    const artWrapRef = useRef<HTMLDivElement | null>(null)
    // 화면에 표시되는 최종 2D 합성 캔버스 (ApplyTab의 getCanvas() 대상이자 MediaRecorder 캡처 대상)
    const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
    // Shape 모드 전용 오프스크린 WebGL 캔버스
    const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
    // Ribbon 모드 기준 해상도(refW × refH) 렌더링용 오프스크린 2D 캔버스
    const ribbonBufferRef = useRef<HTMLCanvasElement | null>(null)

    const glRef = useRef<WebGLRenderingContext | null>(null)
    const programRef = useRef<WebGLProgram | null>(null)
    const bufferRef = useRef<WebGLBuffer | null>(null)
    const uniformsRef = useRef<UniformMap>({})
    const glyphTexRef = useRef<WebGLTexture | null>(null)
    const glyphTexKeyRef = useRef<string | null>(null)

    const engineModeRef = useRef<StudioEngineMode>(engineMode)
    const stateRef = useRef<ShapeStudioState>(state)
    const ribbonLayerRef = useRef<RibbonLayerConfig>(ribbonLayer)
    const overlayLayersRef = useRef<OverlayLayerConfig[]>(overlayLayers)
    const glyphsMapRef = useRef<Record<string, GlyphDefinition>>(glyphsMap)
    const sdfCacheRef = useRef<Record<string, Uint8Array>>({})

    const timeRef = useRef(0)
    const motionOffsetRef = useRef(0)
    const lastStampRef = useRef(0)
    const rafIdRef = useRef<number | null>(null)
    const exportingRef = useRef(false)
    const recAbortRef = useRef(false)
    const forceAnimateRef = useRef(false)

    // 리본 모드 전용 상태/추적기
    const pathRef = useRef<PathTable | null>(null)
    const headRef = useRef(0)
    const loadTokenRef = useRef(0)
    const [ribbonBase, setRibbonBase] = useState<HTMLCanvasElement | null>(null)
    const ribbonBaseRef = useRef<HTMLCanvasElement | null>(null)
    const ribbonStampRef = useRef<CanvasLike | null>(null)
    const [headPct, setHeadPct] = useState(0)

    // 오버레이 레이어(이미지·구글 폰트) 로더 추적기 (Shape / Ribbon 양쪽 공통)
    const imageTrackerRef = useRef(createAssetLoadTracker<CanvasLike>())
    const fontTrackerRef = useRef(createAssetLoadTracker<true>())

    const [canvasMeta, setCanvasMeta] = useState('PREVIEW')
    const [glError, setGlError] = useState<string | null>(null)

    const { width: stageW, height: stageH } = useMemo(
      () => resolveStageSize(state.ratio),
      [state.ratio]
    )
    const effectiveStartColor = computeEffectiveStartColor(ribbonLayer)

    const ribbonStamp = useMemo<CanvasLike | null>(() => {
      if (!ribbonBase) return null
      return buildStamp(makeCanvas, {
        base: toCanvasLike(ribbonBase),
        blurPct: ribbonLayer.blurPct,
        direction: ribbonLayer.direction,
        startColor: effectiveStartColor,
        endColor: ribbonLayer.endColor,
      })
    }, [ribbonBase, ribbonLayer.blurPct, ribbonLayer.direction, effectiveStartColor, ribbonLayer.endColor])

    useEffect(() => {
      ribbonBaseRef.current = ribbonBase
      ribbonStampRef.current = ribbonStamp
    }, [ribbonBase, ribbonStamp])

    // 리본 원천 그래픽 로드
    useEffect(() => {
      const token = ++loadTokenRef.current
      const source = ribbonLayer.source

      async function load() {
        try {
          let canvas: HTMLCanvasElement
          if (source.kind === 'letter') {
            canvas = await loadImageFromBlob(
              new Blob([brandLetterSvgMarkup(source.letter)], { type: 'image/svg+xml' }),
              true
            )
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
          setRibbonBase(cropped)
        } catch (e) {
          if (token !== loadTokenRef.current) return
          toast.error(e instanceof Error ? e.message : '이미지를 불러오지 못했어요.')
        }
      }

      void load()
    }, [ribbonLayer.source])

    // 오버레이 이미지 레이어 로드
    useEffect(() => {
      const tracker = imageTrackerRef.current
      const imageLayers = overlayLayers.filter((l): l is ImageLayerConfig => l.type === 'image')
      const currentUrls = new Set(imageLayers.map((l) => l.assetUrl))
      tracker.prune(currentUrls)

      let cancelled = false
      void tracker.loadMissing(
        Array.from(currentUrls),
        async (url) => {
          const loaded = toCanvasLike(await loadImageLayerAsset(url))
          return loaded
        },
        {
          isCancelled: () => cancelled,
          onError: (_url, e) =>
            toast.error(e instanceof Error ? e.message : '이미지 레이어를 불러오지 못했어요.'),
        }
      ).then(() => {
        if (!cancelled && rafIdRef.current === null) {
          // 로드 완료 시 화면 갱신
          drawCompositeFrame()
        }
      })
      return () => {
        cancelled = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- drawCompositeFrame은 ref를 통해 최신 상태를 읽는다
    }, [overlayLayers])

    // 오버레이 텍스트 레이어 구글 폰트 로드
    useEffect(() => {
      const fontsByKey = new Map<string, TextLayerFont>()
      for (const l of overlayLayers) {
        if (l.type !== 'text' || isSystemDefaultFont(l.font)) continue
        fontsByKey.set(buildFontLoadKey(l.font), l.font)
      }
      let cancelled = false
      void fontTrackerRef.current
        .loadMissing(
          Array.from(fontsByKey.keys()),
          async (key) => {
            await loadFontInBrowser(fontsByKey.get(key)!)
            return true as const
          },
          {
            isCancelled: () => cancelled,
            onError: (_key, e) =>
              toast.error(e instanceof Error ? e.message : '폰트를 불러오지 못했어요.'),
          }
        )
        .then(() => {
          if (!cancelled && rafIdRef.current === null) {
            drawCompositeFrame()
          }
        })
      return () => {
        cancelled = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- drawCompositeFrame은 ref를 통해 최신 상태를 읽는다
    }, [overlayLayers])

    // 리본 이동 곡선 재생성
    useEffect(() => {
      const prevTotal = pathRef.current?.total
      const fraction = prevTotal ? headRef.current / prevTotal : 0
      const nextPath = buildPath(ribbonLayer.seed, ribbonLayer.irregularityPct, stageW, stageH)
      pathRef.current = nextPath
      headRef.current = fraction * nextPath.total
      if (!state.animate) {
        setHeadPct(nextPath.total > 0 ? (headRef.current / nextPath.total) * 100 : 0)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- state.animate는 정지 시 표시값 동기화 조건으로만 사용한다
    }, [ribbonLayer.seed, ribbonLayer.irregularityPct, stageW, stageH])

    useEffect(() => {
      if (!state.animate) {
        const total = pathRef.current?.total ?? 0
        setHeadPct(total > 0 ? (headRef.current / total) * 100 : 0)
      }
    }, [state.animate])

    const compileShader = useCallback((gl: WebGLRenderingContext, type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) throw new Error('셰이더 생성에 실패했습니다.')
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(s) ?? '셰이더 컴파일 오류'
        gl.deleteShader(s)
        throw new Error(info)
      }
      return s
    }, [])

    const initGL = useCallback(() => {
      if (!glCanvasRef.current && typeof document !== 'undefined') {
        glCanvasRef.current = document.createElement('canvas')
      }
      const glCanvas = glCanvasRef.current
      if (!glCanvas) return
      const gl =
        glRef.current ??
        glCanvas.getContext('webgl', {
          alpha: true,
          antialias: false,
          preserveDrawingBuffer: true,
          premultipliedAlpha: false,
        })
      if (!gl) {
        throw new Error(
          '이 브라우저에서 WebGL을 사용할 수 없습니다. 하드웨어 가속을 켠 뒤 다시 열어주세요.'
        )
      }
      glRef.current = gl

      const prog = gl.createProgram()
      if (!prog) throw new Error('WebGL 프로그램 생성에 실패했습니다.')
      gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
      gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) ?? 'WebGL 링크 오류')
      }
      gl.useProgram(prog)
      programRef.current = prog

      const buf = gl.createBuffer()
      bufferRef.current = buf
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      )
      const loc = gl.getAttribLocation(prog, 'position')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

      const U: UniformMap = {}
      const names = [
        'Res',
        'Count',
        'Scale',
        'Rot',
        'Blend',
        'Warp',
        'Time',
        'Soft',
        'Ext',
        'Dir',
        'Flow',
        'Shift',
        'Contour',
        'Rim',
        'Grain',
        'GrainPx',
        'Seed',
        'BgAngle',
        'RimC',
        'BgA',
        'BgB',
        'BgMode',
        'Mode',
        'SpanFull',
        'RangeW',
        'Sdf',
        'Metal',
        'Vivid',
      ]
      for (const n of names) {
        U[n] = gl.getUniformLocation(prog, `u${n}`)
      }
      U.Geo = gl.getUniformLocation(prog, 'uGeo[0]')
      U.Rad = gl.getUniformLocation(prog, 'uRad[0]')
      U.C = gl.getUniformLocation(prog, 'uC[0]')
      uniformsRef.current = U
      glyphTexRef.current = null
      glyphTexKeyRef.current = null
    }, [compileShader])

    const uploadGlyph = useCallback((k: string) => {
      const gl = glRef.current
      if (!gl || glyphTexKeyRef.current === k) return
      const data = buildGlyphSdf(k, glyphsMapRef.current, sdfCacheRef.current)
      if (!glyphTexRef.current) {
        glyphTexRef.current = gl.createTexture()
      }
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, glyphTexRef.current)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        GT,
        GT,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        data
      )
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      glyphTexKeyRef.current = k
    }, [])

    const drawWebGLToCanvas = useCallback(
      (targetW: number, targetH: number): HTMLCanvasElement | null => {
        const gl = glRef.current
        const prog = programRef.current
        const glCanvas = glCanvasRef.current
        if (!gl || !prog || !glCanvas) return null

        if (glCanvas.width !== targetW || glCanvas.height !== targetH) {
          glCanvas.width = targetW
          glCanvas.height = targetH
        }
        const s = stateRef.current
        const U = uniformsRef.current
        gl.viewport(0, 0, targetW, targetH)
        gl.useProgram(prog)

        const g = computeGeometry(s, glyphsMapRef.current)
        if (g.glyph && s.glyph) {
          uploadGlyph(s.glyph)
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, glyphTexRef.current)
          gl.uniform1i(U.Sdf, 0)
          gl.uniform1f(U.SpanFull, g.spanFull ?? 1)
          gl.uniform1f(U.RangeW, (GRANGE / GT) * (g.spanFull ?? 1))
        }
        gl.uniform1i(U.Mode, g.glyph ? 1 : 0)
        gl.uniform2f(U.Res, targetW, targetH)
        gl.uniform1i(U.Count, s.segments.length)
        gl.uniform4fv(U.Geo, g.geo)
        gl.uniform4fv(U.Rad, g.rad)
        gl.uniform1f(U.Ext, Math.max(g.ext, 0.1))
        gl.uniform1f(U.Scale, s.scale / 100)
        gl.uniform1f(U.Rot, (s.rotation * Math.PI) / 180)
        gl.uniform1f(U.Blend, s.metaball ? (s.merge / (REF / 2)) * g.fit : 0)
        gl.uniform1f(U.Warp, s.warp / 100)
        gl.uniform1f(U.Time, timeRef.current)
        gl.uniform1f(U.Soft, s.soft / 100)
        gl.uniform1f(U.Dir, (s.direction * Math.PI) / 180)
        gl.uniform1f(U.Flow, s.flow / 100)
        gl.uniform1f(U.Shift, s.shift / 100 + motionOffsetRef.current)
        gl.uniform1f(U.Metal, s.metal / 100)
        gl.uniform1f(U.Vivid, s.vivid / 100)
        gl.uniform1f(U.Contour, s.contour / 100)
        gl.uniform1f(U.Rim, s.rim / 100)
        gl.uniform1f(U.Grain, s.grain / 100)
        gl.uniform1f(U.GrainPx, Math.max(1, Math.round(targetH / 700)))
        gl.uniform1f(U.Seed, s.seed)
        gl.uniform1f(U.BgAngle, (s.bgAngle * Math.PI) / 180)
        gl.uniform3fv(U.C, new Float32Array(s.colors.slice(0, 5).flatMap(hexToRgb)))
        gl.uniform3fv(U.RimC, new Float32Array(hexToRgb(s.colors[5])))
        gl.uniform3fv(U.BgA, new Float32Array(hexToRgb(s.bgA)))
        gl.uniform3fv(U.BgB, new Float32Array(hexToRgb(s.bgB)))
        gl.uniform1i(U.BgMode, { gradient: 0, solid: 1, transparent: 2 }[s.bgMode])
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        return glCanvas
      },
      [uploadGlyph]
    )

    // 현재 displayCanvas에 베이스 엔진(Shape WebGL 또는 2D Ribbon) + 오버레이 레이어를 합성한다.
    const drawCompositeFrame = useCallback(
      (customHead?: number) => {
        const displayCanvas = displayCanvasRef.current
        if (!displayCanvas) return
        const rawCtx = displayCanvas.getContext('2d')
        if (!rawCtx) return
        const w = displayCanvas.width
        const h = displayCanvas.height
        if (w <= 0 || h <= 0) return

        const ctxLike = toContextLike(rawCtx)
        if (engineModeRef.current === 'shape') {
          rawCtx.clearRect(0, 0, w, h)
          const glCanvas = drawWebGLToCanvas(w, h)
          if (glCanvas) {
            rawCtx.drawImage(glCanvas, 0, 0, w, h)
          }
          drawOverlayLayersOnto(
            ctxLike,
            overlayLayersRef.current,
            imageTrackerRef.current.getValues(),
            w,
            h
          )
        } else {
          const rLayer = ribbonLayerRef.current
          const rStamp = ribbonStampRef.current
          const rBase = ribbonBaseRef.current
          const { width: refW, height: refH } = resolveStageSize(stateRef.current.ratio)
          let path = pathRef.current
          if (!path) {
            path = buildPath(rLayer.seed, rLayer.irregularityPct, refW, refH)
            pathRef.current = path
          }
          const headVal = customHead !== undefined ? customHead : headRef.current
          if (customHead !== undefined) {
            headRef.current = customHead
          }

          // drawRibbonLayer는 내부에서 ctx.setTransform(...)을 직접 호출하므로,
          // 출력 해상도(w × h)가 기준 스테이지 크기(refW × refH)와 다를 때는
          // refW × refH 오프스크린 캔버스에 먼저 그린 뒤 displayCanvas(w × h)로 스케일 복사한다.
          let targetRibbonCtx: Canvas2DContextLike = ctxLike
          let offscreenCanvas: HTMLCanvasElement | null = null
          if (w !== refW || h !== refH) {
            if (!ribbonBufferRef.current) {
              ribbonBufferRef.current = createRawCanvas(refW, refH)
            }
            offscreenCanvas = ribbonBufferRef.current
            if (offscreenCanvas.width !== refW || offscreenCanvas.height !== refH) {
              offscreenCanvas.width = refW
              offscreenCanvas.height = refH
            }
            const offCtx = offscreenCanvas.getContext('2d')
            if (offCtx) {
              targetRibbonCtx = toContextLike(offCtx)
            } else {
              offscreenCanvas = null
            }
          }

          fillBackground(targetRibbonCtx, refW, refH, rLayer.backgroundColor)
          if (rStamp && rBase) {
            drawRibbonLayer(targetRibbonCtx, {
              stamp: rStamp,
              baseWidth: rBase.width,
              baseHeight: rBase.height,
              sizePct: rLayer.sizePct,
              rotationDeg: rLayer.rotationDeg,
              followPath: rLayer.followPath,
              path,
              head: headVal,
              gap: rLayer.gap,
              count: rLayer.count,
              stageWidth: refW,
              stageHeight: refH,
            })
          }

          if (offscreenCanvas) {
            rawCtx.clearRect(0, 0, w, h)
            rawCtx.imageSmoothingEnabled = true
            rawCtx.imageSmoothingQuality = 'high'
            rawCtx.drawImage(offscreenCanvas, 0, 0, refW, refH, 0, 0, w, h)
          }

          // drawImageLayer·drawTextLayer는 stageWidth/stageHeight 대비 비율(%)로 크기·위치를 계산하고
          // 내부에서 ctx.setTransform을 설정하므로 목표 해상도(w, h)를 직접 넘겨 선명하게 합성한다.
          drawOverlayLayersOnto(
            ctxLike,
            overlayLayersRef.current,
            imageTrackerRef.current.getValues(),
            w,
            h
          )
        }
      },
      [drawWebGLToCanvas]
    )

    const renderLoop = useCallback(
      function loop(stamp: number) {
        rafIdRef.current = null
        const isAnimating = stateRef.current.animate || forceAnimateRef.current
        if (isAnimating) {
          if (lastStampRef.current) {
            const rawDt = Math.min((stamp - lastStampRef.current) / 1000, 0.1)
            if (engineModeRef.current === 'shape') {
              const dt = (rawDt * stateRef.current.speed) / 100
              timeRef.current += dt
              motionOffsetRef.current += dt * 0.06
            } else {
              const path = pathRef.current
              if (path && path.total > 0) {
                headRef.current = (headRef.current + ribbonLayerRef.current.speed * rawDt) % path.total
              }
            }
          }
          lastStampRef.current = stamp
        } else {
          lastStampRef.current = 0
        }
        drawCompositeFrame()
        if (isAnimating) {
          rafIdRef.current = requestAnimationFrame(loop)
        }
      },
      [drawCompositeFrame]
    )

    const requestDraw = useCallback(() => {
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(renderLoop)
      }
    }, [renderLoop])

    const resizeStage = useCallback(() => {
      if (exportingRef.current) return
      const st = stageRef.current
      const wrap = artWrapRef.current
      const canvas = displayCanvasRef.current
      if (!st || !wrap || !canvas) return

      const [a, b] = stateRef.current.ratio.split(':').map(Number)
      const cs = getComputedStyle(st)
      const maxW =
        st.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0')
      const maxH =
        st.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0')
      const w = Math.max(100, Math.min(maxW, (maxH * a) / b))
      const h = (w * b) / a
      wrap.style.width = `${Math.round(w)}px`
      wrap.style.height = `${Math.round(h)}px`

      if (engineModeRef.current === 'ribbon') {
        const { width: rw, height: rh } = resolveStageSize(stateRef.current.ratio)
        canvas.width = rw
        canvas.height = rh
      } else {
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      setCanvasMeta(
        `PREVIEW · ${engineModeRef.current === 'shape' ? 'Shape' : 'Ribbon'} · ${stateRef.current.ratio} · ${Math.round(w)} × ${Math.round(h)}`
      )
      requestDraw()
    }, [requestDraw])

    useEffect(() => {
      const stage = stageRef.current
      if (!stage) return

      try {
        initGL()
        setGlError(null)
        onStatusChange('실시간 렌더링')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'WebGL 초기화 실패'
        setGlError(msg)
        onStatusChange('WebGL 사용할 수 없음')
      }

      const glCanvas = glCanvasRef.current
      const handleContextLost = (e: Event) => {
        e.preventDefault()
        programRef.current = null
        onStatusChange('GPU 연결 중단')
      }
      const handleContextRestored = () => {
        try {
          initGL()
          setGlError(null)
          onStatusChange('실시간 렌더링')
          requestDraw()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'WebGL 복구 실패'
          setGlError(msg)
        }
      }

      glCanvas?.addEventListener('webglcontextlost', handleContextLost)
      glCanvas?.addEventListener('webglcontextrestored', handleContextRestored)

      const ro = new ResizeObserver(() => resizeStage())
      ro.observe(stage)
      resizeStage()

      const imageTracker = imageTrackerRef.current
      const fontTracker = fontTrackerRef.current

      return () => {
        recAbortRef.current = true
        ro.disconnect()
        glCanvas?.removeEventListener('webglcontextlost', handleContextLost)
        glCanvas?.removeEventListener('webglcontextrestored', handleContextRestored)
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        imageTracker.dispose()
        fontTracker.dispose()
        const gl = glRef.current
        if (gl) {
          if (glyphTexRef.current) {
            gl.deleteTexture(glyphTexRef.current)
            glyphTexRef.current = null
          }
          if (bufferRef.current) {
            gl.deleteBuffer(bufferRef.current)
            bufferRef.current = null
          }
          if (programRef.current) {
            gl.deleteProgram(programRef.current)
            programRef.current = null
          }
        }
      }
    }, [initGL, onStatusChange, requestDraw, resizeStage])

    useEffect(() => {
      engineModeRef.current = engineMode
      stateRef.current = state
      ribbonLayerRef.current = ribbonLayer
      overlayLayersRef.current = overlayLayers
      glyphsMapRef.current = glyphsMap
      for (const k of Object.keys(sdfCacheRef.current)) {
        if (!(k in glyphsMap)) {
          delete sdfCacheRef.current[k]
        }
      }
      if (glyphTexKeyRef.current && !(glyphTexKeyRef.current in glyphsMap)) {
        glyphTexKeyRef.current = null
      }
      resizeStage()
      requestDraw()
    }, [engineMode, state, ribbonLayer, overlayLayers, glyphsMap, ribbonStamp, resizeStage, requestDraw])

    useImperativeHandle(
      ref,
      () => ({
        getCanvas: () => displayCanvasRef.current,
        getPathTotal: () => pathRef.current?.total ?? 0,
        getHead: () => headRef.current,
        setHead: (head: number) => {
          headRef.current = head
          const total = pathRef.current?.total ?? 0
          setHeadPct(total > 0 ? (head / total) * 100 : 0)
        },
        drawAtHead: (head: number) => {
          drawCompositeFrame(head)
        },
        setExporting: (exporting: boolean) => {
          exportingRef.current = exporting
        },
        areImageAssetsReady: () => imageTrackerRef.current.isIdle(),
        waitForImageAssets: () => imageTrackerRef.current.waitUntilIdle(),
        getMissingImageAssetCount: () =>
          overlayLayersRef.current.filter(
            (l): l is ImageLayerConfig =>
              l.type === 'image' && !imageTrackerRef.current.has(l.assetUrl)
          ).length,
        areFontsReady: () => fontTrackerRef.current.isIdle(),
        waitForFonts: () => fontTrackerRef.current.waitUntilIdle(),
        getMissingFontCount: () =>
          overlayLayersRef.current.filter(
            (l): l is TextLayerConfig =>
              l.type === 'text' &&
              !isSystemDefaultFont(l.font) &&
              !fontTrackerRef.current.has(buildFontLoadKey(l.font))
          ).length,
        resetMotionTime: () => {
          timeRef.current = 0
          motionOffsetRef.current = 0
          lastStampRef.current = 0
          headRef.current = 0
          setHeadPct(0)
          requestDraw()
        },
        exportPng: async (size: number) => {
          const canvas = displayCanvasRef.current
          if (!canvas || exportingRef.current) return

          exportingRef.current = true
          onExportBusyChange(true)
          try {
            if (!imageTrackerRef.current.isIdle()) {
              toast.info('이미지를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
              await imageTrackerRef.current.waitUntilIdle()
            }
            if (!fontTrackerRef.current.isIdle()) {
              toast.info('폰트를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
              await fontTrackerRef.current.waitUntilIdle()
            }

            if (engineModeRef.current === 'shape') {
              const gl = glRef.current
              if (!gl || !programRef.current) {
                throw new Error('WebGL을 사용할 수 없습니다.')
              }
              const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
              if (size > max) {
                throw new Error(`이 기기의 최대 출력 크기는 ${max}px입니다.`)
              }
            }

            const [a, b] = stateRef.current.ratio.split(':').map(Number)
            const w = a >= b ? size : Math.round((size * a) / b)
            const h = a >= b ? Math.round((size * b) / a) : size
            const ow = canvas.width
            const oh = canvas.height
            let blob: Blob | null = null
            try {
              canvas.width = w
              canvas.height = h
              drawCompositeFrame()
              if (engineModeRef.current === 'shape' && glRef.current) {
                if (glRef.current.getError() !== glRef.current.NO_ERROR) {
                  throw new Error('GPU 출력에 실패했습니다. 더 작은 크기로 시도해주세요.')
                }
              }
              blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
              if (!blob) throw new Error('PNG 생성에 실패했습니다.')
            } finally {
              canvas.width = ow
              canvas.height = oh
              drawCompositeFrame()
            }
            downloadBlob(blob, `shape-studio-${Date.now()}.png`)
            toast(`${w} × ${h} PNG 저장 완료`)
          } catch (err) {
            toast(err instanceof Error ? err.message : 'PNG 저장에 실패했습니다.')
          } finally {
            exportingRef.current = false
            onExportBusyChange(false)
          }
        },
        recordVideo: async (longSide: number) => {
          const canvas = displayCanvasRef.current
          if (!canvas || exportingRef.current) return

          const canvasWithStream = canvas as HTMLCanvasElement & {
            captureStream?: (frameRate?: number) => MediaStream
          }
          if (
            typeof window === 'undefined' ||
            !('MediaRecorder' in window) ||
            !canvasWithStream.captureStream
          ) {
            toast('이 브라우저는 동영상 저장을 지원하지 않아요. Chrome에서 열어주세요.')
            return
          }
          const type = pickVideoType()
          if (!type) {
            toast('지원되는 동영상 형식이 없어요.')
            return
          }

          exportingRef.current = true
          recAbortRef.current = false
          onExportBusyChange(true)
          onVideoRecordingChange(true, `녹화 중 0 / ${VIDEO_SEC}초`)

          const [a, b] = stateRef.current.ratio.split(':').map(Number)
          let w = a >= b ? longSide : Math.round((longSide * a) / b)
          let h = a >= b ? Math.round((longSide * b) / a) : longSide
          w -= w % 2
          h -= h % 2

          const prev = {
            w: canvas.width,
            h: canvas.height,
            time: timeRef.current,
            motion: motionOffsetRef.current,
            head: headRef.current,
          }

          const chunks: BlobPart[] = []
          let stream: MediaStream | null = null
          let timer: ReturnType<typeof setInterval> | null = null

          try {
            if (!imageTrackerRef.current.isIdle()) {
              await imageTrackerRef.current.waitUntilIdle()
            }
            if (!fontTrackerRef.current.isIdle()) {
              await fontTrackerRef.current.waitUntilIdle()
            }

            forceAnimateRef.current = true
            timeRef.current = 0
            motionOffsetRef.current = 0
            lastStampRef.current = 0
            canvas.width = w
            canvas.height = h
            requestDraw()

            stream = canvasWithStream.captureStream(30)
            const recorder = new MediaRecorder(stream, {
              mimeType: type,
              videoBitsPerSecond: Math.round(w * h * 30 * 0.14),
            })
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunks.push(e.data)
            }
            const done = new Promise<void>((res) => {
              recorder.onstop = () => res()
            })
            recorder.start(500)
            const t0 = performance.now()
            await new Promise<void>((res) => {
              timer = setInterval(() => {
                const el = (performance.now() - t0) / 1000
                onVideoRecordingChange(
                  true,
                  `녹화 중 ${Math.min(VIDEO_SEC, Math.floor(el))} / ${VIDEO_SEC}초`
                )
                if (el >= VIDEO_SEC || recAbortRef.current) {
                  if (timer) clearInterval(timer)
                  res()
                }
              }, 200)
            })
            recorder.stop()
            await done

            if (recAbortRef.current) {
              toast('녹화를 취소했어요.')
            } else {
              const blob = new Blob(chunks, { type: type.split(';')[0] })
              if (!blob.size) throw new Error('녹화된 영상이 비어 있어요.')
              const isMp4 = type.startsWith('video/mp4')
              downloadBlob(blob, `shape-studio-${Date.now()}${isMp4 ? '.mp4' : '.webm'}`)
              toast(`${w} × ${h} · ${VIDEO_SEC}초 ${isMp4 ? 'MP4' : 'WebM'} 저장 완료`)
            }
          } catch (err) {
            toast(err instanceof Error ? err.message : '동영상 저장에 실패했어요.')
          } finally {
            if (timer) clearInterval(timer)
            if (stream) stream.getTracks().forEach((t) => t.stop())
            forceAnimateRef.current = false
            timeRef.current = prev.time
            motionOffsetRef.current = prev.motion
            headRef.current = prev.head
            canvas.width = prev.w
            canvas.height = prev.h
            exportingRef.current = false
            onExportBusyChange(false)
            onVideoRecordingChange(false, `동영상 저장 (${VIDEO_SEC}초)`)
            resizeStage()
            requestDraw()
          }
        },
        cancelVideo: () => {
          recAbortRef.current = true
        },
      }),
      [drawCompositeFrame, onExportBusyChange, onVideoRecordingChange, requestDraw, resizeStage]
    )

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault()
      }
    }

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return
      e.preventDefault()
      onDropShapeFile(e.dataTransfer.files[0])
    }

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#eceeea]">
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <span className="text-[11px] tracking-[0.3px] text-[#7f8582]">{canvasMeta}</span>
          {engineMode === 'ribbon' && !state.animate && (
            <div className="flex items-center gap-2 text-[11px] text-[#7f8582]">
              <span className="whitespace-nowrap">머리 위치</span>
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
                  requestDraw()
                }}
                className="h-3.5 w-28 cursor-pointer accent-[#5f7a45]"
                aria-label="머리 위치"
              />
              <span className="w-10 text-right font-mono text-[10px] tabular-nums">
                {headPct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div
          ref={stageRef}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDrop={handleDrop}
          className="flex min-h-[150px] flex-1 items-center justify-center overflow-hidden px-[30px] pt-1.5 pb-[18px]"
        >
          <div
            ref={artWrapRef}
            className="relative overflow-hidden rounded-[14px] bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]"
            style={{
              backgroundImage:
                'linear-gradient(45deg,#e5e8e1 25%,transparent 25%),linear-gradient(-45deg,#e5e8e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e8e1 75%),linear-gradient(-45deg,transparent 75%,#e5e8e1 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
            }}
          >
            <canvas
              ref={displayCanvasRef}
              aria-label="실시간 그라데이션 쉐입 미리보기"
              className="block h-full w-full"
            />
            {glError && engineMode === 'shape' && (
              <div className="absolute inset-0 bg-[#f8f9f6] p-8 text-[#8b312f] break-keep wrap-break-word">
                {glError}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 px-6 pb-[18px] text-[11px] text-[#7f8582]">
          <span className="hidden sm:inline break-keep wrap-break-word">
            <kbd className="mr-1 rounded border border-[#cdd4c9] bg-[#fafcf7] px-1.5 py-0.5 text-[10px]">
              Space
            </kbd>
            랜덤 &nbsp;
            <kbd className="mr-1 rounded border border-[#cdd4c9] bg-[#fafcf7] px-1.5 py-0.5 text-[10px]">
              ⌘/Ctrl Z
            </kbd>
            되돌리기
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canUndo}
              onClick={onUndo}
              className="h-7 px-2.5 text-[11px] whitespace-nowrap"
            >
              되돌리기
            </Button>
          </div>
        </footer>
      </div>
    )
  }
)

export default ShapeStudioViewport
