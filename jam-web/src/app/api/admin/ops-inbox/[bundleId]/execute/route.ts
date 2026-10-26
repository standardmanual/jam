/**
 * POST /api/admin/ops-inbox/[bundleId]/execute — 예약 등록 (티켓 20261002_1123, 상위 20260930_1500 ③-b)
 *
 * 본문은 셋 중 정확히 하나다. `{ dryRun: true }`는 사전 점검(쓰기 없음), `{ badgePreview: true }`는 예약할 JAM! 배지의 소급 지급 수 미리 세기(쓰기 없음, 티켓 20261005_1607 ⑨-b),
 * `{ itemIds }`는 실행(요약창이 보인 예약할 항목, 1~60개)이다.
 * 셋 모두 선택 필드 `approve: true`를 함께 받을 수 있다(티켓 20261026_2022): 검토중 항목도 대상에 넣고, 실행은 검토중 항목을 먼저 승인한 뒤 같은 요청에서 예약한다
 * (「승인하고 예약」). `approve` 없이 보내면 이전과 같다(승인된 항목만 대상).
 * 처리와 규칙(선점·그룹 생성·역순 되돌림·결정 기록)은 `opsInbox/execute/run.ts`가 한다. 이 라우트는 인증·입력 확인·응답 뒤 슬랙 글만 맡는다.
 * 미리 세기는 읽기 전용이라 결정 기록도 슬랙 글도 남기지 않는다. 유저가 많으면 표본으로 세어 오래 걸릴 수 있어(40초까지) 사전 점검과 따로 요청한다.
 *
 * - 관리자 로그인 세션만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보낸다(토큰 쓰기 예외는 제출 경로 하나뿐이다).
 * - 슬랙 글은 응답이 나간 뒤(`after`) 올린다. 요약은 `#jam-report`, 실패는 `#jam-alert`다. 슬랙이 실패해도 응답과 결정 기록은 그대로다.
 * - 응답에는 DB 오류 원문을 싣지 않는다(핸들러의 쉬운 사유만 싣고 원문은 서버 로그에 남는다).
 */
import { NextResponse, after } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyDecision } from '@/lib/admin/opsInbox/decide'
import { badgePreviewExecution, dryRunExecution, executeBundle, notifyExecution } from '@/lib/admin/opsInbox/execute/run'

// 그룹마다 등록 전 검사와 자원 생성을 차례로 하고 되돌림까지 한 요청에서 끝낸다(60개까지, PRD §8.2 「한도」).
// 끝나지 못해 「준비중」에 남은 항목은 상태 맞추기가 정리한다. 배지 미리 세기도 이 안에서 끝낸다(유저를 40초까지 센다).
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

  // 사전 점검(`dryRun: true`)·배지 미리 세기(`badgePreview: true`)·실행(`itemIds`) 중 정확히 하나.
  const hasDryRun = 'dryRun' in input
  const hasBadgePreview = 'badgePreview' in input
  const hasItemIds = 'itemIds' in input
  if ([hasDryRun, hasBadgePreview, hasItemIds].filter(Boolean).length !== 1) {
    return badRequest('사전 점검(dryRun)이나 배지 미리 세기(badgePreview), 실행(itemIds) 중 하나만 보내 주세요.')
  }
  if (hasDryRun && input.dryRun !== true) return badRequest('dryRun은 true만 보낼 수 있어요.')
  if (hasBadgePreview && input.badgePreview !== true) return badRequest('badgePreview는 true만 보낼 수 있어요.')
  if ('approve' in input && input.approve !== true) return badRequest('approve는 true만 보낼 수 있어요.')
  const includeReviewing = input.approve === true

  const service = createServiceClient()

  if (hasDryRun || hasBadgePreview) {
    // `approve` 없이 보낸 요청은 옛 호출과 인자가 같다.
    const run = hasDryRun ? dryRunExecution : badgePreviewExecution
    const result = includeReviewing ? await run(service, bundleId, { includeReviewing }) : await run(service, bundleId)
    if (!result.ok) return NextResponse.json({ error: result.error, ...result.extra }, { status: result.status })
    return NextResponse.json(result.body)
  }

  const outcome = await executeBundle(service, { bundleId, itemIds: input.itemIds, actor: admin.id, ...(includeReviewing ? { includeReviewing } : {}) })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.extra }, { status: outcome.status })

  // 응답 뒤 슬랙 글. 실패해도 예약 등록은 성공이고, 결과는 결정 기록에 남긴다(`notifyExecution`은 던지지 않는다).
  // 승인한 항목이 있으면 승인 글 1건(`#jam-report`)이 먼저, 예약 결과 글이 그 뒤에 나간다.
  after(async () => {
    if (outcome.approval) await notifyDecision(service, outcome.approval)
    await notifyExecution(service, outcome)
  })

  return NextResponse.json(outcome.body)
}
