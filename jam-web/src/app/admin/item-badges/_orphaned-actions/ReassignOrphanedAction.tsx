'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { runBulk } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { ORPHANED_REASSIGN_MAX_IDS } from '@/lib/admin/orphaned-item-actions'
import { UserSearchCombobox, type SearchedUser } from './UserSearchCombobox'
import { ORPHANED_BULK_ENDPOINT, type OrphanedActionItem } from './types'

interface ReassignOrphanedActionProps {
  items: OrphanedActionItem[]
  label: string
  variant?: 'default' | 'outline'
  size?: 'default' | 'sm'
  disabled?: boolean
  onDone?: () => void
}

interface ReassignPreview {
  eligibleCount: number
  skippedCount: number
  hasInventory: boolean
  freeSlots: number
  shortCount: number
}

/**
 * 고아(Orphaned) 아이템배지 재배정 액션(티켓 20260829_2150) — Orphaned → Held.
 * 대상 유저는 유저명/이메일 검색으로 지정하고, 재배정된 유저에게 알림은 보내지
 * 않는다("조용히 지급" — 티켓 §"재배정"). 목록(일괄)·상세(단건) 양쪽에서 재사용한다.
 *
 * 20260924_0950: 등급 2 동작이라(상위 티켓 §3) 대상 유저를 고르면 서버 미리보기(`dry_run`)로
 * 그 유저의 빈 칸과 재배정할 개수를 비교해 보여 준다. 모자라는 만큼은 인벤토리가 꽉 차서
 * 실패한다. 호출은 서버 일괄 처리 라우트(한 번에 200건까지)로 바꿨다.
 */
export function ReassignOrphanedAction({
  items,
  label,
  variant = 'outline',
  size = 'sm',
  disabled = false,
  onDone,
}: ReassignOrphanedActionProps) {
  const router = useRouter()
  const themeContainer = useAdminPortalContainer()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<SearchedUser | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<ReassignPreview | null>(null)
  const [pending, setPending] = useState(false)
  const previewSeq = useRef(0)

  const ids = items.map((i) => i.id)

  const close = () => {
    previewSeq.current += 1
    setOpen(false)
    setTarget(null)
    setPreview(null)
  }

  // 대상 유저를 고르거나 바꿀 때마다 미리보기를 다시 계산한다. 응답이 늦게 도착해도 마지막으로
  // 고른 유저의 결과만 반영한다.
  const handleTargetChange = async (user: SearchedUser | null) => {
    const seq = ++previewSeq.current
    setTarget(user)
    setPreview(null)
    if (!user) {
      setPreviewLoading(false)
      return
    }

    setPreviewLoading(true)
    try {
      const result = await runBulk(ORPHANED_BULK_ENDPOINT, {
        ids,
        action: 'reassign',
        payload: { targetUserId: user.id },
        dry_run: true,
      })
      if (seq !== previewSeq.current) return
      setPreview({
        eligibleCount: result.processed.length,
        skippedCount: result.skipped.length,
        hasInventory: (result.impact?.hasInventory ?? 0) === 1,
        freeSlots: result.impact?.freeSlots ?? 0,
        shortCount: result.impact?.shortCount ?? 0,
      })
    } catch (error) {
      if (seq !== previewSeq.current) return
      toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했습니다.')
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false)
    }
  }

  const openDialog = () => {
    if (ids.length > ORPHANED_REASSIGN_MAX_IDS) {
      toast.error(`한 번에 최대 ${ORPHANED_REASSIGN_MAX_IDS}건까지 재배정할 수 있습니다. 선택을 줄여주세요.`)
      return
    }
    setOpen(true)
  }

  const handleConfirm = async () => {
    if (!target) return
    setPending(true)
    try {
      const result = await runBulk(ORPHANED_BULK_ENDPOINT, {
        ids,
        action: 'reassign',
        payload: { targetUserId: target.id },
      })
      toastBulkResult(result, { verb: '재배정' })
      close()
      onDone?.()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해주세요.')
    } finally {
      setPending(false)
    }
  }

  let impact: ReactNode = <>재배정할 유저를 먼저 선택해 주세요. 유저에게 별도 알림은 가지 않아요.</>
  if (target && preview) {
    impact = !preview.hasInventory ? (
      <>대상 유저의 인벤토리를 찾을 수 없어 재배정할 수 없어요</>
    ) : (
      <>
        대상 유저의 빈 칸은 {preview.freeSlots}칸이고 재배정할 개체는 {preview.eligibleCount}개예요.
        {preview.shortCount > 0 && <> 모자라는 {preview.shortCount}개는 인벤토리가 꽉 차서 제외돼요.</>}
        {preview.skippedCount > 0 && <> 상태가 바뀐 {preview.skippedCount}개는 제외돼요.</>}
      </>
    )
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
          level={2}
          title="아이템배지 재배정"
          verb="재배정"
          count={preview?.eligibleCount ?? ids.length}
          impact={impact}
          impactLoading={previewLoading}
          confirmDisabled={!target || !preview || !preview.hasInventory || preview.eligibleCount === 0}
          pending={pending}
          onConfirm={handleConfirm}
        >
          <UserSearchCombobox value={target} onChange={handleTargetChange} container={themeContainer} />
        </BulkConfirmDialog>
      )}
    </>
  )
}
