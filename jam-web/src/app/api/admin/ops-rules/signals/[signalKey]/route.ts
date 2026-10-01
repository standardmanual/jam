/**
 * PATCH /api/admin/ops-rules/signals/[signalKey] — 신호 기준값 카드 한 장 저장 (티켓 20260930_1459 조각 C, 운영툴 PRD §11.5)
 *
 * 본문 `{ values, expectedUpdatedAt }`: `values`는 바꿀 칸(기준값 키 → 새 값), `expectedUpdatedAt`은 칸마다 화면이 본 수정 시각(행이 없으면 `null`).
 * 처리와 규칙(카드 전체 검증, 맞물림, 칸별 409, 기본값과 같은 값은 행 없음, 직전 값 기록)은 `opsSignals/saveThresholds.ts`의 `saveSignalThresholds`가 한다.
 * 이 라우트는 인증·본문 읽기·응답만 맡는다. 응답은 200 `{ thresholds, changed }`, 400 `{ error, fieldErrors? }`, 404, 409, 500이다.
 *
 * 관리자 로그인 세션(`getAdminUser()`)만 통과한다. 읽기 토큰으로는 쓸 수 없다(토큰 쓰기 예외는 제출 경로 하나뿐이다). 읽기 `GET`은 `../../route.ts`다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { saveSignalThresholds } from '@/lib/admin/opsSignals/saveThresholds'

/** 본문 상한(바이트). 기준값은 숫자 몇 개 수준이다. */
const MAX_BODY_BYTES = 16_384

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ signalKey: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { signalKey } = await params

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

  const outcome = await saveSignalThresholds(createServiceClient(), {
    signalKey,
    values: input.values,
    expectedUpdatedAt: input.expectedUpdatedAt,
    actor: admin.id,
  })

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) },
      { status: outcome.status }
    )
  }
  return NextResponse.json({ thresholds: outcome.thresholds, changed: outcome.changed })
}
