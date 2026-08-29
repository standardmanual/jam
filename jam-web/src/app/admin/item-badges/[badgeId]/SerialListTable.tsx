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
import {
  ITEM_BADGE_STATUS_LABEL,
  ITEM_BADGE_STATUS_COLOR,
  formatDateTime,
  type ItemBadgeStatus,
} from '@/lib/admin/item-badge-status'

export interface SerialListRow {
  id: string
  serialLabel: string
  status: ItemBadgeStatus
  ownerUserId: string | null
  ownerUsername: string | null
  poiId: string | null
  poiName: string | null
  mintedAt: string
  isReissued: boolean
  /** 재발급된 번호 중, 이전 개체가 파괴되지 않은 채로 둘 다 살아있는 이상 케이스 */
  reissueAnomaly: boolean
}

interface SerialListTableProps {
  rows: SerialListRow[]
  badgeId: string
}

const columnHelper = createColumnHelper<DataTableFeatures, SerialListRow>()

// shadcn Badge 컴포넌트(variant="outline" 등)는 기본 variant의 text-*/bg-* 유틸리티가
// 이 화면의 상태별 커스텀 색상과 같은 className 문자열 안에 섞여, 이 프로젝트의 `cn()`이
// tailwind-merge 없이 단순 join이라 어느 쪽이 최종 적용될지 CSS 생성 순서에 좌우된다 —
// 순수 span으로 직접 그려 그 충돌 가능성을 원천 차단한다(RARITY_BADGE_COLOR 등 기존
// 어드민 화면의 등급 배지도 같은 방식).
const PILL_CLASS = 'inline-block px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap'

/**
 * 배지별 발급 일련번호 목록 테이블(티켓 20260829_2139) — 다른 어드민 화면과 동일하게
 * 공용 Data Table(`admin/data-table`)을 재사용한다(열린 결정 2). 읽기 전용 조회 화면이라
 * 행 선택/일괄 액션은 없다.
 */
export function SerialListTable({ rows, badgeId }: SerialListTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('serialLabel', {
          id: 'serial',
          header: '일련번호',
          // 문자열 사전식 정렬이라 두 자리 이상 번호에서는 시각적으로 어색해진다("10" <
          // "9") — 숫자 정렬을 지원하는 컬럼(발급일시)만 헤더 정렬을 열어둔다.
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/item-badges/${badgeId}/${row.original.id}`}
                className="font-mono font-medium hover:underline"
              >
                #{row.original.serialLabel}
              </Link>
              {row.original.isReissued && (
                <span
                  className={`${PILL_CLASS} border ${
                    row.original.reissueAnomaly
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-neutral-300 bg-white text-neutral-600'
                  }`}
                >
                  {row.original.reissueAnomaly ? '동시 존재 이상' : '재발급'}
                </span>
              )}
            </div>
          ),
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: '현재 상태',
          enableSorting: false,
          meta: { label: '현재 상태' },
          cell: ({ row }) => (
            <span className={`${PILL_CLASS} ${ITEM_BADGE_STATUS_COLOR[row.original.status]}`}>
              {ITEM_BADGE_STATUS_LABEL[row.original.status]}
            </span>
          ),
        }),
        columnHelper.display({
          id: 'location',
          header: '현재 위치/소유자',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => {
            const r = row.original
            if (r.ownerUsername) {
              return r.ownerUserId ? (
                <Link href={`/admin/users/${r.ownerUserId}`} className="hover:underline">
                  {r.ownerUsername}
                </Link>
              ) : (
                <span>{r.ownerUsername}</span>
              )
            }
            if (r.poiName) {
              return r.poiId ? (
                <Link href={`/admin/poi/${r.poiId}`} className="hover:underline">
                  {r.poiName}
                </Link>
              ) : (
                <span>{r.poiName}</span>
              )
            }
            if (r.status === 'Orphaned') return <span className="text-muted-foreground">고아(어드민 보관 중)</span>
            return <span className="text-muted-foreground">—</span>
          },
        }),
        columnHelper.accessor('mintedAt', {
          id: 'mintedAt',
          header: ({ column }) => <DataTableColumnHeader column={column} title="발급일시" />,
          meta: { label: '발급일시' },
          cell: ({ getValue }) => (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(getValue())}</span>
          ),
        }),
      ]),
    [badgeId]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="조건에 맞는 결과가 없습니다." />
    </div>
  )
}
