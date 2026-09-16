'use client'

/**
 * 쉐이더 랩 — 텍스트 레이어 폰트 필드(구글 폰트 검색 콤보박스, 티켓 20260916_2001)
 *
 * 기존 `select` 타입(`ShaderLabParamField.tsx`)은 정적 배열(`field.options`)만 그리므로,
 * 구글 폰트 카탈로그(1,946종, `googleFonts.ts`)를 검색해 자유롭게 고르는 이 필드는 별도
 * 콤보박스로 뺐다. 패턴은 기존 `UserSearchCombobox.tsx`(shadcn Command + Popover)를
 * 그대로 따랐다 — 다만 서버 검색이 아니라 번들된 정적 카탈로그를 클라이언트에서 필터링한다.
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import { searchGoogleFonts } from '@/lib/admin/shaderLab/googleFonts'
import { SHADER_LAB_DEFAULT_TEXT_FONT } from '@/lib/admin/shaderLab/textFontOptions'

interface ShaderLabTextFontFieldProps {
  /** 현재 `fontFamily` 파라미터 값 — 슬롯 id(`bsmnt-grotesque` 또는 구글 폰트 슬롯 11종 중 하나). */
  fontFamilyValue: string
  /** 구글 폰트 슬롯일 때 실제로 배정된 폰트 이름(표시용). */
  googleFontFamily: string | null
  onSelectPretendard: () => void
  onSelectGoogleFont: (family: string) => void
}

export default function ShaderLabTextFontField({
  fontFamilyValue,
  googleFontFamily,
  onSelectPretendard,
  onSelectGoogleFont,
}: ShaderLabTextFontFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchGoogleFonts(query, 50), [query])

  const isPretendard = fontFamilyValue === SHADER_LAB_DEFAULT_TEXT_FONT.value
  const currentLabel = isPretendard
    ? SHADER_LAB_DEFAULT_TEXT_FONT.label
    : (googleFontFamily ?? '폰트를 선택해 주세요')

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground">폰트</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="truncate">{currentLabel}</span>
            <IconChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="구글 폰트 검색..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandGroup heading="기본 폰트">
                <CommandItem
                  value={SHADER_LAB_DEFAULT_TEXT_FONT.value}
                  onSelect={() => {
                    onSelectPretendard()
                    setOpen(false)
                  }}
                >
                  <IconCheck className={cn('h-4 w-4', isPretendard ? 'opacity-100' : 'opacity-0')} />
                  {SHADER_LAB_DEFAULT_TEXT_FONT.label}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="구글 폰트">
                {results.length === 0 && <CommandEmpty>검색 결과가 없어요</CommandEmpty>}
                {results.map((entry) => (
                  <CommandItem
                    key={entry.family}
                    value={entry.family}
                    onSelect={() => {
                      onSelectGoogleFont(entry.family)
                      setOpen(false)
                    }}
                  >
                    <IconCheck
                      className={cn('h-4 w-4', !isPretendard && googleFontFamily === entry.family ? 'opacity-100' : 'opacity-0')}
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
      <span className="text-xs text-muted-foreground">
        {isPretendard
          ? '가변 폰트라 굵기를 자유롭게 조절할 수 있어요.'
          : '구글 폰트는 굵기가 고정이에요(한 컴포지션에서 서로 다른 구글 폰트는 최대 11종까지 동시에 쓸 수 있어요).'}
      </span>
    </label>
  )
}
