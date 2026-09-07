'use client'

import { memo, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'
import type { MissionRow } from '@/types/database'
import { missionTypeLabel } from '@/lib/admin/badge-labels'
import { checkMissionConditionValue } from '@/lib/missions/condition-keys'

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
 * 다중선택 일괄 삭제(20260907_1134) — 참여 이력에 `ON DELETE CASCADE`가 걸려 있어
 * `20260826_015`에서 의도적으로 뺐던 기능이다. 참조 가드(`lib/admin/reference-guards.ts`)를
 * 새로 만들어 참조가 있는 미션은 차단하는 조건으로 다시 추가한다. 상태 컬럼은 여전히
 * 저장된 값이 아니라 시작/종료일에서 파생되는 값이라 소프트 삭제 대상이 아니다 — 일괄
 * 액션은 하드 삭제 하나뿐이다.
 *
 * `React.memo`로 감싸 저작 폼에 입력할 때마다 목록 전체가 리렌더되는 걸 막는다(20260826_011 A3).
 */
function MissionTableInner({ missions, completionCounts, onEdit, onDelete }: MissionTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const now = new Date()

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰에서 발견된 회귀 방지, BadgesTable.tsx와 동일 패턴).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  // 필터·정렬로 목록이 바뀌면 이전 선택은 다른 행을 가리킬 수 있다 — 렌더 중 비교해 초기화
  // (BadgesTable.tsx와 동일 패턴).
  const [prevMissions, setPrevMissions] = useState(missions)
  if (missions !== prevMissions) {
    setPrevMissions(missions)
    setRowSelection({})
  }

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
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="전체 선택"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="행 선택"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
      columnHelper.accessor((r) => r.mission.title, {
        id: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="미션" />,
        enableHiding: false,
        // v9는 `sortingFn`(v8)이 아니라 `sortFn`이다 — `features.ts`에 등록한 이름(text)을 그대로 참조.
        sortFn: 'text',
        cell: ({ row }) => {
          const m = row.original.mission
          // 조건 값이 깨진 미션(예: item_collect인데 badge_id null) 표시 — ②의 검증 함수를
          // 그대로 재사용한다(별도 판정 로직 금지, 티켓 20260905_1327). 편집 폼을 열어야만
          // 알 수 있던 상태를 목록에서 바로 알아볼 수 있게 한다.
          const conditionError = checkMissionConditionValue(m.mission_type, m.condition_json).error
          return (
            <span className="font-medium inline-flex items-center gap-2">
              {m.title}
              {conditionError && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 shrink-0"
                  title={conditionError}
                >
                  목표 미지정
                </span>
              )}
            </span>
          )
        },
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
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original.mission)
  const selectedIds = selectedRows.map((m) => m.id)

  // 일괄 삭제는 진짜 배치 엔드포인트를 쓴다(순차 단건 DELETE 반복이 아니다) — 참조가 있는
  // 미션은 서버가 건너뛰고 항목별 사유를 돌려준다(티켓 20260907_1134).
  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/missions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error ?? '일괄 삭제 중 오류가 발생했습니다.')
      } else {
        const blocked = (data?.blocked ?? []) as { id: string; reason: string }[]
        const deleted = (data?.deleted ?? []) as string[]
        if (blocked.length > 0) {
          const titleOf = (id: string) => selectedRows.find((m) => m.id === id)?.title ?? id
          const detail = blocked.map((b) => `${titleOf(b.id)}: ${b.reason}`).join(' / ')
          alert(`${deleted.length}건 삭제됨, ${blocked.length}건은 참조가 있어 건너뜀 (${detail})`)
        }
      }
      router.refresh()
      setRowSelection({})
    } finally {
      setBulkLoading(false)
      setShowBulkConfirm(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="destructive" size="sm" onClick={() => setShowBulkConfirm(true)}>
          선택 항목 삭제
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="미션 없음" />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>미션 일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}개 미션을 삭제합니다. 삭제하면 되돌릴 수 없습니다. 참여·완료
              이력이 있는 미션은 삭제되지 않고 결과에서 안내됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => setShowBulkConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={bulkLoading} onClick={handleBulkDelete}>
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const MissionTable = memo(MissionTableInner)
