'use client'

/**
 * 쉐이더 랩 — 캔버스 뷰포트 (티켓 20260912_1951, 재생 기능 제거 20260913_1819)
 *
 * 실시간 프리뷰(WYSIWYG). 내부 렌더링 배관은 `useShaderLabPlayback.ts` 참고.
 * 내보내기(`ShaderLabExportPanel`)는 WebGPU 캔버스를 직접 toBlob()하지 않고, 이 컴포넌트가
 * `captureFrameRef`로 넘겨주는 `captureFrame()`(렌더타겟 raw 픽셀 readback)을 쓴다 —
 * 티켓 20260914_1139, `canvas.toDataURL()`/`toBlob()`로는 alpha가 항상 255로 고정되는
 * premultiplied swap chain 문제를 우회하기 위함(완료 기록 참고).
 */
import { forwardRef, useEffect, useState, type RefObject } from 'react'
import type { ShaderLabConfig } from '@basementstudio/shader-lab'
import { useShaderLabPlayback } from '@/lib/admin/shaderLab/useShaderLabPlayback'
import type { ShaderLabCaptureFrameFn } from '@/lib/admin/shaderLab/captureShaderLabFrameToBlob'
import { SHADER_LAB_OUTPUT_SIZE } from '@/lib/admin/shaderLab/composition'

interface ShaderLabViewportProps {
  config: ShaderLabConfig
  captureFrameRef: RefObject<ShaderLabCaptureFrameFn | null>
}

const ShaderLabViewport = forwardRef<HTMLCanvasElement, ShaderLabViewportProps>(function ShaderLabViewport(
  { config, captureFrameRef },
  canvasRef
) {
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const { ready, captureFrame } = useShaderLabPlayback(config, { canvas: canvasEl })

  useEffect(() => {
    captureFrameRef.current = captureFrame
    return () => {
      if (captureFrameRef.current === captureFrame) captureFrameRef.current = null
    }
  }, [captureFrameRef, captureFrame])

  // 렌더러 초기화 실패는 useShaderLabCanvasSource가 예외를 던지지 않고 조용히
  // `ready=false`로 남는다(패키지 소스 확인) — 일정 시간 후에도 준비되지 않으면 안내한다.
  useEffect(() => {
    if (ready) {
      setRuntimeError(null)
      return
    }
    const timer = window.setTimeout(() => {
      setRuntimeError((current) => current ?? '렌더러를 초기화하지 못했어요. 새로고침 후 다시 시도해 주세요.')
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [ready])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-md border border-border bg-[#0a0d10]">
        <canvas
          ref={(node) => {
            setCanvasEl(node)
            if (typeof canvasRef === 'function') canvasRef(node)
            else if (canvasRef) canvasRef.current = node
          }}
          className="h-full w-full [image-rendering:pixelated]"
        />
        {!ready && !runtimeError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white/80">
            렌더러 초기화 중…
          </div>
        )}
        {runtimeError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-xs text-white">
            {runtimeError}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {SHADER_LAB_OUTPUT_SIZE}×{SHADER_LAB_OUTPUT_SIZE}
      </p>
    </div>
  )
})

export default ShaderLabViewport
