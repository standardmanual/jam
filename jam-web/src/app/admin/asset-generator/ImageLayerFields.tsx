'use client'

/**
 * JAM! 에셋 제너레이터 — 선택한 이미지 레이어의 속성(원본·위치·크기·회전·불투명도) (티켓 20260924_2157)
 *
 * 한 줄 행 구성은 `AssetGeneratorPanel`(티켓 20260924_2156)의 SliderRow를 공용 파일로 옮겨
 * 그대로 재사용한다. 업로드 원본은 화면 메모리(blob URL)에만 두고, 저장소 업로드는
 * 하위 티켓 20260924_2159가 맡는다.
 */
import { useRef } from 'react'
import { IconUpload } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import type { ImageLayerConfig } from '@/lib/asset-generator'
import SliderRow from './SliderRow'
import {
  formatDegree,
  formatPercent,
  IMAGE_POSITION_RANGE,
  IMAGE_SIZE_RANGE,
  OPACITY_RANGE,
  ROTATION_RANGE,
} from './assetGeneratorHelpers'

interface ImageLayerFieldsProps {
  layer: ImageLayerConfig
  onChange: (patch: Partial<ImageLayerConfig>) => void
  onReplaceAsset: (file: File) => void
}

export default function ImageLayerFields({ layer, onChange, onReplaceAsset }: ImageLayerFieldsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/svg+xml,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onReplaceAsset(file)
          e.target.value = ''
        }}
      />
      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
        <IconUpload className="h-4 w-4" />
        원본 다시 올리기
      </Button>
      <SliderRow
        label="가로 위치"
        value={layer.xPct}
        {...IMAGE_POSITION_RANGE}
        format={formatPercent}
        onChange={(v) => onChange({ xPct: v })}
      />
      <SliderRow
        label="세로 위치"
        value={layer.yPct}
        {...IMAGE_POSITION_RANGE}
        format={formatPercent}
        onChange={(v) => onChange({ yPct: v })}
      />
      <SliderRow
        label="가로 크기"
        value={layer.widthPct}
        {...IMAGE_SIZE_RANGE}
        format={formatPercent}
        onChange={(v) => onChange({ widthPct: v })}
      />
      <SliderRow
        label="세로 크기"
        value={layer.heightPct}
        {...IMAGE_SIZE_RANGE}
        format={formatPercent}
        onChange={(v) => onChange({ heightPct: v })}
      />
      <SliderRow
        label="회전"
        value={layer.rotationDeg}
        {...ROTATION_RANGE}
        format={formatDegree}
        onChange={(v) => onChange({ rotationDeg: v })}
      />
      <SliderRow
        label="불투명도"
        value={layer.opacityPct}
        {...OPACITY_RANGE}
        format={formatPercent}
        onChange={(v) => onChange({ opacityPct: v })}
      />
    </div>
  )
}
