/**
 * 운영 패턴 쓰기 요청 호출 (티켓 20261008_1617, 상위 20260930_1503 ⑩a-2) — `POST /api/admin/ops-patterns`(만들기),
 * `PATCH /api/admin/ops-patterns/[patternNo]`(고치기·상태 바꾸기).
 *
 * 패턴 폼(`OpsPatternForm`)과 상태 메뉴(`OpsPatternStatusMenu`)가 쓴다. `ruleClient.ts`처럼 **던지지 않고** 결과를 돌려준다 — 실패는 상태 코드(409)와
 * 칸별 문장(400의 `fieldErrors`)까지 알아야 해서 `requestJson`(메시지 문자열로만 던진다)을 쓰지 않는다.
 *
 * `expectedUpdatedAt`은 서버가 준 `updatedAt` 문자열을 **가공하지 않고 그대로** 싣는다(`Date`로 바꿨다 되돌리면 자릿수가 달라져 매번 409가 된다).
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import type { OpsPatternStatus } from '@/lib/admin/opsPatterns/constants'
import type { OpsPatternInput } from '@/lib/admin/opsPatterns/input'
import type { OpsPatternRecord } from '@/lib/admin/opsPatterns/read'

export type PatternWriteResponse =
  | { ok: true; pattern: OpsPatternRecord; changed: boolean }
  | {
      ok: false
      status: number
      error: string
      /** 400: 칸 경로(`name`·`samples.2.role`·`pauseReason`) → 화면에 보일 문장. */
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

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<PatternWriteResponse> {
  let res: Response
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {} }
  }
  const data = asRecord(await res.json().catch(() => null))
  if (res.ok && typeof data.pattern === 'object' && data.pattern !== null) {
    return { ok: true, pattern: data.pattern as OpsPatternRecord, changed: data.changed === true }
  }
  const error = typeof data.error === 'string' && data.error ? data.error : FALLBACK_ERROR
  return { ok: false, status: res.status, error, fieldErrors: stringRecord(data.fieldErrors) }
}

/** 패턴 만들기. 성공하면 서버가 정한 번호가 든 패턴을 돌려준다. */
export function createOpsPatternRequest(input: OpsPatternInput): Promise<PatternWriteResponse> {
  return send('/api/admin/ops-patterns', 'POST', input)
}

/** 패턴 내용 고치기(내용 칸 전체). `expectedUpdatedAt`은 화면이 읽은 `updatedAt` 문자열 그대로다. */
export function updateOpsPatternRequest(patternNo: string, input: OpsPatternInput, expectedUpdatedAt: string): Promise<PatternWriteResponse> {
  return send(`/api/admin/ops-patterns/${encodeURIComponent(patternNo)}`, 'PATCH', { ...input, expectedUpdatedAt })
}

/** 상태 바꾸기. `pauseReason`은 쉬는 중으로 바꿀 때만 싣는다. */
export function changeOpsPatternStatusRequest(
  patternNo: string,
  change: { status: OpsPatternStatus; pauseReason?: string },
  expectedUpdatedAt: string
): Promise<PatternWriteResponse> {
  const body = { status: change.status, ...(change.status === 'paused' ? { pauseReason: change.pauseReason ?? '' } : {}), expectedUpdatedAt }
  return send(`/api/admin/ops-patterns/${encodeURIComponent(patternNo)}`, 'PATCH', body)
}
