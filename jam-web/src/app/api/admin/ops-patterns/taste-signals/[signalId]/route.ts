/**
 * PATCH /api/admin/ops-patterns/taste-signals/[signalId] — 취향 신호의 이유를 고치고 확정하기(근거 붙이기·비우기 포함) (티켓 20261008_1712, 상위 20260930_1503 ⑩b-1), 운영툴 PRD §11.6
 *
 * - 인증: **관리자 세션만** 통과한다(`getAdminUser()`가 없으면 403, 읽기 토큰은 보지 않는다). `signalId`가 UUID가 아니면 404다.
 * - 본문 `{ reason, evidenceDecisionId, expectedUpdatedAt }`(64KB 이하 JSON 객체). `expectedUpdatedAt`은 필수이고 화면이 본 시각과 다르면 409(DB는 그대로)다.
 * - 응답은 200 `{ signal, changed }`, 400 `{ error, fieldErrors? }`, 404, 409, 500이다. 처리는 `tasteWrite.ts`가 한다.
 * - **응답에 관리자 ID(`confirmed_by`)를 싣지 않는다**(`read.ts`가 읽지도 않는다).
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/admin/opsPatterns/input'
import { TASTE_NOT_FOUND_MESSAGE, saveOpsTasteSignal } from '@/lib/admin/opsPatterns/tasteWrite'

/** 본문 상한(바이트). */
const MAX_BODY_BYTES = 65_536

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ signalId: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { signalId } = await params
  if (!isUuid(signalId)) return NextResponse.json({ error: TASTE_NOT_FOUND_MESSAGE }, { status: 404 })

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

  const outcome = await saveOpsTasteSignal(createServiceClient(), signalId, input, { actor: admin.id, expectedUpdatedAt: input.expectedUpdatedAt })
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) },
      { status: outcome.status }
    )
  }
  return NextResponse.json({ signal: outcome.signal, changed: outcome.changed })
}
