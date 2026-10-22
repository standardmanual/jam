'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Alert } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { cn } from '@/lib/utils'
import {
  draftChangedValues,
  draftErrors,
  draftFromValues,
  formatBalanceNumber,
  parseDraftNumber,
} from '@/lib/admin/balance/fields'
import { NOTE_MAX_LENGTH } from '@/lib/admin/balance/history'
import type { BalanceFieldDef, BalanceSnapshot, BalanceValues } from '@/lib/admin/balance/types'
import { putBalanceSection } from './balanceClient'

/**
 * 밸런스 설정 구역 공용 폼 (티켓 20261022_1132 1회). 구역마다 이 폼 하나가 칸 목록·기본값·바뀐 표시·메모·저장을 맡는다.
 *
 * 구역은 «칸 정의»(값만 담긴 `BalanceFieldDef` 목록)를 서버 컴포넌트에서 받아 칸을 그린다. 흐름: 고치는 동안 바뀐 칸에 «바꾼 값» 줄이 나온다 → 칸을 떠나면 그 칸의 오류가 보이고
 * 저장이 막힌다 → [저장]은 바뀐 칸만 보낸다(메모는 선택, 비워도 저장된다) → 성공하면 알림과 토스트, 서버 컴포넌트(최근 변경)를 다시 읽는다. 400의 칸별 문장은 같은 칸 아래에,
 * 409(다른 사람이 먼저 바꿈)는 [새로 불러오기]로 서버 값을 다시 읽는다. 확률 안내에 반영되는 칸의 확인창은 2회에서 더한다.
 *
 * 화면(`BalanceSectionFormView`)과 컨테이너(`BalanceSectionForm`)를 나눴다: 화면은 값만 받아 그리는 순수 부분이라 서버 렌더로 시험하고,
 * 상태·요청은 컨테이너가 맡는다. 문장은 모두 React 텍스트 노드다.
 */

export const SAVE_LABEL = '저장'
export const SAVING_LABEL = '저장하는 중'
export const RELOAD_LABEL = '새로 불러오기'
export const SAVED_MESSAGE = '저장했어요. 바뀐 값은 staging과 프로덕션에 바로 반영돼요.'
export const NOTE_LABEL = '변경 메모 (선택)'
export const NOTE_PLACEHOLDER = '왜 바꾸는지 적어 두면 최근 변경에 함께 남아요'

const TEXT = 'break-keep wrap-break-word'

export interface BalanceNotice {
  kind: 'success' | 'error' | 'conflict'
  text: string
}

function withUnit(value: number, unit?: string): string {
  return `${formatBalanceNumber(value)}${unit ?? ''}`
}

/** 칸을 `group`이 이어지는 만큼 묶는다. `group`이 없는 칸은 제목 없는 한 묶음이다. */
export function groupFields(fields: readonly BalanceFieldDef[]): Array<{ title?: string; fields: BalanceFieldDef[] }> {
  const groups: Array<{ title?: string; fields: BalanceFieldDef[] }> = []
  for (const def of fields) {
    const last = groups[groups.length - 1]
    if (last && last.title === def.group) last.fields.push(def)
    else groups.push({ title: def.group, fields: [def] })
  }
  return groups
}

function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const list = ids.filter((id): id is string => typeof id === 'string' && id !== '')
  return list.length > 0 ? list.join(' ') : undefined
}

interface FieldProps {
  def: BalanceFieldDef
  idBase: string
  text: string
  saved: number | undefined
  error?: string
  disabled: boolean
  onChange: (key: string, text: string) => void
  onTouch: (key: string) => void
}

