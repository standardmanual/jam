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
  /**
   * true면 filterActive와 무관하게 항상 스냅샷을 캡처한다(400ms 간격, 기존 로직 그대로).
   * 기본값 false로 스파이크 페이지의 기존 동작(필터 선택 중에만 캡처)은 그대로 유지된다.
   * 티켓 20260819_007 — BadgeForm 통합 미리보기는 필터 미선택 상태에서도 합성 결과가 필요해서 도입.
   */
  alwaysSnapshot?: boolean
  /**
   * true면 이 패널 자체의 캔버스를 화면에 노출하지 않는다(컨트롤만 노출). 캔버스는 여전히
   * DOM에 마운트된 채로 엔진이 그대로 그린다 — hidden이어도 rAF·캔버스 드로잉·toDataURL은
   * 정상 동작한다. 티켓 20260819_007 — 실제 배지 배경 레이어 미리보기 하나로 합치기 위해 도입.
   */
  hidePreviewBox?: boolean
  /**
   * 스냅샷 캡처 간격(ms). 기본 400ms는 실시간 미리보기용 스로틀링 값이라, 이 상태 그대로 영상을
   * 구우면 초당 2.5장짜리 뚝뚝 끊기는 영상이 나온다. 영상을 굽는 동안만 호출부가 출력
   * 프레임레이트에 맞춰 이 값을 낮춘다 (20260819_012).
   */
  snapshotIntervalMs?: number
  /**
   * true면 사용자가 "일시정지"를 눌러둔 상태여도 엔진을 계속 돌린다. 영상 굽기는 실시간 캡처라
   * 엔진이 멈춰 있으면 정지 화면만 녹화된다 — 일시정지 버튼은 미리보기 조작용으로만 남기고
   * 결과물에는 영향을 주지 않는다는 결정(20260819_012)을 지키기 위한 장치.
   */
  forcePlay?: boolean
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
  alwaysSnapshot = false,
  hidePreviewBox = false,
  snapshotIntervalMs = 400,
  forcePlay = false,
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
    if (playing || forcePlay) engine.start()

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
    if (playing || forcePlay) engineRef.current?.start()
    else engineRef.current?.stop()
  }, [playing, forcePlay])

  // 필터가 선택된 동안만 스로틀링된 스냅샷을 캡처해서 Paper 필터로 흘려보낸다
  // (매 프레임 texImage2D 재업로드는 비용이 크므로 400ms 간격으로 제한 — 검증 항목)
  useEffect(() => {
    if (!filterActive && !alwaysSnapshot) return
    const canvas = canvasRef.current
    if (!canvas) return
    const id = window.setInterval(() => {
      onSnapshotChange(canvas.toDataURL())
    }, snapshotIntervalMs)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActive, alwaysSnapshot, snapshotIntervalMs])

  const update = (patch: Partial<AnimationParams>) => onChange({ ...params, ...patch })

  return (
    <div className="flex gap-6">
      <canvas
        ref={canvasRef}
        className={hidePreviewBox ? 'hidden' : 'shrink-0 rounded-xl border border-[#e5e7eb]'}
        style={hidePreviewBox ? undefined : { width: previewSize, height: previewSize }}
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
