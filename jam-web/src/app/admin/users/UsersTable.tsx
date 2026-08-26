'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
} from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { ResetUserButton } from './ResetUserButton'
import type { UserRow } from '@/types/database'

export interface UserListRow {
  user: Pick<UserRow, 'id' | 'email' | 'username' | 'created_at' | 'region'>
  badgeCount: number
  itemCount: number
}

interface UsersTableProps {
  rows: UserListRow[]
}

const columnHelper = createColumnHelper<DataTableFeatures, UserListRow>()

/**
 * 유저 목록 테이블(20260826_015) — 3단계a 공용 Data Table 컴포넌트로 전환했다. 10명 규모라
 * 서버 페이지네이션은 두지 않는다(사전 조사 결과). 유저 계정에 대한 일괄 삭제/정지는 정책상
 * 민감해 이 티켓 범위 밖이다(티켓 명시) — 행 선택 UI 자체를 생략하고 표시 방식(정렬·컬럼
 * 관리)만 전환한다.
 */
export function UsersTable({ rows }: UsersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.accessor((r) => r.user.username ?? '', {
        id: 'username',
        header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
        enableHiding: false,
        sortFn: 'text',
        cell: ({ row }) => (
          <Link href={`/admin/users/${row.original.user.id}`} className="font-medium hover:underline">
            {row.original.user.username ?? '—'}
          </Link>
        ),
      }),
      columnHelper.accessor((r) => r.user.email, {
        id: 'email',
        header: '이메일',
        enableSorting: false,
        meta: { label: '이메일' },
        cell: ({ row }) => <span>{row.original.user.email}</span>,
      }),
      columnHelper.accessor((r) => r.user.region ?? '', {
        id: 'region',
        header: '지역',
        enableSorting: false,
        meta: { label: '지역' },
        cell: ({ row }) => <span>{row.original.user.region ?? '—'}</span>,
      }),
      columnHelper.accessor((r) => r.badgeCount, {
        id: 'badgeCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="보유 배지" />,
        meta: { label: '보유 배지' },
        cell: ({ row }) => <span>{row.original.badgeCount}</span>,
      }),
      columnHelper.accessor((r) => r.itemCount, {
        id: 'itemCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="보유 아이템" />,
        meta: { label: '보유 아이템' },
        cell: ({ row }) => <span>{row.original.itemCount}</span>,
      }),
      columnHelper.accessor((r) => r.user.created_at, {
        id: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="가입일" />,
        meta: { label: '가입일' },
        // ISO 문자열은 사전식 정렬로도 시간순과 일치한다 — `sortFn` 미지정 시 기본
        // `sortFn_basic`(원시값 비교)이 그대로 동작해 별도 등록 없이 정확히 정렬된다.
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.user.created_at).toLocaleDateString('ko-KR')}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '액션',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <ResetUserButton
            userId={row.original.user.id}
            userName={row.original.user.username ?? row.original.user.email}
          />
        ),
      }),
    ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.user.id,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="유저가 없습니다." />
    </div>
  )
}
