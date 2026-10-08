'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Textarea } from '@/components/admin/ui/textarea'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { OPS_PATTERN_KNOB_LABELS } from '@/lib/admin/opsInbox/labels'
import {
  OPS_PATTERN_KNOB_KEYS,
  OPS_PATTERN_KNOB_VALUE_FIELD_LABELS,
  OPS_PATTERN_KNOB_VALUE_KEYS,
  OPS_PATTERN_LIMITS,
  OPS_PATTERN_SAMPLE_ROLES,
  OPS_PATTERN_SAMPLE_ROLE_LABELS,
  type OpsPatternKnobKey,
  type OpsPatternSampleRole,
} from '@/lib/admin/opsPatterns/constants'
import { fieldDomId, type PatternDraft, type PatternDraftCardShape, type PatternDraftSample } from '@/lib/admin/opsPatterns/formDraft'
import type { OpsPatternFieldErrors } from '@/lib/admin/opsPatterns/input'
import { CARD_SHAPES, isCardShape } from '@/lib/today/shape'
import { cn } from '@/lib/utils'

/**
 * 패턴 만들기·고치기 폼의 칸 부품 (티켓 20261008_1617, 상위 20260930_1503 ⑩a-2). `OpsPatternForm`이 상태와 저장 흐름을 맡고, 이 파일은 칸 하나하나를 그린다.
 *
 * - 칸 id는 `fieldDomId(경로)`(`pattern-field-samples-2-role`)이고 오류 문장은 `${id}-error`다. 입력 칸은 `aria-invalid`·`aria-describedby`로 오류에 이어진다.
 * - 글자 수는 상한의 80%부터 보이고(`name` 60자면 48자부터), 넘으면 붉게 바뀐다. 상한을 넘겨도 입력은 막지 않고 검사가 문장으로 알린다.
 * - 줄 목록(카드 모양·샘플)은 「더하기」「지우기」 버튼이 있고, 메뉴는 칩이다. 줄에는 안정 키가 없어 순서(index)를 키로 쓴다(입력 칸이 모두 제어 입력이라 문제없다).
 */

const { nameMax, longTextMax, menuMax, menusMaxCount, samplesMaxCount, cardShapeNoteMax } = OPS_PATTERN_LIMITS
export const PATTERN_NAME_MAX = nameMax
export const PATTERN_LONG_TEXT_MAX = longTextMax

export const REQUIRED_MARK_LABEL = '필수'
export const MENU_ADD_LABEL = '더하기'
export const MENU_INPUT_LABEL = '쓰는 메뉴 이름'
export const MENU_LIMIT_NOTE = `메뉴는 ${menusMaxCount}개까지 넣을 수 있어요`
export const SAMPLES_LIMIT_NOTE = `샘플은 ${samplesMaxCount}개까지 넣을 수 있어요`
export const CARD_SHAPE_ADD_LABEL = '카드 모양 더하기'
export const SAMPLE_ADD_LABEL = '샘플 더하기'
export const ROW_REMOVE_LABEL = '지우기'
export const SELECT_PLACEHOLDER = '골라 주세요'

/** 글자 수를 보여 줄 문턱(상한의 80%). */
const COUNT_SHOW_RATIO = 0.8

export function errorIdOf(path: string): string {
  return `${fieldDomId(path)}-error`
}

/** 입력 칸에 붙는 접근성 속성: 칸 id, 오류가 있으면 `aria-invalid`와 오류 문장 연결. */
export function fieldA11y(path: string, error: string | undefined) {
  return {
    id: fieldDomId(path),
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? errorIdOf(path) : undefined,
  }
}

const INVALID_CLASS = 'border-destructive focus-visible:ring-destructive'

/** 칸 아래 붉은 오류 문장. 없으면 아무것도 그리지 않는다. */
export function FieldError({ path, error }: { path: string; error: string | undefined }) {
  if (!error) return null
  return (
    <p id={errorIdOf(path)} className="text-sm font-medium text-destructive break-words">
      {error}
    </p>
  )
}

