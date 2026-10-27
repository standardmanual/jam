'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { balanceItemIdSet, buildBalanceView } from '@/lib/admin/opsInbox/balance/view'
import { findRevertTarget } from '@/lib/admin/opsInbox/edit'
import { executeToast, readExecuteResult, scheduledItemIds } from '@/lib/admin/opsInbox/executeView'
import { formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import {
  isDecidable,
  isItemChecked,
  nextDecidableItemId,
  splitByChecked,
  withAllChecked,
  withCheck,
  withItemsChecked,
  type CheckOverrides,
} from '@/lib/admin/opsInbox/selection'
import type { OpsBundleExecution, OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { OpsBundleWorkspace, type OpsBundleWorkspaceProps } from './OpsBundleWorkspace'
import { OpsExecuteBundle } from './OpsExecuteBundle'
import { OpsItemEditForm } from './OpsItemEditForm'
import { OpsImageProduction } from './OpsImageProduction'
import { OpsColorPairPicker } from './OpsColorPairPicker'
import { OpsDecisionPanel } from './OpsDecisionPanel'
import { OpsMixTrialNotice } from './OpsMixTrialNotice'
import { OpsItemFooter, useOpsItemResultHandlers } from './OpsItemFooter'
import { useItemImageProduction } from './useItemImageProduction'

/**
 * 결정 슬롯을 채운 기획 상세 (티켓 20260930_1818). 기획 상세(S3) 페이지가 셸(`OpsBundleWorkspace`) 대신 이 래퍼를 그린다.
 *
 * 셸의 슬롯은 함수라 서버 컴포넌트에서 넘길 수 없다 — 그래서 client 래퍼가 슬롯 갈래를 채운다.
 * - `barAction`: 「N건 승인하고 예약」과 요약창 (`OpsExecuteBundle`, 티켓 20261026_2031). 승인과 예약을 한 버튼이 한다. 승인할 검토중 항목이나 승인됨 항목이 있을 때 나온다
 * - `panel`: 결정 패널 머리 (`OpsDecisionPanel`, 티켓 20261026_2024). 이유 칩·이번 기획의 핵심·종류별로 고르기. 종류 체크는 아래 `overrides`를 항목마다 덮어쓴다(새 상태 없음)
 * - `rowLead`·`listHeader`: 행 체크박스와 「전체 선택 · 결정할 것 12개 중 11개 선택」. 패턴 제안은 예약 대상이 아니라 체크박스가 없다(항목 서랍에서 「패턴 사전에 넣기」로 처리한다)
 * - `detailFooter`: 항목 상태별 결정 줄(`OpsItemFooter`, 티켓 20261006_1537 ③-b가 `OpsItemActions`·`OpsCancelItem`·`OpsEndItem` 분기와 결과 처리를 일정표 서랍과 함께 쓰도록 옮겼다):
 *   「예약됨」 항목이면 안내와 [공개 전 취소하기] (티켓 20261002_1649), 「게재중」이고 지금 종료가 있는 종류면 안내와 [지금 종료하기] (티켓 20261006_1038 ⑪-b), 그 밖에는 반려·수정(패턴 제안은 「패턴 사전에 넣기」도)
 * - `detailEdit`: 직접 수정 양식 (`OpsItemEditForm`)
 * - `detailHistoryAction`: 「마지막 수정 되돌리기」(수정 내역이 있는 검토중 항목만, 확인창 없음)
 *
 * 체크 상태는 사람이 바꾼 것만 항목 수정 시각과 함께 기억하고 나머지는 항목에서 계산한다(`selection.ts`) — 서버 화면을 다시 읽어 항목이
 * 바뀌면 새 항목 기준의 기본 체크(검토중이면서 형식 오류 없음)로 저절로 돌아간다. 결정이 끝나면 토스트를 띄우고 `router.refresh()`로
 * 서버 화면을 다시 읽고, 항목 하나를 결정했으면 다음 결정 전 항목을 선택한다.
 */

const PATTERN_PROPOSAL_KIND = 'pattern_proposal'

type OpsDecisionWorkspaceProps = Pick<
  OpsBundleWorkspaceProps,
  'bundleId' | 'bundleFormatErrors' | 'items' | 'decisions' | 'balance' | 'isSample' | 'previewNames'
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
  previewNames,
}: OpsDecisionWorkspaceProps) {
  const [overrides, setOverrides] = useState<CheckOverrides>({})
  const { decidable: reviewing, checked: reviewingChecked } = useMemo(() => splitByChecked(items, overrides), [items, overrides])
  // 패턴 제안은 승인 즉시 종료라 예약 대상이 아니다. 체크·건수·요약창에서 뺀다.
  const decidable = useMemo(() => reviewing.filter((item) => item.kind !== PATTERN_PROPOSAL_KIND), [reviewing])
  const checked = useMemo(() => reviewingChecked.filter((item) => item.kind !== PATTERN_PROPOSAL_KIND), [reviewingChecked])
  const checkedIds = useMemo(() => new Set(checked.map((item) => item.id)), [checked])
  const allChecked = decidable.length > 0 && checked.length === decidable.length
  // 결정 패널의 「확인 필요」: 밸런스 경고가 붙은 항목과 형식 오류가 있는 항목의 합집합.
  const needsCheckIds = useMemo(() => {
    const ids = new Set(balanceItemIdSet(buildBalanceView(balance)))
    for (const item of items) if (item.formatErrors.length > 0) ids.add(item.id)
    return ids
  }, [balance, items])

  const handlers = useOpsItemResultHandlers({ bundleId })
  const { refresh } = handlers
  const imageProduction = useItemImageProduction({ bundleId, isSample: isSample ?? false, onDone: refresh })

  /** 승인하고 예약이 끝났을 때. 결과 문장은 `executeToast`가 만들고, 결정 기록을 남기지 못했으면 경고 토스트를 하나 더 띄운다. */
  const handleExecuted = (data: Record<string, unknown>) => {
    const toastResult = executeToast(readExecuteResult(data))
    if (toastResult.level === 'warning') toast.warning(toastResult.message)
    else toast.success(toastResult.message)
    if (toastResult.logWarning) toast.warning(toastResult.logWarning)
    refresh()
    // 승인과 예약이 한 번에 일어나므로 예약된 항목의 이미지를 여기서 만든다. 실패해도 예약은 그대로다.
    void imageProduction.startMany(scheduledItemIds(data), items)
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
      makingItemIds={imageProduction.making}
      previewNames={previewNames}
      previewAction={(item, ctx) => (
        <>
          <OpsMixTrialNotice item={item} />
          <OpsColorPairPicker bundleId={bundleId} item={item} ctx={ctx} onFilled={handlers.handleColorFilled} onConflict={refresh} />
          <OpsImageProduction item={item} items={items} isSample={isSample ?? false} production={imageProduction} />
        </>
      )}
      panel={(ctx) => (
        <OpsDecisionPanel
          items={items}
          needsCheckIds={needsCheckIds}
          checkedIds={checkedIds}
          approvableCount={checked.length + execution.readyCount}
          onSetChecked={(itemIds, value) => setOverrides((current) => withItemsChecked(current, items, itemIds, value))}
          onSelectItem={ctx.selectItem}
        />
      )}
      barAction={() =>
        decidable.length > 0 || execution.approvedCount > 0 ? (
          <OpsExecuteBundle
            bundleId={bundleId}
            items={items}
            checkedReviewingIds={checkedIds}
            approvableCount={checked.length + execution.readyCount}
            approvedCount={execution.approvedCount}
            isSample={isSample ?? false}
            onExecuted={handleExecuted}
            onConflict={refresh}
          />
        ) : null
      }
      rowLead={(item) =>
        isDecidable(item) && item.kind !== PATTERN_PROPOSAL_KIND ? (
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
      detailFooter={(item, ctx) => (
        <OpsItemFooter
          bundleId={bundleId}
          item={item}
          ctx={ctx}
          isSample={isSample ?? false}
          handlers={handlers}
          imageProduction={imageProduction}
          onDecided={(_kind, itemId) => {
            const next = nextDecidableItemId(items, itemId)
            if (next) ctx.selectItem(next)
          }}
        />
      )}
      detailEdit={(item, ctx) =>
        item.status === 'reviewing' && ctx.draft?.itemId === item.id ? (
          <OpsItemEditForm bundleId={bundleId} item={item} ctx={ctx} onSaved={handlers.handleSaved} onConflict={refresh} />
        ) : null
      }
      detailHistoryAction={(item) =>
        item.status === 'reviewing' && findRevertTarget(decisions.filter((decision) => decision.itemId === item.id)) ? (
          <RevertLastEditButton onRevert={() => handlers.revert(item.id)} />
        ) : null
      }
    />
  )
}
