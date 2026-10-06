/**
 * 일정표 항목 서랍이 받는 데이터 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 서랍, 카리나 가정 1·12) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * 항목 하나로 그 항목이 속한 묶음을 찾아 기획 상세(S3)와 같은 읽기(`getOpsBundleDetail`)를 한다. 서랍의 결정·편집이 S3와 같은 API를 쓰므로
 * 항목 자기 묶음의 ID(`bundleId`)와 묶음의 항목 전부(「연결」·함께 취소될 항목을 찾는다)·결정 기록·밸런스 평가를 함께 돌려준다.
 * 반려·취소·실패 항목도 열린다(칸에는 없어도 `?item=`으로 만난다, 가정 4·12). **읽기만 한다** — 「도착 → 검토중」 전환 같은 상태 변경은 하지 않는다.
 *
 * 없는 항목·UUID가 아닌 값은 null이다(조회 오류는 던진다).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { throwOnQueryError } from '@/lib/admin/queryError'
import { isUuid } from '@/lib/admin/uuid'
import type { OpsBundleBalance } from '@/lib/admin/opsInbox/balance/view'
import { getOpsBundleDetail, type OpsDecisionRecord, type OpsItemRecord } from '@/lib/admin/opsInbox/query'

const ERROR_LABEL = 'ops-schedule'

/** 서랍이 그리는 데이터. 일반 객체라 응답 본문(JSON)으로 그대로 나간다. */
export interface ScheduleItemDetail {
  /** 서랍이 연 항목의 ID(`items` 안에 있다). */
  itemId: string
  /** 항목 자기 묶음의 DB 행 ID. 결정 API(`/api/admin/ops-inbox/{bundleId}/decisions`)에 넘긴다. */
  bundleId: string
  isSample: boolean
  /** 그 묶음의 항목 전부(`position` 순). */
  items: OpsItemRecord[]
  /** 그 묶음의 결정 기록(최신순). */
  decisions: OpsDecisionRecord[]
  balance: OpsBundleBalance
}

export async function getScheduleItemDetail(rawItemId: string): Promise<ScheduleItemDetail | null> {
  if (!isUuid(rawItemId)) return null
  const itemId = rawItemId.toLowerCase()

  const found = await createServiceClient().from('ops_bundle_items').select('bundle_id').eq('id', itemId).maybeSingle()
  throwOnQueryError(found.error, ERROR_LABEL)
  if (!found.data) return null

  const detail = await getOpsBundleDetail(found.data.bundle_id)
  // 읽는 사이 묶음이 지워졌거나 항목이 사라졌으면 없는 항목이다.
  if (!detail || !detail.items.some((item) => item.id === itemId)) return null

  return {
    itemId,
    bundleId: detail.bundle.id,
    isSample: detail.bundle.isSample,
    items: detail.items,
    decisions: detail.decisions,
    balance: detail.balance,
  }
}