/** 「n / 상한」. 상한의 80%부터 보이고 넘으면 붉다. */
export function CharCount({ length, max }: { length: number; max: number }) {
  if (length < max * COUNT_SHOW_RATIO) return null
  return (
    <p className={cn('text-xs tabular-nums', length > max ? 'font-medium text-destructive' : 'text-muted-foreground')}>
      {length.toLocaleString('ko-KR')} / {max.toLocaleString('ko-KR')}
    </p>
  )
}

function Label({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
      {required && (
        <>
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
          <span className="sr-only"> ({REQUIRED_MARK_LABEL})</span>
        </>
      )}
    </label>
  )
}

interface TextFieldProps {
  /** 오류 경로이자 칸 id의 바탕(`name`·`samples.2.impl`). */
  path: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  /** 있으면 글자 수를 보인다. */
  max?: number
  /** 있으면 여러 줄 칸이다. */
  rows?: number
  className?: string
}

/** 한 줄 칸(`rows` 없음) 또는 여러 줄 칸. 이름표·오류·글자 수를 함께 그린다. */
export function TextField({ path, label, value, onChange, error, required, max, rows, className }: TextFieldProps) {
  const a11y = fieldA11y(path, error)
  const invalid = error ? INVALID_CLASS : undefined
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label htmlFor={a11y.id} required={required}>
        {label}
      </Label>
      {rows ? (
        <Textarea {...a11y} rows={rows} value={value} aria-required={required || undefined} className={invalid} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input {...a11y} type="text" autoComplete="off" value={value} aria-required={required || undefined} className={invalid} onChange={(event) => onChange(event.target.value)} />
      )}
      <FieldError path={path} error={error} />
      {max !== undefined && <CharCount length={value.trim().length} max={max} />}
    </div>
  )
}

interface PatternSelectProps<T extends string> {
  path: string
  label: string
  value: T | ''
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  error?: string
  required?: boolean
}

/** 값을 고르는 칸. 아직 고르지 않았으면 「골라 주세요」가 보인다. */
export function PatternSelect<T extends string>({ path, label, value, options, onChange, error, required }: PatternSelectProps<T>) {
  const container = useAdminPortalContainer()
  const a11y = fieldA11y(path, error)
  const selected = options.find((option) => option.value === value)
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={a11y.id} required={required}>
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger {...a11y} aria-required={required || undefined} className={cn('w-full', error && INVALID_CLASS)}>
          <SelectValue placeholder={SELECT_PLACEHOLDER}>{selected?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent container={container ?? undefined}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError path={path} error={error} />
    </div>
  )
}

const SAMPLE_ROLE_OPTIONS = OPS_PATTERN_SAMPLE_ROLES.map((role) => ({ value: role, label: OPS_PATTERN_SAMPLE_ROLE_LABELS[role] }))
const CARD_SHAPE_OPTIONS = CARD_SHAPES.map((shape) => ({ value: shape, label: shape }))

// ── 쓰는 메뉴 (칩) ───────────────────────────────────────────────────────────────────────────────

interface MenuChipsProps {
  menus: string[]
  /** 칩별 오류(`menus.2`)와 목록 전체 오류(`menus`). */
  errors: OpsPatternFieldErrors
  onChange: (menus: string[]) => void
}

