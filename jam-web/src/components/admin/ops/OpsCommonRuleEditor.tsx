'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { OPS_TASTE_LIMITS } from '@/lib/admin/opsPatterns/constants'
import type { OpsCommonRuleRecord } from '@/lib/admin/opsPatterns/read'
import {
  COMMON_RULE_CONFIRM_TEXT,
  COMMON_RULE_CONFIRM_TITLE,
  COMMON_RULE_EDIT_LABEL,
  COMMON_RULE_SAVE_LABEL,
  COMMON_RULE_SAVING_LABEL,
  RULE_SAVED_TEXT,
  TASTE_CANCEL_LABEL,
  TASTE_NOT_CHANGED_TEXT,
  commonRuleSaveBody,
  isCommonRuleDirty,
} from '@/lib/admin/opsPatterns/tasteDraft'
import { OpsConfirmPanel, OpsDialogShell } from './OpsConfirmDialog'
import { SaveFailureAlerts, UnsavedChip, judgeFailedResponse, useFlash, type CardFailure } from './OpsRuleCardParts'
import { saveCommonRuleRequest } from './tasteClient'

/**
 * 공통 규칙 줄 안 편집 (티켓 20261008_1754, 상위 20260930_1503 ⑩b-2, 채원 판정 승인 19). 「공통 규칙·취향 신호」 탭의 규칙 한 건이다.
 *
 * [고치기] → 줄 안에 펼침(제목 60자 + 본문 2,000자, 현재 값으로 시작) + [저장하기]·[취소]. 고친 칸이 있을 때만 「저장 전」 칩과 [저장하기]가 켜진다.
 * [저장하기]는 확인창(「모든 패턴에 적용되는 규칙이에요…」)을 거쳐 `PATCH`로 간다(`expectedUpdatedAt`은 받은 문자열 그대로). 성공하면 토스트 + 펼침 닫기 + `router.refresh()` + 잔상.
 * 400은 칸 아래, 409는 줄 안 경고 + [최신 값 불러오기]다. 규칙 추가·삭제 버튼은 없다. 읽기 모양(본문과 [전체 보기])은 호출부가 `children`으로 넘긴다.
 */

const { ruleTitleMax, ruleBodyMax } = OPS_TASTE_LIMITS
const TEXT_CLASS = 'break-keep wrap-break-word'
const FADE_CLASS = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'

/** 저장 확인창 알맹이(`AlertDialog` 문맥 안에서 그린다). */
export function OpsCommonRuleConfirm({ pending, onConfirm, onCancel }: { pending: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <OpsConfirmPanel
      title={COMMON_RULE_CONFIRM_TITLE}
      description={<p className={cn(TEXT_CLASS, 'text-pretty')}>{COMMON_RULE_CONFIRM_TEXT}</p>}
      confirmLabel={COMMON_RULE_SAVE_LABEL}
      pendingLabel={COMMON_RULE_SAVING_LABEL}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

function overText(label: string, max: number): string {
  return `${label}은 ${max.toLocaleString('ko-KR')}자까지 적을 수 있어요. 줄여서 다시 적어 주세요.`
}

interface FieldProps {
  id: string
  label: string
  error: string | null
  count: { length: number; max: number }
  children: (props: { id: string; invalid: boolean; describedBy: string | undefined }) => ReactNode
}

function Field({ id, label, error, count, children }: FieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={cn('text-sm font-medium', TEXT_CLASS)}>
        {label}
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
        <span className="sr-only"> (필수)</span>
      </label>
      {children({ id, invalid: error !== null, describedBy: error ? errorId : undefined })}
      {error && (
        <p id={errorId} className={cn('text-sm font-medium text-destructive', TEXT_CLASS)}>
          {error}
        </p>
      )}
      {count.length >= count.max * 0.8 && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {count.length.toLocaleString('ko-KR')} / {count.max.toLocaleString('ko-KR')}
        </p>
      )}
    </div>
  )
}

interface EditPanelProps {
  rule: OpsCommonRuleRecord
  panelId: string
  onClosed: () => void
  onSaved: () => void
}

