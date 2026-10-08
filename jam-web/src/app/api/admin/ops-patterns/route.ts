/**
 * GET·POST /api/admin/ops-patterns — 운영 패턴 사전 목록 읽기(티켓 20261001_2134, 상위 20260930_1503 ②)와 패턴 만들기(티켓 20261008_1545 ⑩a-1), 운영툴 PRD §11.6
 *
 * 응답 `{ patterns, commonRules, tasteSignals }`. 에이전트(1504의 주간 루틴)가 한 번 호출로 사전 전체를 읽는다. 처리와 응답 칸은
 * `lib/admin/opsPatterns/read.ts`가 정한다. 이 라우트는 인증·쿼리 읽기·응답만 맡는다.
 *
 * - GET 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용).
 * - POST(패턴 만들기): **관리자 세션만** 통과한다(`getAdminUser()`가 없으면 403, 읽기 토큰은 보지 않는다). 본문은 패턴 내용 칸
 *   `{ name, principle, userExperience, menus, samples, cardShapes, knobs, pitfalls }`이고 번호(P19~)·상태(`active`)·출처(`manual`)는 서버가 정한다.
 *   응답은 201 `{ pattern }`, 400 `{ error, fieldErrors? }`, 409(그사이 다른 패턴이 만들어짐), 500이다. 처리는 `write.ts`의 `createOpsPattern`이 한다.
 * - 쿼리 `includeArchived=true`일 때만 보관 패턴을 싣는다(기본은 사용 중·쉬는 중). 취향 신호는 보관한 패턴 것까지 싣는다.
 * - 테이블이 비어 있으면(시드 전) 세 목록이 모두 빈 배열이다(오류 아님).
 * - **응답에 관리자 ID(`updated_by`·`confirmed_by`)를 싣지 않는다**(`read.ts`가 읽지도 않는다).
 */
import { NextResponse } from 'next/server'
import { getAdminUser, requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_PATTERN_LOAD_FAILED_MESSAGE, listOpsCommonRules, listOpsPatterns, listOpsTasteSignals } from '@/lib/admin/opsPatterns/read'
import { createOpsPattern } from '@/lib/admin/opsPatterns/write'

/** 본문 상한(바이트). 긴 글 칸(2,000자)이 여러 개라 규칙 저장보다 크다. */
const MAX_BODY_BYTES = 65_536

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const includeArchived = new URL(req.url).searchParams.get('includeArchived') === 'true'

  try {
    const service = createServiceClient()
    const [patterns, commonRules, tasteSignals] = await Promise.all([
      listOpsPatterns(service, { includeArchived }),
      listOpsCommonRules(service),
      listOpsTasteSignals(service),
    ])
    return NextResponse.json({ patterns, commonRules, tasteSignals })
  } catch (error) {
    console.error('[admin/ops-patterns] 패턴 사전 조회 실패:', error)
    return NextResponse.json({ error: OPS_PATTERN_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function POST(req: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return badRequest('본문이 너무 커요.')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요.')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return badRequest('본문은 객체여야 해요.')

  // 번호·상태·출처는 본문에서 받지 않는다(서버가 정한다).
  const outcome = await createOpsPattern(createServiceClient(), body, { actor: admin.id })
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) },
      { status: outcome.status }
    )
  }
  return NextResponse.json({ pattern: outcome.pattern }, { status: 201 })
}
