/**
 * POST /api/admin/ops-inbox/[bundleId]/execute — 예약 등록 (티켓 20261002_1123, 상위 20260930_1500 ③-b)
 *
 * 본문은 둘 중 정확히 하나다. `{ dryRun: true }`는 사전 점검(쓰기 없음), `{ itemIds }`는 실행(요약창이 보인 예약할 항목, 1~60개)이다.
 * 처리와 규칙(선점·그룹 생성·역순 되돌림·결정 기록)은 `opsInbox/execute/run.ts`가 한다. 이 라우트는 인증·입력 확인·응답 뒤 슬랙 글만 맡는다.
 *
 * - 관리자 로그인 세션만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보낸다(토큰 쓰기 예외는 제출 경로 하나뿐이다).
 * - 슬랙 글은 응답이 나간 뒤(`after`) 올린다. 요약은 `#jam-report`, 실패는 `#jam-alert`다. 슬랙이 실패해도 응답과 결정 기록은 그대로다.
 * - 응답에는 DB 오류 원문을 싣지 않는다(핸들러의 쉬운 사유만 싣고 원문은 서버 로그에 남는다).
 */
import { NextResponse, after } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import { dryRunExecution, executeBundle, notifyExecution } from '@/lib/admin/opsInbox/execute/run'

// 그룹마다 등록 전 검사와 자원 생성을 차례로 하고 되돌림까지 한 요청에서 끝낸다(60개까지, PRD §8.2 「한도」).
// 끝나지 못해 「준비중」에 남은 항목은 상태 맞추기가 정리한다.
export const maxDuration = 60

/** 본문 상한(바이트). 항목 ID 60개(UUID)가 3KB 안쪽이라 넉넉하게 잡은 값이다. */
const MAX_BODY_BYTES = 16_384

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
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

  // 사전 점검(`dryRun: true`)과 실행(`itemIds`) 중 정확히 하나.
  const hasDryRun = 'dryRun' in input
  const hasItemIds = 'itemIds' in input
  if (hasDryRun === hasItemIds) return badRequest('사전 점검(dryRun)이나 실행(itemIds) 중 하나만 보내 주세요.')
  if (hasDryRun && input.dryRun !== true) return badRequest('dryRun은 true만 보낼 수 있어요.')

  const service = createServiceClient()

  if (hasDryRun) {
    const result = await dryRunExecution(service, bundleId)
    if (!result.ok) return NextResponse.json({ error: result.error, ...result.extra }, { status: result.status })
    return NextResponse.json(result.body)
  }

  const outcome = await executeBundle(service, { bundleId, itemIds: input.itemIds, actor: admin.id })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.extra }, { status: outcome.status })

  // 응답 뒤 슬랙 글. 실패해도 예약 등록은 성공이고, 결과는 결정 기록에 남긴다(`notifyExecution`은 던지지 않는다).
  after(() => notifyExecution(service, outcome))

  return NextResponse.json(outcome.body)
}
