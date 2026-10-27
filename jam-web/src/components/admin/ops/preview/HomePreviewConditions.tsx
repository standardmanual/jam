'use client'

import { Checkbox } from '@/components/admin/ui/checkbox'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import type { SpecialDayTag } from '@/lib/inputs/special-days-config'
import type { TimeOfDayTag } from '@/lib/today/exposure'
import { cn } from '@/lib/utils'
import {
  SPECIAL_OPTIONS,
  STORED_LABEL,
  TIME_OPTIONS,
  WEATHER_OPTIONS,
  type HomePreviewConditions,
  type HomePreviewTribe,
} from './homePreviewClient'

/**
 * 홈피드 미리보기의 조건 줄 (티켓 20261026_2025 2회차). 값을 들고 있지 않고 바깥(`HomePreviewPanel`)이 정한 값을 그리기만 한다.
 *
 * 시작 날짜(미래 날짜도 고른다) · 트라이브(「전체(트라이브 없음)」 포함) · 시간대(새벽·아침·낮·저녁·밤) · 날씨(「저장된 값」 포함)
 * · 특일(공휴일·절기·기념일 토글과 「저장된 값」) · 신규 유저.
 * 날씨·특일은 선택한 날에 저장된 값이 있으면 「저장된 값」이 기본이다. 저장된 값이 없는 날(미래)이면 `missingStored`로 한 줄 알리고 그대로 고르게 한다.
 */

const TEXT_CLASS = 'break-keep wrap-break-word'
const NO_TRIBE = '__none__'

interface HomePreviewConditionsProps {
  fromDate: string
  onFromDateChange: (date: string) => void
  conditions: HomePreviewConditions
  onChange: (next: HomePreviewConditions) => void
  tribes: readonly HomePreviewTribe[]
  /** 선택한 날의 저장된 날씨 이름(있을 때). 「저장된 값 (비)」처럼 보여준다 */
  storedWeatherName: string | null
  /** 저장된 값을 쓰기로 했는데 그날 저장된 값이 없는 항목 이름들 */
  missingStored: readonly string[]
  /** 고르기 목록을 올릴 곳(어드민 테마 범위 안) */
  portalContainer?: HTMLElement
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={cn('text-xs text-muted-foreground whitespace-nowrap', TEXT_CLASS)}>{label}</span>
      {children}
    </div>
  )
}

export function HomePreviewConditionsRow({
  fromDate,
  onFromDateChange,
  conditions,
  onChange,
  tribes,
  storedWeatherName,
  missingStored,
  portalContainer,
}: HomePreviewConditionsProps) {
  const toggleSpecial = (tag: SpecialDayTag) => {
    const current = conditions.special === 'stored' ? [] : conditions.special
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    onChange({ ...conditions, special: next })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="시작 날짜">
          <Input
            type="date"
            value={fromDate}
            aria-label="시작 날짜"
            className="h-9 w-40"
            onChange={(event) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onFromDateChange(event.target.value)
            }}
          />
        </Field>

        <Field label="트라이브">
          <Select
            value={conditions.tribeId ?? NO_TRIBE}
            onValueChange={(value) => onChange({ ...conditions, tribeId: value === NO_TRIBE ? null : value })}
          >
            <SelectTrigger aria-label="트라이브" className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value={NO_TRIBE}>전체(트라이브 없음)</SelectItem>
              {tribes.map((tribe) => (
                <SelectItem key={tribe.id} value={tribe.id}>
                  {tribe.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="시간대">
          <Select value={conditions.timeOfDay} onValueChange={(value) => onChange({ ...conditions, timeOfDay: value as TimeOfDayTag })}>
            <SelectTrigger aria-label="시간대" className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              {TIME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="날씨">
          <Select
            value={conditions.weather}
            onValueChange={(value) => onChange({ ...conditions, weather: value as HomePreviewConditions['weather'] })}
          >
            <SelectTrigger aria-label="날씨" className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value="stored">{storedWeatherName ? `${STORED_LABEL} (${storedWeatherName})` : STORED_LABEL}</SelectItem>
              {WEATHER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="특일">
          <div role="group" aria-label="특일" className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={conditions.special === 'stored' ? 'default' : 'outline'}
              aria-pressed={conditions.special === 'stored'}
              className="h-9"
              onClick={() => onChange({ ...conditions, special: 'stored' })}
            >
              {STORED_LABEL}
            </Button>
            {SPECIAL_OPTIONS.map((option) => {
              const on = conditions.special !== 'stored' && conditions.special.includes(option.value)
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={on ? 'default' : 'outline'}
                  aria-pressed={on}
                  className="h-9"
                  onClick={() => toggleSpecial(option.value)}
                >
                  {option.label}
                </Button>
              )
            })}
          </div>
        </Field>

        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={conditions.newUser} onCheckedChange={(value) => onChange({ ...conditions, newUser: value === true })} />
          <span className={cn('whitespace-nowrap', TEXT_CLASS)}>신규 유저</span>
        </label>
      </div>

      {missingStored.length > 0 && (
        <p role="status" className={cn('text-xs text-muted-foreground text-pretty', TEXT_CLASS)}>
          {`저장된 값이 없어요: ${missingStored.join(', ')}. 위에서 직접 골라 볼 수 있어요.`}
        </p>
      )}
    </div>
  )
}
