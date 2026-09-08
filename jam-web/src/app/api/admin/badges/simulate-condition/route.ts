/**
 * 배지 저장 전 조건 사전 시뮬레이션 — 어드민 전용 (티켓 20260908_1554)
 *
 * 판정 로직 자체는 `@/lib/admin/conditionSimulation`의 `simulateCondition` 하나뿐이다 — 이
 * 라우트는 어드민 인증 후 그 함수를 부르는 얇은 래퍼다. 미션 `engine_condition` 타입 전용
 * 래퍼(`/api/admin/missions/simulate-condition`, 티켓 20260908_1632)와 같은 함수를 공유한다.
 *
 * 대상은 기존 유저(`userId`) 또는 가상 활동(`virtualActivity`+`repeatCount`, 티켓 20260908_1631)
 * 중 하나 — 실제 판정 분기는 `simulateCondition`이 맡는다. 이 라우트는 바디를 그대로 전달만 한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { simulateCondition } from '@/lib/admin/conditionSimulation'
import type { VirtualActivityInput } from '@/lib/admin/virtualActivity'
import type { BadgeCondition } from '@/types/database'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const body = await req.json()
  const { condition, userId, virtualActivity, repeatCount } = body as {
    condition?: BadgeCondition | null
    userId?: string
    /** 가상 활동 입력 — 시뮬레이터 폼(`VirtualActivityForm`)이 만든 값(티켓 20260908_1631) */
    virtualActivity?: VirtualActivityInput
    repeatCount?: number
  }

  const outcome = await simulateCondition(condition as Record<string, unknown> | null, {
    userId,
    virtualActivity,
    repeatCount,
  })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json(outcome.data)
}
