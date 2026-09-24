'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import type { DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { fetchListIds, runBulk } from '@/components/admin/data-table/admin-fetch'
import { EXTEND_DAY_OPTIONS } from '@/lib/admin/abusing-bulk'

type SanctionAction = 'release' | 'extend'

interface SanctionBulkConfig {
  /** `POST /api/admin/abusing/<탭>/bulk` */
  bulkEndpoint: string
  /** `GET /api/admin/abusing/<탭>/ids` */
  idsEndpoint: string
  /** 확인창 제목에 붙이는 이름(섀도우밴·POI 블록) */
  noun: string
  selectedIds: string[]
  clear: () => void
  /** 현재 필터 조건(`useListParams().filterQuery`) — "이 조건의 N건 모두 선택"이 그대로 서버에 넘긴다 */
  filterQuery: Record<string, string>
  /** 해제 미리보기(`impact`)를 확인창 문장으로 바꾼다 */
  releaseImpact: (impact: Record<string, number>) => ReactNode
}

const DEFAULT_EXTEND_DAYS = 7

/**
 * 제재·POI 차단 표가 함께 쓰는 일괄 처리 조합(티켓 20260924_0952) — [해제]·[만료 연장] 두
 * 동작이 모두 위험 등급 2라, 누르면 서버에 미리보기(`dry_run`)를 먼저 물어 영향 건수를 확인창에
 * 띄운다. 실행은 서버에 요청 한 번이다(단건 요청을 반복하지 않는다).
 */
export function useSanctionBulk({ bulkEndpoint, idsEndpoint, noun, selectedIds, clear, filterQuery, releaseImpact }: SanctionBulkConfig) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [action, setAction] = useState<SanctionAction | null>(null)
  const [impact, setImpact] = useState<Record<string, number> | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [extendDays, setExtendDays] = useState<number>(DEFAULT_EXTEND_DAYS)
  // 일수 버튼을 연달아 누를 때 늦게 돌아온 이전 미리보기가 최신 값을 덮지 않게 한다
  const requestSeq = useRef(0)

  const closeConfirm = () => {
    requestSeq.current += 1
    setAction(null)
    setImpact(null)
    setImpactLoading(false)
  }

  const loadImpact = async (next: SanctionAction, days: number) => {
    const seq = ++requestSeq.current
    setImpact(null)
    setImpactLoading(true)
    try {
      const result = await runBulk(bulkEndpoint, {
        ids: selectedIds,
        action: next,
        payload: next === 'extend' ? { days } : undefined,
        dry_run: true,
      })
      if (seq === requestSeq.current) setImpact(result.impact ?? {})
    } catch (error) {
      if (seq !== requestSeq.current) return
      toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했어요.')
      closeConfirm()
    } finally {
      if (seq === requestSeq.current) setImpactLoading(false)
    }
  }

  const openConfirm = (next: SanctionAction) => {
    setAction(next)
    setExtendDays(DEFAULT_EXTEND_DAYS)
    void loadImpact(next, DEFAULT_EXTEND_DAYS)
  }

  const pickExtendDays = (days: number) => {
    setExtendDays(days)
    void loadImpact('extend', days)
  }

  const runAction = async () => {
    if (!action) return
    setPending(true)
    try {
      const result = await runBulk(bulkEndpoint, {
        ids: selectedIds,
        action,
        payload: action === 'extend' ? { days: extendDays } : undefined,
      })
      toastBulkResult(result, { verb: action === 'release' ? '해제' : '연장' })
      if ((result as { logged?: boolean }).logged === false) {
        toast.warning('해제는 끝났지만 해제 기록을 남기지 못했어요. 개발자에게 알려 주세요.')
      }
      clear()
      closeConfirm()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  const fetchAllIds = () => fetchListIds(`${idsEndpoint}?${new URLSearchParams(filterQuery).toString()}`)

  const actions: DataTableBulkAction[] = [
    { key: 'release', label: '해제', onClick: () => openConfirm('release'), disabled: pending },
    { key: 'extend', label: '만료 연장', onClick: () => openConfirm('extend'), disabled: pending },
  ]

  const extendImpactText = (values: Record<string, number>): ReactNode => (
    <>
      다시 적용될 만료된 {noun} {values.reapplyCount ?? 0}건
      {(values.permanentCount ?? 0) > 0 && <>, 건너뛸 영구 {noun} {values.permanentCount}건</>}
    </>
  )

  const dialogs = action && (
    <BulkConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) closeConfirm()
      }}
      level={2}
      title={action === 'release' ? `${noun} 해제` : `${noun} 만료 연장`}
      verb={action === 'release' ? '해제' : '연장'}
      count={selectedIds.length}
      impact={impact ? (action === 'release' ? releaseImpact(impact) : extendImpactText(impact)) : null}
      impactLoading={impactLoading}
      pending={pending}
      onConfirm={runAction}
    >
      {action === 'extend' && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-700">지금부터 며칠 뒤까지로 늦출까요?</p>
          <div className="flex flex-wrap gap-2">
            {EXTEND_DAY_OPTIONS.map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={extendDays === days ? 'default' : 'outline'}
                disabled={pending}
                onClick={() => pickExtendDays(days)}
              >
                {days}일
              </Button>
            ))}
          </div>
        </div>
      )}
    </BulkConfirmDialog>
  )

  return { actions, dialogs, fetchAllIds, pending }
}
