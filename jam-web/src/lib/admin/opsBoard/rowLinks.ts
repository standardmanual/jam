/**
 * 주간 흐름 지도 행의 결정 패널 링크 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.2, 순수 함수).
 *
 * 결정 필요·문제 정류장은 그 주 묶음의 기획 상세(결정 패널)로 간다. 한 주에 묶음이 여럿이면 결정할 항목(도착·검토중·실패)이 있는
 * 묶음 가운데 가장 늦게 받은 것을, 없으면 가장 늦게 받은 묶음을 고른다. 묶음이 없는 주는 받은 기획함 목록이다.
 */
import { stageOfItemStatus } from '@/lib/admin/opsInbox/bundleStatus'
import { weekStartOfRecord } from '@/lib/admin/opsBoard/weekFlow'
import type { BoardBundleInput } from '@/lib/admin/opsBoard/types'

export const BOARD_INBOX_PATH = '/admin/ops-inbox'

function needsAction(bundle: BoardBundleInput): boolean {
  return bundle.items.some((item) => {
    const stage = stageOfItemStatus(item.status)
    return stage === 'arrived' || stage === 'review' || item.status === 'failed'
  })
}

/** 주 월요일(KST `YYYY-MM-DD`) → 그 주의 결정 패널 경로. 묶음이 없는 주는 목록에 없다. */
export function flowRowHrefs(input: { bundles: readonly BoardBundleInput[]; includeSample?: boolean }): Record<string, string> {
  const includeSample = input.includeSample === true
  const byWeek = new Map<string, BoardBundleInput[]>()
  for (const bundle of input.bundles) {
    if (bundle.isSample && !includeSample) continue
    const monday = weekStartOfRecord(bundle.week, bundle.receivedAt)
    if (!monday) continue
    byWeek.set(monday, [...(byWeek.get(monday) ?? []), bundle])
  }
  const hrefs: Record<string, string> = {}
  for (const [monday, bundles] of byWeek) {
    const latestFirst = [...bundles].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    const target = latestFirst.find(needsAction) ?? latestFirst[0]
    hrefs[monday] = `${BOARD_INBOX_PATH}/${target.id}`
  }
  return hrefs
}
