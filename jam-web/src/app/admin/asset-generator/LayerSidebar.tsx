'use client'

/**
 * JAM! 에셋 제너레이터 — 이미지 레이어 목록·추가·순서·삭제 (티켓 20260924_2157)
 *
 * 리본 레이어는 고정 1개·삭제 불가라 목록 맨 아래에 라벨로만 보여준다. 이미지 레이어는
 * 배열 인덱스 0이 목록 맨 위(가장 나중에 그려져 가장 위에 보인다), 마지막 인덱스가 리본
 * 바로 위(가장 먼저 그려진다) — 합성 순서(fillBackground → drawRibbonLayer → 이미지 레이어
 * 역순)는 `AssetGeneratorViewport`의 `drawImageLayersOnto` 참고.
 *
 * 추가·순서 변경·삭제의 사용감은 `src/app/admin/shader-lab/ShaderLabLayerSidebar.tsx`를
 * 참고했다(코드는 옮기지 않았다. 이 화면은 설정 패널의 Accordion·SliderRow 규칙을 따르므로
 * Popover/Command 대신 아이콘 버튼으로 단순화했다).
 */
import { useRef } from 'react'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import type { ImageLayerConfig } from '@/lib/asset-generator'

interface LayerSidebarProps {
  imageLayers: ImageLayerConfig[]
  selectedIndex: number | null
  onSelect: (index: number) => void
  onAdd: (file: File) => void
  onRemove: (index: number) => void
  onMove: (index: number, direction: 'up' | 'down') => void
}

export default function LayerSidebar({ imageLayers, selectedIndex, onSelect, onAdd, onRemove, onMove }: LayerSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/svg+xml,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onAdd(file)
          e.target.value = ''
        }}
      />
      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
        <IconPlus className="h-4 w-4" />
        이미지 레이어 추가
      </Button>

      {imageLayers.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {imageLayers.map((_, index) => {
            const isSelected = index === selectedIndex
            return (
              <li
                key={index}
                className={`flex items-center gap-0.5 rounded-md border px-2 py-1.5 ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <button type="button" onClick={() => onSelect(index)} className="flex-1 truncate text-left text-sm">
                  이미지 레이어 {index + 1}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onMove(index, 'up')}
                  disabled={index === 0}
                  aria-label="위로 이동"
                >
                  <IconArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onMove(index, 'down')}
                  disabled={index === imageLayers.length - 1}
                  aria-label="아래로 이동"
                >
                  <IconArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onRemove(index)}
                  aria-label="삭제"
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="rounded-md border border-dashed border-input px-2 py-1.5 text-sm text-muted-foreground">
        리본 <span className="text-xs">(고정, 삭제 불가)</span>
      </div>
    </div>
  )
}
