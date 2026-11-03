/**
 * 에셋 스튜디오의 오버레이 레이어(이미지·텍스트) 합성 도구 (티켓 20261103_1735)
 *
 * `ShapeStudioViewport`(Shape·Ribbon)와 `logo3d/Logo3DViewport`(3D)가 같은 규칙으로 레이어를 그리도록 한곳에 둔다.
 * - `drawOverlayLayersOnto`: 레이어 배열의 뒤에서부터(아래 층부터) 그린다. 위치·크기는 스테이지 대비 %라 해상도와 무관하다.
 * - `useOverlayAssets`: 이미지 원본과 구글 폰트를 불러와 추적한다. 저장·적용 전에 `waitUntilIdle`로 기다릴 수 있다.
 */
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  drawImageLayer,
  drawTextLayer,
  type Canvas2DContextLike,
  type CanvasFactory,
  type CanvasLike,
  type ImageLayerConfig,
  type OverlayLayerConfig,
  type TextLayerFont,
} from '@/lib/asset-generator'
import {
  buildFontLoadKey,
  isSystemDefaultFont,
  loadFontInBrowser,
} from '@/app/admin/asset-generator/assetGeneratorHelpers'
import { createAssetLoadTracker } from '@/app/admin/asset-generator/assetLoadTracker'

export function toCanvasLike(canvas: HTMLCanvasElement): CanvasLike {
  return canvas as unknown as CanvasLike
}

export function toContextLike(ctx: CanvasRenderingContext2D): Canvas2DContextLike {
  return ctx as unknown as Canvas2DContextLike
}

export function createRawCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export const IMAGE_LAYER_SVG_FALLBACK_LONG_SIDE = 2048
export const makeCanvas: CanvasFactory = (width, height) => toCanvasLike(createRawCanvas(width, height))

export function normalizeSvgMarkup(text: string, fallbackLongSide = 512): string {
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

export async function loadImageLayerAsset(url: string): Promise<HTMLCanvasElement> {
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

export function drawOverlayLayersOnto(
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

/**
 * 오버레이 이미지·폰트 로더 추적기와 불러오기 효과. 새로 불러오기가 끝나면 `onLoaded`를 부른다.
 * `onLoaded`는 ref로 들고 있어 효과가 다시 돌지 않는다.
 */
export function useOverlayAssets(overlayLayers: OverlayLayerConfig[], onLoaded: () => void) {
  const imageTrackerRef = useRef(createAssetLoadTracker<CanvasLike>())
  const fontTrackerRef = useRef(createAssetLoadTracker<true>())
  const onLoadedRef = useRef(onLoaded)
  useEffect(() => {
    onLoadedRef.current = onLoaded
  })

  // 오버레이 이미지 레이어 로드
  useEffect(() => {
    const tracker = imageTrackerRef.current
    const imageLayers = overlayLayers.filter((l): l is ImageLayerConfig => l.type === 'image')
    const currentUrls = new Set(imageLayers.map((l) => l.assetUrl))
    tracker.prune(currentUrls)

    let cancelled = false
    void tracker
      .loadMissing(
        Array.from(currentUrls),
        async (url) => toCanvasLike(await loadImageLayerAsset(url)),
        {
          isCancelled: () => cancelled,
          onError: (_url, e) => toast.error(e instanceof Error ? e.message : '이미지 레이어를 불러오지 못했어요.'),
        }
      )
      .then(() => {
        if (!cancelled) onLoadedRef.current()
      })
    return () => {
      cancelled = true
    }
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
          onError: (_key, e) => toast.error(e instanceof Error ? e.message : '폰트를 불러오지 못했어요.'),
        }
      )
      .then(() => {
        if (!cancelled) onLoadedRef.current()
      })
    return () => {
      cancelled = true
    }
  }, [overlayLayers])

  return { imageTrackerRef, fontTrackerRef }
}
