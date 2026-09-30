'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'

/**
 * 받은 기획함의 확인창 껍데기 (티켓 20260930_1818, 채원 화면 설계 「컴포넌트」의 `OpsConfirmDialog`).
 *
 * `ui/alert-dialog` 위의 얇은 껍데기다. 기존 `BulkConfirmDialog`는 확인 버튼이 빨강으로 고정되고 문구가 「N건을 …할까요?」로
 * 고정이라 승인에 맞지 않아 따로 둔다(시험 묶음 지우기에만 재사용한다). 붉은 면은 `tone="destructive"`인 확인 버튼 하나뿐이다.
 * 실패는 창 안 인라인(`error`)이고 창은 유지한다. 처리 중에는 닫히지 않는다.
 *
 * `OpsConfirmPanel`은 포털 밖의 알맹이다 — `AlertDialog` 문맥만 있으면 포털 없이 그 안을 그릴 수 있어 테스트가 쓴다.
 */
export interface OpsConfirmPanelProps {
  title: string
  description?: ReactNode
  tone?: 'default' | 'destructive'
  confirmLabel: string
  /** 처리 중인 동안 확인 버튼 글자. 누른 버튼의 동사를 진행형으로 쓴다(UX 라이팅 §5.3). 기본은 「처리하는 중」. */
  pendingLabel?: string
  cancelLabel?: string
  confirmDisabled?: boolean
  pending?: boolean
  /** 실패 문장. 있으면 창 안에 붉은 글로 보인다. */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function OpsConfirmPanel({
  title,
  description,
  tone = 'default',
  confirmLabel,
  pendingLabel = '처리하는 중',
  cancelLabel = '취소',
  confirmDisabled,
  pending,
  error,
  onConfirm,
  onCancel,
  children,
}: OpsConfirmPanelProps) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description !== undefined && (
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        )}
      </AlertDialogHeader>

      {children}

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <AlertDialogFooter>
        <Button type="button" variant="outline" className="flex-1" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === 'destructive' ? 'destructive' : 'default'}
          className="flex-1"
          disabled={pending || confirmDisabled}
          onClick={onConfirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </AlertDialogFooter>
    </>
  )
}

interface OpsDialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 처리 중에는 바깥을 눌러도 Esc를 눌러도 닫히지 않는다. */
  pending?: boolean
  /** 요약 창처럼 내용이 넓은 창. */
  wide?: boolean
  children: ReactNode
}

/** 창 틀: 어드민 테마 안에 포털로 그리고, 처리 중에는 닫히지 않게 한다. */
export function OpsDialogShell({ open, onOpenChange, pending, wide, children }: OpsDialogShellProps) {
  const container = useAdminPortalContainer()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || pending) return
        onOpenChange(false)
      }}
    >
      <AlertDialogContent container={container ?? undefined} className={cn(wide && 'max-w-lg')}>
        {children}
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface OpsConfirmDialogProps extends Omit<OpsConfirmPanelProps, 'onCancel'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  wide?: boolean
}

export function OpsConfirmDialog({ open, onOpenChange, wide, ...panel }: OpsConfirmDialogProps) {
  return (
    <OpsDialogShell open={open} onOpenChange={onOpenChange} pending={panel.pending} wide={wide}>
      <OpsConfirmPanel {...panel} onCancel={() => onOpenChange(false)} />
    </OpsDialogShell>
  )
}
