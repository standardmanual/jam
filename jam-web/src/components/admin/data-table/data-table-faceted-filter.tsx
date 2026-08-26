'use client'

import { IconCheck, IconCirclePlus } from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/admin/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import { Separator } from '@/components/admin/ui/separator'

interface DataTableFacetedFilterOption {
  label: string
  value: string
}

interface DataTableFacetedFilterProps {
  title: string
  options: DataTableFacetedFilterOption[]
  /** 현재 선택된 값(들). 이 프로젝트의 어드민 필터는 전부 서버(URL) 단일값 필터라 보통 0~1개 */
  selected: string[]
  onChange: (values: string[]) => void
  /**
   * true(기본값)면 한 번에 하나만 선택되는 라디오형으로 동작한다 — 서버 쿼리가
   * `.eq()` 단일값 필터라서다. 여러 값을 동시에 필터링하는 화면이 생기면 false로 켠다.
   */
  singleSelect?: boolean
}

/**
 * shadcn 공식 Data Table 패턴의 `DataTableFacetedFilter`(20260826_014) — Popover+Command
 * 드롭다운 UI는 공식 패턴 그대로다.
 *
 * 다만 TanStack `column`이 아니라 `selected`/`onChange`를 직접 받는다: 이 프로젝트의 어드민
 * 목록은 서버사이드 필터링(URL searchParams)이고, 필터 UI(`BadgesFilterBar.tsx`)가 모바일·
 * 데스크탑 공용이라 데스크탑 전용 테이블의 `table` 인스턴스 밖에 위치해야 하기 때문이다
 * (`data-table/features.ts` 주석 참고). 페이지당 데이터만 들고 있어 정확한 전체 카운트를
 * 낼 수 없으므로(서버 페이지네이션) 공식 패턴에 있는 옵션별 개수 표시는 넣지 않는다.
 */
export function DataTableFacetedFilter({
  title,
  options,
  selected,
  onChange,
  singleSelect = true,
}: DataTableFacetedFilterProps) {
  const selectedValues = new Set(selected)

  const toggle = (value: string) => {
    if (singleSelect) {
      onChange(selectedValues.has(value) ? [] : [value])
      return
    }
    const next = new Set(selectedValues)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(Array.from(next))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <IconCirclePlus className="h-4 w-4" />
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selectedValues.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selectedValues.size}개 선택됨
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge variant="secondary" key={option.value} className="rounded-sm px-1 font-normal">
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>결과가 없습니다.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                return (
                  <CommandItem key={option.value} onSelect={() => toggle(option.value)}>
                    <div
                      className={cn(
                        'flex size-4 items-center justify-center rounded-[4px] border',
                        isSelected
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 [&_svg]:invisible'
                      )}
                    >
                      <IconCheck className="size-3.5 text-white" />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    필터 초기화
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
