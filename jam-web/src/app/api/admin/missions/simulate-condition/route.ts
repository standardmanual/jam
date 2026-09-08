/**
 * 미션(`mission_type='engine_condition'`) 저장 전 조건 사전 시뮬레이션 — 어드민 전용
 * (티켓 20260908_1632)
 *
 * 배지 라우트(`/api/admin/badges/simulate-condition`, 티켓 20260908_1554)와 같은 판정 함수
 * (`@/lib/admin/conditionSimulation`의 `simulateCondition`)를 공유하는 얇은 래퍼다. 새 판정
 * 로직을 만들지 않는다.
 *
 * ⚠️ **한계**: `engine_condition` 미션의 실제 달성 판정은 `evaluateEngineMissionCondition`
 * (`@/lib/missions/engineCondition.ts`)이 맡는다. 그 함수는 이 시뮬레이션이 쓰는
 * `evaluateConditionDetailed`(배지엔진 어휘, distance_km·streak_days 등)에 위임 가능한 필드
 * 외에 **미션 전용 어휘**(`weekly_streak_min_count`·`monthly_streak`·`distinct_weekday_count`·
 * `time_band_counts`·`distinct_months_required` 등, `MISSION_ONLY_CONDITION_KEYS`)를 별도
 * 로직으로 직접 판정한다 — 이 시뮬레이션은 그 부분을 평가하지 않는다. `extraAllowedKeys`로
 * 그 키들이 "알 수 없는 필드"로 오탐되지 않게만 열어 두고, 조건에 그런 키가 있으면
 * `missionOnlyKeysPresent`로 알려 화면이 고지하게 한다 — 이 경우 판정 결과(pass/blocked/unmet)가
 * 실제 미션 판정과 다를 수 있다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { simulateCondition } from '@/lib/admin/conditionSimulation'
import { MISSION_ONLY_CONDITION_KEYS } from '@/lib/missions/condition-keys'
import type { MissionCondition } from '@/types/database'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const body = await req.json()
  const { condition, userId } = body as { condition?: MissionCondition | null; userId?: string }

  const outcome = await simulateCondition(
    condition as Record<string, unknown> | null,
    userId,
    MISSION_ONLY_CONDITION_KEYS
  )
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  const missionOnlyKeysPresent = condition
    ? Object.keys(condition).filter(
        (k) => MISSION_ONLY_CONDITION_KEYS.has(k) && (condition as Record<string, unknown>)[k] !== undefined
      )
    : []

  return NextResponse.json({ ...outcome.data, missionOnlyKeysPresent })
}
