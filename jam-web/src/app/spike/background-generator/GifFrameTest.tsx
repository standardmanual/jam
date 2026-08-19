'use client'

import { useEffect, useRef, useState } from 'react'
import FilterPreview from './FilterPreview'
import type { FilterId } from './types'

interface GifFrameTestProps {
  gifUrl: string
  filterId: FilterId
  size: number
}

/**
 * GIF 소스를 Paper 필터에 넣었을 때 프레임 단위로 처리되는지 확인하는 비교 테스트 (20260819_001).
 * - 정지 프레임: image prop에 GIF URL을 그대로 전달 → Paper Shaders 내부에서 new Image()로
 *   1회만 디코드해 텍스처 업로드하므로 항상 첫(또는 로드 시점) 프레임에 고정된다.
 * - 실시간 갱신: 살아있는 <img> 엘리먼트(브라우저가 계속 애니메이션 재생)의 현재 프레임을
 *   주기적으로 캔버스에 캡처해 data URL 문자열을 새로 만들어 image prop에 다시 주입한다.
 *   문자열이 바뀔 때마다 셰이더 마운트의 텍스처 캐시가 무효화되어 재업로드된다.
 */
export default function GifFrameTest({ gifUrl, filterId, size }: GifFrameTestProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [liveSrc, setLiveSrc] = useState<string | null>(null)

  useEffect(() => {
    if (filterId === 'none') return
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const id = window.setInterval(() => {
      if (!img.complete || img.naturalWidth === 0) return
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      setLiveSrc(canvas.toDataURL())
    }, 250)
    return () => window.clearInterval(id)
  }, [filterId, size])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="text-sm font-medium text-[#374151]">GIF 프레임 처리 테스트</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={gifUrl}
          alt="원본 GIF (재생 중)"
          className="w-10 h-10 rounded-lg border border-[#e5e7eb] object-cover"
        />
        <span className="text-xs text-[#9ca3af]">← 원본 (브라우저에서 애니메이션 재생 중)</span>
      </div>

      {filterId === 'none' ? (
        <p className="text-xs text-[#9ca3af]">필터를 선택하면 정지 프레임 vs 실시간 갱신 비교가 표시됩니다.</p>
      ) : (
        <div className="flex gap-6">
          <FilterPreview
            filterId={filterId}
            source={gifUrl}
            size={size}
            label="정지 프레임 (image prop에 GIF URL을 그대로 전달)"
          />
          <FilterPreview
            filterId={filterId}
            source={liveSrc}
            size={size}
            label="실시간 갱신 (250ms마다 현재 프레임을 캔버스로 캡처해 다시 주입)"
          />
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
