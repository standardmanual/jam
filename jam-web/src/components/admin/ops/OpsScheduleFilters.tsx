'use client'

import { useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { IconChevronDown, IconX } from '@tabler/icons-react'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/admin/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import { OPS_ITEM_KINDS } from '@/lib/admin/opsInbox/constants'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import { filterQuery, hasScheduleFilters, type ScheduleFilters } from '@/lib/admin/opsSchedule/filters'
import { parseScheduleParams } from '@/lib/admin/opsSchedule/params'
import { OpsStatusLegend } from './OpsStatusLegend'

/**
 * 일정표 거르기 줄 (티켓 20261006_1539 ③-d, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 거르기).
 *
 * `[종류] [트라이브] [패턴]` 세 단추가 각각 Popover + Command + Checkbox 다중 선택을 열고, 고른 값은 칩으로 남는다. 칩의 [×]는 그 값만, [거르기 지우기]는 전부 지운다.
 * 거르기는 주소(`kind`·`tribe`·`pattern`)가 전부다 — 바꿀 때마다 주소만 갈아 끼우고(`router.replace`, 스크롤 유지) 서버가 같은 주소로 본문을 다시 거른다.
 * 도구줄의 이전·다음 링크도 서버가 새 주소로 다시 그려 거르기를 이어 간다. 종류는 7개 중 일정표에 올라올 6개(「패턴 제안」은 칸에 오르지 않는다)다.
 * 월간·타임라인에서는 [상태 아이콘 보기]가 이 줄 오른쪽에 붙는다(③-c 메모: 거르기 줄이 생기면 그리로 옮긴다).
 * 단추 높이는 컨테이너 40rem 이상 40px, 미만 44px이다(채원 판정).
 */

export interface ScheduleFilterOption {
  value: string
  label: string
}

export const FILTER_KIND_TITLE = '종류'
export const FILTER_TRIBE_TITLE = '트라이브'
export const FILTER_PATTERN_TITLE = '패턴'
export const FILTER_CLEAR_LABEL = '거르기 지우기'
export const FILTER_OPTIONS_FAILED_TEXT = '트라이브·패턴 목록을 읽지 못해 고를 수 없어요. 새로 고쳐 다시 불러와 주세요'

/** 종류 선택지: 일정표 칸·막대에 오르는 6개(「패턴 제안」 제외). */
export const SCHEDULE_KIND_OPTIONS: readonly ScheduleFilterOption[] = OPS_ITEM_KINDS.filter((kind) => kind !== 'pattern_proposal').map((kind) => ({
  value: kind,
  label: kindLabel(kind),
}))

const BUTTON_HEIGHT = 'h-11 @[40rem]:h-10'

interface FilterPickerProps {
  title: string
  options: readonly ScheduleFilterOption[]
  selected: readonly string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

function FilterPicker({ title, options, selected, onChange, disabled }: FilterPickerProps) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={BUTTON_HEIGHT} disabled={disabled}>
          {title}
          {selected.length > 0 && (
            <Badge variant="secondary" className="rounded-sm px-1 font-normal">
              {selected.length}
            </Badge>
          )}
          <IconChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`${title} 찾기`} />
          <CommandList>
            <CommandEmpty>맞는 값이 없어요</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => toggle(option.value)}>
                  <Checkbox checked={selected.includes(option.value)} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface OpsScheduleFiltersProps {
  tribes: readonly ScheduleFilterOption[]
  patterns: readonly ScheduleFilterOption[]
  /** 트라이브·패턴 목록을 읽지 못했는가(단추를 막고 이유를 알린다). */
  optionsFailed?: boolean
  /** 월간·타임라인이면 [상태 아이콘 보기]를 이 줄에 붙인다. */
  showLegend: boolean
}

export function OpsScheduleFilters({ tribes, patterns, optionsFailed = false, showLegend }: OpsScheduleFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const current = useMemo(() => parseScheduleParams(searchParams), [searchParams])
  const filters: ScheduleFilters = { kinds: current.kinds, tribes: current.tribes, patterns: current.patterns }

  const apply = (next: Partial<ScheduleFilters>) => {
    const query = filterQuery(window.location.search, { ...filters, ...next })
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  const labelOf = (options: readonly ScheduleFilterOption[], value: string) => options.find((option) => option.value === value)?.label ?? value
  const chips = [
    ...filters.kinds.map((value) => ({ key: `kind:${value}`, label: labelOf(SCHEDULE_KIND_OPTIONS, value), remove: () => apply({ kinds: filters.kinds.filter((v) => v !== value) }) })),
    ...filters.tribes.map((value) => ({ key: `tribe:${value}`, label: labelOf(tribes, value), remove: () => apply({ tribes: filters.tribes.filter((v) => v !== value) }) })),
    ...filters.patterns.map((value) => ({ key: `pattern:${value}`, label: labelOf(patterns, value), remove: () => apply({ patterns: filters.patterns.filter((v) => v !== value) }) })),
  ]

  return (
    <div className="@container space-y-2" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <FilterPicker title={FILTER_KIND_TITLE} options={SCHEDULE_KIND_OPTIONS} selected={filters.kinds} onChange={(kinds) => apply({ kinds })} />
        <FilterPicker title={FILTER_TRIBE_TITLE} options={tribes} selected={filters.tribes} onChange={(next) => apply({ tribes: next })} disabled={optionsFailed} />
        <FilterPicker title={FILTER_PATTERN_TITLE} options={patterns} selected={filters.patterns} onChange={(next) => apply({ patterns: next })} disabled={optionsFailed} />
        {hasScheduleFilters(filters) && (
          <Button type="button" variant="ghost" size="sm" className={BUTTON_HEIGHT} onClick={() => apply({ kinds: [], tribes: [], patterns: [] })}>
            {FILTER_CLEAR_LABEL}
          </Button>
        )}
        {showLegend && <OpsStatusLegend className={`ml-auto ${BUTTON_HEIGHT}`} />}
      </div>
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="고른 거르기">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.remove}
                  aria-label={`${chip.label} 거르기 지우기`}
                  className="inline-flex size-5 items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconX className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {optionsFailed && <p className="text-sm text-muted-foreground">{FILTER_OPTIONS_FAILED_TEXT}</p>}
    </div>
  )
}
