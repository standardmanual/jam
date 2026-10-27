/**
 * PATCH /api/admin/dev-requests/[id] — 개발 요청 상태 바꾸기 (티켓 20261026_2027 1회차, 어드민 상황판 PRD §8)
 *
 * **관리자 세션만** 통과한다(`getAdminUser()`가 없으면 403, 읽기 토큰은 보지 않는다). `id`가 UUID가 아니면 404,
 * 검증 실패 400(`status`는 requested·dismissed만), 없는 행 404, 성공 200 `{ request }`.
 * `ticketed`는 카리나가 SQL로 정한다. 삭제 경로는 없다. 오류 본문에 내부 메시지를 싣지 않고 응답은 캐시하지 않는다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { DEV_REQUEST_MAX_BODY_BYTES } from '@/lib/admin/devRequests/constants'
import { validateDevRequestPatch } from '@/lib/admin/devRequests/requests'
import { updateDevRequest } from '@/lib/admin/devRequests/store'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function badRequest(error: string, details?: string[]) {
  return json(details ? { error, details } : { error }, 400)
}

function notFound() {
  return json({ error: '개발 요청을 찾을 수 없어요. 목록을 새로 고쳐 주세요.' }, 404)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: '어드민 권한이 필요합니다.' }, 403)

  const { id } = await params
  if (!UUID_PATTERN.test(id)) return notFound()

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > DEV_REQUEST_MAX_BODY_BYTES) {
    return badRequest('본문이 너무 커요. 개발 요청 수정은 16KB까지 받아요. 내용을 줄여서 다시 보내 주세요.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요. 올바른 JSON인지 확인하고 다시 보내 주세요.')
  }

  const validation = validateDevRequestPatch(parsed)
  if (!validation.ok) {
    return badRequest('개발 요청 형식이 맞지 않아요. details를 보고 고쳐서 다시 보내 주세요.', validation.errors)
  }

  try {
    const result = await updateDevRequest(createServiceClient(), id, validation.value)
    if (!result.ok) return notFound()
    return json({ request: result.request })
  } catch (error) {
    console.error('[admin/dev-requests] 개발 요청 수정 실패:', error)
    return json({ error: '개발 요청을 수정하지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 500)
  }
}
