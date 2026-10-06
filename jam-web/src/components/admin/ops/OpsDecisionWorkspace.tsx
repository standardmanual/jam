'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { findRevertTarget } from '@/lib/admin/opsInbox/edit'
import { canEndItem, cancelToast, endToast, executeToast, readExecuteResult } from '@/lib/admin/opsInbox/executeView'
import { formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import {
  isDecidable,
  isItemChecked,
  nextDecidableItemId,
  splitByChecked,
  withAllChecked,
  withCheck,
  type CheckOverrides,
} from '@/lib/admin/opsInbox/selection'
import type { OpsBundleExecution, OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { OpsBulkApprove, bulkResultMessage } from './OpsBulkApprove'
import { OpsBundleWorkspace, type OpsBundleWorkspaceProps, type OpsWorkspaceContext } from './OpsBundleWorkspace'
import { OpsCancelItem } from './OpsCancelItem'
import { postDecision } from './decisionClient'
import { OpsEndItem } from './OpsEndItem'
import { OpsExecuteBundle } from './OpsExecuteBundle'
import { OpsItemActions } from './OpsItemActions'
import { OpsItemEditForm } from './OpsItemEditForm'

/**
 * 결정 슬롯을 채운 기획 상세 (티켓 20260930_1818). 기획 상세(S3) 페이지가 셸(`OpsBundleWorkspace`) 대신 이 래퍼를 그린다.
 *
 * 셸의 슬롯은 함수라 서버 컴포넌트에서 넘길 수 없다 — 그래서 client 래퍼가 슬롯 갈래를 채운다.
 * - `barAction`: 「N개 승인하기」와 요약 창 (`OpsBulkApprove`), 그 오른쪽에 「N개 예약 등록하기」와 요약창 (`OpsExecuteBundle`, 승인됨 항목이 있을 때만. 티켓 20261002_1648)
 * - `rowLead`·`listHeader`: 행 체크박스와 「전체 선택 · 결정할 것 12개 중 11개 선택」
 * - `detailFooter`: 「예약됨」 항목이면 안내와 [공개 전 취소하기] (`OpsCancelItem`, 티켓 20261002_1649), 「게재중」이고 지금 종료가 있는 종류면 안내와 [지금 종료하기]
 *   (`OpsEndItem`, 티켓 20261006_1038 ⑪-b), 그 밖에는 반려·수정·승인 (`OpsItemActions`)
 * - `detailEdit`: 직접 수정 양식 (`OpsItemEditForm`)
 * - `detailHistoryAction`: 「마지막 수정 되돌리기」(수정 내역이 있는 검토중 항목만, 확인창 없음)
 *
 * 체크 상태는 사람이 바꾼 것만 항목 수정 시각과 함께 기억하고 나머지는 항목에서 계산한다(`selection.ts`) — 서버 화면을 다시 읽어 항목이
 * 바뀌면 새 항목 기준의 기본 체크(검토중이면서 형식 오류 없음)로 저절로 돌아간다. 결정이 끝나면 토스트를 띄우고 `router.refresh()`로
 * 서버 화면을 다시 읽고, 항목 하나를 결정했으면 다음 결정 전 항목을 선택한다.
 */

const UNDO_TOAST_MS = 10_000

type OpsDecisionWorkspaceProps = Pick<
  OpsBundleWorkspaceProps,
  'bundleId' | 'bundleFormatErrors' | 'items' | 'decisions' | 'balance' | 'isSample'
> & {
  /** 서버 로더가 센 예약 등록 요약(승인됨 수·예약할 항목 수). 레지스트리를 화면으로 끌어오지 않으려고 계산은 서버가 한다. */
  execution: OpsBundleExecution
}

/** 「마지막 수정 되돌리기」 버튼. 확인창 없이 바로 요청하고, 요청 중에는 다시 눌리지 않는다. */
function RevertLastEditButton({ onRevert }: { onRevert: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await onRevert()
        setPending(false)
      }}
    >
      {pending ? '되돌리는 중' : '마지막 수정 되돌리기'}
    </Button>
  )
}

