'use client'

import { OpsConfirmPanel, OpsDialogShell } from '@/components/admin/ops/OpsConfirmDialog'
import { OpsDiffLines } from '@/components/admin/ops/OpsDiffLines'
import { Textarea } from '@/components/admin/ui/textarea'
import { NOTE_LABEL, NOTE_MAX_LENGTH, NOTE_PLACEHOLDER } from '@/lib/admin/balance/history'
import { cn } from '@/lib/utils'

/**
 * 확률 안내에 반영되는 칸을 바꿀 때의 확인창 (티켓 20261022_1132 2회, 사용자 결정 2, 가정 마).
 *
 * 확률 안내 페이지(`/probability`)는 설정 표를 매번 읽어 그리므로 저장하면 페이지가 **바로** 바뀐다. 공지하는 수단은 아직 없어서(6-4도 확인하지 못했다) 이 창이
 * 바뀌는 값(전 → 후)과 «바꾸기 전에 공지가 필요한지 확인해요»를 알리는 데까지만 한다. 공용 DB를 staging과 프로덕션이 함께 쓰므로 프로덕션에 바로 반영된다는 것도 알린다.
 * 변경 메모는 선택이고(비워도 저장된다) 창 안에서도 쓸 수 있다. 메모 글은 구역 폼과 같은 상태라 폼의 메모 칸과 함께 움직인다.
 *
 * 차이 줄은 받은 기획함의 `OpsDiffLines`를 쓴다(`path`에 칸 이름표를 넣는다). 알맹이(`BalanceProbabilityConfirmPanel`)는 포털 밖이라 시험이 `AlertDialog` 안에 넣어 그린다.
 */
export const CONFIRM_TITLE = '확률 안내에 반영되는 값을 바꿀까요?'
export const CONFIRM_NOTICE = '확률 안내 페이지에 바로 반영돼요. 바꾸기 전에 공지가 필요한지 확인해요.'
export const CONFIRM_PRODUCTION = '저장하면 프로덕션에 바로 반영돼요. staging과 프로덕션이 같은 값을 쓰기 때문이에요.'
export const CONFIRM_CHANGES_TITLE = '확률 안내에 반영되는 칸'
export const CONFIRM_BUTTON = '저장하기'
export const CONFIRM_PENDING = '저장하는 중'
export const CONFIRM_CANCEL = '취소'

const TEXT = 'break-keep wrap-break-word'

/** 확인창에 보일 바뀐 칸 한 줄. 값은 단위까지 붙은 글자다(예: `84%`). */
export interface BalanceConfirmLine {
  label: string
  before: string
  after: string
}

/** 확률 안내에 반영되지 않는 칸이 함께 저장될 때 알리는 문장. */
export function otherChangesText(count: number): string {
  return `그 밖에 ${count}칸도 함께 저장돼요.`
}

export interface BalanceProbabilityConfirmPanelProps {
  /** 확률 안내에 반영되는 바뀐 칸. */
  lines: readonly BalanceConfirmLine[]
  /** 확률 안내에 반영되지 않지만 함께 저장되는 바뀐 칸 수. */
  otherChangeCount: number
  note: string
  onNoteChange: (text: string) => void
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function BalanceProbabilityConfirmPanel({
  lines,
  otherChangeCount,
  note,
  onNoteChange,
  pending,
  onConfirm,
  onCancel,
}: BalanceProbabilityConfirmPanelProps) {
  const noteId = 'balance-probability-confirm-note'
  return (
    <OpsConfirmPanel
      title={CONFIRM_TITLE}
      description={
        <div className="space-y-1">
          <p className={cn('text-pretty', TEXT)}>{CONFIRM_NOTICE}</p>
          <p className={cn('text-pretty', TEXT)}>{CONFIRM_PRODUCTION}</p>
        </div>
      }
      confirmLabel={CONFIRM_BUTTON}
      pendingLabel={CONFIRM_PENDING}
      cancelLabel={CONFIRM_CANCEL}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <section className="space-y-2">
        <h3 className={cn('text-sm font-semibold text-balance', TEXT)}>{CONFIRM_CHANGES_TITLE}</h3>
        <OpsDiffLines diff={lines.map((line) => ({ path: line.label, before: line.before, after: line.after }))} className="break-keep" />
        {otherChangeCount > 0 && <p className={cn('text-sm text-muted-foreground text-pretty', TEXT)}>{otherChangesText(otherChangeCount)}</p>}
      </section>
      <div className="space-y-1.5">
        <label htmlFor={noteId} className={cn('text-sm font-medium', TEXT)}>
          {NOTE_LABEL}
        </label>
        <Textarea
          id={noteId}
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          value={note}
          disabled={pending}
          placeholder={NOTE_PLACEHOLDER}
          className="min-h-16"
          onChange={(event) => onNoteChange(event.target.value)}
        />
        <p className={cn('text-xs text-muted-foreground', TEXT)}>
          최대 {NOTE_MAX_LENGTH}자 · {note.length}자
        </p>
      </div>
    </OpsConfirmPanel>
  )
}

export interface BalanceProbabilityConfirmProps extends Omit<BalanceProbabilityConfirmPanelProps, 'onCancel'> {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BalanceProbabilityConfirm({ open, onOpenChange, ...panel }: BalanceProbabilityConfirmProps) {
  return (
    <OpsDialogShell open={open} onOpenChange={onOpenChange} pending={panel.pending} wide>
      <BalanceProbabilityConfirmPanel {...panel} onCancel={() => onOpenChange(false)} />
    </OpsDialogShell>
  )
}
