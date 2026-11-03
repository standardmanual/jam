'use client'

/**
 * 3D 로고 설정 섹션 — Input·Thickness·Color·View (티켓 20261103_1352, 에셋 3D 모드로 옮김: 티켓 20261103_1734)
 *
 * 에셋 패널(`../ShapeStudioPanel.tsx`)의 3D 모드가 이 섹션을 쓴다(별도 3D 화면은 티켓 20261103_1738에서 걷어냈다).
 * 어드민 shadcn/ui 컴포넌트만 쓴다(네이티브 select 없음). 섹션 머리는 에셋 패널과 같은 형식(영문 제목 + 한글 설명)이다.
 */
import { useMemo, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconUpload } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/admin/ui/command'
import { Input } from '@/components/admin/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { searchGoogleFonts } from '@/lib/admin/googleFonts'
import { cn } from '@/lib/utils'
import { LOGO3D_PARAM_RANGES, type Logo3DParams } from '@/lib/logo-3d/types'
import {
  FONT_WEIGHT_OPTIONS,
  PALETTES,
  ROTATION_RANGE,
  TEXT_MAX_LENGTH,
  ZOOM_RANGE,
  type Logo3DPalette,
  type Logo3DSceneState,
  type Logo3DView,
} from './logo3dConfig'

export type Logo3DSceneChange = (patch: Partial<Logo3DSceneState>) => void

const PARAM_FIELDS: { key: keyof Logo3DParams; label: string }[] = [
  { key: 'depth', label: '로고 깊이' },
  { key: 'frameWidth', label: '외곽선 폭' },
  { key: 'frameFrontProtrusion', label: '틀 앞쪽 돌출' },
  { key: 'frameBevelRadius', label: '틀 모서리 둥글림' },
  { key: 'tileBevelRadius', label: '타일 모서리 둥글림' },
]

function decimalsOf(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

export type SliderRowProps = {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}

export function SliderRow({ id, label, value, min, max, step, unit = '', disabled = false, onChange }: SliderRowProps) {
  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <label htmlFor={id} className="mt-2.5 mb-1 flex items-center justify-between gap-2.5 text-[11px]">
        <span className="break-keep wrap-break-word">{label}</span>
        <output className="text-[10px] text-[#6f766c] tabular-nums">
          {value.toFixed(decimalsOf(step))}
          {unit}
        </output>
      </label>
      <Input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-3.5 w-full cursor-pointer border-0 bg-transparent p-0 accent-[#5f7a45] shadow-none focus-visible:ring-0"
      />
    </div>
  )
}

export function SectionHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
      <span>{title}</span>
      <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">{caption}</span>
    </div>
  )
}

export const SECTION = 'border-t border-[#e0e4df] px-5 py-4'

