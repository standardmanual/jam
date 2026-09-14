'use client'

/**
 * 쉐이더 랩 — WebGPU 캔버스 raw 픽셀 캡처 결과를 PNG Blob으로 변환 (티켓 20260914_1139)
 *
 * `useShaderLabPlayback().captureFrame()`이 반환하는 straight-alpha RGBA(Uint8ClampedArray,
 * 렌더타겟에서 직접 읽은 값)를 2D 캔버스에 `putImageData()`한 뒤 `toBlob()`한다. 2D 캔버스는
 * WebGPU premultiplied swap chain 문제(티켓 20260914_1045 재발 조사 결과)와 무관해
 * `canvas.toBlob()`으로 alpha가 그대로 보존된다 — `canvas.toDataURL()`/`toBlob()`/
 * `drawImage()`로 WebGPU 캔버스 자체를 직접 읽던 기존 경로는 이 함수로 대체한다.
 */
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'

export type ShaderLabCaptureFrameFn = (
  x: number,
  y: number,
  width: number,
  height: number
) => Promise<Uint8ClampedArray | null>

export async function captureShaderLabFrameToBlob(
  captureFrame: ShaderLabCaptureFrameFn,
  width: number,
  height: number
): Promise<Blob> {
  const pixels = await captureFrame(0, 0, width, height)
  if (!pixels) throw new Error('캔버스에서 픽셀을 읽지 못했어요.')

  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const ctx = offscreen.getContext('2d')
  if (!ctx) throw new Error('픽셀을 옮겨 담을 캔버스를 만들지 못했어요.')

  // 브라우저별 ImageData 생성자 타입 정의 차이(Uint8ClampedArray의 ArrayBuffer 제네릭)를
  // 피하려고 createImageData() + set()으로 채운다.
  const imageData = ctx.createImageData(width, height)
  imageData.data.set(pixels)
  ctx.putImageData(imageData, 0, 0)
  return canvasToBlob(offscreen)
}
