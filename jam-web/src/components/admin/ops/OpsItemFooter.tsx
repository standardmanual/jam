'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { canEndItem, cancelToast, endToast } from '@/lib/admin/opsInbox/executeView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import type { OpsWorkspaceContext } from './OpsBundleWorkspace'
import { OpsCancelItem } from './OpsCancelItem'
import { postDecision } from './decisionClient'
import { OpsEndItem } from './OpsEndItem'
import { OpsItemActions } from './OpsItemActions'
import type { ItemImageProduction } from './useItemImageProduction'

/**
 * 항목 하나의 결정 줄과 결과 처리 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 「결합 주의」 — `OpsDecisionWorkspace`의 푸터 분기를 빼서 S3와 일정표 서랍이 같이 쓴다).
 *
 * - `useOpsItemResultHandlers`: 결정 요청이 끝난 뒤의 토스트와 화면 새로 읽기(수정 저장·되돌리기·승인·반려·공개 전 취소·지금 종료). 토스트 문장은 S3와 서랍이 같다.
 *   화면을 다시 읽는 방법(`onRefresh`)만 쓰는 쪽이 정한다 — S3는 `router.refresh()`(기본), 일정표 서랍은 서랍 자기 데이터도 다시 받는다.
 * - `OpsItemFooter`: 항목 상태에 따른 고정 줄. 예약됨이면 [공개 전 취소하기](`OpsCancelItem`), 게재중이고 지금 종료가 있는 종류면 [지금 종료하기](`OpsEndItem`), 그 밖에는 반려·수정·승인(`OpsItemActions`).
 *   `statusNotice`가 글을 돌려주는 상태는 결정 줄 대신 그 글을 그린다(일정표 서랍의 「승인됨」·「도착」 안내).
 */

const UNDO_TOAST_MS = 10_000

export interface OpsItemResultOptions {
  bundleId: string
  /** 결과를 반영해 화면을 다시 읽는 방법. 없으면 `router.refresh()`다. */
  onRefresh?: () => void
}

export interface OpsItemResultHandlers {
  /** 화면을 다시 읽는다. 409(그 사이 다른 곳에서 처리됨)를 받은 부품의 `onConflict`도 이것이다. */
  refresh: () => void
  /** 되돌리기 요청. 저장 토스트의 [되돌리기]와 「마지막 수정 되돌리기」가 같은 요청을 부른다. */
  revert: (itemId: string) => Promise<void>
  handleSaved: (itemId: string) => void
  /** 색 채우기가 끝났을 때(티켓 20261007_1146). 토스트를 띄우고 화면을 새로 읽는다. */
  handleColorFilled: () => void
  /** 승인·반려가 끝났을 때. `afterToast`는 토스트 다음, 새로 읽기 앞에서 부른다(S3는 다음 결정 전 항목을 고른다). */
  handleDecided: (kind: 'approve' | 'reject', afterToast?: () => void) => void
  handleCancelled: (data: Record<string, unknown>) => void
  handleEnded: (data: Record<string, unknown>) => void
  handleItemEnded: (message: string) => void
}

export function useOpsItemResultHandlers({ bundleId, onRefresh }: OpsItemResultOptions): OpsItemResultHandlers {
  const router = useRouter()
  const refresh = () => (onRefresh ? onRefresh() : router.refresh())

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

  const handleColorFilled = () => {
    toast.success('색을 채웠어요')
    refresh()
  }

  const handleDecided = (kind: 'approve' | 'reject', afterToast?: () => void) => {
    toast.success(kind === 'approve' ? '승인했어요' : '반려했어요')
    afterToast?.()
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

  return { refresh, revert, handleSaved, handleColorFilled, handleDecided, handleCancelled, handleEnded, handleItemEnded }
}

interface OpsItemFooterProps {
  bundleId: string
  item: OpsItemRecord
  ctx: OpsWorkspaceContext
  isSample: boolean
  handlers: OpsItemResultHandlers
  /** 승인·반려가 끝난 뒤 토스트 다음에 할 일. S3는 다음 결정 전 항목을 고른다. */
  onDecided?: (kind: 'approve' | 'reject', itemId: string) => void
  /** 승인이 끝나면 이 항목의 이미지를 만든다(티켓 20261007_1031). 일괄 승인은 이 줄을 거치지 않아 만들지 않는다. */
  imageProduction?: ItemImageProduction
  /** 글을 돌려주는 상태는 결정 줄 대신 그 글을 그린다. 없거나 null이면 아래 분기가 그린다. */
  statusNotice?: (item: OpsItemRecord) => ReactNode | null
}

export function OpsItemFooter({ bundleId, item, ctx, isSample, handlers, onDecided, imageProduction, statusNotice }: OpsItemFooterProps) {
  const notice = statusNotice?.(item) ?? null
  if (notice !== null) return <>{notice}</>

  if (item.status === 'scheduled') {
    return (
      <OpsCancelItem
        bundleId={bundleId}
        item={item}
        items={ctx.items}
        isSample={isSample}
        onCancelled={handlers.handleCancelled}
        onConflict={handlers.refresh}
      />
    )
  }
  if (canEndItem(item)) {
    return (
      <OpsEndItem
        bundleId={bundleId}
        item={item}
        items={ctx.items}
        onEnded={handlers.handleEnded}
        onConflict={handlers.refresh}
        onItemEnded={handlers.handleItemEnded}
      />
    )
  }
  return (
    <OpsItemActions
      bundleId={bundleId}
      item={item}
      ctx={ctx}
      onDecided={(kind, itemId) => {
        if (kind === 'approve') void imageProduction?.start(itemId, ctx.items)
        handlers.handleDecided(kind, () => onDecided?.(kind, itemId))
      }}
      onConflict={handlers.refresh}
    />
  )
}
