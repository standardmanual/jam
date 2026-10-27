/**
 * 트렌드 출처 쓰기 요청 호출 (티켓 20261026_2033 2회차) — `POST /api/admin/ops-trend-sources`(등록),
 * `PATCH /api/admin/ops-trend-sources/[id]`(켜기·끄기).
 *
 * `patternClient.ts`처럼 **던지지 않고** 결과를 돌려준다. 실패 문장은 서버가 준 것을 그대로 한 줄로 만든다
 * (400은 `details`가 있으면 그 문장들, 없으면 `error`). 응답을 받지 못하면 고정 문장이다.
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import type { OpsTrendSourceKind } from '@/lib/admin/opsTrends/constants'

export type TrendSourceRequestResult = { ok: true } | { ok: false; status: number; message: string }

export interface TrendSourceCreateBody {
  name: string
  kind: OpsTrendSourceKind
  location: string
}

const FALLBACK_ERROR = '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

export const TREND_SOURCES_URL = '/api/admin/ops-trend-sources'

export function trendSourceUrl(id: string): string {
  return `${TREND_SOURCES_URL}/${encodeURIComponent(id)}`
}

/** 서버 오류 본문에서 한 줄 문장을 만든다. */
export function errorLineOf(data: unknown): string {
  if (typeof data !== 'object' || data === null) return FALLBACK_ERROR
  const { error, details } = data as { error?: unknown; details?: unknown }
  if (Array.isArray(details)) {
    const lines = details.filter((line): line is string => typeof line === 'string' && line.trim() !== '')
    if (lines.length > 0) return lines.join(' ')
  }
  return typeof error === 'string' && error.trim() !== '' ? error : FALLBACK_ERROR
}

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<TrendSourceRequestResult> {
  let res: Response
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    return { ok: false, status: 0, message: NETWORK_ERROR_MESSAGE }
  }
  if (res.ok) return { ok: true }
  const data: unknown = await res.json().catch(() => null)
  return { ok: false, status: res.status, message: errorLineOf(data) }
}

export function createTrendSourceRequest(body: TrendSourceCreateBody): Promise<TrendSourceRequestResult> {
  return send(TREND_SOURCES_URL, 'POST', body)
}

export function setTrendSourceEnabledRequest(id: string, enabled: boolean): Promise<TrendSourceRequestResult> {
  return send(trendSourceUrl(id), 'PATCH', { enabled })
}