function BalanceField({ def, idBase, text, saved, error, disabled, onChange, onTouch }: FieldProps) {
  const id = `${idBase}-${def.key}`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const parsed = parseDraftNumber(text)
  const changedTo = parsed !== null && saved !== undefined && parsed !== saved ? parsed : null

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className={cn('text-sm font-medium', TEXT)}>
        {def.label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          inputMode={def.decimals > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(error && errorId, def.hint ? hintId : undefined)}
          className={cn('h-11 w-28 md:h-10', changedTo !== null && 'border-amber-400', error && 'border-destructive focus-visible:ring-destructive')}
          onChange={(event) => onChange(def.key, event.target.value)}
          onBlur={() => onTouch(def.key)}
        />
        {def.unit && <span className="text-sm text-muted-foreground whitespace-nowrap break-keep">{def.unit}</span>}
      </div>
      {def.hint && (
        <p id={hintId} className={cn('text-xs text-muted-foreground text-pretty', TEXT)}>
          {def.hint}
        </p>
      )}
      <p className={cn('text-xs text-muted-foreground', TEXT)}>기본값 {withUnit(def.defaultValue, def.unit)}</p>
      {changedTo !== null && saved !== undefined && (
        <p className={cn('text-xs font-medium text-amber-700', TEXT)}>
          바꾼 값 {withUnit(saved, def.unit)} → {withUnit(changedTo, def.unit)}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={cn('text-xs font-medium text-destructive text-pretty', TEXT)}>
          {error}
        </p>
      )}
    </div>
  )
}

export interface BalanceSectionFormViewProps {
  /** 요소 ID 접두사(`balance-<구역 키>`). */
  idBase: string
  fields: readonly BalanceFieldDef[]
  /** 저장된 값. 바뀐 칸을 가르는 기준이다. */
  savedValues: BalanceValues
  /** 칸 이름 → 입력 글자. */
  draft: Readonly<Record<string, string>>
  note: string
  /** 지금 보이는 칸 오류(만져 본 칸 + 서버 400). 칸 이름 → 문장. */
  errors: Readonly<Partial<Record<string, string>>>
  canSave: boolean
  saving: boolean
  notice: BalanceNotice | null
  onDraftChange: (key: string, text: string) => void
  onTouch: (key: string) => void
  onNoteChange: (text: string) => void
  onSubmit: () => void
  onReload: () => void
}

export function BalanceSectionFormView(props: BalanceSectionFormViewProps) {
  const { idBase, fields, savedValues, draft, note, errors, canSave, saving, notice, onDraftChange, onTouch, onNoteChange, onSubmit, onReload } = props
  const changedCount = Object.keys(draftChangedValues(fields, savedValues, draft)).length
  const noteId = `${idBase}-note`

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate aria-busy={saving} className="space-y-6 p-4 md:p-6">
        {groupFields(fields).map((group, index) => (
          <fieldset key={group.title ?? `group-${index}`} className="min-w-0 space-y-3">
            {group.title && <legend className={cn('mb-3 text-sm font-semibold text-balance', TEXT)}>{group.title}</legend>}
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((def) => (
                <BalanceField
                  key={def.key}
                  def={def}
                  idBase={idBase}
                  text={draft[def.key] ?? ''}
                  saved={savedValues[def.key]}
                  error={errors[def.key]}
                  disabled={saving}
                  onChange={onDraftChange}
                  onTouch={onTouch}
                />
              ))}
            </div>
          </fieldset>
        ))}

        <div className="space-y-1.5">
          <label htmlFor={noteId} className={cn('text-sm font-medium', TEXT)}>
            {NOTE_LABEL}
          </label>
          <Textarea
            id={noteId}
            rows={2}
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            disabled={saving}
            placeholder={NOTE_PLACEHOLDER}
            className="min-h-16"
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <p className={cn('text-xs text-muted-foreground', TEXT)}>
            최대 {NOTE_MAX_LENGTH}자 · {note.length}자
          </p>
        </div>

        {notice?.kind === 'success' && (
          <p role="status" className={cn('text-sm font-medium text-emerald-700 text-pretty', TEXT)}>
            {notice.text}
          </p>
        )}
        {notice && notice.kind !== 'success' && (
          <Alert variant={notice.kind === 'conflict' ? 'warning' : 'destructive'} className="space-y-2">
            <p className={cn('text-sm text-pretty', TEXT)}>{notice.text}</p>
            {notice.kind === 'conflict' && (
              <Button type="button" variant="outline" size="sm" onClick={onReload}>
                {RELOAD_LABEL}
              </Button>
            )}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSave}>
            {saving ? SAVING_LABEL : SAVE_LABEL}
          </Button>
          <span className={cn('text-sm text-muted-foreground', TEXT)}>{changedCount > 0 ? `바뀐 칸 ${changedCount}개` : '바뀐 칸이 없어요'}</span>
        </div>
      </form>
    </Card>
  )
}

