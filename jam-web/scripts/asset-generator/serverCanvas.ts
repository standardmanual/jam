/**
 * JAM! 에셋 제너레이터 — 서버 캔버스 구현체 (@napi-rs/canvas, 2026-09-25 사용자 승인)
 * 티켓 20260924_2201
 *
 * `../../src/lib/asset-generator/render.ts`의 CanvasFactory·ImageLoader 인터페이스(15~83줄)를
 * 서버 캔버스 라이브러리로 구현한다. 브라우저 쪽(AssetGeneratorViewport.tsx 133~146줄)의 경계
 * 캐스트 2개(toCanvasLike·toContextLike) 방식을 그대로 따른다 — render.ts의 인터페이스는
 * 브라우저·서버 어느 한쪽에도 치우치지 않도록 최소 메서드만 선언해 실제 네이티브 타입과
 * 구조적으로 완전히 일치하지 않는다(예: napi-rs의 drawImage는 `Image | Canvas` 합집합을 받지만
 * 라이브러리는 `ImageSourceLike` 하나만 받는다). 런타임에는 이 모듈이 실제로 쓰는 메서드를
 * napi-rs 쪽이 전부 구현하므로, 여기 두 지점에서만 타입을 좁혀 이어준다.
 *
 * ctx.filter 블러 실측(2026-09-25): @napi-rs/canvas의 SKRSContext2D는 `filter =
 * 'blur(Npx)'`를 그대로 지원한다(하드에지 사각형에 blur(3px)를 적용해 픽셀 값이 매끄러운
 * 그라디언트로 바뀌는 것을 확인) — render.ts의 `supportsCanvasFilter`가 true를 반환해 브라우저와
 * 같은 필터 경로(buildStamp → blurCanvas의 filter 분기)를 타고, 축소·확대 폴백 경로는 쓰이지
 * 않는다. 브라우저와 서버가 다른 결과를 내는 지점은 없다.
 *
 * 알파 바운딩 박스 자르기(cropToAlphaBounds)는 브라우저 쪽
 * (AssetGeneratorViewport.tsx의 동명 함수, 194~224줄)과 같은 알고리즘이지만, 그 파일은 리액트
 * 컴포넌트·브라우저 전용 훅(useEffect 등)을 함께 담고 있어 서버 스크립트가 통째로 import하기
 * 부적절해 여기 따로 둔다(수정 금지 대상 모방 아님, 중복 작성 —
 * `src/app/admin/asset-generator/assetGeneratorHelpers.ts`의 generateLayerId 주석과 같은 사유).
 */
import { createCanvas, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import type {
  Canvas2DContextLike,
  CanvasFactory,
  CanvasLike,
  ImageLoader,
  ImageLoaderInput,
  ImageSourceLike,
} from '../../src/lib/asset-generator/render'

function toCanvasLike(canvas: Canvas): CanvasLike {
  return canvas as unknown as CanvasLike
}
function toContextLike(ctx: SKRSContext2D): Canvas2DContextLike {
  return ctx as unknown as Canvas2DContextLike
}

/** render.ts의 CanvasFactory 구현체(서버). */
export const serverCanvasFactory: CanvasFactory = (width, height) =>
  toCanvasLike(createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height))))

/** render.ts가 넘겨준 CanvasLike에서 실제 2D 컨텍스트를 꺼낸다(경계 캐스트, render.mjs가
 *  스테이지 캔버스에 쓴다 — plain JS인 render.mjs에는 타입이 없어 이 캐스트가 굳이 필요하지
 *  않지만, "캔버스 → 컨텍스트"를 얻는 지점을 한 곳으로 모아 두 파일이 같은 방식을 쓰게 한다). */
export function getServerContext(canvas: CanvasLike): Canvas2DContextLike {
  return toContextLike((canvas as unknown as Canvas).getContext('2d'))
}

/**
 * URL 또는 바이트를 캔버스로 읽어들인다(원본 크기 그대로, 알파 자르기는 하지 않는다). 리본
 * 원천 그래픽 로드(자르기 전 단계, render.mjs가 cropToAlphaBounds와 함께 쓴다)와 오버레이
 * 이미지 레이어 로드(serverImageLoader)가 함께 쓴다. `loadImage`는 문자열 URL을 직접
 * 받으면 내부에서 내려받는다(napi-rs/canvas 공개 API, `LoadImageOptions` 참고).
 */
export async function loadImageAsCanvas(source: string | Buffer): Promise<Canvas> {
  const image: Image = await loadImage(source)
  const canvas = createCanvas(image.width, image.height)
  canvas.getContext('2d').drawImage(image, 0, 0)
  return canvas
}

/**
 * render.ts의 ImageLoader 구현체(서버). 오버레이 이미지 레이어는 알파 자르기 없이 그대로 쓴다
 * (브라우저 loadImageLayerAsset과 같은 정책, AssetGeneratorViewport.tsx 251~259줄).
 */
export const serverImageLoader: ImageLoader = async (input: ImageLoaderInput): Promise<ImageSourceLike> => {
  const canvas = 'url' in input ? await loadImageAsCanvas(input.url) : await loadImageAsCanvas(Buffer.from(input.data))
  return toCanvasLike(canvas)
}

/**
 * 알파 있는 픽셀의 바운딩 박스만큼 잘라낸 캔버스를 돌려준다(리본 원천 그래픽 전용, buildStamp에
 * 넘기기 전 단계). 불투명 픽셀이 없으면 null.
 */
export function cropToAlphaBounds(source: Canvas): Canvas | null {
  const w = source.width
  const h = source.height
  const data = source.getContext('2d').getImageData(0, 0, w, h).data
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
  const cropped = createCanvas(bw, bh)
  cropped.getContext('2d').drawImage(source, x0, y0, bw, bh, 0, 0, bw, bh)
  return cropped
}
