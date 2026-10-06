/**
 * POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/end — 공개 뒤 「지금 종료」 (티켓 20261006_0950, 상위 20260930_1500 ⑪-a)
 *
 * 본문은 둘 중 하나다. `{ dryRun: true }`는 미리 보기(쓰기 없음: 이 항목을 가리키는 게재 중 항목과 미션·컬렉션의 영향 유저 수), `{ reason? }`는 지금 종료다. 사유는 선택이고 앞뒤 공백을 뺀 500자까지이며
 * 빈 문자열은 없음으로 본다. 둘을 함께 보내거나 다른 키를 보내면 400이다(되돌릴 수 없는 쓰기라 오타가 종료로 이어지지 않게 한다).
 * 처리와 규칙(상태 선점·자원 종료·되돌림·결정 기록)은 `opsInbox/execute/end.ts`가 한다. 이 라우트는 인증·입력 확인·응답 뒤 슬랙 글만 맡는다.
 *
 * - 관리자 로그인 세션만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보낸다(토큰 쓰기 예외는 제출 경로 하나뿐이다).
 * - 슬랙 글은 응답이 나간 뒤(`after`) 올린다. 종료 요약은 `#jam-report`, 끝내지 못한 일은 `#jam-alert`다. 슬랙이 실패해도 응답과 결정 기록은 그대로다.
 * - 응답에는 DB 오류 원문을 싣지 않는다(고정 문장만 싣고 원문은 서버 로그에 남는다).
 */
import { NextResponse, after } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import { MAX_DECISION_REASON_CHARS } from '@/lib/admin/opsInbox/constants'
import { endItem, notifyEnd, previewEnd } from '@/lib/admin/opsInbox/execute/end'

// 항목을 읽고 선점한 뒤 자원을 끝내고 결정 기록까지 한 요청에서 끝낸다. 되돌림까지 실패해 어긋난 항목은 `#jam-alert` 글로 사람이 확인한다.
export const maxDuration = 60

/** 본문 상한(바이트). 사유 500자가 1.5KB 안쪽이라 넉넉하게 잡은 값이다. */
const MAX_BODY_BYTES = 16_384

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function POST(req: Request, { params }: { params: Promise<{ bundleId: string; itemId: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { bundleId, itemId } = await params
  if (!isUuid(bundleId)) return badRequest('기획 ID 형식이 올바르지 않아요.')
  if (!isUuid(itemId)) return badRequest('항목 ID 형식이 올바르지 않아요.')

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return badRequest('본문이 너무 커요.')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요.')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return badRequest('본문은 객체여야 해요.')
  const input = body as Record<string, unknown>

  // 미리 보기(`dryRun: true`)이거나 지금 종료(`reason?`). 다른 키는 받지 않는다.
  if (Object.keys(input).some((key) => key !== 'dryRun' && key !== 'reason')) return badRequest('알 수 없는 값이 있어요.')
  const hasDryRun = 'dryRun' in input
  if (hasDryRun && 'reason' in input) return badRequest('미리 보기(dryRun)에는 사유를 함께 보낼 수 없어요.')
  if (hasDryRun && input.dryRun !== true) return badRequest('dryRun은 true만 보낼 수 있어요.')

  let reason: string | null = null
  if ('reason' in input) {
    if (typeof input.reason !== 'string') return badRequest('사유는 글자로 보내 주세요.')
    const trimmed = input.reason.trim()
    if (trimmed.length > MAX_DECISION_REASON_CHARS) return badRequest(`사유는 ${MAX_DECISION_REASON_CHARS}자까지 적을 수 있어요.`)
    reason = trimmed === '' ? null : trimmed
  }

  const service = createServiceClient()

  if (hasDryRun) {
    const preview = await previewEnd(service, { bundleId, itemId })
    if (!preview.ok) return NextResponse.json({ error: preview.error, ...preview.extra }, { status: preview.status })
    return NextResponse.json(preview.body)
  }

  const outcome = await endItem(service, { bundleId, itemId, actor: admin.id, reason })

  // 응답 뒤 슬랙 글. 종료가 200이거나 되돌림까지 실패해 알림이 필요할 때 올린다(`notifyEnd`는 던지지 않는다).
  const { slack } = outcome
  if (slack) after(() => notifyEnd(service, slack))

  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.extra }, { status: outcome.status })
  return NextResponse.json(outcome.body)
}
