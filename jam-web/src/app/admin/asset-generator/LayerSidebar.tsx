'use client'

/**
 * JAM! 에셋 제너레이터 — 오버레이 레이어(이미지·텍스트) 목록·추가·순서·삭제
 * (티켓 20260924_2157, 텍스트 레이어 통합 재작업 20260924_2158)
 *
 * 리본 레이어는 고정 1개·삭제 불가라 목록 맨 아래에 라벨로만 보여준다. 이미지·텍스트 레이어는
 * 배열 인덱스 0이 목록 맨 위(가장 나중에 그려져 가장 위에 보인다), 마지막 인덱스가 리본
 * 바로 위(가장 먼저 그려진다) — 합성 순서(fillBackground → drawRibbonLayer → 오버레이 레이어
 * 역순)는 `AssetGeneratorViewport`의 `drawOverlayLayersOnto` 참고.
 *
 * 추가·순서 변경·삭제의 사용감은 `src/app/admin/shader-lab/ShaderLabLayerSidebar.tsx`를
 * 참고했다(코드는 옮기지 않았다. 이 화면은 설정 패널의 Accordion·SliderRow 규칙을 따르므로
 * Popover/Command 대신 아이콘 버튼으로 단순화했다).
 */
import { useRef } from 'react'
import { IconArrowDown, IconArrowUp, IconTextPlus, IconTrash, IconUpload } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import type { OverlayLayerConfig } from '@/lib/asset-generator'

interface LayerSidebarProps {
  layers: OverlayLayerConfig[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddImage: (file: File) => void
  onAddText: () => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
}

/** 목록 항목 라벨: 이미지는 같은 종류끼리 매긴 번호, 텍스트는 입력한 첫 줄(없으면 번호)로
 * 구분한다 — 텍스트 레이어가 여러 개일 때 내용으로 알아보기 쉽도록. */
function describeLayer(layer: OverlayLayerConfig, typeIndex: number): string {
  if (layer.type === 'image') return `이미지 레이어 ${typeIndex}`
  const firstLine = layer.content.split('\n')[0]?.trim()
  return firstLine || `텍스트 레이어 ${typeIndex}`
}

export default function LayerSidebar({ layers, selectedId, onSelect, onAddImage, onAddText, onRemove, onMove }: LayerSidebarProps) {
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
          if (file) onAddImage(file)
          e.target.value = ''
        }}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()}>
          <IconUpload className="h-4 w-4" />
          이미지 업로드
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={onAddText}>
          <IconTextPlus className="h-4 w-4" />
          텍스트 추가
        </Button>
      </div>

      {layers.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {layers.map((overlayLayer, index) => {
            const isSelected = overlayLayer.id === selectedId
            const typeIndex = layers.slice(0, index + 1).filter((l) => l.type === overlayLayer.type).length
            return (
              <li
                key={overlayLayer.id}
                className={`flex items-center gap-0.5 rounded-md border px-2 py-1.5 ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(overlayLayer.id)}
                  className="flex-1 truncate text-left text-sm"
                >
                  {describeLayer(overlayLayer, typeIndex)}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onMove(overlayLayer.id, 'up')}
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
                  onClick={() => onMove(overlayLayer.id, 'down')}
                  disabled={index === layers.length - 1}
                  aria-label="아래로 이동"
                >
                  <IconArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onRemove(overlayLayer.id)}
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
