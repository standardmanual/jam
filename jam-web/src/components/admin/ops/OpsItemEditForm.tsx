'use client'

import { useState, type ReactNode } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/admin/ui/tooltip'
import BackgroundColorField from '@/components/admin/BackgroundColorField'
import { MAX_DECISION_REASON_CHARS } from '@/lib/admin/opsInbox/constants'
import { OPS_FIELD_UNKNOWN, readOpsPatternProposal } from '@/lib/admin/opsInbox/fields'
import { computeDraftDiff, kstLocalInputToIso, splitFieldErrors, valuesFromDiff } from '@/lib/admin/opsInbox/editDraft'
import { describeValue, entriesOf, itemField, linksOf, worldReviewOf } from '@/lib/admin/opsInbox/itemView'
import { editPathLabel, kindLabel } from '@/lib/admin/opsInbox/labels'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { toKstLocalInputValue } from '@/lib/admin/kst-format'
import { postDecision } from './decisionClient'
import { OpsDiffLines } from './OpsDiffLines'
import type { OpsWorkspaceContext } from './OpsBundleWorkspace'

/**
 * 직접 수정 양식 (티켓 20260930_1818, 채원 화면 설계 「행동 영역」의 수정 양식). 상세 카드 `detailEdit` 슬롯을 채운다.
 *
 * [수정하기]를 누르면 상세 카드가 그 자리에서 편집 모드가 된다(모달·서랍이 아니다). 칸은 다섯 갈래뿐이다: 문안(제출된 문안 항목마다 한 칸),
 * 색(`BackgroundColorField`), 공개·종료 시각(`datetime-local`, KST), 대상, 유저가 겪는 것. 종류·패턴·손잡이·연결·검수·판정은 읽기 전용이고
 * 「고칠 수 없어요」 툴팁을 단다(패턴 제안 항목은 제안 패턴 이름 줄이 더해진다, 티켓 20261007_1746). 고친 칸에는 「수정됨」 칩, 아래 「바뀌는 내용」에 바뀐 칸만 「문안 · body: 전 → 후」로 보인다.
 * 바뀐 게 없으면 [저장하기]가 비활성이다. 저장은 확인창 없이 바로이고, 400은 칸 아래 인라인이다.
 *
 * 편집 값은 셸의 `draft`에 둔다(티켓 20260930_1501이 미리보기에 물릴 수 있다). 이 양식은 초안이 이 항목의 것일 때만 그려진다.
 * 초안을 연 뒤 다른 곳에서 이 항목이 바뀌었으면(수정 시각이 달라졌으면) 저장을 막고 다시 열도록 안내한다.
 */

export const OPS_CANNOT_EDIT_HINT = '고칠 수 없어요'
export const OPS_EDIT_STALE_MESSAGE = '수정하는 사이 다른 곳에서 이 항목이 바뀌었어요. 취소하고 다시 수정해 주세요.'

function ChangedChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
      수정됨
    </span>
  )
}

interface FieldProps {
  label: string
  htmlFor?: string
  changed: boolean
  error?: string
  children: ReactNode
}

