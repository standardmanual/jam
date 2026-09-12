'use client'

/**
 * 쉐이더 랩 — 캔버스 뷰포트 (티켓 20260912_1951)
 *
 * 실시간 프리뷰(WYSIWYG) + 재생/정지. 내부 렌더링 배관은 `useShaderLabPlayback.ts` 참고.
 * 내보내기(`ShaderLabExportPanel`)는 이 컴포넌트가 갖는 `<canvas>`를 그대로
 * `canvas.toBlob()`한다 — 별도 오프스크린 렌더링을 만들지 않는다.
 */
import { forwardRef, useEffect, useState } from 'react'
import type { ShaderLabConfig } from '@basementstudio/shader-lab'
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { useShaderLabPlayback } from '@/lib/admin/shaderLab/useShaderLabPlayback'

interface ShaderLabViewportProps {
  config: ShaderLabConfig
  playing: boolean
  onTogglePlaying: () => void
}

const ShaderLabViewport = forwardRef<HTMLCanvasElement, ShaderLabViewportProps>(function ShaderLabViewport(
  { config, playing, onTogglePlaying },
  canvasRef
) {
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const { ready } = useShaderLabPlayback(config, { canvas: canvasEl, playing })

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
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="outline" onClick={onTogglePlaying}>
          {playing ? <IconPlayerPause className="mr-1 h-4 w-4" /> : <IconPlayerPlay className="mr-1 h-4 w-4" />}
          {playing ? '정지' : '재생'}
        </Button>
        <span className="text-xs text-muted-foreground">1280×1280 · 애니메이션 파라미터가 있는 레이어만 재생에 영향을 받아요.</span>
      </div>
    </div>
  )
})

export default ShaderLabViewport
