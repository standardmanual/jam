/**
 * GET /api/admin/ops-patterns/[patternNo]/rejections?offset= — 취향 신호의 근거 후보: 이 패턴 항목의 반려 기록 (티켓 20261008_1712, 상위 20260930_1503 ⑩b-1), 운영툴 PRD §11.6
 *
 * 응답 `{ rejections, hasMore, total }`. 시험 묶음은 빼고 최신순이며 **기간 제한이 없다**(결정 기록 API의 92일 제한과 별개). 10건씩 읽고 `offset`(0 이상 정수, 상한 1,000)으로 다음 쪽을 읽는다.
 * 한 줄 `{ id, createdAt, actorType, agentName, bundleId, itemId, itemName, reason }`이고 `actor` 원문·`diff`·`slack_result`는 싣지 않는다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용).
 * - `patternNo`가 `P01` 형식이 아니거나 `offset`이 틀리면 400이다(같은 경로 GET과 같다). 반려 기록이 없는 패턴은 빈 목록이다.
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { parseRejectionOffset } from '@/lib/admin/opsPatterns/input'
import { OPS_PATTERN_NO_INVALID_MESSAGE } from '@/lib/admin/opsPatterns/read'
import { REJECTIONS_LOAD_FAILED_MESSAGE, REJECTION_OFFSET_INVALID_MESSAGE, listPatternRejections } from '@/lib/admin/opsPatterns/tasteWrite'

export async function GET(req: Request, { params }: { params: Promise<{ patternNo: string }> }) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const { patternNo } = await params
  if (!OPS_PATTERN_NO_PATTERN.test(patternNo)) return NextResponse.json({ error: OPS_PATTERN_NO_INVALID_MESSAGE }, { status: 400 })
  const offset = parseRejectionOffset(new URL(req.url).searchParams.get('offset'))
  if (offset === null) return NextResponse.json({ error: REJECTION_OFFSET_INVALID_MESSAGE }, { status: 400 })

  try {
    return NextResponse.json(await listPatternRejections(createServiceClient(), patternNo, { offset }))
  } catch (error) {
    console.error('[admin/ops-patterns] 반려 기록 조회 실패:', error)
    return NextResponse.json({ error: REJECTIONS_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}
