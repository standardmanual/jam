/**
 * 어드민 목록 화면의 공용 fetch 래퍼(티켓 20260924_0940). 실패하면 서버가 돌려준
 * `error` 메시지로 throw한다 — 화면마다 `res.ok` 체크와 에러 문구를 반복하지 않기 위함이다.
 */

async function readErrorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => null)
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error
  }
  return '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해주세요.'
}

/** JSON 응답을 받는 fetch — 실패(!res.ok)하면 서버 메시지로 throw한다 */
export async function requestJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  if (!res.ok) throw new Error(await readErrorMessage(res))
  return (await res.json()) as T
}

export interface BulkRequestBody {
  ids: string[]
  action: string
  payload?: unknown
  dry_run?: boolean
  confirm_phrase?: string
}

export interface BulkRunResponse {
  processed: string[]
  skipped: { id: string; reason: string; label?: string }[]
  dryRun?: boolean
  requiredPhrase?: string
  impact?: Record<string, number>
}

/** `POST /api/admin/<메뉴>/bulk` 공용 호출 — 본문 규격은 `lib/admin/bulk/shared.ts` 참고 */
export async function runBulk(url: string, body: BulkRequestBody): Promise<BulkRunResponse> {
  return requestJson<BulkRunResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** "필터 결과 전체 선택"이 부를, 같은 필터 조건의 ID 전체(상한 이내)를 가져오는 공용 호출 */
export async function fetchListIds(url: string): Promise<string[]> {
  const data = await requestJson<{ ids: string[] }>(url)
  return data.ids
}

/** CSV 등 파일 응답을 내려받는다 — 실패하면 서버 메시지로 throw한다 */
export async function downloadResponseAsFile(input: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(input)
  if (!res.ok) throw new Error(await readErrorMessage(res))

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition')
  const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackFilename

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
