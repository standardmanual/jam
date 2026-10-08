'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import { Textarea } from '@/components/admin/ui/textarea'
import { OPS_TASTE_LIMITS } from '@/lib/admin/opsPatterns/constants'
import { TASTE_EVIDENCE_TEXT, type TasteSignalLine } from '@/lib/admin/opsPatterns/detailView'
import {
  TASTE_CANCEL_LABEL,
  commonTasteEditLabel,
  evidenceChoiceToId,
  initialEvidenceChoice,
  mergeRejectionPages,
  tasteEditLabel,
  tasteSaveBody,
  tasteSubmitLabel,
  tasteSubmitPendingLabel,
  tasteToastText,
} from '@/lib/admin/opsPatterns/tasteDraft'
import type { OpsPatternRejectionsResult } from '@/lib/admin/opsPatterns/tasteWrite'
import { OpsEvidencePicker, type EvidencePickerState } from './OpsEvidencePicker'
import { OpsStatusBadge } from './OpsStatusBadge'
import { SaveFailureAlerts, judgeFailedResponse, useFlash, type CardFailure } from './OpsRuleCardParts'
import { fetchPatternRejectionsRequest, saveTasteSignalRequest } from './tasteClient'

/**
 * 취향 신호 줄 안 편집 (티켓 20261008_1754, 상위 20260930_1503 ⑩b-2, 채원 판정 승인 16~18). 패턴 상세의 「취향 신호」 구역과 목록의 「공통 규칙·취향 신호」 탭이 함께 쓴다.
 *
 * - 줄마다 [이유 고치고 확정하기](추정) / [이유·근거 고치기](확정) → 줄 안에 펼친다(모달 아님). 한 번에 한 줄만 펼치고, 다른 줄을 열면 앞 줄은 고친 내용을 버리고 닫힌다.
 * - 펼치면 이유 칸으로 포커스가 가고, 닫으면 누른 버튼으로 돌아온다. 펼침은 `motion-safe`에서만 200ms 페이드다.
 * - `patternNo`가 있으면 근거 묶음(`OpsEvidencePicker`)이 나오고 펼칠 때 그 패턴의 반려 기록을 읽는다. 공통 신호(`patternNo: null`)는 근거 없이만 확정한다.
 * - 저장은 `PATCH`(`expectedUpdatedAt`은 받은 문자열 그대로). 성공하면 토스트 + 펼침 닫기 + `router.refresh()` + 1.2초 잔상. 400은 칸 아래, 409는 줄 안 경고 + [최신 값 불러오기].
 *   추정으로 되돌리는 버튼과 신호 추가·삭제는 없다.
 */

const { reasonMax } = OPS_TASTE_LIMITS
const TEXT_CLASS = 'break-keep wrap-break-word'
const FADE_CLASS = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'

/** 근거 후보를 읽는 상태. 첫 쪽 읽기·다시 시도·더 보기를 맡는다. `patternNo`가 `null`이면 아무것도 읽지 않는다. */
function useRejectionPages(patternNo: string | null) {
  const [state, setState] = useState<EvidencePickerState>({ status: 'loading' })
  const [moreLoading, setMoreLoading] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const alive = useRef(true)
  const data = useRef<OpsPatternRejectionsResult | null>(null)

  useEffect(() => {
    alive.current = true
    if (patternNo !== null) {
      void fetchPatternRejectionsRequest(patternNo, 0).then((res) => {
        if (!alive.current) return
        if (res.ok) {
          data.current = res
          setState({ status: 'ready', data: res })
        } else {
          setState({ status: 'failed' })
        }
      })
    }
    return () => {
      alive.current = false
    }
  }, [patternNo, attempt])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  const more = async () => {
    const current = data.current
    if (patternNo === null || current === null) return
    setMoreLoading(true)
    setMoreFailed(false)
    const res = await fetchPatternRejectionsRequest(patternNo, current.rejections.length)
    if (!alive.current) return
    setMoreLoading(false)
    if (res.ok) {
      const merged = mergeRejectionPages(current, res)
      data.current = merged
      setState({ status: 'ready', data: merged })
    } else {
      setMoreFailed(true)
    }
  }

  return { state, moreLoading, moreFailed, retry, more }
}

interface EditPanelProps {
  signal: TasteSignalLine
  patternNo: string | null
  panelId: string
  onClosed: () => void
  onSaved: () => void
}

