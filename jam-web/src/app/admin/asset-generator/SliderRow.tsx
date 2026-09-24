'use client'

/**
 * JAM! 에셋 제너레이터 — 한 줄 슬라이더 행 (레이블 · 슬라이더 · 값) (티켓 20260924_2156)
 *
 * `AssetGeneratorPanel` 안에 있던 로컬 컴포넌트를 이미지 레이어 속성 패널(`ImageLayerFields`,
 * 티켓 20260924_2157)에서도 그대로 쓰기 위해 공용 파일로 옮겼다 — 중복 정의하지 않는다.
 * 원본: jam-doc/assets/prototypes/20260924_jam-asset-generator.html의 .row 그리드.
 */
import { cn } from '@/lib/utils'

export interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
  action?: React.ReactNode
}

/** 한 줄 행: 레이블 · 슬라이더(shadcn 톤으로 감싼 input[type=range]) · 값. */
export default function SliderRow({ label, value, min, max, step, format, onChange, action }: SliderRowProps) {
  return (
    <div className={cn('grid items-center gap-2', action ? 'grid-cols-[64px_minmax(0,1fr)_52px_auto]' : 'grid-cols-[64px_minmax(0,1fr)_52px]')}>
      <label className="text-sm text-foreground">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-primary"
      />
      <span className="text-right text-xs font-mono text-muted-foreground tabular-nums">{format(value)}</span>
      {action}
    </div>
  )
}
