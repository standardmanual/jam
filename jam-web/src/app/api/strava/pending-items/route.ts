/**
 * 동기화 보류 고르기 API (티켓 20261017_1425, 운영 로직 6.4절)
 *
 * GET  /api/strava/pending-items          — 로그인한 유저의 대기 중 보류 목록과 골라야 할 개수
 * POST /api/strava/pending-items { chosenIds } — 고르기를 확정한다(고르지 않은 것은 받을 수 없다)
 *
 * `resolve_sync_pending_items`는 service_role만 실행할 수 있다. 세션으로 유저를 확인한 뒤 서버 클라이언트(service role)로
 * 호출하고, 대상은 세션 유저뿐이다. 입력은 서버가 검증한다(uuid 문자열 배열, 중복 없음, 길이 상한).
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { getPendingItems, resolvePendingItems, type ResolvePendingErrorCode } from '@/lib/strava/pending-items'
import { runPendingFollowUps } from '@/lib/strava/pending-followups'
import { PENDING_CHOSEN_IDS_MAX } from '@/lib/strava/pending-items-contract'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `chosenIds`가 uuid 문자열의 중복 없는 배열(길이 상한 이하, 빈 배열 허용)이면 돌려주고 아니면 null이다. */
function parseChosenIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null
  const chosenIds = (body as { chosenIds?: unknown }).chosenIds
  if (!Array.isArray(chosenIds) || chosenIds.length > PENDING_CHOSEN_IDS_MAX) return null
  if (!chosenIds.every((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id))) return null
  const unique = new Set(chosenIds.map((id) => id.toLowerCase()))
  if (unique.size !== chosenIds.length) return null
  return chosenIds
}

const RESOLVE_ERRORS: Record<ResolvePendingErrorCode, { status: number; message: string }> = {
  wrong_count: { status: 400, message: d.syncPending.wrongCount },
  invalid_selection: { status: 400, message: d.syncPending.invalidSelection },
  no_pending: { status: 409, message: d.syncPending.noPending },
  inventory_not_found: { status: 404, message: d.syncPending.inventoryNotFound },
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const payload = await getPendingItems(createServiceClient(), user.id)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/strava/pending-items] 보류 조회 오류:', err)
    return NextResponse.json({ error: d.syncPending.loadFailed }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: d.syncPending.invalidInput }, { status: 400 })
  }
  const chosenIds = parseChosenIds(body)
  if (!chosenIds) {
    return NextResponse.json({ error: d.syncPending.invalidInput }, { status: 400 })
  }

  try {
    const service = createServiceClient()
    const result = await resolvePendingItems(service, user.id, chosenIds)
    if (!result.ok) {
      const { status, message } = RESOLVE_ERRORS[result.error]
      return NextResponse.json(
        { error: message, code: result.error, ...(result.expected !== undefined ? { expected: result.expected } : {}) },
        { status }
      )
    }
    // 보류에서 받은 개체도 바로 지급과 같이 포인트·피드·결산을 잇는다. 지급은 이미 끝났으므로 실패는 로그만 남기고 응답을 바꾸지 않는다.
    try {
      await runPendingFollowUps(service, user.id, result.itemIds)
    } catch (followUpError) {
      console.error('[/api/strava/pending-items] 보류 후속 처리 오류:', followUpError)
    }
    return NextResponse.json({ granted: result.granted, discarded: result.discarded, itemIds: result.itemIds })
  } catch (err) {
    console.error('[/api/strava/pending-items] 고르기 오류:', err)
    return NextResponse.json({ error: d.syncPending.resolveFailed }, { status: 500 })
  }
}
