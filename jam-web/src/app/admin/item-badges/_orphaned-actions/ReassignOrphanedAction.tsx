'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/admin/ui/dialog'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { UserSearchCombobox, type SearchedUser } from './UserSearchCombobox'
import type { OrphanedActionItem, OrphanedActionResult } from './types'
import { REASSIGN_ERROR_LABEL } from './types'

interface ReassignOrphanedActionProps {
  items: OrphanedActionItem[]
  label: string
  variant?: 'default' | 'outline'
  size?: 'default' | 'sm'
  disabled?: boolean
  onDone?: () => void
}

/**
 * 고아(Orphaned) 아이템배지 재배정 액션(티켓 20260829_2150) — Orphaned → Held.
 * 대상 유저는 유저명/이메일 검색으로 지정하고, 재배정된 유저에게 알림은 보내지
 * 않는다("조용히 지급" — 티켓 §"재배정"). 목록(일괄)·상세(단건) 양쪽에서 재사용한다.
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
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<SearchedUser | null>(null)
  const [results, setResults] = useState<OrphanedActionResult[] | null>(null)

  // sheet.tsx/BanTable.tsx와 동일 패턴 — Radix Portal을 어드민 테마 스코프로 고정
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const handleReassign = async () => {
    if (!target) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/item-badges/orphaned/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: items.map((i) => i.id), targetUserId: target.id }),
      })
      const data = await res.json()
      setResults((data.results ?? []) as OrphanedActionResult[])
    } finally {
      setLoading(false)
    }
  }

  const close = (nextOpen: boolean) => {
    if (loading) return
    setOpen(nextOpen)
    if (!nextOpen) {
      const hadResults = !!results
      setResults(null)
      setTarget(null)
      if (hadResults) {
        onDone?.()
        router.refresh()
      }
    }
  }

  const failedCount = results ? results.filter((r) => !r.ok).length : 0

  return (
    <>
      <Button type="button" variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent container={themeContainer ?? undefined}>
          <DialogHeader>
            <DialogTitle>아이템배지 재배정</DialogTitle>
            <DialogDescription>
              선택한 {items.length}개 개체를 대상 유저에게 재배정합니다. 재배정된 유저에게 별도 알림은
              가지 않습니다.
            </DialogDescription>
          </DialogHeader>

          {!results && (
            <div className="space-y-2">
              <UserSearchCombobox value={target} onChange={setTarget} container={themeContainer} />
            </div>
          )}

          {results && (
            <div className="space-y-2 text-sm">
              <p>
                {results.length}개 중 {results.length - failedCount}개 재배정 완료
                {failedCount > 0 && `, ${failedCount}개 실패`}
              </p>
              {failedCount > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <ul className="space-y-1">
                      {results
                        .filter((r) => !r.ok)
                        .map((r) => {
                          const item = items.find((i) => i.id === r.itemId)
                          return (
                            <li key={r.itemId}>
                              #{item?.serialLabel ?? r.itemId.slice(0, 8)} —{' '}
                              {REASSIGN_ERROR_LABEL[r.error ?? ''] ?? r.error}
                            </li>
                          )
                        })}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            {results ? (
              <Button type="button" onClick={() => close(false)}>
                닫기
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={loading} onClick={() => close(false)}>
                  취소
                </Button>
                <Button type="button" disabled={loading || !target} onClick={handleReassign}>
                  {loading ? '처리 중...' : '재배정'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
