'use client'

import { useEffect, useRef, useState } from 'react'
import { KaleidoscopeEngine } from './kaleidoscope/engine'
import type { AnimationParams } from './types'

interface AnimationPanelProps {
  image: HTMLImageElement
  params: AnimationParams
  onChange: (params: AnimationParams) => void
  previewSize: number
  /** 필터 미리보기용 스냅샷 — 필터가 선택된 동안만 주기적으로 캡처한다 (성능 검증용) */
  onSnapshotChange: (dataUrl: string) => void
  filterActive: boolean
}

const rowClass = 'flex items-center justify-between gap-3 text-sm text-[#374151]'
const rangeClass = 'flex-1 accent-[#111111]'
const numClass = 'w-10 text-right text-xs text-[#6b7280]'

export default function AnimationPanel({
  image,
  params,
  onChange,
  previewSize,
  onSnapshotChange,
  filterActive,
}: AnimationPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<KaleidoscopeEngine | null>(null)
  const [playing, setPlaying] = useState(true)
  const [resetTick, setResetTick] = useState(0)

  // 이미지/미리보기 크기/리셋이 바뀔 때만 엔진을 새로 만든다
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = previewSize
    canvas.height = previewSize

    const engine = new KaleidoscopeEngine(canvas, image, params)
    engineRef.current = engine
    if (playing) engine.start()

    return () => {
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, previewSize, resetTick])

  // 파라미터 변경은 실행 중인 엔진에 그대로 반영 (numTiles 변경 시 엔진 내부에서 재구성한다)
  useEffect(() => {
    engineRef.current?.setParams(params)
  }, [params])

  useEffect(() => {
    if (playing) engineRef.current?.start()
    else engineRef.current?.stop()
  }, [playing])

  // 필터가 선택된 동안만 스로틀링된 스냅샷을 캡처해서 Paper 필터로 흘려보낸다
  // (매 프레임 texImage2D 재업로드는 비용이 크므로 400ms 간격으로 제한 — 검증 항목)
  useEffect(() => {
    if (!filterActive) return
    const canvas = canvasRef.current
    if (!canvas) return
    const id = window.setInterval(() => {
      onSnapshotChange(canvas.toDataURL())
    }, 400)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActive])

  const update = (patch: Partial<AnimationParams>) => onChange({ ...params, ...patch })

  return (
    <div className="flex gap-6">
      <canvas
        ref={canvasRef}
        className="shrink-0 rounded-xl border border-[#e5e7eb]"
        style={{ width: previewSize, height: previewSize }}
      />

      <div className="flex-1 flex flex-col gap-3 min-w-[260px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="bg-[#111111] text-white rounded-lg px-3 py-1.5 text-xs hover:bg-[#333333] transition-colors"
          >
            {playing ? '일시정지' : '재생'}
          </button>
          <button
            type="button"
            onClick={() => setResetTick((t) => t + 1)}
            className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-xs text-[#374151] hover:bg-[#f3f4f6] transition-colors"
          >
            다시 시작
          </button>
        </div>

        <label className={rowClass}>
          슬라이스 수
          <span className="flex items-center gap-2 flex-1">
            <input type="range" min={2} max={25} step={1} value={params.numTiles} className={rangeClass}
              onChange={(e) => update({ numTiles: +e.target.value })} />
            <span className={numClass}>{params.numTiles}</span>
          </span>
        </label>

        <label className={rowClass}>
          애니메이션 속도
          <span className="flex items-center gap-2 flex-1">
            <input type="range" min={1} max={15} step={1} value={params.speed} className={rangeClass}
              onChange={(e) => update({ speed: +e.target.value })} />
            <span className={numClass}>{params.speed}</span>
          </span>
        </label>

        <p className="text-xs text-[#9ca3af]">
          collidingScopes/collidingScopes.github.io(MIT)의 kaleidoscope.js에서 정삼각형 타일 대칭·
          회전 렌더링 로직을 발췌해 이식했습니다. 슬라이스 수가 클수록 삼각형이 작아지고 반복이
          촘촘해지며, 정현파 오프셋으로 패턴이 왕복 운동합니다.
        </p>
      </div>
    </div>
  )
}
