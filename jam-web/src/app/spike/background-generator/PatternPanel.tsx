'use client'

import { useEffect, useMemo } from 'react'
import { buildTileCanvas, flattenPattern } from './patternTile'
import type { PatternParams } from './types'

interface PatternPanelProps {
  image: HTMLImageElement
  params: PatternParams
  onChange: (params: PatternParams) => void
  previewSize: number
  onFlattenedChange: (dataUrl: string) => void
}

const rowClass = 'flex items-center justify-between gap-3 text-sm text-[#374151]'
const rangeClass = 'flex-1 accent-[#111111]'
const numClass = 'w-10 text-right text-xs text-[#6b7280]'

export default function PatternPanel({ image, params, onChange, previewSize, onFlattenedChange }: PatternPanelProps) {
  const tilePitchX = previewSize / Math.max(1, params.gridX)
  const tilePitchY = previewSize / Math.max(1, params.gridY)

  // 타일 재굽기(mirror/오프셋/rotation/scale/stagger 반영) — 그리드 수가 바뀌어도 다시 굽는다
  const tileCanvas = useMemo(
    () => buildTileCanvas(image, tilePitchX, tilePitchY, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image, tilePitchX, tilePitchY, params.mirror, params.rowGap, params.colGap, params.rotation, params.imageScale, params.rowStagger, params.colStagger]
  )

  // 렌더링 중 순수 계산으로 CSS 배경 스타일을 도출한다 (상태/이펙트 불필요)
  const style: React.CSSProperties = useMemo(() => {
    if (tileCanvas.width === 0) return {}
    return {
      backgroundImage: `url(${tileCanvas.toDataURL()})`,
      backgroundRepeat: 'repeat',
      backgroundSize: `${tileCanvas.width}px ${tileCanvas.height}px`,
    }
  }, [tileCanvas])

  // Paper 필터 입력용 평면 이미지를 부모(page.tsx)에 알린다 — CSS 미리보기와 동일한 결과를 흘려보낸다
  useEffect(() => {
    if (tileCanvas.width === 0) return
    const flattened = flattenPattern(tileCanvas, previewSize, previewSize)
    onFlattenedChange(flattened.toDataURL())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileCanvas, previewSize])

  const update = (patch: Partial<PatternParams>) => onChange({ ...params, ...patch })

  return (
    <div className="flex gap-6">
      <div
        className="shrink-0 rounded-xl border border-[#e5e7eb] overflow-hidden"
        style={{ width: previewSize, height: previewSize, ...style }}
      />

      <div className="flex-1 flex flex-col gap-3 min-w-[260px]">
        <label className={rowClass}>
          XY 그리드 수
          <span className="flex items-center gap-2 flex-1">
            <input type="range" min={1} max={12} step={1} value={params.gridX} className={rangeClass}
              onChange={(e) => update({ gridX: +e.target.value })} />
            <span className={numClass}>{params.gridX}</span>
            <input type="range" min={1} max={12} step={1} value={params.gridY} className={rangeClass}
              onChange={(e) => update({ gridY: +e.target.value })} />
            <span className={numClass}>{params.gridY}</span>
          </span>
        </label>

        <label className={rowClass}>
          오프셋 — 행 사이 간격
          <span className="flex items-center gap-2 flex-1">
            <input type="range" min={0} max={60} step={1} value={params.rowGap} className={rangeClass}
              onChange={(e) => update({ rowGap: +e.target.value })} />
            <span className={numClass}>{params.rowGap}</span>
          </span>
        </label>

        <label className={rowClass}>
          오프셋 — 열 사이 간격
          <span className="flex items-center gap-2 flex-1">
            <input type="range" min={0} max={60} step={1} value={params.colGap} className={rangeClass}
              onChange={(e) => update({ colGap: +e.target.value })} />
            <span className={numClass}>{params.colGap}</span>
          </span>
        </label>

        <label className={rowClass}>
          대칭반복(mirror)
          <input type="checkbox" checked={params.mirror} onChange={(e) => update({ mirror: e.target.checked })} />
        </label>

        <label className={rowClass}>
          이미지 크기
          <span className="flex items-center gap-2 flex-1">
            <input type="range" min={0.2} max={3} step={0.05} value={params.imageScale} className={rangeClass}
              onChange={(e) => update({ imageScale: +e.target.value })} />
            <span className={numClass}>{params.imageScale.toFixed(2)}</span>
          </span>
        </label>

        <label className={rowClass}>
          Row stagger (벽돌쌓기)
          <input type="checkbox" checked={params.rowStagger} onChange={(e) => update({ rowStagger: e.target.checked })} />
        </label>

        <label className={rowClass}>
          Column stagger (벽돌쌓기)
          <input type="checkbox" checked={params.colStagger} onChange={(e) => update({ colStagger: e.target.checked })} />
        </label>

        <label className={rowClass}>
          이미지 회전
          <span className="flex items-center gap-2 flex-1">
            <input type="range" min={0} max={360} step={1} value={params.rotation} className={rangeClass}
              onChange={(e) => update({ rotation: +e.target.value })} />
            <span className={numClass}>{params.rotation}°</span>
          </span>
        </label>
      </div>
    </div>
  )
}
