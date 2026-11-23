'use client'

/**
 * 「카드 모양」 섹션과 칩 편집기가 함께 쓰는 공용 조각 — 선택 칸(`ChoiceField`)·선택지 모양(`ChoiceOption`)·도장·칩 자리 이름(`stampSlotLabel`) (티켓 20261121_2113, 상위 20261120_2026).
 * 두 파일이 서로를 가져오던 순환을 끊으려고 한 파일로 옮겼다. `FeedCardSection.tsx`는 같은 이름을 다시 내보내 외부 가져오기가 그대로 동작한다.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { FieldLabel, FieldMessage } from '@/app/admin/badges/BadgeFormControls'
import { cornerOfSlot, type ChipCorner } from '@/lib/today/feedChipLayout'
import { feedColorVar, type FeedColorKey } from '@/lib/today/feedConstants'

// ── 자리 이름 ──────────────────────────────────────────────────

const SLOT_ANCHOR_LABELS: Readonly<Record<string, string>> = {
  image: '이미지',
  badge: '배지',
  'box-row': '박스 줄',
  box: '박스',
  art: '그림',
}

const CORNER_LABELS: Readonly<Record<ChipCorner, string>> = {
  'top-left': '왼쪽 위',
  'top-right': '오른쪽 위',
  'bottom-left': '왼쪽 아래',
  'bottom-right': '오른쪽 아래',
}

/** 자리 이름 → 한국어(`box-top-left` → «박스 왼쪽 위»). 모서리 자리가 아니면 이름 그대로다. */
export function stampSlotLabel(slot: string): string {
  const corner = cornerOfSlot(slot)
  if (!corner) return slot
  const anchor = slot.slice(0, slot.length - corner.length - 1)
  return `${SLOT_ANCHOR_LABELS[anchor] ?? anchor} ${CORNER_LABELS[corner]}`
}

// ── 선택 칸 ────────────────────────────────────────────────────

const AUTO_VALUE = '__auto__'
export const AUTO_HINT = '저장할 때 자동으로 정해져요'
export const TEXT_CLASS = 'break-keep wrap-break-word'

export interface ChoiceOption {
  value: string
  label: string
  /** 색 키면 이름 앞에 견본을 그린다 */
  colorKey?: FeedColorKey
}

function Swatch({ colorKey }: { colorKey: FeedColorKey }) {
  return (
    <span
      aria-hidden="true"
      className="mr-2 inline-block size-3.5 shrink-0 rounded-full border border-border align-middle"
      style={{ backgroundColor: feedColorVar(colorKey) }}
    />
  )
}

/** 자동 + 선택지 하나를 고르는 칸. 빈 값(`''`)이 «자동»이다. */
export function ChoiceField({
  id,
  label,
  value,
  options,
  currentValueOption,
  autoLabel = '자동',
  onChange,
  themeContainer,
  help,
  autoHint = AUTO_HINT,
  disabled,
  required,
}: {
  id: string
  label: string
  value: string
  options: readonly ChoiceOption[]
  /** 저장된 값이 `options` 밖일 때 닫힌 칸에만 보이는 «현재 값» 선택지. 목록에는 들어가지 않아 다시 고를 수 없다. */
  currentValueOption?: ChoiceOption
  autoLabel?: string
  onChange: (value: string) => void
  themeContainer?: HTMLElement | null
  help?: string
  /** «자동»일 때 도움말 뒤에 붙는 문구. 기본은 «저장할 때 자동으로 정해져요»이고, 그릴 때 정해지는 칸(칩 자리·기울기)은 `null`로 끈다 */
  autoHint?: string | null
  /** 고를 수 없는 상태(선택지가 없을 때) */
  disabled?: boolean
  /** 비워 둘 수 없는 칸. «자동» 선택지를 두지 않는다(값이 선택지에 없을 때만 «자동» 문구가 자리표시로 보인다) */
  required?: boolean
}) {
  const selected = options.find((o) => o.value === value) ?? (currentValueOption && currentValueOption.value === value ? currentValueOption : undefined)
  const isAuto = !selected
  const helpId = `${id}-help`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id} className={TEXT_CLASS}>
        {label}
      </FieldLabel>
      <Select value={selected ? selected.value : AUTO_VALUE} onValueChange={(v) => onChange(v === AUTO_VALUE ? '' : v)} disabled={disabled}>
        <SelectTrigger id={id} aria-describedby={helpId}>
          <SelectValue>
            {selected ? (
              <span className="inline-flex items-center">
                {selected.colorKey && <Swatch colorKey={selected.colorKey} />}
                {selected.label}
              </span>
            ) : (
              <span className="text-muted-foreground">{autoLabel}</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent container={themeContainer ?? undefined}>
          {!required && <SelectItem value={AUTO_VALUE}>{autoLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="inline-flex items-center">
                {o.colorKey && <Swatch colorKey={o.colorKey} />}
                {o.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldMessage id={helpId} className={TEXT_CLASS}>
        {isAuto ? [help, autoHint].filter(Boolean).join(' ') : help}
      </FieldMessage>
    </div>
  )
}
