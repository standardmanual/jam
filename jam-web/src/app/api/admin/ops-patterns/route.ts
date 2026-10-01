/**
 * GET /api/admin/ops-patterns — 운영 패턴 사전 목록 읽기 (티켓 20261001_2134, 상위 20260930_1503 ②, 운영툴 PRD §11.6)
 *
 * 응답 `{ patterns, commonRules, tasteSignals }`. 에이전트(1504의 주간 루틴)가 한 번 호출로 사전 전체를 읽는다. 처리와 응답 칸은
 * `lib/admin/opsPatterns/read.ts`가 정한다. 이 라우트는 인증·쿼리 읽기·응답만 맡는다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다**(패턴 만들기·고치기는 ⑩a).
 * - 쿼리 `includeArchived=true`일 때만 보관 패턴을 싣는다(기본은 사용 중·쉬는 중). 취향 신호는 보관한 패턴 것까지 싣는다.
 * - 테이블이 비어 있으면(시드 전) 세 목록이 모두 빈 배열이다(오류 아님).
 * - **응답에 관리자 ID(`updated_by`·`confirmed_by`)를 싣지 않는다**(`read.ts`가 읽지도 않는다).
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_PATTERN_LOAD_FAILED_MESSAGE, listOpsCommonRules, listOpsPatterns, listOpsTasteSignals } from '@/lib/admin/opsPatterns/read'

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
