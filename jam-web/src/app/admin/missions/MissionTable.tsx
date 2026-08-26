'use client'

import { memo, useMemo, useState } from 'react'
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
import type { MissionRow } from '@/types/database'
import { missionTypeLabel } from '@/lib/admin/badge-labels'

interface MissionTableProps {
  missions: MissionRow[]
  completionCounts: Map<string, number>
  onEdit: (mission: MissionRow) => void
  onDelete: (id: string) => void
}

interface MissionTableRow {
  mission: MissionRow
  status: '진행 중' | '종료' | '예정'
  completionCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, MissionTableRow>()

/**
 * 미션 목록 테이블(20260826_015) — `MissionList.tsx`의 저작 폼과 분리된 자식 컴포넌트로,
 * 3단계a 공용 Data Table 컴포넌트로 전환했다. 미션은 45건 규모라 서버 페이지네이션은
 * 두지 않고(사전 조사 결과) 정렬도 클라이언트에서 처리한다(URL 동기화 불필요 — 모바일
 * 전용 뷰가 없어 배지/POI처럼 뷰 간 상태를 공유할 필요가 없다).
 *
 * 일괄 삭제 API가 없고(하드 DELETE만 존재, PATCH에 활성/비활성 개념 없음) 미션 "상태"는
 * 저장된 값이 아니라 시작/종료일에서 파생되는 값이라 소프트 삭제 대상도 아니다 — 행 선택 +
 * 일괄 액션은 이 화면 범위에서 제외한다(20260826_015 티켓 판단, 완료 기록 참고).
 *
 * `React.memo`로 감싸 저작 폼에 입력할 때마다 목록 전체가 리렌더되는 걸 막는다(20260826_011 A3).
 */
function MissionTableInner({ missions, completionCounts, onEdit, onDelete }: MissionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const now = new Date()

  const rows = useMemo<MissionTableRow[]>(
    () =>
      missions.map((m) => {
        const isEnded = m.ends_at !== null && new Date(m.ends_at) < now
        const isActive = new Date(m.starts_at) <= now && !isEnded
        return {
          mission: m,
          status: isActive ? '진행 중' : isEnded ? '종료' : '예정',
          completionCount: completionCounts.get(m.id) ?? 0,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missions, completionCounts]
  )

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.accessor((r) => r.mission.title, {
        id: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="미션" />,
        enableHiding: false,
        // v9는 `sortingFn`(v8)이 아니라 `sortFn`이다 — `features.ts`에 등록한 이름(text)을 그대로 참조.
        sortFn: 'text',
        cell: ({ row }) => <span className="font-medium">{row.original.mission.title}</span>,
      }),
      columnHelper.accessor((r) => r.mission.mission_type, {
        id: 'type',
        header: '타입',
        enableSorting: false,
        meta: { label: '타입' },
        cell: ({ row }) => <span>{missionTypeLabel(row.original.mission.mission_type)}</span>,
      }),
      columnHelper.display({
        id: 'period',
        header: '기간',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const m = row.original.mission
          return (
            <span className="text-xs text-muted-foreground">
              {new Date(m.starts_at).toLocaleDateString('ko-KR')} ~<br />
              {m.ends_at ? new Date(m.ends_at).toLocaleDateString('ko-KR') : '상시'}
            </span>
          )
        },
      }),
      columnHelper.accessor((r) => r.completionCount, {
        id: 'completion',
        header: ({ column }) => <DataTableColumnHeader column={column} title="달성" />,
        meta: { label: '달성' },
        cell: ({ row }) => (
          <span>
            {row.original.completionCount}
            {row.original.mission.max_completions ? `/${row.original.mission.max_completions}` : ''}명
          </span>
        ),
      }),
      columnHelper.accessor((r) => r.status, {
        id: 'status',
        header: '상태',
        enableSorting: false,
        meta: { label: '상태' },
        cell: ({ row }) => {
          const status = row.original.status
          const cls =
            status === '진행 중'
              ? 'bg-neutral-900/20 text-neutral-900'
              : status === '종료'
                ? 'bg-neutral-100 text-neutral-500'
                : 'bg-amber-50 text-amber-600'
          return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex gap-3">
            <button onClick={() => onEdit(row.original.mission)} className="text-xs hover:opacity-70">
              수정
            </button>
            <button
              onClick={() => onDelete(row.original.mission.id)}
              className="text-xs text-red-600 hover:text-red-700"
            >
              삭제
            </button>
          </div>
        ),
      }),
    ]),
    [onEdit, onDelete]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.mission.id,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="미션 없음" />
    </div>
  )
}

export const MissionTable = memo(MissionTableInner)
