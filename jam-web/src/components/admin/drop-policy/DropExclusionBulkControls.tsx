'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DataTableBulkActionBar, type DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import type { UseCrossPageSelectionResult } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { runBulk, fetchListIds } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import type { ExclusionTab } from '@/lib/admin/drop-exclusion-list'

interface DropExclusionBulkControlsProps {
  tab: ExclusionTab
  /** 현재 페이지에 보이는 행 ID — 전체 선택 배너 판정용 */
  pageIds: string[]
  /** 현재 필터 조건에 맞는 전체 건수 */
  totalCount: number
  selection: UseCrossPageSelectionResult
}

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/drop-policy/exclusions/bulk'
const IDS_ENDPOINT = '/api/admin/drop-policy/exclusions/ids'

type Action = 'exclude' | 'include'

const ACTION_META: Record<Action, { title: string; verb: string; button: string; toastVerb: string }> = {
  exclude: { title: '드랍에서 제외', verb: '드랍에서 제외', button: '제외', toastVerb: '제외' },
  include: { title: '드랍 제외 해제', verb: '제외 해제', button: '해제', toastVerb: '해제' },
}

/**
 * 드랍 제외 관리 표 위의 전체 선택 배너·일괄 바·확인창(티켓 20260924_0948, 상위 티켓 §4.4) — 두
 * 탭(아이템배지·컬렉션)이 같은 동작을 하므로 한 곳에 둔다. 제외·해제 모두 되돌릴 수 있는 등급 1이라
 * "N건을 ○○할까요?" 확인창만 거치고, 요청은 서버 일괄 처리 한 번이다.
 */
export function DropExclusionBulkControls({ tab, pageIds, totalCount, selection }: DropExclusionBulkControlsProps) {
  const router = useRouter()
  const { filterQuery } = useListParams()
  const { selectedIds, selectIds, clear } = selection

  const [pending, setPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState<Action | null>(null)

  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams({ ...filterQuery, tab })
    return fetchListIds(`${IDS_ENDPOINT}?${params.toString()}`)
  }

  const run = async (action: Action) => {
    setPending(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, {
        ids: selectedIds,
        action,
        payload: { entity: tab === 'badges' ? 'badge' : 'collection' },
      })
      toastBulkResult(result, { verb: ACTION_META[action].toastVerb })
      clear()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해주세요.')
    } finally {
      setPending(false)
      setConfirmAction(null)
    }
  }

  const actions: DataTableBulkAction[] = [
    { key: 'exclude', label: ACTION_META.exclude.button, onClick: () => setConfirmAction('exclude'), disabled: pending },
    { key: 'include', label: ACTION_META.include.button, onClick: () => setConfirmAction('include'), disabled: pending },
  ]

  return (
    <>
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

      {confirmAction && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) setConfirmAction(null)
          }}
          level={1}
          title={ACTION_META[confirmAction].title}
          verb={ACTION_META[confirmAction].verb}
          count={selectedIds.length}
          pending={pending}
          onConfirm={() => run(confirmAction)}
        >
          <p className="text-sm text-muted-foreground">
            {confirmAction === 'exclude'
              ? '드랍 후보에서만 빠집니다. 화면 노출과 이미 보유한 유저 이력에는 영향이 없습니다.'
              : '다시 드랍 후보에 들어갑니다.'}
          </p>
        </BulkConfirmDialog>
      )}
    </>
  )
}
