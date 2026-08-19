'use client'

import { useEffect, useMemo } from 'react'
import { buildTileCanvas, flattenPattern } from './patternTile'
import { SERVICE_WIDTH, type PatternParams } from './types'

interface PatternPanelProps {
  image: HTMLImageElement
  params: PatternParams
  onChange: (params: PatternParams) => void
  onFlattenedChange: (dataUrl: string) => void
}

const rowClass = 'flex items-center justify-between gap-3 text-sm text-[#374151]'
const rangeClass = 'flex-1 accent-[#111111]'
const numClass = 'w-10 text-right text-xs text-[#6b7280]'

/**
 * 패턴 모드 미리보기 + 컨트롤 패널.
 *
 * 렌더링 기준 폭은 스파이크 UI가 임의로 정하는 프리뷰 박스 크기가 아니라 항상
 * `SERVICE_WIDTH`(430px, 배지 상세 앱 컬럼 폭)로 고정한다(20260819_006). 미리보기 박스의 CSS
 * 표시 크기도 SERVICE_WIDTH와 동일하게 맞춰서, 여기서 보이는 결과가 실제 배지 상세화면에
 * 적용됐을 때와 같은 절대 px 스케일이 되도록 한다.
 */
export default function PatternPanel({ image, params, onChange, onFlattenedChange }: PatternPanelProps) {
  // 타일 재굽기(mirror/오프셋/rotation/이미지 크기/stagger 반영) — 이미지 크기는 절대 px 값이라
  // 프리뷰 박스 크기와 무관하게 항상 동일한 결과를 낸다.
  const tileCanvas = useMemo(
    () => buildTileCanvas(image, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image, params.mirror, params.rowGap, params.colGap, params.rotation, params.imageSize, params.rowStagger, params.colStagger]
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

  // Paper 필터 입력용 평면 이미지를 부모(page.tsx)에 알린다 — SERVICE_WIDTH 기준으로 구워서
  // 실제 서비스 렌더링과 동일한 결과를 흘려보낸다.
  useEffect(() => {
    if (tileCanvas.width === 0) return
    const flattened = flattenPattern(tileCanvas, SERVICE_WIDTH, SERVICE_WIDTH)
    onFlattenedChange(flattened.toDataURL())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileCanvas])

  const update = (patch: Partial<PatternParams>) => onChange({ ...params, ...patch })

  // 그리드 수 상태는 없다 — 반복 개수는 피치(이미지 크기+간격)와 SERVICE_WIDTH로부터 파생되는
  // 읽기 전용 정보일 뿐이다(20260819_006). 강제로 맞추거나 clamp하지 않으므로 0개(완전히 넘침)도
  // 정상 값이다.
  const approxRepeatCols = Math.floor((SERVICE_WIDTH + params.colGap) / (params.imageSize + params.colGap))

  return (
    <div className="flex gap-6">
      <div
        className="shrink-0 rounded-xl border border-[#e5e7eb] overflow-hidden"
        style={{ width: SERVICE_WIDTH, height: SERVICE_WIDTH, ...style }}
      />

      <div className="flex-1 flex flex-col gap-3 min-w-[260px]">
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

        <div className="flex flex-col gap-1">
          <label className={rowClass}>
            이미지 크기 (px)
            <span className="flex items-center gap-2 flex-1">
              <input type="range" min={10} max={430} step={1} value={params.imageSize} className={rangeClass}
                onChange={(e) => update({ imageSize: +e.target.value })} />
              <span className={numClass}>{params.imageSize}</span>
            </span>
          </label>
          <p className="text-right text-[11px] text-[#9ca3af]">
            {SERVICE_WIDTH}px 폭에 약 {approxRepeatCols}개 표시됨
          </p>
        </div>

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