/** 펼친 편집 영역. 열릴 때마다 새로 그려져 입력은 현재 값에서 시작한다. */
export function OpsCommonRuleEditPanel({ rule, panelId, onClosed, onSaved }: EditPanelProps) {
  const router = useRouter()
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(rule.title)
  const [body, setBody] = useState(rule.body)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<CardFailure | null>(null)
  const [conflictMessage, setConflictMessage] = useState('')

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const dirty = isCommonRuleDirty(rule, { title, body })
  const titleLength = title.trim().length
  const bodyLength = body.trim().length
  const titleOver = titleLength > ruleTitleMax
  const bodyOver = bodyLength > ruleBodyMax
  const canSave = dirty && titleLength > 0 && bodyLength > 0 && !titleOver && !bodyOver
  const titleError = titleOver ? overText('제목', ruleTitleMax) : (fieldErrors.title ?? null)
  const bodyError = bodyOver ? overText('본문', ruleBodyMax) : (fieldErrors.body ?? null)

  const save = async () => {
    if (pending) return
    setFailure(null)
    setFieldErrors({})
    const prepared = commonRuleSaveBody({ title, body }, rule.updatedAt)
    if (!prepared.ok) {
      setConfirming(false)
      setFieldErrors(prepared.fieldErrors)
      return
    }
    setPending(true)
    const res = await saveCommonRuleRequest(rule.ruleNo, prepared.body)
    setPending(false)
    setConfirming(false)
    if (res.ok) {
      if (res.changed) toast.success(RULE_SAVED_TEXT)
      else toast.message(TASTE_NOT_CHANGED_TEXT)
      onSaved()
      router.refresh()
      return
    }
    const judged = judgeFailedResponse(res)
    setFieldErrors(judged.fieldErrors)
    setFailure(judged.failure)
    if (judged.failure?.kind === 'conflict') setConflictMessage(res.error)
  }

  const reload = () => {
    router.refresh()
    onClosed()
  }

  return (
    <div id={panelId} className={cn('space-y-3 pt-2', FADE_CLASS)}>
      <Field id={`${panelId}-title`} label="제목" error={titleError} count={{ length: titleLength, max: ruleTitleMax }}>
        {({ id, invalid, describedBy }) => (
          <Input
            ref={titleRef}
            id={id}
            value={title}
            disabled={pending}
            aria-required="true"
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className={cn(invalid && 'border-destructive focus-visible:ring-destructive')}
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
      </Field>
      <Field id={`${panelId}-body`} label="본문" error={bodyError} count={{ length: bodyLength, max: ruleBodyMax }}>
        {({ id, invalid, describedBy }) => (
          <Textarea
            id={id}
            rows={8}
            value={body}
            disabled={pending}
            aria-required="true"
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className={cn(invalid && 'border-destructive focus-visible:ring-destructive')}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </Field>

      <SaveFailureAlerts failure={failure} conflictMessage={conflictMessage} reloading={false} onReload={reload} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="whitespace-nowrap" disabled={!canSave || pending} onClick={() => setConfirming(true)}>
          {COMMON_RULE_SAVE_LABEL}
        </Button>
        <Button type="button" variant="outline" className="whitespace-nowrap" disabled={pending} onClick={onClosed}>
          {TASTE_CANCEL_LABEL}
        </Button>
        {dirty && <UnsavedChip />}
      </div>

      {confirming && (
        <OpsDialogShell open onOpenChange={(next) => !next && setConfirming(false)} pending={pending}>
          <OpsCommonRuleConfirm pending={pending} onConfirm={() => void save()} onCancel={() => setConfirming(false)} />
        </OpsDialogShell>
      )}
    </div>
  )
}

/** 공통 규칙 한 건: 번호·제목 + [고치기], 읽기 본문(`children`) 또는 편집 영역. */
export function OpsCommonRuleItem({ rule, children }: { rule: OpsCommonRuleRecord; children: ReactNode }) {
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { flash, start } = useFlash()

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <li className={cn('space-y-1 px-4 py-3 transition-colors', flash && 'bg-muted')}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn('min-w-0 font-medium', TEXT_CLASS)}>
          <span className="tabular-nums">{rule.ruleNo}</span>. {rule.title}
        </p>
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 whitespace-nowrap"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={open ? close : () => setOpen(true)}
        >
          {COMMON_RULE_EDIT_LABEL}
        </Button>
      </div>
      {open ? (
        <OpsCommonRuleEditPanel
          rule={rule}
          panelId={panelId}
          onClosed={close}
          onSaved={() => {
            close()
            start()
          }}
        />
      ) : (
        children
      )}
    </li>
  )
}
