/**
 * 보지 않은 캡슐 결과 «봤어요» API (티켓 20261028_1740 2회, 상위 20261028_1730 D12)
 *
 * POST /api/capsule/unseen/seen — 본문 `{ ids: string[] }`(UUID 문자열 1~50개)의 행 가운데 세션 유저의 것이고 아직 `seen_at`이 비어 있는 것만 `seen_at = now()`로 바꾼다.
 *   응답은 `{ marked: number }`(이번 요청으로 바뀐 행 수)이다. 이미 본 행·남의 행·없는 id는 세지 않고 오류도 아니므로, 같은 요청을 두 번 보내면 두 번째는 `marked: 0`인 200이다.
 *
 * 형식이 맞지 않으면 400(본문이 JSON이 아님, `ids`가 배열이 아님, 비었거나 50개 초과, UUID가 아닌 값). 같은 id가 겹쳐 있으면 하나로 본다.
 * 이용 정지 중에도 막지 않는다(내 결과를 확인 처리할 뿐이다). 세션으로 유저를 확인하고(401) 서비스 클라이언트로 쓴다. 오류는 500과 일반 문구, 내부 원문은 싣지 않는다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { CAPSULE_UNSEEN_MAX_IDS, type CapsuleSeenPayload } from '@/lib/capsule/capsule-contract'
import { markUnseenCapsuleResultsSeen } from '@/lib/capsule/unseen'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 형식이 맞는 id 목록이면 중복을 없앤 목록, 아니면 null */
function parseIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null
  const ids = (body as { ids?: unknown }).ids
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > CAPSULE_UNSEEN_MAX_IDS) return null
  if (!ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))) return null
  return [...new Set(ids as string[])]
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const ids = parseIds(body)
  if (!ids) {
    return NextResponse.json({ error: d.capsule.seenInvalid }, { status: 400 })
  }

  try {
    const marked = await markUnseenCapsuleResultsSeen(createServiceClient(), user.id, ids)
    const payload: CapsuleSeenPayload = { marked }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/capsule/unseen/seen] 확인 처리 오류:', err)
    return NextResponse.json({ error: d.capsule.seenFailed }, { status: 500 })
  }
}
