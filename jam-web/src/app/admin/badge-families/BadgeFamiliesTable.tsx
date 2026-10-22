'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar, type DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { fetchListIds, downloadResponseAsFile } from '@/components/admin/data-table/admin-fetch'

/** 표에 그릴 값만 담은 한 줄 — 서버 페이지가 `BadgeFamily`에서 뽑아 넘긴다(구성 배지 전체를 넘기지 않는다) */
export interface FamilyTableRow {
  /** 행 ID = 계열 키(`BadgeFamily.key`) — UUID가 아니다 */
  key: string
  familyKey: string | null
  name: string
  categoryLabel: string
  kindLabel: string
  topLabel: string
  variantCount: number
  withImage: number
  /** 조건값 칸에 보일 지표 이름 */
  conditionLabels: string[]
  missionReward: boolean
  /** 평가 대기 지표 이름 */
  pendingLabels: string[]
}

interface BadgeFamiliesTableProps {
  families: FamilyTableRow[]
  /** 현재 필터 조건에 맞는 전체 계열 수(쪽당 건수가 아니다) — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, FamilyTableRow>()

const SELECT_ALL_CAP = 1000
const HEADER_SORTS = ['name', 'count'] as const

/** 계열 상세 경로 — 계열 키에 `:` 등이 들어가므로 인코딩한다 */
export function familyDetailHref(key: string): string {
  return `/admin/badge-families/${encodeURIComponent(key)}`
}

/**
 * 배지 계열 목록 표(티켓 20260924_0949, 상위 티켓 §1·§4.3). 바꾸는 기능이 없는 감사·기록형
 * 목록이라 표 안 대표 기능은 없고, 일괄 처리는 내보내기뿐이다(일괄 재계산은 넣지 않는다 —
 * 상위 티켓 결정). 행 ID는 계열 키이고, 행 아무 곳이나 눌러 계열 상세로 이동한다.
 */
export function BadgeFamiliesTable({ families, totalCount }: BadgeFamiliesTableProps) {
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkPending, setBulkPending] = useState(false)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor('categoryLabel', {
          id: 'category',
          header: '종목',
          enableSorting: false,
          enableHiding: false,
          cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
        }),
        columnHelper.accessor('name', {
          id: 'name',
          header: ({ column }) => <DataTableColumnHeader column={column} title="계열" />,
          enableHiding: false,
          cell: ({ row }) => {
            const family = row.original
            return (
              <div>
                <Link href={familyDetailHref(family.key)} className="font-medium text-foreground underline underline-offset-4">
                  {family.name}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {family.familyKey ? (
                    <span className="font-mono text-xs text-muted-foreground">{family.familyKey}</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
                      계열 키 없음
                    </span>
                  )}
                  {family.missionReward && (
                    <span className="rounded bg-neutral-100 px-1.5 py-px text-[11px] text-neutral-600">미션 보상</span>
                  )}
                  {family.pendingLabels.length > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
                      평가 대기 {family.pendingLabels.length}종 — {family.pendingLabels.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )
          },
        }),
        columnHelper.accessor('kindLabel', {
          id: 'kind',
          header: '종류',
          enableSorting: false,
          meta: { label: '종류' },
          cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
        }),
        columnHelper.accessor('topLabel', {
          id: 'top',
          header: '가장 높은 단계',
          enableSorting: false,
          meta: { label: '가장 높은 단계' },
          cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
        }),
        columnHelper.accessor('variantCount', {
          id: 'count',
          header: ({ column }) => <DataTableColumnHeader column={column} title="단계 수" />,
          enableHiding: false,
          cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
        }),
        columnHelper.display({
          id: 'conditions',
          header: '조건값',
          enableSorting: false,
          meta: { label: '조건값' },
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
              {row.original.conditionLabels.length > 0 ? row.original.conditionLabels.join(' · ') : '—'}
            </span>
          ),
        }),
        columnHelper.display({
          id: 'images',
          header: '이미지',
          enableSorting: false,
          meta: { label: '이미지' },
          cell: ({ row }) => (
            <span className="tabular-nums whitespace-nowrap">
              {row.original.withImage}/{row.original.variantCount}
            </span>
          ),
        }),
      ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: families,
    columns,
    getRowId: (row) => row.key,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = families.map((f) => f.key)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    return fetchListIds(`/api/admin/badge-families/ids?${params.toString()}`)
  }

  const handleExport = async () => {
    setBulkPending(true)
    try {
      await downloadResponseAsFile('/api/admin/badge-families/export', 'badge_families.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내기에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setBulkPending(false)
    }
  }

  const actions: DataTableBulkAction[] = [
    { key: 'export', label: '내보내기', onClick: handleExport, disabled: bulkPending },
  ]

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableSelectAllBanner
        pageIds={pageIds}
        selection={selectedIds}
        totalCount={totalCount}
        cap={SELECT_ALL_CAP}
        fetchAllIds={fetchAllIds}
        selectIds={selectIds}
        clear={clear}
      />

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={actions} offPageCount={offPageCount} />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="조건에 맞는 계열이 없어요"
        getRowHref={(row) => familyDetailHref(row.original.key)}
      />
    </div>
  )
}
