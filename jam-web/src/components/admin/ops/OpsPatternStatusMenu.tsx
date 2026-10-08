'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconChevronDown } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu'
import { Textarea } from '@/components/admin/ui/textarea'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { OPS_PATTERN_LIMITS, type OpsPatternStatus } from '@/lib/admin/opsPatterns/constants'
import { OpsConfirmPanel, OpsDialogShell } from './OpsConfirmDialog'
import { submitPatternStatus } from './patternSubmit'

/**
 * 패턴 상태 바꾸기 메뉴 (티켓 20261008_1617, 상위 20260930_1503 ⑩a-2, 채원 판정 승인 12). 패턴 상세 머리에 놓는 `[상태 바꾸기 ▾]`다.
 *
 * 지금 상태에 따라 항목이 다르다 — 사용 중: 쉬게 하기·보관하기 / 쉬는 중: 다시 사용하기·쉬는 이유 고치기·보관하기 / 보관: 다시 사용하기.
 * 항목마다 `OpsConfirmDialog`와 같은 확인창(`OpsConfirmPanel`)을 거친다. 쉬게 하기·쉬는 이유 고치기는 이유(필수, 200자)를 적는다.
 * 성공하면 토스트 + `router.refresh()`다. 409는 창 안 문장 + [새로 읽기](다시 읽고 창을 닫는다). 「쉬는 이유 고치기」는 같은 상태(`paused`)로 보내는 요청이다.
 * `updatedAt`은 화면이 읽은 문자열을 가공하지 않고 그대로 보낸다.
 */

export type PatternStatusActionKey = 'pause' | 'resume' | 'edit-reason' | 'archive'

export interface PatternStatusAction {
  key: PatternStatusActionKey
  /** 메뉴 항목 글자. */
  label: string
  /** 보낼 상태. */
  target: OpsPatternStatus
  title: string
  description: string
  confirmLabel: string
  pendingLabel: string
  /** 성공 토스트. */
  toast: string
  /** 쉬는 이유를 적어야 하는지. */
  needsReason: boolean
}

const PAUSE_DESCRIPTION = '조합 뽑기에서만 빠져요. 이미 예약된 항목에는 영향이 없어요'

export const PATTERN_STATUS_ACTIONS: Record<PatternStatusActionKey, PatternStatusAction> = {
  pause: {
    key: 'pause',
    label: '쉬게 하기',
    target: 'paused',
    title: '이 패턴을 쉬게 할까요?',
    description: PAUSE_DESCRIPTION,
    confirmLabel: '쉬게 하기',
    pendingLabel: '쉬게 하는 중',
    toast: '쉬게 했어요',
    needsReason: true,
  },
  resume: {
    key: 'resume',
    label: '다시 사용하기',
    target: 'active',
    title: '이 패턴을 다시 사용할까요?',
    description: '조합 뽑기에 다시 나와요',
    confirmLabel: '다시 사용하기',
    pendingLabel: '다시 사용하는 중',
    toast: '다시 사용해요',
    needsReason: false,
  },
  'edit-reason': {
    key: 'edit-reason',
    label: '쉬는 이유 고치기',
    target: 'paused',
    title: '쉬는 이유를 고칠까요?',
    description: PAUSE_DESCRIPTION,
    confirmLabel: '고치기',
    pendingLabel: '고치는 중',
    toast: '쉬는 이유를 고쳤어요',
    needsReason: true,
  },
  archive: {
    key: 'archive',
    label: '보관하기',
    target: 'archived',
    title: '이 패턴을 보관할까요?',
    description: '목록에서 숨고 조합 뽑기에서 빠져요. 번호와 취향 신호는 남아요',
    confirmLabel: '보관하기',
    pendingLabel: '보관하는 중',
    toast: '보관했어요',
    needsReason: false,
  },
}

const ACTIONS_BY_STATUS: Record<OpsPatternStatus, readonly PatternStatusActionKey[]> = {
  active: ['pause', 'archive'],
  paused: ['resume', 'edit-reason', 'archive'],
  archived: ['resume'],
}

/** 지금 상태에서 고를 수 있는 항목(메뉴에 나오는 순서). */
export function statusActionsFor(status: OpsPatternStatus): PatternStatusAction[] {
  return ACTIONS_BY_STATUS[status].map((key) => PATTERN_STATUS_ACTIONS[key])
}

export const STATUS_MENU_LABEL = '상태 바꾸기'
export const STATUS_CONFLICT_TEXT = '그사이 상태가 바뀌었어요'
export const STATUS_RELOAD_LABEL = '새로 읽기'
export const PAUSE_REASON_LABEL = '쉬는 이유'
export const PAUSE_REASON_REQUIRED_TEXT = '쉬는 이유를 적어 주세요.'

const { pauseReasonMax } = OPS_PATTERN_LIMITS

export function pauseReasonOverText(): string {
  return `쉬는 이유는 ${pauseReasonMax}자까지 적을 수 있어요. 줄여서 다시 적어 주세요.`
}

