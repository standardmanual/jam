/**
 * 개발 요청 저장소 (티켓 20261026_2027 1회차, 어드민 상황판 PRD §8). 서버에서만 쓴다.
 *
 * - `listDevRequests`: `no` 내림차순, 최대 200건. `status`로 거르거나 `all`이면 전부.
 * - `createDevRequest`: 같은 정책(`policy_id`)에 이미 `requested` 요청이 있으면 만들지 않고
 *   `{ ok: false, code: 'duplicate_open', existingNo }`를 돌려준다. `policy_id`가 없는 요청은 중복 검사를 하지 않는다.
 * - `updateDevRequest`: 없는 행은 `{ ok: false, code: 'not_found' }`.
 * - 읽기·쓰기 실패는 호출부가 500으로 바꾸도록 던진다. 돌려주는 값에 `created_by`는 없다.
 * - 삭제는 없다. `status`로 닫는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import {
  DEV_REQUEST_LIST_LIMIT,
  type DevRequestOrigin,
  type DevRequestStatus,
} from '@/lib/admin/devRequests/constants'
import type { DevRequestCreateInput, DevRequestPatchInput } from '@/lib/admin/devRequests/requests'

type ServiceClient = ReturnType<typeof createServiceClient>

const REQUEST_COLUMNS = 'id, no, title, detail, origin, policy_id, status, ticket_id, created_at'

interface RequestRow {
  id: string
  no: number
  title: string
  detail: string
  origin: string
  policy_id: string | null
  status: string
  ticket_id: string | null
  created_at: string
}

export interface DevRequest {
  id: string
  no: number
  title: string
  detail: string
  origin: DevRequestOrigin
  policyId: string | null
  status: DevRequestStatus
  ticketId: string | null
  createdAt: string
}

export type DevRequestCreateResult =
  | { ok: true; request: DevRequest }
  | { ok: false; code: 'duplicate_open'; existingNo: number }

export type DevRequestUpdateResult = { ok: true; request: DevRequest } | { ok: false; code: 'not_found' }

function toRequest(row: RequestRow): DevRequest {
  return {
    id: row.id,
    no: row.no,
    title: row.title,
    detail: row.detail,
    origin: row.origin as DevRequestOrigin,
    policyId: row.policy_id,
    status: row.status as DevRequestStatus,
    ticketId: row.ticket_id,
    createdAt: row.created_at,
  }
}

export async function listDevRequests(
  service: ServiceClient,
  options: { status: DevRequestStatus | 'all' }
): Promise<DevRequest[]> {
  let query = service.from('ops_dev_requests').select(REQUEST_COLUMNS)
  if (options.status !== 'all') query = query.eq('status', options.status)
  const { data, error } = await query.order('no', { ascending: false }).limit(DEV_REQUEST_LIST_LIMIT)
  if (error) throw new Error(`개발 요청 조회 실패: ${error.message}`)
  return ((data ?? []) as RequestRow[]).map(toRequest)
}

export async function createDevRequest(
  service: ServiceClient,
  input: DevRequestCreateInput,
  adminId: string
): Promise<DevRequestCreateResult> {
  if (input.policyId !== null) {
    const { data: open, error: openError } = await service
      .from('ops_dev_requests')
      .select('no')
      .eq('policy_id', input.policyId)
      .eq('status', 'requested')
      .order('no', { ascending: true })
      .limit(1)
    if (openError) throw new Error(`개발 요청 중복 확인 실패: ${openError.message}`)
    const existing = ((open ?? []) as Array<{ no: number }>)[0]
    if (existing) return { ok: false, code: 'duplicate_open', existingNo: existing.no }
  }

  const { data, error } = await service
    .from('ops_dev_requests')
    .insert({
      title: input.title,
      detail: input.detail,
      origin: input.origin,
      policy_id: input.policyId,
      created_by: adminId,
    })
    .select(REQUEST_COLUMNS)
    .single()
  if (error) throw new Error(`개발 요청 등록 실패: ${error.message}`)
  return { ok: true, request: toRequest(data as RequestRow) }
}

export async function updateDevRequest(
  service: ServiceClient,
  id: string,
  patch: DevRequestPatchInput
): Promise<DevRequestUpdateResult> {
  const { data, error } = await service
    .from('ops_dev_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(REQUEST_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`개발 요청 수정 실패: ${error.message}`)
  if (!data) return { ok: false, code: 'not_found' }
  return { ok: true, request: toRequest(data as RequestRow) }
}
