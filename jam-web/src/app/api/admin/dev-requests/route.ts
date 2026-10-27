/**
 * GET·POST /api/admin/dev-requests — 개발 요청 목록 읽기와 등록 (티켓 20261026_2027 1회차, 어드민 상황판 PRD §8)
 *
 * - GET 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). 쿼리 `status`는
 *   `requested`(기본)·`ticketed`·`dismissed`·`all`. 응답 `{ requests: [{ no, title, detail, origin, policyId, status, ticketId, createdAt }] }`.
 * - POST(요청 등록): **관리자 세션만**(`getAdminUser()`가 없으면 403, 읽기 토큰은 보지 않는다). 본문은 16KB까지,
 *   검증 실패 400, 같은 정책의 열린 요청이 있으면 409, 성공 201 `{ request }`.
 * - 응답에 `created_by`와 행 `id`를 싣지 않는다(PATCH용 id는 등록 응답에만 싣는다). 오류 본문에 내부 메시지를 싣지 않는다
 *   (원문은 서버 로그에만 남긴다). 응답은 캐시하지 않는다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser, requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { DEV_REQUEST_MAX_BODY_BYTES, DEV_REQUEST_STATUSES, type DevRequestStatus } from '@/lib/admin/devRequests/constants'
import { validateDevRequestCreate } from '@/lib/admin/devRequests/requests'
import { createDevRequest, listDevRequests } from '@/lib/admin/devRequests/store'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function badRequest(error: string, details?: string[]) {
  return json(details ? { error, details } : { error }, 400)
}

function parseStatus(raw: string | null): DevRequestStatus | 'all' | null {
  if (raw === null || raw === '') return 'requested'
  if (raw === 'all') return 'all'
  return (DEV_REQUEST_STATUSES as readonly string[]).includes(raw) ? (raw as DevRequestStatus) : null
}

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const status = parseStatus(new URL(req.url).searchParams.get('status'))
  if (status === null) {
    return badRequest('status는 requested · ticketed · dismissed · all 중 하나여야 해요. 값을 고쳐서 다시 요청해 주세요.')
  }

  try {
    const requests = await listDevRequests(createServiceClient(), { status })
    return json({
      requests: requests.map(({ no, title, detail, origin, policyId, status: state, ticketId, createdAt }) => ({
        no,
        title,
        detail,
        origin,
        policyId,
        status: state,
        ticketId,
        createdAt,
      })),
    })
  } catch (error) {
    console.error('[admin/dev-requests] 개발 요청 목록 조회 실패:', error)
    return json({ error: '개발 요청을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 500)
  }
}

export async function POST(req: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: '어드민 권한이 필요합니다.' }, 403)

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > DEV_REQUEST_MAX_BODY_BYTES) {
    return badRequest('본문이 너무 커요. 개발 요청은 16KB까지 받아요. 내용을 줄여서 다시 보내 주세요.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요. 올바른 JSON인지 확인하고 다시 보내 주세요.')
  }

  const validation = validateDevRequestCreate(parsed)
  if (!validation.ok) {
    return badRequest('개발 요청 형식이 맞지 않아요. details를 보고 고쳐서 다시 보내 주세요.', validation.errors)
  }

  try {
    const result = await createDevRequest(createServiceClient(), validation.value, admin.id)
    if (!result.ok) {
      return json(
        {
          error: `같은 정책의 개발 요청 ${result.existingNo}번이 아직 열려 있어요. 그 요청이 처리된 뒤에 다시 요청해 주세요.`,
          existingNo: result.existingNo,
        },
        409
      )
    }
    return json({ request: result.request }, 201)
  } catch (error) {
    console.error('[admin/dev-requests] 개발 요청 등록 실패:', error)
    return json({ error: '개발 요청을 등록하지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 500)
  }
}