export function OpsDecisionWorkspace({
  bundleId,
  bundleFormatErrors,
  items,
  decisions,
  balance,
  isSample,
  execution,
}: OpsDecisionWorkspaceProps) {
  const router = useRouter()
  const [overrides, setOverrides] = useState<CheckOverrides>({})
  const { decidable, checked, excluded } = useMemo(() => splitByChecked(items, overrides), [items, overrides])
  const allChecked = decidable.length > 0 && checked.length === decidable.length

  const refresh = () => router.refresh()

  /** 되돌리기 요청. 저장 토스트의 버튼과 「마지막 수정 되돌리기」가 같은 요청을 부른다. */
  const revert = async (itemId: string) => {
    const result = await postDecision(bundleId, { action: 'revert', itemId })
    if (result.ok) {
      toast.success('수정을 되돌렸어요')
      refresh()
      return
    }
    toast.error(result.error)
    if (result.status === 409) refresh()
  }

  const handleSaved = (itemId: string) => {
    toast.success('수정을 저장했어요', {
      duration: UNDO_TOAST_MS,
      action: { label: '되돌리기', onClick: () => void revert(itemId) },
    })
    refresh()
  }

  const handleDecided = (ctx: OpsWorkspaceContext, kind: 'approve' | 'reject', itemId: string) => {
    toast.success(kind === 'approve' ? '승인했어요' : '반려했어요')
    const next = nextDecidableItemId(items, itemId)
    if (next) ctx.selectItem(next)
    refresh()
  }

  const handleBulkApproved = (ctx: OpsWorkspaceContext, result: { approved: number; skipped: number }) => {
    const message = bulkResultMessage(result.approved, result.skipped)
    if (result.skipped > 0) toast.warning(message)
    else toast.success(message)
    // 보고 있던 항목이 방금 승인됐으면 남은 결정 전 항목으로 옮긴다.
    const approvedIds = new Set(checked.map((item) => item.id))
    if (ctx.selectedItem && approvedIds.has(ctx.selectedItem.id)) {
      const next = nextDecidableItemId(
        items.filter((item) => !approvedIds.has(item.id)),
        ctx.selectedItem.id
      )
      if (next) ctx.selectItem(next)
    }
    refresh()
  }

  /** 예약 등록이 끝났을 때. 결과 문장은 `executeToast`가 만들고, 결정 기록을 남기지 못했으면 경고 토스트를 하나 더 띄운다. */
  const handleExecuted = (data: Record<string, unknown>) => {
    const toastResult = executeToast(readExecuteResult(data))
    if (toastResult.level === 'warning') toast.warning(toastResult.message)
    else toast.success(toastResult.message)
    if (toastResult.logWarning) toast.warning(toastResult.logWarning)
    refresh()
  }

  /** 공개 전 취소가 끝났을 때. 결과 문장은 `cancelToast`가 만들고, 결정 기록을 남기지 못했으면 경고 토스트를 하나 더 띄운다. */
  const handleCancelled = (data: Record<string, unknown>) => {
    const toastResult = cancelToast(data)
    toast.success(toastResult.message)
    if (toastResult.logWarning) toast.warning(toastResult.logWarning)
    refresh()
  }

  /** 지금 종료가 끝났을 때. 결과 문장은 `endToast`가 만들고, 결정 기록을 남기지 못했으면 경고 토스트를 하나 더 띄운다. */
  const handleEnded = (data: Record<string, unknown>) => {
    const toastResult = endToast(data)
    toast.success(toastResult.message)
    if (toastResult.logWarning) toast.warning(toastResult.logWarning)
    refresh()
  }

  /** 항목은 「종료」로 바뀌었는데 자원 종료를 되돌리지 못했을 때. 항목이 바뀌어 창이 사라지므로 서버 문장을 토스트로 보인다. */
  const handleItemEnded = (message: string) => {
    toast.error(message)
    refresh()
  }

  const checkLabel = (item: OpsItemRecord): string => {
    const startsAt = formatKstDayTime(item.startsAt)
    return `${kindLabel(item.kind)}${startsAt ? ` ${startsAt}` : ''} 승인 대상으로 고르기`
  }

  return (
    <OpsBundleWorkspace
      bundleId={bundleId}
      bundleFormatErrors={bundleFormatErrors}
      items={items}
      decisions={decisions}
      balance={balance}
      isSample={isSample}
      barAction={(ctx) => {
        const bulkApprove =
          decidable.length > 0 ? (
            <OpsBulkApprove
              bundleId={bundleId}
              checked={checked}
              excluded={excluded}
              onApproved={(result) => handleBulkApproved(ctx, result)}
              onConflict={refresh}
            />
          ) : null
        const executeBundle =
          execution.approvedCount > 0 ? (
            <OpsExecuteBundle
              bundleId={bundleId}
              items={items}
              readyCount={execution.readyCount}
              isSample={isSample ?? false}
              onExecuted={handleExecuted}
              onConflict={refresh}
            />
          ) : null
        // 일괄 승인 버튼이 함께 있으면 예약 등록 버튼은 그 오른쪽이다. 둘 다 없으면 자리를 잡지 않는다.
        return bulkApprove || executeBundle ? (
          <div className="flex items-start gap-2">
            {bulkApprove}
            {executeBundle}
          </div>
        ) : null
      }}
      rowLead={(item) =>
        isDecidable(item) ? (
          <label className="flex size-10 cursor-pointer items-center justify-center">
            <Checkbox
              checked={isItemChecked(item, overrides)}
              onCheckedChange={(value) => setOverrides((current) => withCheck(current, item, value === true))}
              aria-label={checkLabel(item)}
            />
          </label>
        ) : null
      }
      listHeader={() =>
        decidable.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-background pr-3 text-sm">
            <label className="flex cursor-pointer items-center font-medium">
              <span className="flex size-10 items-center justify-center">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={() => setOverrides((current) => withAllChecked(current, decidable, !allChecked))}
                />
              </span>
              전체 선택
            </label>
            <span className="tabular-nums text-muted-foreground">
              결정할 것 {decidable.length}개 중 {checked.length}개 선택
            </span>
          </div>
        ) : null
      }
      detailFooter={(item, ctx) =>
        item.status === 'scheduled' ? (
          <OpsCancelItem
            bundleId={bundleId}
            item={item}
            items={ctx.items}
            isSample={isSample ?? false}
            onCancelled={handleCancelled}
            onConflict={refresh}
          />
        ) : canEndItem(item) ? (
          <OpsEndItem
            bundleId={bundleId}
            item={item}
            items={ctx.items}
            onEnded={handleEnded}
            onConflict={refresh}
            onItemEnded={handleItemEnded}
          />
        ) : (
          <OpsItemActions
            bundleId={bundleId}
            item={item}
            ctx={ctx}
            onDecided={(kind, itemId) => handleDecided(ctx, kind, itemId)}
            onConflict={refresh}
          />
        )
      }
      detailEdit={(item, ctx) =>
        item.status === 'reviewing' && ctx.draft?.itemId === item.id ? (
          <OpsItemEditForm bundleId={bundleId} item={item} ctx={ctx} onSaved={handleSaved} onConflict={refresh} />
        ) : null
      }
      detailHistoryAction={(item) =>
        item.status === 'reviewing' && findRevertTarget(decisions.filter((decision) => decision.itemId === item.id)) ? (
          <RevertLastEditButton onRevert={() => revert(item.id)} />
        ) : null
      }
    />
  )
}
