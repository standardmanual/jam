'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { Button } from '@/components/admin/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { runBulk, type BulkRunResponse } from '@/components/admin/data-table/admin-fetch'

interface AssignTribeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ids: string[]
  tribes: { id: string; name: string }[]
  pending: boolean
  onConfirm: (tribeId: string) => void
}

/**
 * 배지 트라이브 일괄 지정 다이얼로그(티켓 20260924_0944, 상위 티켓 §4.1 배지 행, 등급 1) —
 * 트라이브를 고르면 건너뛸 항목(체크인 배지·소속 컬렉션 트라이브 불일치)을 바로 미리보기로
 * 보여준다. 등급 1 확인창(`BulkConfirmDialog`)은 `level>=2`일 때만 영향 영역을 그리므로,
 * 이 미리보기를 넣으려면 별도 다이얼로그가 필요하다.
 */
export function AssignTribeDialog({ open, onOpenChange, ids, tribes, pending, onConfirm }: AssignTribeDialogProps) {
  const container = useAdminPortalContainer()
  const [tribeId, setTribeId] = useState('')
  const [preview, setPreview] = useState<BulkRunResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setTribeId('')
      setPreview(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !tribeId) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    runBulk('/api/admin/badges/list-bulk', { ids, action: 'assign_tribe', payload: { tribe_id: tribeId }, dry_run: true })
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, tribeId, ids])

  const confirmDisabled = pending || !tribeId || previewLoading || (preview?.processed.length ?? 0) === 0

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onOpenChange(false)
      }}
    >
      <AlertDialogContent container={container ?? undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>배지 트라이브 일괄 지정</AlertDialogTitle>
          <AlertDialogDescription>선택한 {ids.length}건에 트라이브를 지정할까요?</AlertDialogDescription>
        </AlertDialogHeader>

        <Select value={tribeId} onValueChange={setTribeId} disabled={pending}>
          <SelectTrigger aria-label="지정할 트라이브">
            <SelectValue placeholder="트라이브를 선택하세요" />
          </SelectTrigger>
          <SelectContent container={container ?? undefined}>
            {tribes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tribeId && (
          <div className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            {previewLoading || !preview ? (
              '영향을 확인하는 중...'
            ) : preview.skipped.length > 0 ? (
              <>
                {preview.processed.length}건에 지정됩니다. {preview.skipped.length}건은 체크인 배지이거나 소속
                컬렉션의 트라이브와 달라 건너뜁니다.
              </>
            ) : (
              <>선택한 {preview.processed.length}건 모두에 지정됩니다.</>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" disabled={confirmDisabled} onClick={() => onConfirm(tribeId)}>
            {pending ? '처리 중...' : '지정'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
