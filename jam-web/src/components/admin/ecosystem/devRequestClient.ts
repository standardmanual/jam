/**
 * 개발 요청 API 호출과 응답 해석 (티켓 20261026_2027 3-1)
 *
 * `DevRequestButton`(클라이언트)이 쓰는 fetch 래퍼다. 응답을 글자로 바꾸는 부분은 순수 함수(`interpret*`)로 분리해 시험한다.
 * 서버 모듈을 가져오지 않는다(상수 모듈만).
 *
 * - 접수: `POST /api/admin/dev-requests` (`origin: 'eco'`). 201이면 번호·id, 409면 «같은 정책의 요청 N번이 이미 열려 있어요»,
 *   400·403·그 밖은 [현상] → [원인] → [해결] 한 줄.
 * - 접기: `PATCH /api/admin/dev-requests/<id>` `{ status: 'dismissed' }`.
 */
import { DEV_REQUEST_MAX_DETAIL, DEV_REQUEST_MAX_TITLE } from '@/lib/admin/devRequests/constants'

export const DEV_REQUESTS_PATH = '/api/admin/dev-requests'

export type CreateOutcome =
  | { kind: 'created'; id: string; no: number }
  | { kind: 'duplicate'; existingNo: number | null; message: string }
  | { kind: 'failed'; message: string }

export type DismissOutcome = { kind: 'dismissed' } | { kind: 'failed'; message: string }

export const NETWORK_ERROR_MESSAGE = '요청을 보내지 못했어요. 네트워크가 끊겼을 수 있어요. 연결을 확인하고 다시 시도해 주세요.'
export const INVALID_ERROR_MESSAGE = `요청 내용이 맞지 않아 접수하지 못했어요. 제목은 ${DEV_REQUEST_MAX_TITLE}자, 내용은 ${DEV_REQUEST_MAX_DETAIL.toLocaleString('en-US')}자까지예요. 줄여서 다시 보내 주세요.`
export const FORBIDDEN_ERROR_MESSAGE = '어드민 로그인이 풀려 접수하지 못했어요. 다시 로그인한 뒤 시도해 주세요.'
export const SERVER_ERROR_MESSAGE = '요청을 접수하지 못했어요. 서버에 문제가 있었을 수 있어요. 잠시 뒤 다시 시도해 주세요.'
export const DISMISS_NOT_FOUND_MESSAGE = '이미 처리된 요청이에요. 화면을 새로 고쳐 확인해 주세요.'
export const DISMISS_ERROR_MESSAGE = '요청을 접지 못했어요. 서버에 문제가 있었을 수 있어요. 잠시 뒤 다시 시도해 주세요.'

export function duplicateMessage(existingNo: number | null): string {
  return existingNo === null ? '같은 정책의 요청이 이미 열려 있어요' : `같은 정책의 요청 ${existingNo}번이 이미 열려 있어요`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 접수 응답(상태 코드 + 본문)을 결과로 바꾼다. 본문을 못 읽었으면 `body`는 `null` */
export function interpretCreateResponse(status: number, body: unknown): CreateOutcome {
  if (status === 201 && isRecord(body) && isRecord(body.request)) {
    const { id, no } = body.request
    if (typeof id === 'string' && typeof no === 'number') return { kind: 'created', id, no }
    return { kind: 'failed', message: SERVER_ERROR_MESSAGE }
  }
  if (status === 409) {
    const existingNo = isRecord(body) && typeof body.existingNo === 'number' ? body.existingNo : null
    return { kind: 'duplicate', existingNo, message: duplicateMessage(existingNo) }
  }
  if (status === 400) return { kind: 'failed', message: INVALID_ERROR_MESSAGE }
  if (status === 403) return { kind: 'failed', message: FORBIDDEN_ERROR_MESSAGE }
  return { kind: 'failed', message: SERVER_ERROR_MESSAGE }
}

/** 접기 응답을 결과로 바꾼다 */
export function interpretDismissResponse(status: number): DismissOutcome {
  if (status === 200) return { kind: 'dismissed' }
  if (status === 404) return { kind: 'failed', message: DISMISS_NOT_FOUND_MESSAGE }
  if (status === 403) return { kind: 'failed', message: FORBIDDEN_ERROR_MESSAGE }
  return { kind: 'failed', message: DISMISS_ERROR_MESSAGE }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function postDevRequest(
  input: { title: string; detail: string; policyId: string },
  fetchFn: FetchFn = fetch
): Promise<CreateOutcome> {
  let res: Response
  try {
    res = await fetchFn(DEV_REQUESTS_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: input.title, detail: input.detail, origin: 'eco', policyId: input.policyId }),
    })
  } catch {
    return { kind: 'failed', message: NETWORK_ERROR_MESSAGE }
  }
  return interpretCreateResponse(res.status, await readJson(res))
}

export async function dismissDevRequest(id: string, fetchFn: FetchFn = fetch): Promise<DismissOutcome> {
  let res: Response
  try {
    res = await fetchFn(`${DEV_REQUESTS_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    })
  } catch {
    return { kind: 'failed', message: NETWORK_ERROR_MESSAGE }
  }
  return interpretDismissResponse(res.status)
}
