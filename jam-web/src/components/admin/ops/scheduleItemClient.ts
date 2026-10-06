/**
 * 일정표 항목 서랍 데이터 요청 (티켓 20261006_1537 ③-b) — `GET /api/admin/ops-schedule/items/[itemId]`.
 *
 * 서랍은 안 읽은 항목만 이 요청으로 받는다. `requestJson`은 실패를 문자열로만 던져 404(「찾을 수 없는 항목이에요」)와 그 밖의 실패를 가를 수 없으므로 따로 둔다.
 * **던지지 않고** 결과를 돌려준다(서랍 안에서만 보이는 오류로 격리하려고). 요청을 중단하면(서랍을 닫거나 다른 항목으로 옮겼다) `aborted`다.
 * 서랍은 실패 사유를 문장으로 보이지 않고 고정 안내(「항목을 불러오지 못했어요」)만 보이므로 `error`는 사유를 싣지 않는다.
 */
import { asRecord } from '@/components/admin/ops/decisionClient'
import type { ScheduleItemDetail } from '@/lib/admin/opsSchedule/itemDetail'

export type ScheduleItemOutcome =
  | { kind: 'ok'; detail: ScheduleItemDetail }
  | { kind: 'notFound' }
  | { kind: 'error' }
  | { kind: 'aborted' }

/** 서랍이 그릴 수 있는 모양인가. 항목이 자기 묶음의 항목 안에 있어야 한다(응답이 어긋나면 서랍 안에서만 오류가 된다). */
function isItemDetail(body: Record<string, unknown>): boolean {
  return (
    typeof body.itemId === 'string' &&
    typeof body.bundleId === 'string' &&
    Array.isArray(body.decisions) &&
    Array.isArray(body.items) &&
    body.items.some((entry) => asRecord(entry).id === body.itemId)
  )
}

export async function fetchScheduleItem(itemId: string, signal?: AbortSignal): Promise<ScheduleItemOutcome> {
  let res: Response
  try {
    res = await fetch(`/api/admin/ops-schedule/items/${encodeURIComponent(itemId)}`, { signal, cache: 'no-store' })
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return { kind: 'aborted' }
    return { kind: 'error' }
  }
  if (res.status === 404) return { kind: 'notFound' }
  if (!res.ok) return { kind: 'error' }

  const body = asRecord(await res.json().catch(() => null))
  if (!isItemDetail(body)) return { kind: 'error' }
  return { kind: 'ok', detail: body as unknown as ScheduleItemDetail }
}
