'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { requestJson } from '@/components/admin/data-table/admin-fetch'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import type { SuspensionRow } from '@/lib/admin/suspension-list'

interface SuspensionTableProps {
  suspensions: SuspensionRow[]
}

const columnHelper = createColumnHelper<DataTableFeatures, SuspensionRow>()

const displayName = (row: SuspensionRow) => row.user?.username ?? row.user?.email ?? row.user_id.slice(0, 8)

/**
 * 이용 정지 이력 표(티켓 20261017_1426 2회) — 옛 섀도우밴 표(`BanTable`)를 대신한다. 정지를 걸 때마다 한 줄이고 푼 줄도 남는다.
 * 활성/풀림 필터·검색·번호 페이지는 서버가 URL(`?tab=suspensions&status=&q=&page=`)로 나눈다.
 * 진행 중인 줄에만 «풀기»가 있고, 누르면 확인창(상담 결과 메모 입력)을 거친다. 풀면 유저가 다시 동기화할 수 있다.
 * 일괄 처리는 두지 않는다(정지는 한 명씩 사유를 보고 풀어야 한다).
 */
export function SuspensionTable({ suspensions }: SuspensionTableProps) {
  const router = useRouter()
  const portalContainer = useAdminPortalContainer()
  const [target, setTarget] = useState<SuspensionRow | null>(null)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)

  const closeDialog = () => {
    if (pending) return
    setTarget(null)
    setNote('')
  }

  const lift = async () => {
    if (!target) return
    setPending(true)
    try {
      await requestJson(`/api/admin/suspensions/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      toast.success('이용 정지를 풀었어요.')
      setTarget(null)
      setNote('')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '이용 정지를 풀지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((r) => displayName(r), {
          id: 'user',
          header: '유저',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/users/${row.original.user_id}`} className="block hover:underline">
              <span className="block font-medium">{row.original.user?.username ?? '—'}</span>
              <span className="block text-xs text-muted-foreground">
                {row.original.user?.email ?? row.original.user_id.slice(0, 8)}
              </span>
            </Link>
          ),
        }),
        columnHelper.accessor('reason', {
          id: 'reason',
          header: '사유',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span className="block max-w-xs break-keep wrap-break-word whitespace-pre-line text-xs">{getValue()}</span>
          ),
        }),
        columnHelper.accessor('suspended_at', {
          id: 'suspendedAt',
          header: '정지한 시각',
          enableSorting: false,
          cell: ({ row }) => (
            <span className="block text-xs">
              <span className="block text-muted-foreground">{formatKstYmdHm(row.original.suspended_at)}</span>
              <span className="block text-muted-foreground">{row.original.suspended_by}</span>
            </span>
          ),
        }),
        columnHelper.accessor((r) => r.lifted_at ?? '', {
          id: 'liftedAt',
          header: '해제',
          enableSorting: false,
          cell: ({ row }) => {
            const { lifted_at, lifted_by, lift_note } = row.original
            if (!lifted_at) {
              return (
                <span className="w-fit rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">정지 중</span>
              )
            }
            return (
              <span className="block text-xs text-muted-foreground">
                <span className="block">{formatKstYmdHm(lifted_at)}</span>
                {lifted_by && <span className="block">{lifted_by}</span>}
                {lift_note && <span className="block max-w-xs break-keep wrap-break-word whitespace-pre-line">{lift_note}</span>}
              </span>
            )
          },
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          enableHiding: false,
          cell: ({ row }) =>
            row.original.lifted_at ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setTarget(row.original)}>
                풀기
              </Button>
            ),
        }),
      ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: suspensions,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
  })

  return (
    <div className="space-y-3">
      <DataTable table={table} columnCount={columns.length} emptyMessage="조건에 맞는 이용 정지가 없어요." />

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent container={portalContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>이용 정지 풀기</AlertDialogTitle>
            <AlertDialogDescription>
              {target ? `${displayName(target)}님의 이용 정지를 풀까요?` : ''} 풀면 다시 동기화하고 아이템 배지를 받을 수 있어요.
              정지 기간에 시작한 활동은 풀린 뒤에도 반영되지 않아요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <label htmlFor="suspension-lift-note" className="text-xs text-muted-foreground">
              해제 메모 (선택, 고객센터 상담 결과 등 운영자만 봐요)
            </label>
            <Input
              id="suspension-lift-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 소명 확인 후 해제"
              disabled={pending}
            />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={closeDialog}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={lift}>
              {pending ? '처리 중...' : '정지 풀기'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
