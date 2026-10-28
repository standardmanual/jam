/**
 * 운영툴 서랍 이미지 — 브라우저 렌더 어댑터 (티켓 20261007_0945, 상위 20261006_1803 ③-a)
 *
 * `renderPresetToPngBlob({ presetId, bg, end, values, seed })`가 프리셋을 읽어 PNG Blob 한 장을 만든다. 조립은 `renderPreset.ts`가 하고,
 * 이 파일은 브라우저에서만 필요한 부품(캔버스 팩토리·이미지·글꼴 로더·브랜드 글자·알파 자르기·Blob 변환)을 붙인다.
 * 시드는 호출부가 정해 넘긴다. 서버 전용 모듈(`opsInbox/image.ts`·`scripts/asset-generator/*`·`serverCanvas.ts`)은 가져오지 않는다.
 *
 * 글꼴·이미지 로드에는 시간 제한이 있다. 제한을 넘기거나 실패하면 던진다 — 호출부가 「이미지 제작 필요」로 남긴다(조용히 폴백 글꼴로 그리지 않는다).
 * `AssetGeneratorViewport.tsx`는 고치지 않았고 같은 조립이 어드민 화면·CLI·여기 세 벌이 된다(브랜드 글자 값은 그 파일과 같다).
 */
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import { loadFontInBrowser } from '@/app/admin/asset-generator/assetGeneratorHelpers'
import { renderPresetToCanvas, type RenderPresetDeps } from '@/lib/asset-generator/renderPreset'
import type { CanvasFactory, CanvasLike, FontLoader, ImageLoader, ImageSourceLike } from '@/lib/asset-generator/render'
import type { AssetPreset } from '@/lib/asset-generator/types'

/** 글꼴·이미지 한 건을 기다리는 최대 시간(ms) */
export const RENDER_LOAD_TIMEOUT_MS = 15_000

/** 브랜드 글자 'J' 원천(어드민 화면 `AssetGeneratorViewport.tsx`의 BRAND_LETTERS.J와 같은 값). */
const BRAND_J = {
  w: 136.018,
  h: 204.628,
  d: 'M136.018 128.585C136.018 170.589 101.954 204.628 59.944 204.628H0V128.585H42.24C52.026 128.585 59.957 120.657 59.957 110.875L59.957 54.735L0 54.862L0 0H136.018V128.585Z',
}
const BRAND_LONG_SIDE_PX = 512

export function brandLetterJSvgMarkup(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BRAND_J.w}" height="${BRAND_J.h}" viewBox="0 0 ${BRAND_J.w} ${BRAND_J.h}"><path d="${BRAND_J.d}" fill="#000"/></svg>`
}

/** 시간 제한을 건다. 넘기면 `message`로 던진다. */
export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

function createRawCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export const browserCanvasFactory: CanvasFactory = (width, height) => createRawCanvas(width, height) as unknown as CanvasLike

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // 캔버스를 PNG로 내보내려면 오염되지 않아야 한다
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 읽지 못했어요.'))
    img.src = src
  })
}

/** 이미지 레이어 원본을 원본 해상도 그대로 캔버스로 읽는다(알파 자르기·축소 없음). */
export const browserImageLoader: ImageLoader = async (input) => {
  let url: string
  let revoke = false
  if ('url' in input) {
    url = input.url
  } else {
    url = URL.createObjectURL(new Blob([input.data as BlobPart], { type: input.mimeType }))
    revoke = true
  }
  try {
    const img = await withTimeout(loadHtmlImage(url), RENDER_LOAD_TIMEOUT_MS, '이미지를 불러오는 데 시간이 너무 오래 걸렸어요.')
    const canvas = createRawCanvas(img.naturalWidth || 1, img.naturalHeight || 1)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas as unknown as ImageSourceLike
  } finally {
    if (revoke) URL.revokeObjectURL(url)
  }
}

/** 글꼴 로더 — 어드민 화면의 `loadFontInBrowser`에 시간 제한을 건다. */
export const browserFontLoader: FontLoader = (font) =>
  withTimeout(loadFontInBrowser(font), RENDER_LOAD_TIMEOUT_MS, `"${font.family}" 폰트를 불러오는 데 시간이 너무 오래 걸렸어요.`)

/** 알파 바운딩 박스로 잘라낸 캔버스를 돌려준다. 불투명 픽셀이 없으면 null(어드민 화면·서버와 같은 알고리즘, 임계값 8). */
export function cropToAlphaBounds(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = source.width
  const h = source.height
  const data = source.getContext('2d')!.getImageData(0, 0, w, h).data
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

async function loadBrandBase(): Promise<CanvasLike | null> {
  const blob = new Blob([brandLetterJSvgMarkup()], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await withTimeout(loadHtmlImage(url), RENDER_LOAD_TIMEOUT_MS, '원천 그래픽을 불러오는 데 시간이 너무 오래 걸렸어요.')
    const long = Math.max(img.naturalWidth || BRAND_J.w, img.naturalHeight || BRAND_J.h)
    const scale = BRAND_LONG_SIDE_PX / long
    const canvas = createRawCanvas((img.naturalWidth || BRAND_J.w) * scale, (img.naturalHeight || BRAND_J.h) * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return cropToAlphaBounds(canvas) as unknown as CanvasLike | null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const browserRenderDeps: RenderPresetDeps = {
  canvasFactory: browserCanvasFactory,
  imageLoader: browserImageLoader,
  fontLoader: browserFontLoader,
  loadBase: loadBrandBase,
}

/** 프리셋 한 건을 읽는다(`GET /api/admin/asset-generator/presets/[id]`). 실패하면 한국어 메시지로 던진다. */
export async function fetchPreset(presetId: string): Promise<AssetPreset> {
  let res: Response
  try {
    res = await fetch(`/api/admin/asset-generator/presets/${encodeURIComponent(presetId)}`, { cache: 'no-store' })
  } catch {
    throw new Error('프리셋을 불러오지 못했어요. 네트워크 연결을 확인해 주세요.')
  }
  if (res.status === 404) throw new Error('프리셋을 찾을 수 없어요.')
  if (!res.ok) throw new Error('프리셋을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  const body: unknown = await res.json().catch(() => null)
  const preset = (body as { preset?: AssetPreset } | null)?.preset
  if (!preset || !Array.isArray(preset.layers) || typeof preset.stageRatio !== 'string') {
    throw new Error('프리셋을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }
  return preset
}

export interface RenderPresetToPngArgs {
  presetId: string
  bg: string
  end: string
  values?: Record<string, string>
  /** 호출부가 정해 넘긴다 */
  seed: number
}

/** 프리셋·색·문안·시드로 PNG Blob 한 장을 만든다. 어떤 실패든 한국어 메시지의 Error를 던진다. */
export async function renderPresetToPngBlob(args: RenderPresetToPngArgs, deps: RenderPresetDeps = browserRenderDeps): Promise<Blob> {
  const preset = await fetchPreset(args.presetId)
  const { canvas } = await renderPresetToCanvas({ preset, bg: args.bg, end: args.end, values: args.values, seed: args.seed }, deps)
  return canvasToBlob(canvas as unknown as HTMLCanvasElement)
}
