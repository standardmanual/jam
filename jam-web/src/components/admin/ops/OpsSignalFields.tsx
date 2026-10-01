'use client'

import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { OPS_WEEKDAY_LABELS } from '@/lib/admin/opsSignals/catalog'
import type { OpsSignalThresholdKey } from '@/lib/admin/opsSignals/thresholds'
import {
  MIN_COUNT_LEGEND,
  SIGNAL_REVERT_LABEL,
  changedFieldLine,
  readOnlyTimeText,
  type SignalCardSpec,
  type SignalDraft,
  type SignalRecordMap,
  type ThresholdFieldSpec,
} from '@/lib/admin/opsSignals/thresholdSettings'
import { cn } from '@/lib/utils'

/**
 * 신호 기준값 카드 안의 칸 (티켓 20260930_1459 조각 C, 채원 확정 설계 「조각 C (S7 신호 기준값 구역)」). `OpsSignalCard`가 폼·저장 흐름을 맡고, 이 부품은 칸을 그린다:
 * - 숫자 칸(정수·배수): 이름표 · 입력 + 단위 · 안내 · 오류(있으면). 입력 모양은 밸런스 규칙 카드의 `NumberField`와 같다(`type="text"`, 카드 폭 40rem 미만 `h-11`)
 * - 요일 칸: 같은 자리의 Select(트리거 44px). 이름표는 `<label htmlFor>`로 잇는다
 * - 지표별 최소 건수 5칸: `<fieldset>` + `<legend>` 「지표별 최소 건수(최근 7일 합계)」
 * - 읽기 전용 시각(`routineCheckStartsAt`): 입력·되돌리기 없이 글만(「10/6(화) 09:00」 · 「아직 정해지지 않았어요」 · 「시각을 읽을 수 없어요」)
 * - 바꾼 칸: 「바꾼 값이에요 · 기본값 30분」 줄과 [기본값으로 되돌리기](확인창 없이 그 칸의 행만 지운다. 44px). 칸 순서는 입력 → 되돌리기라 탭 순서도 그렇다
 *
 * 오류·안내는 `aria-describedby`, 잘못된 값은 `aria-invalid` + `border-destructive`다. 카드는 `@container`라 40rem 미만에서는 한 열, 이상에서는 두 열이다.
 * 문장은 모두 React 텍스트 노드다.
 */

export interface OpsSignalFieldsProps {
  card: SignalCardSpec
  /** 카드 칸들의 저장된 상태(바꾼 칸의 줄·되돌리기 버튼·읽기 전용 시각이 읽는다). */
  records: SignalRecordMap
  draft: SignalDraft
  onChange: (next: SignalDraft) => void
  /** 지금 보이는 칸 오류(만져 본 칸 + 맞물린 짝 + 서버 400 + 읽을 수 없는 저장값). 기준값 키 → 문장. */
  errors: Partial<Record<string, string>>
  /** 칸을 떠났다(그 칸의 오류를 보이기 시작한다). */
  onTouch: (key: OpsSignalThresholdKey) => void
  /** 그 칸을 기본값으로 되돌린다(그 칸의 행만 지운다). */
  onRevert: (key: OpsSignalThresholdKey) => void
  disabled: boolean
  /** 카드 안 요소 ID의 접두사(`signal-<신호 키>`). */
  idBase: string
}

interface FieldProps {
  field: ThresholdFieldSpec
  idBase: string
  records: SignalRecordMap
  draft: SignalDraft
  error?: string
  disabled: boolean
  onText: (key: OpsSignalThresholdKey, text: string) => void
  onTouch: (key: OpsSignalThresholdKey) => void
  onRevert: (key: OpsSignalThresholdKey) => void
}

function domId(idBase: string, key: string): string {
  return `${idBase}-${key}`
}

/** 바꾼 칸의 줄과 [기본값으로 되돌리기]. */
function ChangedLine({ field, idBase, records, disabled, onRevert }: Pick<FieldProps, 'field' | 'idBase' | 'records' | 'disabled' | 'onRevert'>) {
  const record = records[field.key]
  if (!record?.changed) return null
  const line = changedFieldLine(record)
  return (
    <div className="space-y-0.5">
      {line && (
        <p id={`${domId(idBase, field.key)}-changed`} className="break-words text-xs text-muted-foreground">
          {line}
        </p>
      )}
      <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2" disabled={disabled} onClick={() => onRevert(field.key)}>
        {SIGNAL_REVERT_LABEL}
      </Button>
    </div>
  )
}