interface StatusPanelProps {
  action: PatternStatusAction
  reason: string
  onReason: (reason: string) => void
  pending: boolean
  /** 창 안 실패 문장(409 포함). */
  error: string | null
  /** 409로 막혔다. [새로 읽기]를 보인다. */
  conflict: boolean
  /** 서버가 이유 칸을 거절했을 때의 문장. */
  reasonError?: string | null
  onConfirm: () => void
  onCancel: () => void
  onReload: () => void
}

/** 확인창 안쪽: 제목·설명, (이유가 필요하면) 쉬는 이유 칸, 실패 문장, 보조 「취소」와 주 버튼. 이유가 비었거나 200자를 넘으면 주 버튼이 꺼진다. */
export function OpsPatternStatusPanel({ action, reason, onReason, pending, error, conflict, reasonError, onConfirm, onCancel, onReload }: StatusPanelProps) {
  const trimmed = reason.trim()
  const over = trimmed.length > pauseReasonMax
  const reasonMessage = over ? pauseReasonOverText() : (reasonError ?? null)
  const reasonId = 'pattern-status-reason'
  const errorId = `${reasonId}-error`
  return (
    <OpsConfirmPanel
      title={action.title}
      description={<p>{action.description}</p>}
      confirmLabel={action.confirmLabel}
      pendingLabel={action.pendingLabel}
      pending={pending}
      confirmDisabled={action.needsReason && (trimmed === '' || over)}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {action.needsReason && (
        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {PAUSE_REASON_LABEL}
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
            <span className="sr-only"> (필수)</span>
          </label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            disabled={pending}
            aria-required="true"
            aria-invalid={reasonMessage ? true : undefined}
            aria-describedby={reasonMessage ? errorId : undefined}
            className={reasonMessage ? 'border-destructive focus-visible:ring-destructive' : undefined}
            onChange={(event) => onReason(event.target.value)}
          />
          {reasonMessage && (
            <p id={errorId} className="text-sm font-medium text-destructive">
              {reasonMessage}
            </p>
          )}
          {trimmed.length >= pauseReasonMax * 0.8 && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {trimmed.length} / {pauseReasonMax}
            </p>
          )}
        </div>
      )}
      {conflict && (
        <div>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onReload}>
            {STATUS_RELOAD_LABEL}
          </Button>
        </div>
      )}
    </OpsConfirmPanel>
  )
}

export interface OpsPatternStatusMenuProps {
  patternNo: string
  status: OpsPatternStatus
  pauseReason: string | null
  /** 화면이 읽은 수정 시각 문자열. 가공하지 않고 그대로 보낸다. */
  updatedAt: string
}

export function OpsPatternStatusMenu({ patternNo, status, pauseReason, updatedAt }: OpsPatternStatusMenuProps) {
  const router = useRouter()
  const container = useAdminPortalContainer()
  const [action, setAction] = useState<PatternStatusAction | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [reasonError, setReasonError] = useState<string | null>(null)

  const open = (next: PatternStatusAction) => {
    setAction(next)
    // 쉬는 이유 고치기는 지금 이유에서 시작하고, 쉬게 하기는 빈 칸에서 시작한다.
    setReason(next.key === 'edit-reason' ? (pauseReason ?? '') : '')
    setError(null)
    setConflict(false)
    setReasonError(null)
  }

  const close = () => {
    if (!pending) setAction(null)
  }

  const reload = () => {
    setAction(null)
    router.refresh()
  }

  const confirm = async () => {
    if (!action || pending) return
    setPending(true)
    setError(null)
    setConflict(false)
    setReasonError(null)
    const result = await submitPatternStatus(patternNo, { status: action.target, ...(action.needsReason ? { pauseReason: reason.trim() } : {}) }, updatedAt)
    setPending(false)
    switch (result.kind) {
      case 'changed':
        setAction(null)
        toast.success(action.toast)
        router.refresh()
        return
      case 'unchanged':
        setAction(null)
        toast.message('바뀐 내용이 없어요')
        router.refresh()
        return
      case 'conflict':
        setConflict(true)
        setError(STATUS_CONFLICT_TEXT)
        return
      case 'fieldErrors':
        setReasonError(result.fieldErrors.pauseReason ?? null)
        if (!result.fieldErrors.pauseReason) setError(Object.values(result.fieldErrors)[0] ?? null)
        return
      case 'failed':
        setError(result.message)
        return
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            {STATUS_MENU_LABEL}
            <IconChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" container={container ?? undefined}>
          {statusActionsFor(status).map((item) => (
            <DropdownMenuItem key={item.key} onSelect={() => open(item)}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {action && (
        <OpsDialogShell open onOpenChange={(next) => !next && close()} pending={pending}>
          <OpsPatternStatusPanel
            action={action}
            reason={reason}
            onReason={setReason}
            pending={pending}
            error={error}
            conflict={conflict}
            reasonError={reasonError}
            onConfirm={confirm}
            onCancel={close}
            onReload={reload}
          />
        </OpsDialogShell>
      )}
    </>
  )
}
