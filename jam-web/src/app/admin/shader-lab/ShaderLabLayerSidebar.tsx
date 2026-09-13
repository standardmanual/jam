'use client'

/**
 * 쉐이더 랩 — 레이어 사이드바 (티켓 20260912_1951)
 *
 * 추가·삭제·순서 변경(위/아래 버튼 — 신규 드래그앤드롭 의존성을 추가하지 않기 위한 구현자
 * 재량)·표시 토글·선택을 담당한다. 배열의 앞이 위쪽(캔버스 합성 순서상 나중에 그려짐)이다
 * — 실제 런타임 호출부(`create-webgpu-renderer.js`의 `syncLayers([...frame.layers].reverse())`)가
 * 배열을 뒤집은 뒤 합성하기 때문이다(`page.tsx`의 `handleAdd` 주석에 실측 근거 정리).
 *
 * 원본 저장소(`src/components/editor/layer-sidebar.tsx`, 비공개 앱 소스)의 레이어 목록
 * 개념(추가·삭제·순서·표시 토글)을 참고해 JAM! 어드민 스타일로 새로 작성했다 — 코드를
 * 복붙하지 않았다. 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 *
 * UI 개선(티켓 20260913_1613): 레이어 추가 드롭다운을 `kind`(소스/이펙트) 기준 2그룹으로
 * 나누고, 레이어 행의 위로/아래로/삭제를 "⋮ 더보기" 메뉴로 묶어 260px 사이드바 폭 안에서
 * 레이어 이름이 심하게 잘리던 문제를 해소했다(표시 토글만 인라인 유지).
 */
import { useState } from 'react'
import type { ShaderLabLayerConfig } from '@basementstudio/shader-lab'
import {
  IconEye,
  IconEyeOff,
  IconArrowUp,
  IconArrowDown,
  IconTrash,
  IconPlus,
  IconDotsVertical,
} from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select'
import {
  SHADER_LAB_LAYER_TYPES,
  getLayerTypeDefinition,
  type SupportedShaderLabLayerType,
} from '@/lib/admin/shaderLab/effectRegistry'

const SOURCE_LAYER_TYPES = SHADER_LAB_LAYER_TYPES.filter(
  (type) => getLayerTypeDefinition(type).kind === 'source'
)
const EFFECT_LAYER_TYPES = SHADER_LAB_LAYER_TYPES.filter(
  (type) => getLayerTypeDefinition(type).kind === 'effect'
)

interface ShaderLabLayerSidebarProps {
  layers: ShaderLabLayerConfig[]
  selectedLayerId: string | null
  onSelect: (id: string) => void
  onAdd: (type: SupportedShaderLabLayerType) => void
  onRemove: (id: string) => void
  onToggleVisible: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
}

export default function ShaderLabLayerSidebar({
  layers,
  selectedLayerId,
  onSelect,
  onAdd,
  onRemove,
  onToggleVisible,
  onMove,
}: ShaderLabLayerSidebarProps) {
  // Select/DropdownMenu(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn
  // 어드민 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그
  // 스코프 노드로 지정한다(BadgeForm.tsx와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  return (
    <div className="flex flex-col gap-3">
      <Select onValueChange={(value) => onAdd(value as SupportedShaderLabLayerType)}>
        <SelectTrigger>
          <SelectValue placeholder="레이어 추가" />
        </SelectTrigger>
        <SelectContent container={themeContainer ?? undefined}>
          <SelectGroup>
            <SelectLabel>소스</SelectLabel>
            {SOURCE_LAYER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                <IconPlus className="mr-1 inline h-3.5 w-3.5" />
                {getLayerTypeDefinition(type).label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>이펙트</SelectLabel>
            {EFFECT_LAYER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                <IconPlus className="mr-1 inline h-3.5 w-3.5" />
                {getLayerTypeDefinition(type).label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {layers.length === 0 ? (
        <p className="text-sm text-muted-foreground">레이어가 없어요. 위에서 추가해 보세요.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {layers.map((layer, index) => {
            const isSelected = layer.id === selectedLayerId
            return (
              <li
                key={layer.id}
                className={`flex items-center gap-0.5 rounded-md border px-2 py-1.5 ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(layer.id)}
                  className="flex-1 truncate text-left text-sm"
                  title={layer.name}
                >
                  {layer.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {isSupportedTypeLabel(layer.type)}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onToggleVisible(layer.id)}
                  aria-label={layer.visible ? '숨기기' : '표시하기'}
                >
                  {layer.visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="레이어 옵션 더보기"
                    >
                      <IconDotsVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" container={themeContainer ?? undefined}>
                    <DropdownMenuItem onClick={() => onMove(layer.id, 'up')} disabled={index === 0}>
                      <IconArrowUp className="h-4 w-4" />
                      위로 이동
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMove(layer.id, 'down')} disabled={index === layers.length - 1}>
                      <IconArrowDown className="h-4 w-4" />
                      아래로 이동
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onRemove(layer.id)}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <IconTrash className="h-4 w-4" />
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function isSupportedTypeLabel(type: string): string {
  if ((SHADER_LAB_LAYER_TYPES as readonly string[]).includes(type)) {
    return getLayerTypeDefinition(type as SupportedShaderLabLayerType).label
  }
  return type
}
