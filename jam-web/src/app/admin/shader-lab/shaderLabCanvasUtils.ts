'use client'

// 쉐이더 랩 캔버스 -> PNG 변환 공용 유틸 (티켓 20260917_1443).
// 모서리 라운드 토글·배지/미션/컬렉션 저장 600x600 고정 리사이즈에서 공통으로 쓴다.
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'

/**
 * 배지/미션/컬렉션 적용 시 저장 크기(정사각형, px). 티켓 20260917_1443 — 서비스에 노출되는
 * 대표이미지 규격을 600x600으로 고정한다.
 */
export const APPLY_IMAGE_SIZE_PX = 600

/**
 * 모서리 라운드 토글의 반경(px) — 600x600 기준. PNG 다운로드(1920x1920 유지)에 적용할 때는
 * `APPLY_ROUND_RADIUS_PX * (다운로드 해상도 / APPLY_IMAGE_SIZE_PX)`로 비례 확대해서 쓴다.
 */
export const APPLY_ROUND_RADIUS_PX = 72

/**
 * PNG blob을 디코딩된 `<img>`로 로드한다. 쉐이더 랩 캔버스는 WebGPU 컨텍스트라
 * `drawImage(webgpuCanvas, ...)`로 직접 리사이즈/클립하면 빈 화면(완전 투명)이 그려지는 걸
 * 실측으로 확인했다(같은 프로젝트가 이미 겪은 WebGL↔WebGPU 캔버스 브릿지 문제와 같은 종류 —
 * `liquid-metal-pass.js`가 WebGL 캔버스를 2D로 매 프레임 미러링하는 이유와 동일). 그래서
 * `canvas.toBlob()`으로 먼저 표준 PNG를 만든 뒤 그걸 `<img>`로 디코딩하면, 이후 리사이즈/클립은
 * 순수 2D 캔버스 간 `drawImage`라 문제없이 동작한다.
 */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했어요.'))
    }
    img.src = url
  })
}

/** 쉐이더 랩 캔버스(WebGPU)를 2D 드로잉 소스로 쓸 수 있는 `<img>`로 변환한다. */
export async function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  const blob = await canvasToBlob(canvas)
  return loadImageFromBlob(blob)
}

/**
 * 이미지를 `size × size` 정사각 캔버스에 그린다. `radiusPx`가 주어지면 그만큼의 반경으로
 * 둥근 사각형 클립 패스를 먼저 적용해, 패스 밖 영역은 완전 투명(alpha 0)으로 남긴다.
 */
export function drawImageToCanvas(image: HTMLImageElement, size: number, radiusPx: number | null): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('캔버스를 만들지 못했어요.')

  ctx.clearRect(0, 0, size, size)
  if (radiusPx !== null && radiusPx > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(0, 0, size, size, radiusPx)
    ctx.clip()
    ctx.drawImage(image, 0, 0, size, size)
    ctx.restore()
  } else {
    ctx.drawImage(image, 0, 0, size, size)
  }
  return out
}
