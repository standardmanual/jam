/**
 * POST /api/admin/ops-inbox/[bundleId]/decisions — 결정하기 (티켓 20260930_1818)
 *
 * 승인·반려·일괄 승인·직접 수정·수정 되돌리기·색 채우기(`fill_color`, 본문 `bg`·`end`)를 한 경로로 받는다. 본문 `{ action, itemId?, itemIds?, reason?, values?, bg?, end?, expectedUpdatedAt? }`.
 * 처리와 규칙(조건부 update, 결정 기록 추가만, 되돌림)은 `opsInbox/decide.ts`가 한다. 이 라우트는 인증·입력 확인·응답 뒤 슬랙 글만 맡는다.
 *
 * - 관리자 로그인 세션만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보낸다(토큰 쓰기 예외는 제출 경로 하나뿐이다).
 * - 슬랙 글은 응답이 나간 뒤(`after`) 올리고 결과를 결정 기록의 `slack_result`에 채운다. 슬랙이 실패해도 응답과 결정은 그대로다.
 */
import { NextResponse, after } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import {
  approveItem,
  bulkApprove,
  editItem,
  fillColor,
  notifyDecision,
  rejectItem,
  revertLastEdit,
  type DecisionOutcome,
} from '@/lib/admin/opsInbox/decide'

/** 본문 상한(바이트). 수정 값이 문안 몇 줄 수준이라 넉넉하게 잡은 값이다. */
const MAX_BODY_BYTES = 262_144

const ACTIONS = ['approve', 'reject', 'bulk_approve', 'edit', 'revert', 'fill_color'] as const
type DecisionAction = (typeof ACTIONS)[number]

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

function isAction(value: unknown): value is DecisionAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}

export async function POST(req: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { bundleId } = await params
  if (!isUuid(bundleId)) return badRequest('기획 ID 형식이 올바르지 않아요.')

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

  if (!isAction(input.action)) return badRequest('알 수 없는 결정이에요.')
  const action = input.action

  let itemId = ''
  if (action !== 'bulk_approve') {
    if (typeof input.itemId !== 'string' || !isUuid(input.itemId)) return badRequest('항목 ID 형식이 올바르지 않아요.')
    itemId = input.itemId
  }

  const service = createServiceClient()
  const actor = admin.id

  let outcome: DecisionOutcome
  switch (action) {
    case 'approve':
      outcome = await approveItem(service, { bundleId, itemId, actor })
      break
    case 'reject':
      outcome = await rejectItem(service, { bundleId, itemId, actor, reason: input.reason })
      break
    case 'bulk_approve':
      outcome = await bulkApprove(service, { bundleId, itemIds: input.itemIds, actor })
      break
    case 'edit':
      outcome = await editItem(service, {
        bundleId,
        itemId,
        actor,
        values: input.values,
        reason: input.reason,
        expectedUpdatedAt: input.expectedUpdatedAt,
      })
      break
    case 'revert':
      outcome = await revertLastEdit(service, { bundleId, itemId, actor })
      break
    case 'fill_color':
      outcome = await fillColor(service, {
        bundleId,
        itemId,
        actor,
        bg: input.bg,
        end: input.end,
        expectedUpdatedAt: input.expectedUpdatedAt,
      })
      break
  }

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error, ...outcome.extra }, { status: outcome.status })
  }

  // 응답 뒤 슬랙 글. 실패해도 결정은 성공이고, 결과는 결정 기록에 남긴다(`notifyDecision`은 던지지 않는다).
  const success = outcome
  after(() => notifyDecision(service, success))

  return NextResponse.json(success.body)
}
