'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconDots } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import { requestJson } from '@/components/admin/data-table/admin-fetch'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'

/**
 * 시험 묶음 지우기 메뉴 (티켓 20260930_1818, 채원 화면 설계 승인 항목 7). 기획 상세 머리 오른쪽에 **시험 묶음일 때만** 놓는다.
 *
 * 「...」 메뉴 › 「시험 묶음 지우기」 → 확인 문구를 직접 입력하는 확인창(`BulkConfirmDialog` 등급 3)이다. 지우면 묶음의 항목과 결정 기록이
 * 함께 사라진다. 시험이 아닌 묶음은 서버(`DELETE /api/admin/ops-inbox/[bundleId]`)도 403으로 막는다 — 이 메뉴는 편의일 뿐 방어선이 아니다.
 * 성공하면 받은 기획함으로 돌아가 토스트를 띄운다. 실패는 창 안 인라인이고 창은 유지한다.
 */

export const OPS_SAMPLE_DELETE_PHRASE = '시험 묶음 삭제'
const DELETE_FAILED = '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.'

interface OpsSampleDeleteMenuProps {
  bundleId: string
  /** 함께 지워질 항목 수(확인창 안내). */
  itemCount: number
}

export function OpsSampleDeleteMenu({ bundleId, itemCount }: OpsSampleDeleteMenuProps) {
  const router = useRouter()
  const container = useAdminPortalContainer()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setPending(true)
    setError(null)
    try {
      await requestJson(`/api/admin/ops-inbox/${bundleId}`, { method: 'DELETE' })
    } catch (err) {
      setPending(false)
      setError(err instanceof Error && err.message ? err.message : DELETE_FAILED)
      return
    }
    setPending(false)
    setOpen(false)
    toast.success('시험 묶음을 지웠어요')
    router.push('/admin/ops-inbox')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="기획 메뉴">
            <IconDots className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" container={container ?? undefined}>
          <DropdownMenuItem
            onSelect={() => {
              setError(null)
              setOpen(true)
            }}
          >
            시험 묶음 지우기
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {open && (
        <BulkConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next && !pending) setOpen(false)
          }}
          level={3}
          title="시험 묶음 지우기"
          verb="삭제"
          count={1}
          impact={<p>이 시험 묶음의 항목 {itemCount}개와 결정 기록이 함께 지워져요. 되돌릴 수 없어요.</p>}
          requiredPhrase={OPS_SAMPLE_DELETE_PHRASE}
          pending={pending}
          onConfirm={remove}
        >
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </BulkConfirmDialog>
      )}
    </>
  )
}
