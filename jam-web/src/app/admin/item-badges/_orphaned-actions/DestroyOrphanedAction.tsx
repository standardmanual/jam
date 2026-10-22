'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import { runBulk, type BulkRunResponse } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { ORPHANED_BULK_ENDPOINT, type OrphanedActionItem } from './types'

interface DestroyOrphanedActionProps {
  items: OrphanedActionItem[]
  /** 버튼 문구 — 목록(일괄)과 상세(단건)에서 다르게 쓴다 */
  label: string
  variant?: 'destructive' | 'outline'
  size?: 'default' | 'sm'
  disabled?: boolean
  /** 처리 완료 후 호출 — 선택을 비우는 등 화면 상태를 정리한다(서버 데이터는 router.refresh로 다시 읽는다) */
  onDone?: () => void
}

interface DestroyPreview {
  eligibleCount: number
  skipped: BulkRunResponse['skipped']
  requiredPhrase: string
  itemCount: number
  badgeKindCount: number
}

/**
 * 고아(Orphaned) 아이템배지 영구 폐기 액션(티켓 20260829_2150) — Orphaned → Destroyed.
 * 되돌릴 수 없는 등급 3 동작이라(상위 티켓 §3) 서버가 미리보기(`dry_run`)로 영향 수치와 확인
 * 문구를 계산하고, 그 문구를 그대로 입력해야 실행된다(단건·일괄 모두). 목록(일괄)·상세(단건)
 * 양쪽에서 재사용한다 — 20260924_0950에서 확인창을 공용 `BulkConfirmDialog`로, 호출을 서버
 * 일괄 처리 라우트로 바꿨다.
 */
export function DestroyOrphanedAction({
  items,
  label,
  variant = 'destructive',
  size = 'sm',
  disabled = false,
  onDone,
}: DestroyOrphanedActionProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<DestroyPreview | null>(null)
  const [pending, setPending] = useState(false)

  const ids = items.map((i) => i.id)

  const close = () => {
    setOpen(false)
    setPreview(null)
  }

  const openDialog = async () => {
    setOpen(true)
    setPreviewLoading(true)
    try {
      const result = await runBulk(ORPHANED_BULK_ENDPOINT, { ids, action: 'destroy', dry_run: true })
      setPreview({
        eligibleCount: result.processed.length,
        skipped: result.skipped,
        requiredPhrase: result.requiredPhrase ?? '',
        itemCount: result.impact?.itemCount ?? 0,
        badgeKindCount: result.impact?.badgeKindCount ?? 0,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했습니다.')
      close()
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    setPending(true)
    try {
      const result = await runBulk(ORPHANED_BULK_ENDPOINT, {
        ids,
        action: 'destroy',
        confirm_phrase: preview.requiredPhrase,
      })
      toastBulkResult(result, { verb: '폐기' })
      close()
      onDone?.()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해주세요.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} disabled={disabled} onClick={openDialog}>
        {label}
      </Button>
      {open && (
        <BulkConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) close()
          }}
          level={3}
          title="아이템배지 영구 폐기"
          verb="영구 폐기"
          count={preview?.eligibleCount ?? ids.length}
          impact={
            preview ? (
              <>
                지금도 소유자가 없는 개체 {preview.itemCount}개(배지 {preview.badgeKindCount}종)를 영구히
                폐기해요. 되돌릴 수 없어요.
                {preview.skipped.length > 0 && (
                  <> 상태가 바뀐 {preview.skipped.length}개는 제외돼요.</>
                )}
              </>
            ) : null
          }
          impactLoading={previewLoading}
          requiredPhrase={preview?.requiredPhrase}
          confirmDisabled={!preview || preview.eligibleCount === 0}
          pending={pending}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}
