'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import type { OrphanedActionItem, OrphanedActionResult } from './types'
import { DESTROY_ERROR_LABEL } from './types'

interface DestroyOrphanedActionProps {
  items: OrphanedActionItem[]
  /** 버튼 문구 — 목록(일괄)과 상세(단건)에서 다르게 쓴다 */
  label: string
  variant?: 'destructive' | 'outline'
  size?: 'default' | 'sm'
  disabled?: boolean
  /** 처리 완료 후 호출 — 서버 데이터를 다시 읽어와 화면을 갱신한다(router.refresh) */
  onDone?: () => void
}

/**
 * 고아(Orphaned) 아이템배지 영구 폐기 액션(티켓 20260829_2150) — Orphaned → Destroyed.
 * 되돌릴 수 없으므로 확인 모달이 필수다(단건·일괄 모두, 대상 개수를 모달에 명시).
 * 목록(SerialListTable, 일괄)·상세([itemId]/page.tsx, 단건) 양쪽에서 재사용한다.
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
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<OrphanedActionResult[] | null>(null)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — BanTable.tsx와 동일 패턴.
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const handleDestroy = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/item-badges/orphaned/destroy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: items.map((i) => i.id) }),
      })
      const data = await res.json()
      setResults((data.results ?? []) as OrphanedActionResult[])
    } finally {
      setLoading(false)
    }
  }

  const close = (open: boolean) => {
    if (loading) return
    setOpen(open)
    if (!open && results) {
      setResults(null)
      onDone?.()
      router.refresh()
    }
  }

  const failedCount = results ? results.filter((r) => !r.ok).length : 0

  return (
    <>
      <Button type="button" variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={close}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>아이템배지 영구 폐기</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {items.length}개 개체를 영구히 폐기할까요? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {results && (
            <div className="space-y-2 text-sm">
              <p>
                {results.length}개 중 {results.length - failedCount}개 폐기 완료
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
                              {DESTROY_ERROR_LABEL[r.error ?? ''] ?? r.error}
                            </li>
                          )
                        })}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {results ? (
              <Button type="button" onClick={() => close(false)}>
                닫기
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={loading} onClick={() => close(false)}>
                  취소
                </Button>
                <Button type="button" variant="destructive" disabled={loading} onClick={handleDestroy}>
                  {loading ? '처리 중...' : '영구 폐기'}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
