/**
 * PATCH /api/admin/ops-rules/[ruleKey] — 밸런스 규칙 값·경고 수준·켜기 바꾸기 (티켓 20260930_1459 조각 B, 운영툴 PRD §11.5)
 *
 * 본문 `{ value?, level?, enabled?, expectedUpdatedAt }`. 처리와 규칙(칸별 검증, 조건부 update, 직전 값 기록)은 `balance/save.ts`의
 * `saveOpsRule`이 한다. 이 라우트는 인증·본문 읽기·응답만 맡는다. 응답은 200 `{ rule, changed }`, 400 `{ error, fieldErrors? }`, 404, 409, 500이다.
 *
 * 관리자 로그인 세션(`getAdminUser()`)만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보내고, 닿더라도 이 라우트는
 * 토큰을 보지 않는다(토큰 쓰기 예외는 제출 경로 하나뿐이다). 규칙을 읽는 `GET`은 `../route.ts`다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { saveOpsRule } from '@/lib/admin/opsInbox/balance/save'

/** 본문 상한(바이트). 규칙 값은 숫자 몇 개 수준이다. */
const MAX_BODY_BYTES = 16_384

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ruleKey: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { ruleKey } = await params

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

  const outcome = await saveOpsRule(createServiceClient(), {
    ruleKey,
    value: input.value,
    level: input.level,
    enabled: input.enabled,
    expectedUpdatedAt: input.expectedUpdatedAt,
    actor: admin.id,
  })

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) },
      { status: outcome.status }
    )
  }
  return NextResponse.json({ rule: outcome.rule, changed: outcome.changed })
}
