'use client'

/**
 * 쉐이더 랩 — 파라미터 필드 제너릭 렌더러 (티켓 20260912_1951)
 *
 * `effectRegistry.ts`의 `ShaderLabFieldDefinition` 하나를 받아 타입에 맞는 입력 UI를
 * 그린다. 어드민 화면이라 MODULAR 대상이 아니다(정책) — `/admin/shader-text`의
 * `ShaderTextControls.tsx` 관례(네이티브 range/color, shadcn Select·Switch)를 그대로 따른다.
 *
 * 필드 타입 분기(number/boolean/select/color/vec2)는 원본 저장소
 * (`src/components/editor/properties-sidebar-fields.tsx`, 비공개 앱 소스)의 필드 렌더러
 * 개념을 참고했다. 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 */
import type { ChangeEvent } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Switch } from '@/components/admin/ui/switch'
import type { ShaderLabFieldDefinition } from '@/lib/admin/shaderLab/paramFields'

interface ShaderLabParamFieldProps {
  field: ShaderLabFieldDefinition
  value: unknown
  onChange: (value: ShaderLabFieldDefinition['defaultValue']) => void
}

function FieldShell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export default function ShaderLabParamField({ field, value, onChange }: ShaderLabParamFieldProps) {
  if (field.type === 'number') {
    const current = typeof value === 'number' ? value : field.defaultValue
    return (
      <FieldShell label={field.label} hint={field.description}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 0.01}
            value={current}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
            className="accent-primary flex-1"
          />
          <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
            {current}
            {field.unit ?? ''}
          </span>
        </div>
      </FieldShell>
    )
  }

  if (field.type === 'boolean') {
    const current = typeof value === 'boolean' ? value : field.defaultValue
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm text-foreground">{field.label}</span>
          {field.description && <span className="text-xs text-muted-foreground">{field.description}</span>}
        </div>
        <Switch checked={current} onCheckedChange={onChange} />
      </div>
    )
  }

  if (field.type === 'select') {
    const current = typeof value === 'string' ? value : field.defaultValue
    return (
      <FieldShell label={field.label} hint={field.description}>
        <Select value={current} onValueChange={(v) => onChange(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    )
  }

  if (field.type === 'color') {
    const current = typeof value === 'string' ? value : field.defaultValue
    return (
      <FieldShell label={field.label} hint={field.description}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={current}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            className="h-9 w-14 shrink-0 cursor-pointer rounded border border-input bg-transparent p-1"
          />
          <span className="font-mono text-xs text-muted-foreground">{current}</span>
        </div>
      </FieldShell>
    )
  }

  // vec2
  const current = Array.isArray(value) && value.length === 2 ? (value as [number, number]) : field.defaultValue
  return (
    <FieldShell label={field.label} hint={field.description}>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 0.01}
          value={current[0]}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange([Number(e.target.value), current[1]])}
          className="accent-primary"
        />
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 0.01}
          value={current[1]}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange([current[0], Number(e.target.value)])}
          className="accent-primary"
        />
      </div>
    </FieldShell>
  )
}
