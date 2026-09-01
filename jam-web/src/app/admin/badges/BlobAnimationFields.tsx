'use client'

import {
  BLOB_ANIMATION_RANGES,
  BLOB_COLOR_COUNT,
  type BlobAnimationParams,
} from '@/lib/blobAnimation'

interface BlobAnimationFieldsProps {
  value: BlobAnimationParams
  onChange: (next: BlobAnimationParams) => void
}

type SliderKey = 'speed' | 'seed' | 'blur' | 'scale'

const SLIDERS: { key: SliderKey; label: string; decimals: number }[] = [
  { key: 'speed', label: '속도', decimals: 1 },
  { key: 'seed', label: '시드', decimals: 0 },
  { key: 'blur', label: '흐림', decimals: 2 },
  { key: 'scale', label: '크기', decimals: 2 },
]

/**
 * 블롭 애니메이션 파라미터 저작 컨트롤 — [20260901_1944]
 *
 * 값이 바뀔 때마다 즉시 `onChange`를 올려 미리보기 캔버스가 실시간으로 갱신되게 한다.
 * 참조 스크립트의 Aperture Size / Edge Softness는 원형 마스크 전용이라 채택하지 않았다
 * (카드 전체를 채우는 이번 렌더링에는 불필요).
 *
 * 어드민 화면이라 MODULAR 디자인 시스템 적용 대상이 아니다(기존 정책).
 */
export default function BlobAnimationFields({ value, onChange }: BlobAnimationFieldsProps) {
  const setColor = (index: number, color: string) => {
    const colors = [...value.colors]
    colors[index] = color
    onChange({ ...value, colors })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">블롭 색상</span>
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({ length: BLOB_COLOR_COUNT }, (_, i) => (
            <input
              key={i}
              type="color"
              value={value.colors[i]}
              onChange={(e) => setColor(i, e.target.value)}
              aria-label={`블롭 색상 ${i + 1}`}
              className="w-11 h-11 shrink-0 rounded-xl border border-border bg-white p-1 cursor-pointer"
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          색상 4개가 블롭 6개에 순환해서 칠해져요.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">카드 배경색</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={value.bgColor}
            onChange={(e) => onChange({ ...value, bgColor: e.target.value })}
            aria-label="카드 배경색"
            className="w-11 h-11 shrink-0 rounded-xl border border-border bg-white p-1 cursor-pointer"
          />
          <span className="text-xs text-muted-foreground">
            블롭 뒤에 깔리는 색이에요. 이미지 카드 안에만 적용돼요.
          </span>
        </div>
      </div>

      {SLIDERS.map(({ key, label, decimals }) => {
        const range = BLOB_ANIMATION_RANGES[key]
        return (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">
              {label} <span className="text-muted-foreground font-mono">{value[key].toFixed(decimals)}</span>
            </span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={value[key]}
                onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
                className="flex-1 accent-primary"
              />
              {key === 'seed' && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      seed: Math.floor(Math.random() * (BLOB_ANIMATION_RANGES.seed.max + 1)),
                    })
                  }
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1.5"
                >
                  무작위
                </button>
              )}
            </div>
          </label>
        )
      })}
    </div>
  )
}
