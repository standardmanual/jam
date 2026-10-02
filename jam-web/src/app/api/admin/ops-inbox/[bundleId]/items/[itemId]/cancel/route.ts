/**
 * POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/cancel — 공개 전 취소 (티켓 20261002_1256, 상위 20260930_1500 ④-b)
 *
 * 본문은 둘 중 하나다. `{ dryRun: true }`는 미리 보기(쓰기 없음: 함께 취소될 항목과 막는 항목), `{ reason? }`는 취소다. 사유는 선택이고 앞뒤 공백을 뺀 500자까지이며
 * 빈 문자열은 없음으로 본다. 둘을 함께 보내거나 다른 키를 보내면 400이다(되돌릴 수 없는 쓰기라 오타가 취소로 이어지지 않게 한다).
 * 처리와 규칙(범위·자원 취소·상태·결정 기록)은 `opsInbox/execute/cancel.ts`가 한다. 이 라우트는 인증·입력 확인·응답 뒤 슬랙 글만 맡는다.
 *
 * - 관리자 로그인 세션만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보낸다(토큰 쓰기 예외는 제출 경로 하나뿐이다).
 * - 슬랙 글은 응답이 나간 뒤(`after`) 올린다. 취소 요약은 `#jam-report`, 끝내지 못한 항목은 `#jam-alert`다. 슬랙이 실패해도 응답과 결정 기록은 그대로다.
 * - 응답에는 DB 오류 원문을 싣지 않는다(고정 문장만 싣고 원문은 서버 로그에 남는다).
 */
import { NextResponse, after } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import { MAX_DECISION_REASON_CHARS } from '@/lib/admin/opsInbox/constants'
import { cancelItem, notifyCancel, previewCancel } from '@/lib/admin/opsInbox/execute/cancel'

// 항목마다 자원을 읽고 지운 뒤 상태와 결정 기록을 한 요청에서 끝낸다. 끝나지 못해 「예약됨」에 남은 항목은 상태 맞추기가 정리한다.
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

  // 미리 보기(`dryRun: true`)이거나 취소(`reason?`). 다른 키는 받지 않는다.
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
    const preview = await previewCancel(service, { bundleId, itemId })
    if (!preview.ok) return NextResponse.json({ error: preview.error, ...preview.extra }, { status: preview.status })
    return NextResponse.json(preview.body)
  }

  const outcome = await cancelItem(service, { bundleId, itemId, actor: admin.id, reason })

  // 응답 뒤 슬랙 글. 취소가 200이거나 일부만 지우고 멈춰 알림이 필요할 때 올린다(`notifyCancel`은 던지지 않는다).
  const { slack } = outcome
  if (slack) after(() => notifyCancel(service, slack))

  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.extra }, { status: outcome.status })
  return NextResponse.json(outcome.body)
}
