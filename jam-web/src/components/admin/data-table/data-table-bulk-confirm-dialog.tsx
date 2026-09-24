'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { isPhraseMatch } from '@/lib/admin/bulk/shared'
import { useAdminPortalContainer } from './use-admin-portal-container'

interface BulkConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 상위 티켓 §3 위험 등급 표 — 1(되돌릴 수 있음)·2(유저에게 보임)·3(되돌릴 수 없음) */
  level: 1 | 2 | 3
  title: string
  /** "N건을 {verb}할까요?" 문구에 그대로 들어간다 — "삭제"·"비활성화"처럼 어간 그대로 넘긴다 */
  verb: string
  count: number
  /** 등급 2 이상에서 보여줄 영향 영역(참여 중인 유저 수 등) */
  impact?: ReactNode
  impactLoading?: boolean
  /** 등급 3에서 그대로 입력해야 하는 확인 문구(`confirmPhraseFor`가 서버에서 계산한 값) */
  requiredPhrase?: string
  confirmDisabled?: boolean
  pending: boolean
  onConfirm: () => void
  /** 추가 입력 칸(사유 등)이 필요한 화면용 */
  children?: ReactNode
}

/**
 * 위험 등급별 일괄 처리 확인창(티켓 20260924_0940, 상위 티켓 §3). 등급이 올라갈수록 확인
 * 절차가 늘어난다 — 1은 문구만, 2는 영향 영역이 붙고, 3은 확인 문구 입력까지 요구한다.
 * `BulkToolManager.tsx`의 영향 분석 + 확인 문구 방식을 공용으로 승격한 것이다.
 */
export function BulkConfirmDialog({
  open,
  onOpenChange,
  level,
  title,
  verb,
  count,
  impact,
  impactLoading,
  requiredPhrase,
  confirmDisabled,
  pending,
  onConfirm,
  children,
}: BulkConfirmDialogProps) {
  const container = useAdminPortalContainer()
  const [phrase, setPhrase] = useState('')

  const phraseOk = level < 3 || (!!requiredPhrase && isPhraseMatch(phrase, requiredPhrase))
  const disabled = pending || !!confirmDisabled || (level >= 2 && !!impactLoading) || !phraseOk

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || pending) return
        setPhrase('')
        onOpenChange(false)
      }}
    >
      <AlertDialogContent container={container ?? undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {count}건을 {verb}할까요?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {level >= 2 && (
          <div className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            {impactLoading ? '영향을 확인하는 중...' : impact}
          </div>
        )}

        {level >= 3 && requiredPhrase && (
          <div className="space-y-2">
            <div className="rounded-lg bg-neutral-100 px-3 py-2 font-mono text-sm">{requiredPhrase}</div>
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={requiredPhrase}
              aria-label="확인 문구"
            />
          </div>
        )}

        {children}

        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" variant="destructive" disabled={disabled} onClick={onConfirm}>
            {pending ? '처리 중...' : '확인'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
