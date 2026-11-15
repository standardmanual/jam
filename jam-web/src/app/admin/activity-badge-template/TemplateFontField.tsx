'use client'

/**
 * 템플릿 글자의 글꼴 고르기 (티켓 20261116_0653).
 * 에셋 제너레이터 TextLayerFields의 콤보박스와 같은 구성이되, 그 파일을 고치지 않으려고 따로 둔다.
 * 첫 항목 «템플릿 글꼴»(null)은 템플릿에 적힌 글꼴을 따른다는 뜻이다.
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
import { searchGoogleFonts } from '@/lib/admin/googleFonts'

export default function TemplateFontField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (family: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchGoogleFonts(query, 50), [query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate break-keep wrap-break-word">{value ?? '템플릿 글꼴'}</span>
          <IconChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="구글 폰트 검색" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="__template__"
                onSelect={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <IconCheck className={cn('h-4 w-4', value === null ? 'opacity-100' : 'opacity-0')} />
                템플릿 글꼴
              </CommandItem>
            </CommandGroup>
            <CommandGroup>
              {results.length === 0 && <CommandEmpty>검색 결과가 없어요</CommandEmpty>}
              {results.map((entry) => (
                <CommandItem
                  key={entry.family}
                  value={entry.family}
                  onSelect={() => {
                    onChange(entry.family)
                    setOpen(false)
                  }}
                >
                  <IconCheck className={cn('h-4 w-4', value === entry.family ? 'opacity-100' : 'opacity-0')} />
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
  )
}
