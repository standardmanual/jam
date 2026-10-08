/**
 * GET·PATCH /api/admin/ops-patterns/[patternNo] — 운영 패턴 사전 상세 읽기(티켓 20261001_2134, 상위 20260930_1503 ②)와 고치기·상태 바꾸기(티켓 20261008_1545 ⑩a-1), 운영툴 PRD §11.6
 *
 * 응답 `{ pattern, tasteSignals }`(그 패턴의 취향 신호만, `sort_order` 순서). `patternNo`가 `P01` 형식이 아니면 400, 없는 번호면 404다.
 * 보관한 패턴도 번호로 직접 읽으면 돌려준다(번호와 기록은 남는다). 처리와 응답 칸은 `lib/admin/opsPatterns/read.ts`가 정한다.
 *
 * - GET 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용).
 * - PATCH(고치기·상태 바꾸기): **관리자 세션만** 통과한다(`getAdminUser()`가 없으면 403, 읽기 토큰은 보지 않는다). 번호 형식이 틀리거나 없는 번호면 404다.
 *   본문에 `status`가 있으면 상태 바꾸기 `{ status, pauseReason?, expectedUpdatedAt }`, 없으면 내용 고치기 `{ ...내용 칸 전체, expectedUpdatedAt }`이다.
 *   둘을 섞으면(`status` + 내용 칸) 400이다. `expectedUpdatedAt`은 필수이고 화면이 본 시각과 다르면 409(DB는 그대로)다.
 *   응답은 200 `{ pattern, changed }`, 400 `{ error, fieldErrors? }`, 404, 409, 500이다. 처리는 `write.ts`가 한다.
 * - **응답에 관리자 ID(`updated_by`·`confirmed_by`)를 싣지 않는다**(`read.ts`가 읽지도 않는다).
 */
import { NextResponse } from 'next/server'
import { getAdminUser, requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import {
  OPS_PATTERN_LOAD_FAILED_MESSAGE,
  OPS_PATTERN_NOT_FOUND_MESSAGE,
  OPS_PATTERN_NO_INVALID_MESSAGE,
  getOpsPattern,
  listOpsTasteSignals,
} from '@/lib/admin/opsPatterns/read'
import { PATTERN_MIXED_PATCH_MESSAGE, changeOpsPatternStatus, updateOpsPattern } from '@/lib/admin/opsPatterns/write'

/** 본문 상한(바이트). 긴 글 칸(2,000자)이 여러 개다. */
const MAX_BODY_BYTES = 65_536
/** 내용 고치기 본문의 칸. `status`와 함께 오면 섞인 요청이다. */
const CONTENT_KEYS = ['name', 'principle', 'userExperience', 'menus', 'samples', 'cardShapes', 'knobs', 'pitfalls'] as const

export async function GET(req: Request, { params }: { params: Promise<{ patternNo: string }> }) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const { patternNo } = await params
  if (!OPS_PATTERN_NO_PATTERN.test(patternNo)) {
    return NextResponse.json({ error: OPS_PATTERN_NO_INVALID_MESSAGE }, { status: 400 })
  }

  try {
    const service = createServiceClient()
    const pattern = await getOpsPattern(service, patternNo)
    if (!pattern) return NextResponse.json({ error: OPS_PATTERN_NOT_FOUND_MESSAGE }, { status: 404 })
    const tasteSignals = await listOpsTasteSignals(service, { patternNo })
    return NextResponse.json({ pattern, tasteSignals })
  } catch (error) {
    console.error('[admin/ops-patterns] 패턴 조회 실패:', error)
    return NextResponse.json({ error: OPS_PATTERN_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ patternNo: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { patternNo } = await params
  if (!OPS_PATTERN_NO_PATTERN.test(patternNo)) return NextResponse.json({ error: OPS_PATTERN_NOT_FOUND_MESSAGE }, { status: 404 })

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

  const context = { actor: admin.id, expectedUpdatedAt: input.expectedUpdatedAt }
  const service = createServiceClient()
  let outcome
  if (input.status !== undefined) {
    if (CONTENT_KEYS.some((key) => input[key] !== undefined)) return badRequest(PATTERN_MIXED_PATCH_MESSAGE)
    outcome = await changeOpsPatternStatus(service, patternNo, { status: input.status, pauseReason: input.pauseReason }, context)
  } else {
    outcome = await updateOpsPattern(service, patternNo, input, context)
  }

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) },
      { status: outcome.status }
    )
  }
  return NextResponse.json({ pattern: outcome.pattern, changed: outcome.changed })
}
