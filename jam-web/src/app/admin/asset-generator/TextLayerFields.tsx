'use client'

/**
 * JAM! 에셋 제너레이터 — 선택한 텍스트 레이어의 속성(내용·폰트·스타일·위치) (티켓 20260924_2158)
 *
 * 한 줄 행 구성은 `AssetGeneratorPanel`의 공용 `SliderRow`를 그대로 재사용한다(`ImageLayerFields`와
 * 같은 방식). 폰트 선택은 `shader-lab`과 같은 사용감(검색 콤보박스, `ShaderLabTextFontField.tsx`
 * 참고)이되, 그 컴포넌트는 텍스트 레이어를 CSS 변수 슬롯에 배정해 그리는 WebGL 전용 방식이라
 * 캔버스 `ctx.font`에는 맞지 않는다 — import하지 않고 `searchGoogleFonts`(googleFonts.ts)만
 * 가져와 이 화면 전용 검색 목록(Command/Popover)을 새로 만든다. `googleFonts.ts`·shader-lab
 * 파일은 고치지 않는다(완료 조건).
 */
import { useMemo, useState } from 'react'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { Textarea } from '@/components/admin/ui/textarea'
import { searchGoogleFonts } from '@/lib/admin/googleFonts'
import type { TextLayerConfig } from '@/lib/asset-generator'
import SliderRow from './SliderRow'
import {
  formatDegree,
  formatMultiplier,
  formatPercent,
  formatWeight,
  FONT_WEIGHT_RANGE,
  IMAGE_POSITION_RANGE,
  isSystemDefaultFont,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  OPACITY_RANGE,
  ROTATION_RANGE,
  SYSTEM_DEFAULT_FONT,
  TEXT_ALIGN_OPTIONS,
  TEXT_SIZE_RANGE,
} from './assetGeneratorHelpers'

interface TextLayerFieldsProps {
  layer: TextLayerConfig
  onChange: (patch: Partial<TextLayerConfig>) => void
}

export default function TextLayerFields({ layer, onChange }: TextLayerFieldsProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchGoogleFonts(query, 50), [query])
  const isSystemDefault = isSystemDefaultFont(layer.font)

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">글자 내용</span>
        <Textarea
          value={layer.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="텍스트를 입력해 주세요"
          rows={3}
        />
        <span className="text-xs text-muted-foreground">이 값은 프리셋에 저장되지 않아요. 적용할 때마다 다시 입력해요.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">폰트</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">{isSystemDefault ? '시스템 기본' : layer.font.family}</span>
              <IconChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="구글 폰트 검색..." value={query} onValueChange={setQuery} />
              <CommandList>
                <CommandGroup heading="기본 폰트">
                  <CommandItem
                    value={SYSTEM_DEFAULT_FONT.family}
                    onSelect={() => {
                      onChange({ font: { family: SYSTEM_DEFAULT_FONT.family, weight: layer.font.weight } })
                      setOpen(false)
                    }}
                  >
                    <IconCheck className={cn('h-4 w-4', isSystemDefault ? 'opacity-100' : 'opacity-0')} />
                    시스템 기본
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="구글 폰트">
                  {results.length === 0 && <CommandEmpty>검색 결과가 없어요</CommandEmpty>}
                  {results.map((entry) => (
                    <CommandItem
                      key={entry.family}
                      value={entry.family}
                      onSelect={() => {
                        onChange({ font: { family: entry.family, weight: layer.font.weight } })
                        setOpen(false)
                      }}
                    >
                      <IconCheck
                        className={cn('h-4 w-4', !isSystemDefault && layer.font.family === entry.family ? 'opacity-100' : 'opacity-0')}
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
      </label>

      <SliderRow
        label="굵기"
        value={layer.font.weight}
        {...FONT_WEIGHT_RANGE}
        format={formatWeight}
        onChange={(v) => onChange({ font: { ...layer.font, weight: v } })}
      />
      <SliderRow
        label="크기"
        value={layer.sizePct}
        {...TEXT_SIZE_RANGE}
        format={formatPercent}
        onChange={(v) => onChange({ sizePct: v })}
      />
      <SliderRow
        label="자간"
        value={layer.letterSpacing}
        {...LETTER_SPACING_RANGE}
        format={formatMultiplier}
        onChange={(v) => onChange({ letterSpacing: v })}
      />
      <SliderRow
        label="행간"
        value={layer.lineHeight}
        {...LINE_HEIGHT_RANGE}
        format={formatMultiplier}
        onChange={(v) => onChange({ lineHeight: v })}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">정렬</span>
        <Tabs value={layer.align} onValueChange={(v) => onChange({ align: v as TextLayerConfig['align'] })}>
          <TabsList className="w-full">
            {TEXT_ALIGN_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value} className="flex-1">
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <label className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground">색</span>
        <Input type="color" value={layer.color} onChange={(e) => onChange({ color: e.target.value })} className="h-9 w-16 p-1" />
      </label>

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
