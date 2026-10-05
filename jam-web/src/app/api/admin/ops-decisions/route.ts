/**
 * GET /api/admin/ops-decisions — 운영툴 결정 기록 읽기 (티켓 20261004_1639, 상위 20260930_1503 ⑤, 운영툴 PRD §11.10)
 *
 * 응답 `{ range, decisions, nextCursor, byPattern }`. 에이전트(1504의 월간 루틴)가 학습 재료로 읽고, 처리와 응답 칸은
 * `lib/admin/opsDecisions/read.ts`가 정한다. 이 라우트는 인증·쿼리 읽기·응답만 맡는다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다**(결정 기록은 추가만 하고 수정·삭제 API가 없다).
 * - 쿼리 `since`·`until`(기본 최근 4주, 최대 92일)·`patternNo`·`action`·`cursor`. 모양이 틀리면 400이고 조회하지 않는다.
 * - **시험 묶음의 기록은 항상 뺀다.** 시험 묶음을 켜는 쿼리는 받지 않는다(화면이 `lib`를 직접 부를 때만 켠다).
 * - **응답에 관리자 ID(`actor` 원문)·제출 원본(`raw`)·슬랙 결과(`slack_result`)를 싣지 않는다.**
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_DECISION_LOAD_FAILED_MESSAGE, listOpsDecisions, parseDecisionQuery } from '@/lib/admin/opsDecisions/read'

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const parsed = parseDecisionQuery(new URL(req.url).searchParams)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const service = createServiceClient()
    return NextResponse.json(await listOpsDecisions(service, parsed.query))
  } catch (error) {
    console.error('[admin/ops-decisions] 결정 기록 조회 실패:', error)
    return NextResponse.json({ error: OPS_DECISION_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}
