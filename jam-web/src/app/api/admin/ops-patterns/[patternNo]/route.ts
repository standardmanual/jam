/**
 * GET /api/admin/ops-patterns/[patternNo] — 운영 패턴 사전 상세 읽기 (티켓 20261001_2134, 상위 20260930_1503 ②, 운영툴 PRD §11.6)
 *
 * 응답 `{ pattern, tasteSignals }`(그 패턴의 취향 신호만, `sort_order` 순서). `patternNo`가 `P01` 형식이 아니면 400, 없는 번호면 404다.
 * 보관한 패턴도 번호로 직접 읽으면 돌려준다(번호와 기록은 남는다). 처리와 응답 칸은 `lib/admin/opsPatterns/read.ts`가 정한다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다.**
 * - **응답에 관리자 ID(`updated_by`·`confirmed_by`)를 싣지 않는다**(`read.ts`가 읽지도 않는다).
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import {
  OPS_PATTERN_LOAD_FAILED_MESSAGE,
  OPS_PATTERN_NOT_FOUND_MESSAGE,
  OPS_PATTERN_NO_INVALID_MESSAGE,
  getOpsPattern,
  listOpsTasteSignals,
} from '@/lib/admin/opsPatterns/read'

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