function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const list = ids.filter((id): id is string => typeof id === 'string' && id !== '')
  return list.length > 0 ? list.join(' ') : undefined
}

function ThresholdField(props: FieldProps) {
  const { field, idBase, records, draft, error, disabled, onText, onTouch, onRevert } = props
  const id = domId(idBase, field.key)
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const text = draft[field.key] ?? ''
  const describe = describedBy(error && errorId, field.hint ? hintId : undefined)

  return (
    <div className="min-w-0 space-y-1.5">
      <label id={labelId} htmlFor={id} className="text-sm font-medium">
        {field.label}
      </label>
      {field.kind === 'weekday' ? (
        <Select value={text} onValueChange={(next) => onText(field.key, next)} disabled={disabled}>
          <SelectTrigger
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describe}
            className={cn('h-11 w-full @[40rem]:max-w-[14rem]', error && 'border-destructive focus:ring-destructive')}
            onBlur={() => onTouch(field.key)}
          >
            <SelectValue placeholder="요일을 골라 주세요">{text === '' ? undefined : `${OPS_WEEKDAY_LABELS[Number(text)]}요일`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.weekdays.map((weekday) => (
              <SelectItem key={weekday} value={String(weekday)}>
                {OPS_WEEKDAY_LABELS[weekday]}요일
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="text"
            inputMode={field.kind === 'multiplier' ? 'decimal' : 'numeric'}
            autoComplete="off"
            value={text}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describe}
            className={cn('h-11 w-28 @[40rem]:h-10', error && 'border-destructive focus-visible:ring-destructive')}
            onChange={(event) => onText(field.key, event.target.value)}
            onBlur={() => onTouch(field.key)}
          />
          <span className="text-sm text-muted-foreground">{field.unit}</span>
        </div>
      )}
      {field.hint && (
        <p id={hintId} className="break-words text-xs text-muted-foreground">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="break-words text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <ChangedLine field={field} idBase={idBase} records={records} disabled={disabled} onRevert={onRevert} />
    </div>
  )
}

/** 읽기 전용 시각 칸: 입력·되돌리기·저장 대상이 아니다. */
function ReadOnlyTimeField({ field, idBase, records }: Pick<FieldProps, 'field' | 'idBase' | 'records'>) {
  const id = domId(idBase, field.key)
  return (
    <div className="min-w-0 space-y-1.5">
      <p id={`${id}-label`} className="text-sm font-medium">
        {field.label}
      </p>
      <p className="break-words text-sm">{readOnlyTimeText(records[field.key])}</p>
      {field.hint && <p className="break-words text-xs text-muted-foreground">{field.hint}</p>}
    </div>
  )
}

export function OpsSignalFields({ card, records, draft, onChange, errors, onTouch, onRevert, disabled, idBase }: OpsSignalFieldsProps) {
  const setText = (key: OpsSignalThresholdKey, text: string) => onChange({ ...draft, [key]: text })

  const renderField = (field: ThresholdFieldSpec) =>
    field.readOnly ? (
      <ReadOnlyTimeField key={field.key} field={field} idBase={idBase} records={records} />
    ) : (
      <ThresholdField
        key={field.key}
        field={field}
        idBase={idBase}
        records={records}
        draft={draft}
        error={errors[field.key]}
        disabled={disabled}
        onText={setText}
        onTouch={onTouch}
        onRevert={onRevert}
      />
    )

  const plain = card.fields.filter((field) => !field.inMinCountGroup)
  const minCountFields = card.fields.filter((field) => field.inMinCountGroup)

  return (
    <div className="grid gap-4 @[40rem]:grid-cols-2">
      {plain.map(renderField)}
      {minCountFields.length > 0 && (
        <fieldset className="min-w-0 space-y-3 @[40rem]:col-span-2">
          <legend className="mb-2 text-sm font-medium">{MIN_COUNT_LEGEND}</legend>
          <div className="grid gap-4 @[40rem]:grid-cols-2">{minCountFields.map(renderField)}</div>
        </fieldset>
      )}
    </div>
  )
}
