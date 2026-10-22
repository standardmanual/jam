/**
 * 밸런스 설정 저장 요청 호출 (티켓 20261022_1132) — `PUT /api/admin/balance/[section]`
 *
 * 구역 폼이 쓴다. `requestJson`은 실패를 메시지 문자열로만 던져서 상태 코드(409)와 칸별 문장(400의 `fieldErrors`)을 알 수 없으므로 `ruleClient.ts`처럼 따로 둔다.
 * **던지지 않고** 결과를 돌려준다.
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import type { BalanceChange, BalanceValues } from '@/lib/admin/balance/types'

export interface BalancePutRequest {
  /** 바뀐 칸만 담은 새 값(칸 이름 → 숫자). */
  values: BalanceValues
  /** 화면이 읽은 때의 수정 시각. 그사이 바뀌었으면 409다. */
  expectedUpdatedAt: string
  /** 변경 메모(선택). 비어 있으면 보내지 않는다. */
  note?: string
}

export type BalancePutResponse =
  | { ok: true; values: BalanceValues; updatedAt: string; changes: BalanceChange[]; affectsDisclosure: boolean }
  | {
      ok: false
      status: number
      error: string
      /** 400: 칸 이름 → 문장. */
      fieldErrors: Record<string, string>
    }

const FALLBACK_ERROR = '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(asRecord(value))) {
    if (typeof entry === 'string') result[key] = entry
  }
  return result
}

export async function putBalanceSection(sectionId: string, body: BalancePutRequest): Promise<BalancePutResponse> {
  let res: Response
  try {
    res = await fetch(`/api/admin/balance/${encodeURIComponent(sectionId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {} }
  }

  const data = asRecord(await res.json().catch(() => null))
  if (res.ok && typeof data.updatedAt === 'string' && typeof data.values === 'object' && data.values !== null) {
    return {
      ok: true,
      values: data.values as BalanceValues,
      updatedAt: data.updatedAt,
      changes: Array.isArray(data.changes) ? (data.changes as BalanceChange[]) : [],
      affectsDisclosure: data.affectsDisclosure === true,
    }
  }
  const error = typeof data.error === 'string' && data.error ? data.error : FALLBACK_ERROR
  return { ok: false, status: res.status, error, fieldErrors: stringRecord(data.fieldErrors) }
}
