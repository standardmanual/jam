'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { ADMIN_REASONS, type AdminReasonValue } from '@/lib/points/reasons'

export interface BulkPointsPayload {
  /** 부호 포함: 양수 지급, 음수 회수 */
  amount: number
  reasonLabel: AdminReasonValue
  note?: string
}

interface BulkPointsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  pending: boolean
  /** 입력을 검증한 뒤 호출된다 — 화면이 미리보기(`dry_run`)와 확인창을 이어서 연다 */
  onSubmit: (payload: BulkPointsPayload) => void
}

/**
 * 포인트 일괄 지급·회수 입력창(티켓 20260924_0951, 등급 3의 첫 단계) — 금액·사유만 받고, 영향 수치와
 * 확인 문구 입력은 이어지는 공용 확인창(`BulkConfirmDialog`)이 맡는다. 단건 폼(`UserGrantForm`)과
 * 같은 입력 규칙이며 서버가 같은 검증기(`validateAdminGrantInput`)로 다시 확인한다.
 */
export function BulkPointsDialog({ open, onOpenChange, count, pending, onSubmit }: BulkPointsDialogProps) {
  const container = useAdminPortalContainer()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onOpenChange(false)
      }}
    >
      <AlertDialogContent container={container ?? undefined}>
        {/* 내용을 별도 컴포넌트로 두면 닫힐 때 함께 사라져 입력 상태가 저절로 초기화된다 */}
        <BulkPointsDialogBody
          count={count}
          pending={pending}
          container={container ?? undefined}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}

function BulkPointsDialogBody({
  count,
  pending,
  container,
  onCancel,
  onSubmit,
}: {
  count: number
  pending: boolean
  container: HTMLElement | undefined
  onCancel: () => void
  onSubmit: (payload: BulkPointsPayload) => void
}) {
  const [direction, setDirection] = useState<'grant' | 'deduct'>('grant')
  const [magnitude, setMagnitude] = useState('')
  const [reasonLabel, setReasonLabel] = useState<AdminReasonValue>('cs_compensation')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const parsed = Number(magnitude)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('0보다 큰 정수 금액을 입력해 주세요.')
      return
    }
    if (reasonLabel === 'other' && note.trim().length === 0) {
      setError('"기타" 사유는 내용을 입력해 주세요.')
      return
    }
    setError(null)
    onSubmit({
      amount: direction === 'deduct' ? -parsed : parsed,
      reasonLabel,
      note: reasonLabel === 'other' ? note.trim() : undefined,
    })
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>포인트 지급·회수</AlertDialogTitle>
        <AlertDialogDescription>
          선택한 {count}명에게 같은 금액을 적용해요. 어드민 계정과 본인 계정은 자동으로 제외돼요.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={direction === 'grant' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setDirection('grant')}
            disabled={pending}
          >
            지급 (+)
          </Button>
          <Button
            type="button"
            variant={direction === 'deduct' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setDirection('deduct')}
            disabled={pending}
          >
            회수 (−)
          </Button>
        </div>

        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder="유저 한 명당 금액 (P)"
          aria-label="유저 한 명당 금액"
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          disabled={pending}
        />

        <Select value={reasonLabel} onValueChange={(v) => setReasonLabel(v as AdminReasonValue)} disabled={pending}>
          <SelectTrigger aria-label="사유">
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={container}>
            {ADMIN_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {reasonLabel === 'other' && (
          <Textarea
            placeholder="사유를 직접 입력해 주세요"
            aria-label="기타 사유"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <AlertDialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          취소
        </Button>
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? '확인하는 중...' : '영향 확인'}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
