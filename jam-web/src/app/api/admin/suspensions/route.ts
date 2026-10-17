import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { fetchSuspensionListPage, parseSuspensionListParams } from '@/lib/admin/suspension-list'
import { suspendUser, type SuspendFailure } from '@/lib/suspension/suspension-write'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 이용 정지 이력 조회·정지 걸기(티켓 20261017_1426 2회). 어드민만 부를 수 있다(`getAdminUser()`, 아니면 403).
 * 옛 `/api/admin/abusing/bans`(섀도우밴)는 그대로 두고 이 경로를 따로 둔다.
 */
const FAILURES: Record<SuspendFailure, { status: number; error: string }> = {
  reason_required: { status: 400, error: '정지 사유를 입력해 주세요. 사유는 유저에게 그대로 보여요.' },
  user_not_found: { status: 404, error: '해당 유저를 찾지 못했어요. 유저 UUID가 맞는지 확인해 주세요.' },
  already_suspended: { status: 409, error: '이미 이용이 정지된 유저예요. 정지 이력에서 먼저 풀어 주세요.' },
}

export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = pickSingleQueryParamsFromURL(req.nextUrl.searchParams)
  const page = Math.max(1, parseInt(raw.page ?? '1', 10) || 1)
  const result = await fetchSuspensionListPage(createServiceClient(), parseSuspensionListParams(raw), page)
  if (result.error) {
    return NextResponse.json({ error: `정지 이력을 불러오지 못했어요. (${result.error})` }, { status: 500 })
  }
  return NextResponse.json({ suspensions: result.rows, total: result.total })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { user_id?: unknown; reason?: unknown } | null
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : ''
  const reason = typeof body?.reason === 'string' ? body.reason : ''

  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: '유저 UUID 형식이 올바르지 않아요.', code: 'invalid_user_id' }, { status: 400 })
  }

  try {
    const result = await suspendUser(createServiceClient(), { userId, reason, adminEmail: admin.email })
    if (!result.ok) {
      const failure = FAILURES[result.code]
      return NextResponse.json({ error: failure.error, code: result.code }, { status: failure.status })
    }
    return NextResponse.json({ ok: true, id: result.id })
  } catch (e) {
    // 어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `이용 정지가 적용되지 않았어요. 데이터베이스가 요청을 거부했어요. (${detail})` },
      { status: 500 }
    )
  }
}