function Field({ label, htmlFor, changed, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
            {label}
          </label>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        )}
        {changed && <ChangedChip />}
      </div>
      {children}
      {error && (
        <p role="alert" className="break-words text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

interface ReadOnlyRow {
  label: string
  value: string
}

/** 고칠 수 없는 칸들(종류·패턴·손잡이·연결·검수·판정, 글이 아닌 대상). 값은 제출 문자열이라 텍스트 노드로만 그린다. */
function readOnlyRows(item: OpsItemRecord, segmentEditable: boolean): ReadOnlyRow[] {
  const rows: ReadOnlyRow[] = [{ label: '종류', value: kindLabel(item.kind) }]
  if (item.patternNo) rows.push({ label: '패턴 번호', value: item.patternNo })
  const proposal = readOpsPatternProposal(item)
  if (proposal !== null) rows.push({ label: '제안 패턴', value: proposal === OPS_FIELD_UNKNOWN ? '형식이 틀려 읽을 수 없어요' : proposal.name })
  const knobs = entriesOf(itemField(item, 'knobs'))
  if (knobs && knobs.length > 0) rows.push({ label: '손잡이', value: knobs.map(({ key, text }) => `${key}: ${text}`).join(' · ') })
  if (!segmentEditable) {
    const segment = describeValue(itemField(item, 'segment'))
    if (segment) rows.push({ label: '대상', value: segment })
  }
  const links = linksOf(item)
  rows.push({ label: '연결', value: links.length > 0 ? `${links.length}개` : '없어요' })
  const review = worldReviewOf(item)
  const balance = describeValue(itemField(item, 'balance_check'))
  const reviewParts: string[] = []
  if (review && review.worldRelated !== null) reviewParts.push(review.worldRelated ? '세계관과 닿아요' : '세계관과 닿지 않아요')
  if (review && review.winterReviewed !== null) reviewParts.push(review.winterReviewed ? '윈터 검수 끝' : '윈터 검수 아직')
  if (balance) reviewParts.push(`밸런스 ${balance}`)
  rows.push({ label: '검수·판정', value: reviewParts.length > 0 ? reviewParts.join(' · ') : '없어요' })
  return rows
}

function ReadOnlyList({ rows }: { rows: readonly ReadOnlyRow[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">고칠 수 없는 것</p>
      <dl className="space-y-1 text-sm">
        {rows.map((row) => (
          <Tooltip key={row.label}>
            <TooltipTrigger asChild>
              <div tabIndex={0} className="flex cursor-not-allowed gap-2 rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900">
                <dt className="shrink-0">{row.label}:</dt>
                <dd className="min-w-0 break-words">{row.value}</dd>
              </div>
            </TooltipTrigger>
            <TooltipContent>{OPS_CANNOT_EDIT_HINT}</TooltipContent>
          </Tooltip>
        ))}
      </dl>
    </div>
  )
}

interface OpsItemEditFormProps {
  bundleId: string
  item: OpsItemRecord
  ctx: OpsWorkspaceContext
  /** 저장이 끝났다(초안은 이미 비웠다). 토스트(되돌리기 버튼)와 화면 새로 읽기는 호출한 쪽이 한다. */
  onSaved: (itemId: string) => void
  /** 그 사이 다른 곳에서 바뀐 항목이라 409를 받았다(화면을 새로 읽는다). */
  onConflict: () => void
}

export function OpsItemEditForm({ bundleId, item, ctx, onSaved, onConflict }: OpsItemEditFormProps) {
  const draft = ctx.draft
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  if (!draft || draft.itemId !== item.id) return null

  const values = draft.values
  const paths = Object.keys(values)
  const copyPaths = paths.filter((path) => path.startsWith('copy.'))
  const colorPaths = paths.filter((path) => path.startsWith('colors.'))
  const valueOf = (path: string): string => (typeof values[path] === 'string' ? (values[path] as string) : '')
  const segmentEditable = paths.includes('segment')

  const { diff, errors: clientErrors } = computeDraftDiff(item, values)
  const changed = new Set(diff.map((entry) => entry.path))
  const server = splitFieldErrors(serverErrors, paths)
  const client = splitFieldErrors(clientErrors, paths)
  const errorOf = (path: string): string | undefined => client.byPath[path] ?? server.byPath[path]
  const otherErrors = [...client.other, ...server.other]

  const stale = draft.baseUpdatedAt !== undefined && draft.baseUpdatedAt !== item.updatedAt
  const hasErrors = Object.keys(clientErrors).length > 0
  const canSave = diff.length > 0 && !hasErrors && !stale && !pending

  const setValue = (path: string, next: string) => {
    setServerErrors({})
    setFormError(null)
    ctx.setDraft({ ...draft, values: { ...values, [path]: next } })
  }

  const save = async () => {
    setPending(true)
    setServerErrors({})
    setFormError(null)
    const trimmed = reason.trim()
    const result = await postDecision(bundleId, {
      action: 'edit',
      itemId: item.id,
      values: valuesFromDiff(diff),
      ...(trimmed ? { reason: trimmed } : {}),
      expectedUpdatedAt: draft.baseUpdatedAt ?? item.updatedAt,
    })
    setPending(false)
    if (result.ok) {
      ctx.setDraft(null)
      onSaved(item.id)
      return
    }
    setServerErrors(result.fieldErrors)
    setFormError(result.error)
    if (result.status === 409) onConflict()
  }

  const idOf = (path: string) => `ops-edit-${item.id}-${path}`

  return (
    <section aria-label="직접 수정" className="space-y-4">
      <h4 className="text-xs font-semibold text-muted-foreground">직접 수정</h4>

      {stale && (
        <Alert variant="warning">
          <IconAlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{OPS_EDIT_STALE_MESSAGE}</AlertDescription>
        </Alert>
      )}

      {/* ⑤ 유저가 겪는 것 */}
      <Field label={editPathLabel('user_experience')} htmlFor={idOf('user_experience')} changed={changed.has('user_experience')} error={errorOf('user_experience')}>
        <Textarea
          id={idOf('user_experience')}
          value={valueOf('user_experience')}
          onChange={(e) => setValue('user_experience', e.target.value)}
          rows={3}
          disabled={pending}
        />
      </Field>

      {/* ① 문안 */}
      {copyPaths.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">문안</legend>
          {(client.groups.copy ?? server.groups.copy) && (
            <p role="alert" className="break-words text-xs font-medium text-destructive">
              {client.groups.copy ?? server.groups.copy}
            </p>
          )}
          {copyPaths.map((path) => (
            <Field key={path} label={editPathLabel(path)} htmlFor={idOf(path)} changed={changed.has(path)} error={errorOf(path)}>
              <Input id={idOf(path)} value={valueOf(path)} onChange={(e) => setValue(path, e.target.value)} disabled={pending} />
            </Field>
          ))}
        </fieldset>
      )}

      {/* ② 색 */}
      {colorPaths.length > 0 && (
        <fieldset className="space-y-3" disabled={pending}>
          <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">색</legend>
          {(client.groups.colors ?? server.groups.colors) && (
            <p role="alert" className="break-words text-xs font-medium text-destructive">
              {client.groups.colors ?? server.groups.colors}
            </p>
          )}
          {colorPaths.map((path) => (
            <div key={path} className="space-y-1.5">
              <BackgroundColorField
                label={editPathLabel(path)}
                value={valueOf(path)}
                onChange={(next) => setValue(path, next)}
                helperText="#rrggbb 형식으로 적어 주세요. 예: #1a2b3c"
              />
              {changed.has(path) && <ChangedChip />}
              {errorOf(path) && (
                <p role="alert" className="break-words text-xs font-medium text-destructive">
                  {errorOf(path)}
                </p>
              )}
            </div>
          ))}
        </fieldset>
      )}

      {/* ③ 시각 */}
      <div className="grid grid-cols-1 gap-3 @[60rem]/center:grid-cols-2">
        {(['starts_at', 'ends_at'] as const).map((path) => (
          <Field key={path} label={editPathLabel(path)} htmlFor={idOf(path)} changed={changed.has(path)} error={errorOf(path)}>
            <Input
              id={idOf(path)}
              type="datetime-local"
              value={valueOf(path) ? toKstLocalInputValue(valueOf(path)) : ''}
              onChange={(e) => setValue(path, kstLocalInputToIso(e.target.value))}
              disabled={pending}
              className="tabular-nums"
            />
          </Field>
        ))}
      </div>

      {/* ④ 대상 */}
      {segmentEditable && (
        <Field label={editPathLabel('segment')} htmlFor={idOf('segment')} changed={changed.has('segment')} error={errorOf('segment')}>
          <Input id={idOf('segment')} value={valueOf('segment')} onChange={(e) => setValue('segment', e.target.value)} disabled={pending} />
        </Field>
      )}

      <ReadOnlyList rows={readOnlyRows(item, segmentEditable)} />

      {/* 바뀌는 내용 */}
      <div className="space-y-1.5" aria-live="polite">
        <p className="text-xs font-medium text-muted-foreground">바뀌는 내용</p>
        {diff.length > 0 ? (
          <OpsDiffLines diff={diff} />
        ) : (
          <p className="text-sm text-muted-foreground">아직 바뀐 내용이 없어요</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idOf('reason')} className="text-xs font-medium text-muted-foreground">
          수정한 이유(선택)
        </label>
        <Input
          id={idOf('reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_DECISION_REASON_CHARS}
          disabled={pending}
        />
      </div>

      {(otherErrors.length > 0 || formError) && (
        <div role="alert" className="space-y-0.5 text-sm font-medium text-destructive">
          {formError && <p className="break-words">{formError}</p>}
          {otherErrors.map((message) => (
            <p key={message} className="break-words">
              {message}
            </p>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => ctx.setDraft(null)}>
          취소
        </Button>
        <Button type="button" disabled={!canSave} onClick={save}>
          {pending ? '저장하는 중' : '저장하기'}
        </Button>
      </div>
    </section>
  )
}
