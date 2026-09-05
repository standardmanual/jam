'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
  type Updater,
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
import { BadgeActiveToggleButton } from './BadgeActiveToggleButton'
import type { BadgeCondition, BadgeRarity } from '@/types/database'
import type { BadgeListRow } from './BadgeList'
import { badgeTypeLabel } from '@/lib/admin/badge-labels'
import { formatConditionChips } from '@/lib/badge-engine/conditionRegistry'

const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-600',
  rare: 'text-blue-600',
  epic: 'text-violet-600',
  mystic: 'text-amber-600',
}

const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  mystic: 'Mystic',
}

/** "YYYY.MM.DD" 형식으로 날짜 포맷 */
function formatYmd(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

/**
 * condition_json을 간단한 칩 목록으로 변환.
 *
 * 문구는 조건 필드 메타 레지스트리(`conditionRegistry.ts`)가 단일 출처다(티켓 20260905_0028).
 * 예전에는 이 파일이 필드마다 한글을 하드코딩하고 있어(계절·요일 표기까지 BadgeDetail과
 * 따로 복제), 새 조건 필드가 추가돼도 목록에는 아무 칩도 나타나지 않았다.
 */
function conditionSummary(c: BadgeCondition | null): string[] {
  return formatConditionChips(c)
}

/** URL의 `sort` 파라미터 ↔ TanStack `SortingState` 변환 — "이름" 컬럼만 헤더 클릭으로 정렬한다.
 *  최신순/오래된순(created_at 기준)은 컬럼이 없어 헤더 클릭 대상이 아니다 — 필터바의
 *  정렬 드롭다운이 계속 그 두 값을 담당한다(모바일 카드 뷰도 같은 정렬을 쓰기 때문에
 *  데스크탑 헤더 클릭만으로는 대체할 수 없다). */
function paramToSorting(sort: string | null): SortingState {
  if (sort === 'name_asc') return [{ id: 'name', desc: false }]
  if (sort === 'name_desc') return [{ id: 'name', desc: true }]
  return []
}

function sortingToParam(sorting: SortingState): string | null {
  const nameSort = sorting.find((s) => s.id === 'name')
  if (!nameSort) return null
  return nameSort.desc ? 'name_desc' : 'name_asc'
}

interface BadgesTableProps {
  badges: BadgeListRow[]
  factionMap?: Map<string, string>
}

const columnHelper = createColumnHelper<DataTableFeatures, BadgeListRow>()

export default function BadgesTable({ badges, factionMap = new Map() }: BadgesTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰에서 alert-dialog.tsx 팔레트 전환 후 미연결 시 흰
  // 배경 위 흰 글씨로 안 보이는 회귀를 발견해 추가).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  // 필터·정렬·페이지 이동으로 목록(badges)이 바뀌면 이전 선택은 다른 행을 가리킬 수 있다 —
  // 렌더 중 이전 값과 비교해 초기화한다("Adjusting state when a prop changes" 패턴,
  // useEffect로 하면 리렌더가 한 번 더 발생한다: react-hooks/set-state-in-effect).
  const [prevBadges, setPrevBadges] = useState(badges)
  if (badges !== prevBadges) {
    setPrevBadges(badges)
    setRowSelection({})
  }

  const sorting = useMemo(() => paramToSorting(searchParams.get('sort')), [searchParams])

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const params = new URLSearchParams(searchParams.toString())
    const sortParam = sortingToParam(next)
    if (sortParam) params.set('sort', sortParam)
    else params.delete('sort')
    params.delete('page')
    router.push(`/admin/badges?${params.toString()}`)
  }

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
      columnHelper.accessor('image_url', {
        id: 'image',
        header: '이미지',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
            {row.original.image_url ? (
              <Image
                src={row.original.image_url}
                alt={row.original.name}
                width={40}
                height={40}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-gray-400 text-xs">—</span>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('name', {
        id: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
        enableHiding: false,
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      }),
      columnHelper.accessor('deleted_at', {
        id: 'status',
        header: '상태',
        enableSorting: false,
        meta: { label: '상태' },
        cell: ({ getValue }) => {
          const deletedAt = getValue()
          return deletedAt ? (
            <span className="inline-flex items-center px-2 py-1 bg-red-50 border border-red-200 rounded-full text-red-600 text-xs font-semibold whitespace-nowrap">
              비활성화됨 · {formatYmd(deletedAt)} 회수
            </span>
          ) : (
            <span className="text-gray-500 text-xs">활성</span>
          )
        },
      }),
      columnHelper.accessor('type', {
        id: 'type',
        header: '타입',
        enableSorting: false,
        meta: { label: '타입' },
        cell: ({ getValue }) => (
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
            {badgeTypeLabel(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('rarity', {
        id: 'rarity',
        header: '희귀도',
        enableSorting: false,
        meta: { label: '희귀도' },
        cell: ({ getValue }) => {
          const rarity = getValue()
          return (
            <span className={`font-semibold text-sm ${(rarity ? RARITY_COLOR[rarity] : '') || ''}`}>
              {/* 무한레벨형은 등급이 없다(마이그레이션 130) — 레벨 표기는 티켓 20260905_0032/0034 */}
              {rarity ? RARITY_LABEL[rarity as BadgeRarity] : '—'}
            </span>
          )
        },
      }),
      columnHelper.accessor('faction_id', {
        id: 'faction',
        header: '세계관',
        enableSorting: false,
        meta: { label: '세계관' },
        cell: ({ getValue }) => {
          const factionId = getValue()
          return <span className="text-sm">{factionId ? (factionMap.get(factionId) ?? '—') : '—'}</span>
        },
      }),
      columnHelper.accessor('activity_types', {
        id: 'activity',
        header: '활동',
        enableSorting: false,
        meta: { label: '활동' },
        cell: ({ getValue }) => {
          const types = getValue()
          return <span className="text-sm">{types?.length ? types.join(', ') : '—'}</span>
        },
      }),
      columnHelper.accessor('condition_json', {
        id: 'condition',
        header: '조건',
        enableSorting: false,
        meta: { label: '조건' },
        cell: ({ getValue }) => {
          const chips = conditionSummary(getValue() as BadgeCondition | null)
          if (chips.length === 0) return <span className="text-gray-500 text-xs">없음</span>
          return (
            <div className="flex flex-wrap gap-1 max-w-xs">
              {chips.slice(0, 2).map((chip, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 whitespace-nowrap">
                  {chip}
                </span>
              ))}
              {chips.length > 2 && <span className="text-xs text-gray-500">+{chips.length - 2}</span>}
            </div>
          )
        },
      }),
      columnHelper.accessor('patch_available', {
        id: 'patch',
        header: '패치',
        enableSorting: false,
        meta: { label: '패치' },
        // display 컬럼(accessorFn 없음)은 DataTableViewOptions 목록에서 자동 제외된다(공식
        // 패턴) — "패치"는 컬럼 표시 토글 대상이라 accessor 컬럼으로 정의한다.
        cell: ({ row }) =>
          row.original.patch_available ? (
            <span className="text-emerald-600 font-medium text-sm">
              {row.original.patch_price_krw?.toLocaleString()}원
            </span>
          ) : (
            <span className="text-gray-500 text-sm">—</span>
          ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '액션',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <BadgeActiveToggleButton badgeId={row.original.id} isActive={!row.original.deleted_at} />
            <Link href={`/admin/badges/${row.original.id}`}>
              <Button variant="outline" size="sm" className="h-8">
                상세보기
              </Button>
            </Link>
          </div>
        ),
      }),
    ]),
    [factionMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: badges,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id)

  // 일괄 삭제 전용 API는 없다(티켓 사전 확인 결과) — 기존 단건 PATCH를 선택된 행 전체에
  // 순차 호출한다(20260826_014 요구사항). 배지 목록 페이지 크기가 50건이라 규모상 문제없다.
  const handleBulkDeactivate = async () => {
    setBulkLoading(true)
    try {
      let failCount = 0
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/badges/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: false }),
        })
        if (!res.ok) failCount += 1
      }
      if (failCount > 0) {
        alert(`${failCount}개 배지의 상태 변경에 실패했습니다. 다시 시도해주세요.`)
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
          선택 항목 비활성화
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="등록된 배지가 없습니다." />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>배지 일괄 비활성화</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}개 배지를 비활성화하면 이미 획득한 유저에게 더 이상 보이지
              않습니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => setShowBulkConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={bulkLoading} onClick={handleBulkDeactivate}>
              계속
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