/** 메뉴 칩 입력: 글자를 적고 Enter 또는 [더하기]로 칩을 만들고, 칩마다 지우기 버튼이 있다. 열 개가 차면 더하기가 꺼진다. */
export function MenuChips({ menus, errors, onChange }: MenuChipsProps) {
  const [text, setText] = useState('')
  const full = menus.length >= menusMaxCount
  const inputId = 'pattern-menu-input'

  const add = () => {
    const next = text.trim()
    if (next === '' || full) return
    onChange([...menus, next])
    setText('')
  }

  const chipErrors = Object.entries(errors).filter(([path]) => path.startsWith('menus.'))

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        쓰는 메뉴
      </label>
      {menus.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="넣은 메뉴">
          {menus.map((menu, index) => (
            <li
              key={index}
              id={fieldDomId(`menus.${index}`)}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-3 pr-1 text-sm',
                errors[`menus.${index}`] ? 'border-destructive' : 'border-border'
              )}
            >
              <span className="min-w-0 break-words">{menu}</span>
              <button
                type="button"
                aria-label={`${menu} 지우기`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onChange(menus.filter((_, at) => at !== index))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="text"
          autoComplete="off"
          value={text}
          maxLength={menuMax}
          disabled={full}
          placeholder={full ? MENU_LIMIT_NOTE : undefined}
          aria-label={MENU_INPUT_LABEL}
          className="min-w-0 flex-1"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // 한글 조합 중의 Enter는 글자를 확정하는 키라 칩을 만들지 않는다.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            add()
          }}
        />
        <Button type="button" variant="outline" disabled={full || text.trim() === ''} onClick={add}>
          {MENU_ADD_LABEL}
        </Button>
      </div>
      {full && <p className="text-xs text-muted-foreground">{MENU_LIMIT_NOTE}</p>}
      <FieldError path="menus" error={errors.menus} />
      {chipErrors.map(([path, message]) => (
        <FieldError key={path} path={path} error={message} />
      ))}
    </div>
  )
}

// ── 줄 목록 틀 ──────────────────────────────────────────────────────────────────────────────────

function RowFrame({ title, onRemove, children }: { title: string; onRemove: () => void; children: ReactNode }) {
  return (
    <li className="@container space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button type="button" variant="ghost" size="sm" aria-label={`${title} ${ROW_REMOVE_LABEL}`} onClick={onRemove}>
          {ROW_REMOVE_LABEL}
        </Button>
      </div>
      {children}
    </li>
  )
}

// ── 카드 모양 ───────────────────────────────────────────────────────────────────────────────────

interface CardShapeRowsProps {
  rows: PatternDraftCardShape[]
  errors: OpsPatternFieldErrors
  onChange: (rows: PatternDraftCardShape[]) => void
}

/** 카드 모양 줄: 모양을 고르고 메모를 적는다. 줄 수에 상한은 없다. */
export function CardShapeRows({ rows, errors, onChange }: CardShapeRowsProps) {
  const update = (index: number, patch: Partial<PatternDraftCardShape>) => onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm font-medium">카드 모양</p>
      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <RowFrame key={index} title={`카드 모양 ${index + 1}`} onRemove={() => onChange(rows.filter((_, at) => at !== index))}>
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-[10rem_minmax(0,1fr)]">
                <PatternSelect
                  path={`cardShapes.${index}.shape`}
                  label="모양"
                  required
                  value={row.shape}
                  options={CARD_SHAPE_OPTIONS}
                  error={errors[`cardShapes.${index}.shape`]}
                  onChange={(shape) => update(index, { shape: isCardShape(shape) ? shape : '' })}
                />
                <TextField
                  path={`cardShapes.${index}.note`}
                  label="메모"
                  value={row.note}
                  max={cardShapeNoteMax}
                  error={errors[`cardShapes.${index}.note`]}
                  onChange={(note) => update(index, { note })}
                />
              </div>
              <FieldError path={`cardShapes.${index}`} error={errors[`cardShapes.${index}`]} />
            </RowFrame>
          ))}
        </ul>
      )}
      <FieldError path="cardShapes" error={errors.cardShapes} />
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { shape: '', note: '' }])}>
        {CARD_SHAPE_ADD_LABEL}
      </Button>
    </div>
  )
}

// ── 손잡이 ──────────────────────────────────────────────────────────────────────────────────────

interface KnobGroupsProps {
  knobs: PatternDraft['knobs']
  errors: OpsPatternFieldErrors
  onChange: (key: OpsPatternKnobKey, values: [string, string]) => void
}