export interface BalanceSectionFormProps {
  sectionId: string
  fields: readonly BalanceFieldDef[]
  /** 서버가 읽은 현재 값. */
  values: BalanceValues
  /** 서버가 읽은 때의 수정 시각. 저장 때 그대로 돌려보낸다. */
  updatedAt: string
}

export function BalanceSectionForm({ sectionId, fields, values, updatedAt }: BalanceSectionFormProps) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<BalanceSnapshot>({ values, updatedAt })
  const [propStamp, setPropStamp] = useState(updatedAt)
  const [draft, setDraft] = useState<Record<string, string>>(() => draftFromValues(fields, values))
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<BalanceNotice | null>(null)
  const [saving, setSaving] = useState(false)

  // 화면을 새로 읽어 서버 값이 달라졌으면(다른 곳의 저장·새로 불러오기) 초안을 그 값으로 다시 만든다. 내 저장 직후의 새로 읽기는 이미 반영돼 있어 건드리지 않는다.
  if (updatedAt !== propStamp) {
    setPropStamp(updatedAt)
    if (updatedAt !== snapshot.updatedAt) {
      setSnapshot({ values, updatedAt })
      setDraft(draftFromValues(fields, values))
      setNote('')
      setTouched(new Set())
      setServerErrors({})
      setNotice(null)
    }
  }

  const liveErrors = useMemo(() => draftErrors(fields, draft), [fields, draft])
  const changed = useMemo(() => draftChangedValues(fields, snapshot.values, draft), [fields, snapshot.values, draft])
  const visibleErrors = useMemo(() => {
    const shown: Record<string, string> = {}
    for (const [key, message] of Object.entries(liveErrors)) if (touched.has(key)) shown[key] = message
    return { ...shown, ...serverErrors }
  }, [liveErrors, touched, serverErrors])
  const canSave = !saving && Object.keys(changed).length > 0 && Object.keys(liveErrors).length === 0

  function changeDraft(key: string, text: string) {
    setDraft((current) => ({ ...current, [key]: text }))
    setServerErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
    setNotice(null)
  }

  function touch(key: string) {
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)))
  }

  async function submit() {
    if (!canSave) return
    setSaving(true)
    setNotice(null)
    setServerErrors({})
    const trimmed = note.trim()
    const res = await putBalanceSection(sectionId, {
      values: changed,
      expectedUpdatedAt: snapshot.updatedAt,
      ...(trimmed ? { note: trimmed } : {}),
    })
    setSaving(false)

    if (res.ok) {
      setSnapshot({ values: res.values, updatedAt: res.updatedAt })
      setDraft(draftFromValues(fields, res.values))
      setNote('')
      setTouched(new Set())
      setNotice({ kind: 'success', text: SAVED_MESSAGE })
      toast.success('저장했어요', { description: '바뀐 값은 staging과 프로덕션에 바로 반영돼요' })
      // 최근 변경(서버 컴포넌트)을 다시 읽는다
      router.refresh()
      return
    }
    setServerErrors(res.fieldErrors)
    setNotice({ kind: res.status === 409 ? 'conflict' : 'error', text: res.error })
  }

  return (
    <BalanceSectionFormView
      idBase={`balance-${sectionId}`}
      fields={fields}
      savedValues={snapshot.values}
      draft={draft}
      note={note}
      errors={visibleErrors}
      canSave={canSave}
      saving={saving}
      notice={notice}
      onDraftChange={changeDraft}
      onTouch={touch}
      onNoteChange={setNote}
      onSubmit={() => void submit()}
      onReload={() => router.refresh()}
    />
  )
}
