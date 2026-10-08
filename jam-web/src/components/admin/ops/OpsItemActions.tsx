'use client'

import { useState, type ReactNode } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Textarea } from '@/components/admin/ui/textarea'
import { MAX_DECISION_REASON_CHARS } from '@/lib/admin/opsInbox/constants'
import { readEditableValues } from '@/lib/admin/opsInbox/edit'
import { formatErrorPathLabel, formatKstDayTime, kindLabel, splitFormatError } from '@/lib/admin/opsInbox/labels'
import { truncateText, userExperienceOf } from '@/lib/admin/opsInbox/itemView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { postDecision, type DecisionRequest } from './decisionClient'
import { OpsConfirmDialog, OpsConfirmPanel, OpsDialogShell } from './OpsConfirmDialog'
import type { OpsWorkspaceContext } from './OpsBundleWorkspace'

/**
 * 항목 결정 줄 (티켓 20260930_1818, 채원 화면 설계 「행동 영역」). 상세 카드 아래 고정 줄 `detailFooter` 슬롯을 채운다.
 *
 * `[반려하기](테두리형·붉은 글) ··· [수정하기] [승인하기]`는 **검토중 항목에만** 보인다. 그 밖의 상태는 버튼 자리에 안내 글만 둔다.
 * 승인·반려는 확인창 뒤에만 실행된다. 실패는 창 안 인라인이고 창은 유지한다. 붉은 면은 반려 창의 확인 버튼 하나뿐이다.
 * 승인은 「승인됨」에서 멈춘다 — 예약은 승인한 뒤 단계 표시줄의 [예약 등록하기]에서 하므로 창에 그 사실을 알린다(상위 티켓 1455 가정 1, 20261002_1648).
 */

const ERROR_LIST_SHOWN = 5

/** 검토중이 아닌 항목의 버튼 자리 안내 글. */
export function decisionGuidance(status: string): string {
  if (status === 'approved') return '승인한 항목은 여기서 고칠 수 없어요'
  if (status === 'rejected') return '반려한 항목은 여기서 고칠 수 없어요'
  if (status === 'cancelled') return '취소한 항목은 여기서 고칠 수 없어요'
  if (status === 'failed') return '실패한 항목은 여기서 고칠 수 없어요'
  if (status === 'ended') return '종료한 항목은 여기서 고칠 수 없어요'
  if (status === 'arrived') return '새로 도착한 항목이에요. 화면을 새로 고치면 검토중으로 바뀌고, 그때부터 결정할 수 있어요'
  return '이 항목은 이미 다음 단계에 있어서 여기서 결정하거나 고칠 수 없어요'
}

/** 항목 한 줄 요약: 「홈피드 카드 · 10/5(월) 09:00 시작 · 비 오는 월요일 아침…」. */
export function itemSummaryLine(item: OpsItemRecord): string {
  const startsAt = formatKstDayTime(item.startsAt)
  return [kindLabel(item.kind), startsAt ? `${startsAt} 시작` : null, truncateText(userExperienceOf(item), 40) || null]
    .filter(Boolean)
    .join(' · ')
}

/** 형식 오류 경고 상자(승인 창). 형식 오류가 있어도 승인할 수 있다(상위 티켓 결정 Q3). */
export function FormatErrorWarning({ errors }: { errors: readonly string[] }) {
  const shown = errors.slice(0, ERROR_LIST_SHOWN)
  const hidden = errors.length - shown.length
  return (
    <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-1.5 font-medium">
        <IconAlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        형식 오류가 {errors.length}건 있어요
      </p>
      <ul className="space-y-0.5">
        {shown.map((message, index) => {
          const { path, reason } = splitFormatError(message)
          return (
            <li key={`${index}-${message}`} className="break-words">
              {path ? <span className="text-xs">{formatErrorPathLabel(path)}: </span> : null}
              {reason}
            </li>
          )
        })}
        {hidden > 0 && <li>외 {hidden}건</li>}
      </ul>
      <p className="font-medium">그래도 승인할 수 있어요</p>
    </div>
  )
}