/** 펼친 편집 영역. 열릴 때마다 새로 그려져 입력은 현재 값에서 시작한다. */
function TasteEditPanel({ signal, patternNo, panelId, onClosed, onSaved }: EditPanelProps) {
  const router = useRouter()
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState(signal.reasonRaw)
  const [choice, setChoice] = useState(initialEvidenceChoice(signal.evidenceDecisionId))
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<CardFailure | null>(null)
  const [conflictMessage, setConflictMessage] = useState('')
  const pages = useRejectionPages(patternNo)

  useEffect(() => {
    reasonRef.current?.focus()
  }, [])

  const trimmed = reason.trim()
  const over = trimmed.length > reasonMax
  const reasonError = over ? `이유는 ${reasonMax}자까지 적을 수 있어요. 줄여서 다시 적어 주세요.` : (fieldErrors.reason ?? null)
  const reasonId = `${panelId}-reason`
  const reasonErrorId = `${reasonId}-error`

  const submit = async () => {
    if (pending) return
    setFailure(null)
    setFieldErrors({})
    const prepared = tasteSaveBody({ reason, evidenceDecisionId: patternNo === null ? null : evidenceChoiceToId(choice) }, signal.updatedAt)
    if (!prepared.ok) {
      setFieldErrors(prepared.fieldErrors)
      return
    }
    setPending(true)
    const res = await saveTasteSignalRequest(signal.id, prepared.body)
    setPending(false)
    if (res.ok) {
      const text = tasteToastText(signal.basis, res.changed)
      if (res.changed) toast.success(text)
      else toast.message(text)
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
      <div className="space-y-1.5">
        <label htmlFor={reasonId} className={cn('text-sm font-medium', TEXT_CLASS)}>
          이유
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
          <span className="sr-only"> (필수)</span>
        </label>
        <Textarea
          ref={reasonRef}
          id={reasonId}
          rows={3}
          value={reason}
          disabled={pending}
          aria-required="true"
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? reasonErrorId : undefined}
          className={cn(reasonError && 'border-destructive focus-visible:ring-destructive')}
          onChange={(event) => setReason(event.target.value)}
        />
        {reasonError && (
          <p id={reasonErrorId} className={cn('text-sm font-medium text-destructive', TEXT_CLASS)}>
            {reasonError}
          </p>
        )}
        {trimmed.length >= reasonMax * 0.8 && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {trimmed.length} / {reasonMax}
          </p>
        )}
      </div>

      {patternNo !== null && (
        <OpsEvidencePicker
          state={pages.state}
          attachedId={signal.evidenceDecisionId}
          choice={choice}
          onChoice={setChoice}
          error={fieldErrors.evidenceDecisionId ?? null}
          disabled={pending}
          moreLoading={pages.moreLoading}
          moreFailed={pages.moreFailed}
          onRetry={pages.retry}
          onMore={() => void pages.more()}
          idPrefix={panelId}
        />
      )}

      <SaveFailureAlerts failure={failure} conflictMessage={conflictMessage} reloading={false} onReload={reload} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="whitespace-nowrap" disabled={pending || trimmed === '' || over} onClick={() => void submit()}>
          {pending ? tasteSubmitPendingLabel(signal.basis) : tasteSubmitLabel(signal.basis)}
        </Button>
        <Button type="button" variant="outline" className="whitespace-nowrap" disabled={pending} onClick={onClosed}>
          {TASTE_CANCEL_LABEL}
        </Button>
      </div>
    </div>
  )
}

export interface OpsTasteSignalRowProps {
  signal: TasteSignalLine
  /** 패턴 상세에서는 그 패턴 번호, 공통 탭에서는 `null`(근거 묶음 없음). */
  patternNo: string | null
  open: boolean
  onOpen: () => void
  onClose: () => void
}

/** 취향 신호 한 줄: 읽기 모양(칩·확정일·이름·이유·근거 표시) + 편집 버튼 + (펼쳤을 때) 편집 영역. */
export function OpsTasteSignalRow({ signal, patternNo, open, onOpen, onClose }: OpsTasteSignalRowProps) {
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { flash, start } = useFlash()
  const label = patternNo === null ? commonTasteEditLabel(signal.basis) : tasteEditLabel(signal.basis)

  const close = () => {
    onClose()
    buttonRef.current?.focus()
  }

  return (
    <li className={cn('space-y-1 px-4 py-3 transition-colors', flash && 'bg-muted')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OpsStatusBadge type="taste-basis" basis={signal.basis} />
        {signal.confirmedDay && <span className="text-xs tabular-nums text-muted-foreground">{signal.confirmedDay}(KST)</span>}
        <span className={cn('font-medium', TEXT_CLASS)}>{signal.name}</span>
      </div>
      <p className={cn('whitespace-pre-wrap text-sm text-muted-foreground text-pretty', TEXT_CLASS)}>{signal.reason}</p>
      {signal.hasEvidence && <p className={cn('text-xs text-muted-foreground', TEXT_CLASS)}>{TASTE_EVIDENCE_TEXT}</p>}
      <div>
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={open ? close : onOpen}
        >
          {label}
        </Button>
      </div>
      {open && (
        <TasteEditPanel
          signal={signal}
          patternNo={patternNo}
          panelId={panelId}
          onClosed={close}
          onSaved={() => {
            onClose()
            buttonRef.current?.focus()
            start()
          }}
        />
      )}
    </li>
  )
}

export interface OpsTasteSignalListProps {
  signals: readonly TasteSignalLine[]
  patternNo: string | null
  className?: string
}

/** 취향 신호 줄 목록. 한 번에 한 줄만 펼친다. */
export function OpsTasteSignalList({ signals, patternNo, className }: OpsTasteSignalListProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <ul className={className}>
      {signals.map((signal) => (
        <OpsTasteSignalRow
          key={signal.id}
          signal={signal}
          patternNo={patternNo}
          open={openId === signal.id}
          onOpen={() => setOpenId(signal.id)}
          onClose={() => setOpenId((current) => (current === signal.id ? null : current))}
        />
      ))}
    </ul>
  )
}
