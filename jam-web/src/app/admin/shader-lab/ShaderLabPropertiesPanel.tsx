'use client'

/**
 * 쉐이더 랩 — 속성 패널 (티켓 20260912_1951)
 *
 * 선택된 레이어의 공통 트랜스폼(표시·이름·투명도·색조·채도·블렌드 모드)과 레이어 종류별
 * 파라미터(`effectRegistry.ts`)를 함께 보여준다. 이미지 레이어는 파일 업로드로 `asset.src`를
 * 채운다(로컬 blob URL — 저장/불러오기 시 이미지 자체는 유실된다, 완료 기록 참고).
 *
 * 원본 저장소(`src/components/editor/properties-sidebar-content.tsx`, 비공개 앱 소스)의
 * "선택된 레이어의 공통 트랜스폼 + 타입별 파라미터" 구성을 참고해 JAM! 어드민 스타일로 새로
 * 작성했다. 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 */
import { useRef } from 'react'
import type { ShaderLabBlendMode, ShaderLabLayerConfig, ShaderLabParameterValue } from '@basementstudio/shader-lab'
import { IconUpload } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Switch } from '@/components/admin/ui/switch'
import { getLayerTypeDefinition, isSupportedLayerType } from '@/lib/admin/shaderLab/effectRegistry'
import { isFieldVisible } from '@/lib/admin/shaderLab/paramFields'
import ShaderLabParamField from './ShaderLabParamField'

const BLEND_MODE_OPTIONS: { value: ShaderLabBlendMode; label: string }[] = [
  { value: 'normal', label: '표준' },
  { value: 'multiply', label: '곱하기' },
  { value: 'screen', label: '스크린' },
  { value: 'overlay', label: '오버레이' },
  { value: 'darken', label: '어둡게 하기' },
  { value: 'lighten', label: '밝게 하기' },
  { value: 'color-dodge', label: '색상 닷지' },
  { value: 'color-burn', label: '색상 번' },
  { value: 'hard-light', label: '하드 라이트' },
  { value: 'soft-light', label: '소프트 라이트' },
  { value: 'difference', label: '차이' },
  { value: 'exclusion', label: '제외' },
  { value: 'hue', label: '색조' },
  { value: 'saturation', label: '채도' },
  { value: 'color', label: '색상' },
  { value: 'luminosity', label: '광도' },
]

interface ShaderLabPropertiesPanelProps {
  layer: ShaderLabLayerConfig | null
  onChange: (next: ShaderLabLayerConfig) => void
}

export default function ShaderLabPropertiesPanel({ layer, onChange }: ShaderLabPropertiesPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!layer) {
    return <p className="text-sm text-muted-foreground">왼쪽에서 레이어를 선택하면 속성을 편집할 수 있어요.</p>
  }

  const definition = isSupportedLayerType(layer.type) ? getLayerTypeDefinition(layer.type) : null

  function patch(partial: Partial<ShaderLabLayerConfig>) {
    if (!layer) return
    onChange({ ...layer, ...partial })
  }

  function patchParam(key: string, value: ShaderLabParameterValue) {
    if (!layer) return
    onChange({ ...layer, params: { ...layer.params, [key]: value } })
  }

  function handleImageFileSelected(file: File | null) {
    if (!file) return
    const src = URL.createObjectURL(file)
    patch({ asset: { kind: 'image', src, fileName: file.name } })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">이름</span>
          <Input value={layer.name} onChange={(e) => patch({ name: e.target.value })} maxLength={40} />
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">화면에 표시</span>
          <Switch checked={layer.visible} onCheckedChange={(v) => patch({ visible: v })} />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">
            투명도 <span className="font-mono text-xs text-muted-foreground">{layer.opacity.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={layer.opacity}
            onChange={(e) => patch({ opacity: Number(e.target.value) })}
            className="accent-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">
            색조 <span className="font-mono text-xs text-muted-foreground">{layer.hue.toFixed(0)}°</span>
          </span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={layer.hue}
            onChange={(e) => patch({ hue: Number(e.target.value) })}
            className="accent-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">
            채도 <span className="font-mono text-xs text-muted-foreground">{layer.saturation.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={layer.saturation}
            onChange={(e) => patch({ saturation: Number(e.target.value) })}
            className="accent-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">블렌드 모드</span>
          <Select value={layer.blendMode} onValueChange={(v) => patch({ blendMode: v as ShaderLabBlendMode })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLEND_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {layer.type === 'image' && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-foreground">이미지</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImageFileSelected(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <IconUpload className="mr-1 h-4 w-4" />
            {layer.asset?.fileName ?? '이미지 선택'}
          </Button>
          {!layer.asset && <span className="text-xs text-muted-foreground">이미지를 올려야 캔버스에 나타나요.</span>}
        </div>
      )}

      {definition && (
        <div className="flex flex-col gap-4">
          {definition.fields
            .filter((field) => isFieldVisible(field, layer.params))
            .map((field) => (
              <ShaderLabParamField
                key={field.key}
                field={field}
                value={layer.params[field.key]}
                onChange={(value) => patchParam(field.key, value)}
              />
            ))}
        </div>
      )}
    </div>
  )
}