interface OpsRejectPanelProps {
  summary: ReactNode
  pending?: boolean
  error?: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** 반려 이유를 보낼 수 있는지: 앞뒤 공백을 뗀 글이 남아야 한다(상위 티켓 결정 Q5). */
export function canSubmitRejectReason(reason: string): boolean {
  return reason.trim() !== ''
}

/** 반려 창의 알맹이(포털 밖). 「반려 이유」는 필수이고 공백만이면 확인 버튼이 비활성이다(상위 티켓 결정 Q5). */
export function OpsRejectPanel({ summary, pending, error, onConfirm, onCancel }: OpsRejectPanelProps) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  return (
    <OpsConfirmPanel
      title="이 항목을 반려할까요?"
      description={summary}
      tone="destructive"
      confirmLabel="반려하기"
      pendingLabel="반려하는 중"
      confirmDisabled={!canSubmitRejectReason(reason)}
      pending={pending}
      error={error}
      onConfirm={() => onConfirm(trimmed)}
      onCancel={onCancel}
    >
      <div className="space-y-1.5">
        <label htmlFor="ops-reject-reason" className="text-sm font-medium text-foreground">
          반려 이유
        </label>
        <Textarea
          id="ops-reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_DECISION_REASON_CHARS}
          rows={4}
          required
          aria-required="true"
          disabled={pending}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <span>에이전트가 다음 기획에 참고해요. 구체적으로 적어 주세요</span>
          <span className="shrink-0 tabular-nums">
            {reason.length}/{MAX_DECISION_REASON_CHARS}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">반려는 되돌릴 수 없어요</p>
    </OpsConfirmPanel>
  )
}

interface OpsItemActionsProps {
  bundleId: string
  item: OpsItemRecord
  ctx: OpsWorkspaceContext
  /** 승인·반려가 끝났다(창은 이미 닫혔다). 토스트·화면 새로 읽기·다음 항목 선택은 호출한 쪽이 한다. */
  onDecided: (kind: 'approve' | 'reject', itemId: string, data: Record<string, unknown>) => void
  /** 그 사이 다른 곳에서 처리된 항목이라 409를 받았다(화면을 새로 읽는다). */
  onConflict: () => void
}

export function OpsItemActions({ bundleId, item, ctx, onDecided, onConflict }: OpsItemActionsProps) {
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = ctx.draft?.itemId === item.id

  if (item.status !== 'reviewing') {
    return <p className="text-sm text-muted-foreground">{decisionGuidance(item.status)}</p>
  }

  const open = (next: 'approve' | 'reject') => {
    setError(null)
    setDialog(next)
  }

  const run = async (kind: 'approve' | 'reject', request: DecisionRequest) => {
    setPending(true)
    setError(null)
    const result = await postDecision(bundleId, request)
    setPending(false)
    if (result.ok) {
      setDialog(null)
      onDecided(kind, item.id, result.data)
      return
    }
    setError(result.error)
    if (result.status === 409) onConflict()
  }

  const summary = <p className="break-words font-medium text-foreground">{itemSummaryLine(item)}</p>

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-destructive text-destructive hover:text-destructive"
          disabled={editing}
          onClick={() => open('reject')}
        >
          반려하기
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={editing}
            onClick={() => ctx.setDraft({ itemId: item.id, values: readEditableValues(item), baseUpdatedAt: item.updatedAt })}
          >
            수정하기
          </Button>
          <Button type="button" disabled={editing} onClick={() => open('approve')}>
            승인하기
          </Button>
        </div>
      </div>
      {editing && <p className="mt-2 text-xs text-muted-foreground">수정 중이에요. 저장하거나 취소한 뒤 결정해 주세요</p>}

      {dialog === 'approve' && (
        <OpsConfirmDialog
          open
          onOpenChange={(next) => !next && setDialog(null)}
          title="이 항목을 승인할까요?"
          description={
            <div className="space-y-2">
              {summary}
              <p>승인하면 「승인됨」으로 바뀌고 기록이 남아요. 승인은 되돌릴 수 없어요.</p>
              <p>예약은 승인한 뒤 [예약 등록하기]에서 해요.</p>
            </div>
          }
          confirmLabel="승인하기"
          pendingLabel="승인하는 중"
          pending={pending}
          error={error}
          onConfirm={() => run('approve', { action: 'approve', itemId: item.id })}
        >
          {item.formatErrors.length > 0 && <FormatErrorWarning errors={item.formatErrors} />}
        </OpsConfirmDialog>
      )}

      {dialog === 'reject' && (
        <OpsDialogShell open onOpenChange={(next) => !next && setDialog(null)} pending={pending}>
          <OpsRejectPanel
            summary={summary}
            pending={pending}
            error={error}
            onConfirm={(reason) => run('reject', { action: 'reject', itemId: item.id, reason })}
            onCancel={() => setDialog(null)}
          />
        </OpsDialogShell>
      )}
    </>
  )
}