/** 손잡이 5종: 조건·장소·시간·보상은 「열 수 있는 값」「닫은 값」, 트라이브는 「규칙」「예시」 두 칸씩. 모두 선택이다. */
export function KnobGroups({ knobs, errors, onChange }: KnobGroupsProps) {
  return (
    <ul className="@container space-y-3">
      {OPS_PATTERN_KNOB_KEYS.map((key) => {
        const [first, second] = OPS_PATTERN_KNOB_VALUE_KEYS[key]
        const values = knobs[key]
        return (
          <li key={key} className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{OPS_PATTERN_KNOB_LABELS[key]}</p>
            <FieldError path={`knobs.${key}`} error={errors[`knobs.${key}`]} />
            <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
              <TextField
                path={`knobs.${key}.${first}`}
                label={OPS_PATTERN_KNOB_VALUE_FIELD_LABELS[first]}
                rows={3}
                value={values[0]}
                max={longTextMax}
                error={errors[`knobs.${key}.${first}`]}
                onChange={(value) => onChange(key, [value, values[1]])}
              />
              <TextField
                path={`knobs.${key}.${second}`}
                label={OPS_PATTERN_KNOB_VALUE_FIELD_LABELS[second]}
                rows={3}
                value={values[1]}
                max={longTextMax}
                error={errors[`knobs.${key}.${second}`]}
                onChange={(value) => onChange(key, [values[0], value])}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── 샘플 ────────────────────────────────────────────────────────────────────────────────────────

/** 새 샘플 줄의 번호: 지금 있는 숫자 번호 중 가장 큰 값 + 1(없으면 1). */
export function nextSampleNo(rows: readonly PatternDraftSample[]): string {
  let max = 0
  for (const row of rows) {
    const no = Number(row.no.trim())
    if (Number.isInteger(no) && no > max) max = no
  }
  return String(max + 1)
}

interface SampleRowsProps {
  rows: PatternDraftSample[]
  errors: OpsPatternFieldErrors
  onChange: (rows: PatternDraftSample[]) => void
}

/** 샘플 줄: 번호·이름·역할·구현. 스무 개가 차면 더하기가 꺼진다. */
export function SampleRows({ rows, errors, onChange }: SampleRowsProps) {
  const full = rows.length >= samplesMaxCount
  const update = (index: number, patch: Partial<PatternDraftSample>) => onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  return (
    <div className="min-w-0 space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <RowFrame key={index} title={`샘플 ${index + 1}`} onRemove={() => onChange(rows.filter((_, at) => at !== index))}>
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-[6rem_minmax(0,1fr)_8rem]">
                <TextField
                  path={`samples.${index}.no`}
                  label="번호"
                  required
                  value={row.no}
                  error={errors[`samples.${index}.no`]}
                  onChange={(no) => update(index, { no })}
                />
                <TextField
                  path={`samples.${index}.name`}
                  label="이름"
                  required
                  value={row.name}
                  max={longTextMax}
                  error={errors[`samples.${index}.name`]}
                  onChange={(name) => update(index, { name })}
                />
                <PatternSelect<OpsPatternSampleRole>
                  path={`samples.${index}.role`}
                  label="역할"
                  required
                  value={row.role}
                  options={SAMPLE_ROLE_OPTIONS}
                  error={errors[`samples.${index}.role`]}
                  onChange={(role) => update(index, { role })}
                />
              </div>
              <TextField
                path={`samples.${index}.impl`}
                label="구현"
                rows={2}
                value={row.impl}
                max={longTextMax}
                error={errors[`samples.${index}.impl`]}
                onChange={(impl) => update(index, { impl })}
              />
              <FieldError path={`samples.${index}`} error={errors[`samples.${index}`]} />
            </RowFrame>
          ))}
        </ul>
      )}
      <FieldError path="samples" error={errors.samples} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => onChange([...rows, { no: nextSampleNo(rows), name: '', role: '', impl: '' }])}>
          {SAMPLE_ADD_LABEL}
        </Button>
        {full && <p className="text-xs text-muted-foreground">{SAMPLES_LIMIT_NOTE}</p>}
      </div>
    </div>
  )
}

// ── 이탈 경고 ───────────────────────────────────────────────────────────────────────────────────

/**
 * 고친 칸이 있는 동안 창 닫기·새로 고침에 브라우저 경고를 띄운다(티켓 20261008_1617 D7). 앱 안 링크 이동은 막지 않는다 — Next 라우터 이동을 가로채는 것은
 * 범위 밖이다. 저장에 성공하거나 취소를 확인한 뒤에는 `active`를 꺼서 경고를 풀어야 한다.
 */
export function usePatternLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}