/** 변환 오류·자동 조정 경고·불러오는 중 안내. 내용이 없으면 아무것도 그리지 않는다. */
export function Logo3DNotices({
  error,
  warnings,
  loading,
}: {
  error: string | null
  warnings: string[]
  loading: boolean
}) {
  if (!error && warnings.length === 0 && !loading) return null
  return (
      <section className="px-5 py-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-[#f0c4bf] bg-[#fdf1ef] px-3 py-2 text-[11px] text-[#b42318] break-keep wrap-break-word"
          >
            {error}
            <span className="mt-1 block text-[#6f766c]">이전에 만든 3D 로고를 그대로 보여 주고 있어요.</span>
          </p>
        )}
        {warnings.length > 0 && (
          <div
            className={cn(
              'rounded-md border border-[#e5dcb8] bg-[#fbf7e6] px-3 py-2 text-[11px] text-[#6b5a1e]',
              error && 'mt-2'
            )}
          >
            <b className="block font-semibold break-keep wrap-break-word">값을 자동으로 조정했어요</b>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {warnings.map((w) => (
                <li key={w} className="break-keep wrap-break-word">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        {loading && !error && <p className="text-[11px] text-[#6f766c]">불러오는 중이에요...</p>}
      </section>
  )
}

export function Logo3DInputSection({
  state,
  onChange,
  onSvgFile,
}: {
  state: Logo3DSceneState
  onChange: Logo3DSceneChange
  onSvgFile: (file: File) => void
}) {
  const [fontOpen, setFontOpen] = useState(false)
  const [query, setQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchGoogleFonts(query, 50), [query])

  return (
    <section className={SECTION}>
      <SectionHeader title="Input" caption="폰트 또는 SVG" />
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ['font', '폰트 글자'],
            ['svg', 'SVG 파일'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={state.source === value ? 'default' : 'outline'}
            aria-pressed={state.source === value}
            onClick={() => onChange({ source: value })}
            className="text-xs whitespace-nowrap"
          >
            {label}
          </Button>
        ))}
      </div>

      <div className={cn('mt-3', state.source !== 'font' && 'opacity-50')}>
        <span className="mb-1 block text-[11px]">폰트</span>
        <Popover open={fontOpen} onOpenChange={setFontOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={fontOpen}
              aria-label="폰트 고르기"
              disabled={state.source !== 'font'}
              className="h-8 w-full justify-between text-[11px] font-normal"
            >
              <span className="truncate">{state.fontFamily}</span>
              <IconChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="구글 폰트 검색..." value={query} onValueChange={setQuery} />
              <CommandList>
                <CommandGroup heading="구글 폰트">
                  {results.length === 0 && <CommandEmpty>검색 결과가 없어요</CommandEmpty>}
                  {results.map((entry) => (
                    <CommandItem
                      key={entry.family}
                      value={entry.family}
                      onSelect={() => {
                        onChange({ fontFamily: entry.family })
                        setFontOpen(false)
                      }}
                    >
                      <IconCheck
                        className={cn('h-4 w-4', state.fontFamily === entry.family ? 'opacity-100' : 'opacity-0')}
                      />
                      <div className="flex flex-col">
                        <span>{entry.family}</span>
                        <span className="text-xs text-muted-foreground">{entry.category}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="mt-2.5 flex items-center justify-between gap-2.5 text-[11px]">
          <span className="whitespace-nowrap">굵기</span>
          <Select
            value={String(state.fontWeight)}
            onValueChange={(v) => onChange({ fontWeight: Number(v) })}
            disabled={state.source !== 'font'}
          >
            <SelectTrigger aria-label="굵기" className="h-8 w-[140px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="mt-2.5 block text-[11px]">
          <span className="mb-1 block">글자열</span>
          <Input
            type="text"
            value={state.text}
            maxLength={TEXT_MAX_LENGTH}
            disabled={state.source !== 'font'}
            placeholder="로고로 만들 글자를 입력해 주세요"
            onChange={(e) => onChange({ text: e.target.value })}
            className="h-8 text-[11px]"
          />
        </label>
      </div>

      <div className={cn('mt-3', state.source !== 'svg' && 'opacity-50')}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          aria-label="SVG 파일 고르기"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onSvgFile(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="w-full text-xs whitespace-nowrap"
        >
          <IconUpload className="mr-1.5 h-3.5 w-3.5" />
          SVG 파일 올리기
        </Button>
        <p className="mt-1.5 text-[10px] text-[#7f8582] break-keep wrap-break-word">
          {state.svgName
            ? `올린 파일: ${state.svgName}`
            : '기본 로고(JAM!)를 보여 주고 있어요. SVG 파일을 올리면 바꿀 수 있어요.'}
        </p>
      </div>
    </section>
  )
}

export function Logo3DThicknessSection({
  state,
  onParamChange,
}: {
  state: Logo3DSceneState
  onParamChange: (key: keyof Logo3DParams, value: number) => void
}) {
  return (
    <section className={SECTION}>
      <SectionHeader title="Thickness" caption="두께 · 외곽선 · 둥글림" />
      {PARAM_FIELDS.map(({ key, label }) => {
        const range = LOGO3D_PARAM_RANGES[key]
        return (
          <SliderRow
            key={key}
            id={`logo3d-${key}`}
            label={label}
            value={state.params[key]}
            min={range.min}
            max={range.max}
            step={range.step}
            onChange={(v) => onParamChange(key, v)}
          />
        )
      })}
    </section>
  )
}

export function Logo3DColorSection({
  state,
  onChange,
  onSelectPalette,
}: {
  state: Logo3DSceneState
  onChange: Logo3DSceneChange
  onSelectPalette: (palette: Logo3DPalette) => void
}) {
  return (
    <section className={SECTION}>
      <SectionHeader title="Color" caption="틀 · 타일 색" />
      <div className="grid grid-cols-3 gap-1.5">
        {PALETTES.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            aria-pressed={state.paletteId === p.id}
            onClick={() => onSelectPalette(p)}
            className={cn(
              'h-auto flex-col gap-1 px-1 py-1.5 text-[10px] font-normal',
              state.paletteId === p.id ? 'border-[#8fae6c] bg-[#e5edd8]' : 'bg-white'
            )}
          >
            <span className="flex h-4 w-full overflow-hidden rounded-sm border border-black/10">
              <span className="flex-1" style={{ backgroundColor: p.frame }} />
              <span className="flex-1" style={{ backgroundColor: p.tile }} />
            </span>
            <span className="break-keep wrap-break-word">{p.name}</span>
          </Button>
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        {(
          [
            ['frameColor', '틀 색'],
            ['tileColor', '타일 색'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col items-center gap-1 text-center text-[9px] text-[#7f8582]">
            <Input
              type="color"
              aria-label={label}
              value={state[key]}
              onChange={(e) => onChange({ [key]: e.target.value, paletteId: '' })}
              className="h-[26px] w-full cursor-pointer rounded-[5px] border border-black/10 bg-transparent p-0"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

export function Logo3DViewSection({
  state,
  onChange,
  onResetZoom,
}: {
  state: Logo3DSceneState
  onChange: Logo3DSceneChange
  onResetZoom: () => void
}) {
  return (
    <section className={SECTION}>
      <SectionHeader title="View" caption="회전 · 줌 · 시점" />
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ['perspective', '원근'],
            ['isometric', '등각'],
          ] as const satisfies readonly (readonly [Logo3DView, string])[]
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={state.view === value ? 'default' : 'outline'}
            aria-pressed={state.view === value}
            onClick={() => onChange({ view: value })}
            className="text-xs whitespace-nowrap"
          >
            {label}
          </Button>
        ))}
      </div>
      {(
        [
          ['rotX', '회전 X'],
          ['rotY', '회전 Y'],
          ['rotZ', '회전 Z'],
        ] as const
      ).map(([key, label]) => (
        <SliderRow
          key={key}
          id={`logo3d-${key}`}
          label={label}
          value={state[key]}
          min={ROTATION_RANGE.min}
          max={ROTATION_RANGE.max}
          step={ROTATION_RANGE.step}
          unit="°"
          onChange={(v) => onChange({ [key]: v })}
        />
      ))}
      <SliderRow
        id="logo3d-zoom"
        label="줌"
        value={state.zoom}
        min={ZOOM_RANGE.min}
        max={ZOOM_RANGE.max}
        step={ZOOM_RANGE.step}
        unit="%"
        onChange={(v) => onChange({ zoom: v })}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onResetZoom}
        className="mt-2.5 w-full text-xs whitespace-nowrap"
      >
        줌 초기화
      </Button>
      <p className="mt-1.5 text-[10px] text-[#7f8582] break-keep wrap-break-word">
        미리보기를 드래그하면 회전하고, 휠을 굴리면 줌 인·아웃해요.
      </p>
    </section>
  )
}
