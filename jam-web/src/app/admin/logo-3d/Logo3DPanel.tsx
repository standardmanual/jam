'use client'

/**
 * 3D 로고 설정 패널 (티켓 20261103_1352) — 별도 화면(`/admin/logo-3d`) 전용.
 * Input·Thickness·Color·View 섹션은 에셋 3D 모드와 같은 컴포넌트를 쓴다(`assets/logo3d/Logo3DSections.tsx`, 티켓 20261103_1734).
 * 배경 섹션은 어드민 에셋(`assets/ShapeStudioPanel.tsx`)의 Background 섹션과 같은 문구·배치다.
 */
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { cn } from '@/lib/utils'
import type { Logo3DParams } from '@/lib/logo-3d/types'
import {
  Logo3DColorSection,
  Logo3DInputSection,
  Logo3DNotices,
  Logo3DThicknessSection,
  Logo3DViewSection,
  SECTION,
  SectionHeader,
  SliderRow,
} from '../assets/logo3d/Logo3DSections'
import {
  BACKGROUND_MODE_OPTIONS,
  BG_ANGLE_RANGE,
  backgroundInputsFor,
  RATIO_OPTIONS,
  type BackgroundMode,
  type CanvasRatio,
  type Logo3DState,
} from '../assets/logo3d/logo3dConfig'

type Props = {
  state: Logo3DState
  onChange: (patch: Partial<Logo3DState>) => void
  onParamChange: (key: keyof Logo3DParams, value: number) => void
  onSvgFile: (file: File) => void
  onResetZoom: () => void
  onSave: () => void
  warnings: string[]
  error: string | null
  loading: boolean
  saving: boolean
}

export default function Logo3DPanel({
  state,
  onChange,
  onParamChange,
  onSvgFile,
  onResetZoom,
  onSave,
  warnings,
  error,
  loading,
  saving,
}: Props) {
  const bgInputs = backgroundInputsFor(state.bgMode)

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-[#e0e4df] bg-[#f8f9f6] lg:w-[340px] lg:border-t-0 lg:border-l">
      <Logo3DNotices error={error} warnings={warnings} loading={loading} />
      <Logo3DInputSection state={state} onChange={onChange} onSvgFile={onSvgFile} />
      <Logo3DThicknessSection state={state} onParamChange={onParamChange} />
      <Logo3DColorSection state={state} onChange={onChange} />
      <Logo3DViewSection state={state} onChange={onChange} onResetZoom={onResetZoom} />

      {/* 스테이지 */}
      <section className={SECTION}>
        <SectionHeader title="Background" caption="배경 & 스테이지" />
        <div className="flex items-center justify-between gap-2.5 text-[11px]">
          <span className="whitespace-nowrap">배경 방식</span>
          <Select value={state.bgMode} onValueChange={(v) => onChange({ bgMode: v as BackgroundMode })}>
            <SelectTrigger aria-label="배경 방식" className="h-8 w-[140px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BACKGROUND_MODE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {(
            [
              ['bgA', '배경 A'],
              ['bgB', '배경 B'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className={cn(
                'flex flex-col items-center gap-1 text-center text-[9px] text-[#7f8582]',
                !bgInputs[key] && 'opacity-50'
              )}
            >
              <Input
                type="color"
                aria-label={label}
                value={state[key]}
                disabled={!bgInputs[key]}
                onChange={(e) => onChange({ [key]: e.target.value })}
                className="h-[26px] w-full cursor-pointer rounded-[5px] border border-black/10 bg-transparent p-0"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <SliderRow
          id="logo3d-bgAngle"
          label="배경 각도"
          value={state.bgAngle}
          min={BG_ANGLE_RANGE.min}
          max={BG_ANGLE_RANGE.max}
          step={BG_ANGLE_RANGE.step}
          unit="°"
          disabled={!bgInputs.bgAngle}
          onChange={(v) => onChange({ bgAngle: v })}
        />
      </section>

      {/* 저장 */}
      <section className={SECTION}>
        <SectionHeader title="Export" caption="PNG 저장" />
        <div className="flex items-center justify-between gap-2.5 text-[11px]">
          <span className="whitespace-nowrap">비율</span>
          <Select value={state.ratio} onValueChange={(v) => onChange({ ratio: v as CanvasRatio })}>
            <SelectTrigger aria-label="비율" className="h-8 w-[140px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATIO_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={saving || loading}
          onClick={onSave}
          className="mt-3 w-full bg-[#1e2322] text-xs text-white hover:bg-[#40483f] whitespace-nowrap"
        >
          {saving ? '저장 중이에요...' : 'PNG 저장'}
        </Button>
      </section>
    </aside>
  )
}
