/**
 * 배지 저장 전 조건 사전 시뮬레이션 — 어드민 전용 (티켓 20260908_1554)
 *
 * ## 왜 필요한가
 * `condition_json`은 저장 시점에 필드 「형태」만 정적으로 검사한다
 * (`findBlockingConditionKeys`, `findConditionShapeSaveError`). 실제 발급 가능 여부는 유저의
 * 활동 이력에 대해 배지엔진이 조건을 평가할 때에만 드러나는데, 그 시점이 저장 이후로 미뤄져
 * 있었다. 그래서 회차가 영원히 0에 고정되는 버그(20260908_1438)나 발급 로직이 콘텐츠 스펙과
 * 다르게 동작하는 버그(20260908_1512)가 사후에만 발견됐다.
 *
 * ## 어떻게 판정하는가 — 저장 없이 실제 발급 엔진의 단건 조건 판정 함수를 그대로 재사용
 * 새 판정 로직을 만들지 않는다. `evaluateConditionDetailed`(badge-engine)는 이미 순수 함수
 * 형태로 조건 하나를 활동 배열에 대해 평가한다 — 저장 여부와 무관하게 호출할 수 있다(PRD
 * §7.4 가정, 이 라우트 작성 전 코드로 검증 완료: DB 쓰기가 없고 인자만으로 결과가 결정된다).
 *
 * 대상은 두 가지 중 하나다(티켓 20260908_1631로 두 번째 경로 추가):
 *  1. **기존 유저**: 선택한 유저의 실제 활동 이력(가입 앵커 이후, 발급 판정과 동일한 창)을
 *     그대로 대입해 「지금 이 조건으로 저장하면 이 유저는 어떻게 판정될까」를 계산한다.
 *  2. **가상 활동**: 아직 아무 유저에게도 없는 활동 패턴(GPX 업로드 또는 수치 직접입력, 시뮬레이터
 *     폼 재사용 — `lib/admin/virtualActivity.ts`)을 `NormalizedActivity[]`로 변환해 그대로
 *     대입한다. 가입 앵커 개념이 없으므로 이력 전체가 평가 대상이고 `anchorDate`는 `null`로
 *     응답한다.
 *
 * DB에는 아무것도 쓰지 않는다(dry run 전용) — 유저 경로는 조회만 한다.
 *
 * ## fail-closed 사유를 「정상 미충족」과 구분한다
 * `evaluateConditionDetailed`가 반환하는 실패에는 두 종류가 섞여 있다.
 *  1. 조건은 유효하지만 활동이 아직 그 값에 못 미친 경우 (정상적인 미충족)
 *  2. 조건 자체가 구조적으로 막혀 있어 활동과 무관하게 영원히 통과할 수 없는 경우
 *     (레지스트리에 없는 키, 아직 평가가 구현되지 않은 pending 필드, 짝 필드 누락, 회차+휴식
 *     미지원 조합, 미션 보상 배지, POI 전용 필드, 측정 가능 필드 없음 등)
 * `findBlockingConditionKeys`(conditionRegistry)로 필드 자체의 구조적 차단을 먼저 판정하고,
 * 그 외 나머지 구조적 차단 사유는 `evaluateConditionDetailed`가 돌려주는 고정 문구로 식별한다
 * (아래 STRUCTURAL_BLOCK_REASONS — 전부 활동 값과 무관하게 항상 같은 문구로 떨어지는 분기다).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { evaluateConditionDetailed } from '@/lib/badge-engine'
import { getActivityHistory, getSignupAnchorDate } from '@/lib/strava/activity-history'
import { buildVirtualActivities, type VirtualActivityInput } from '@/lib/admin/virtualActivity'
import {
  findBlockingConditionKeys,
  describeBlockingConditionKeys,
  hasBlockingConditionKeys,
} from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

/**
 * `evaluateConditionDetailed`가 «활동 값과 무관하게 항상 같은 이유»로 떨어뜨리는 분기의
 * 고정 문구. 필드 자체가 레지스트리에 없거나(unknown/pending/unpaired) 문제인 경우는
 * `findBlockingConditionKeys`로 먼저 잡히므로 여기 겹치지 않는다 — 그 검사를 통과한
 * 조건인데도 구조적으로 막히는 나머지 분기만 담는다(index.ts 참조).
 */
const STRUCTURAL_BLOCK_REASONS = new Set([
  '조건 없음',
  '회차와 함께 쓸 수 없는 조건',
  '미션 보상 배지 — 미션 완료로만 지급',
  'GPS 경로 매칭으로 별도 발급',
  '평가 가능한 조건 없음',
])

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

  if (!userId && !virtualActivity) {
    return NextResponse.json({ error: '대상 유저를 선택하거나 가상 활동을 입력해주세요.' }, { status: 400 })
  }

  // 필드 자체의 구조적 차단(레지스트리에 없는 키·평가 대기·짝 필드 누락)은 활동 이력을
  // 조회하지 않고도 판정 가능하다 — 먼저 계산해 결과에 함께 실어 보낸다.
  const blocking = findBlockingConditionKeys(condition ?? undefined)
  const fieldBlocked = hasBlockingConditionKeys(blocking)

  let history: NormalizedActivity[]
  let anchorDate: string | undefined

  if (userId) {
    const supabase = createServiceClient()
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
    if (!userRow) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

    // 실제 발급 판정과 동일한 이력 창 — 가입 앵커 이후 이력 (badge-engine/index.ts
    // evaluateBadgesDetailed와 같은 조회 순서: 앵커 → 그 앵커로 자른 이력).
    anchorDate = await getSignupAnchorDate(supabase, userId)
    history = await getActivityHistory(supabase, userId, anchorDate)
  } else {
    // 가상 활동 — DB 조회 없이 입력값을 그대로 NormalizedActivity[]로 변환한다. 실제 유저가
    // 아니므로 가입 앵커 개념이 없다(이력 전체가 평가 대상).
    if (
      !virtualActivity ||
      typeof virtualActivity.distanceKm !== 'number' ||
      typeof virtualActivity.movingTimeSec !== 'number' ||
      !virtualActivity.startDate
    ) {
      return NextResponse.json({ error: '가상 활동 입력이 올바르지 않습니다.' }, { status: 400 })
    }
    history = buildVirtualActivities(virtualActivity, repeatCount ?? 1)
    anchorDate = undefined
  }

  const evalResult = evaluateConditionDetailed((condition ?? {}) as BadgeCondition, history, { anchorDate })

  const kind: 'pass' | 'blocked' | 'unmet' = evalResult.pass
    ? 'pass'
    : fieldBlocked || STRUCTURAL_BLOCK_REASONS.has(evalResult.reason)
      ? 'blocked'
      : 'unmet'

  return NextResponse.json({
    result: evalResult,
    kind,
    // fieldBlocked일 때만 의미 있는 구조적 사유 문구 — kind==='blocked'이지만 필드 문제가
    // 아니라 STRUCTURAL_BLOCK_REASONS로 걸린 경우는 evalResult.reason이 이미 사람이 읽을 수
    // 있는 문구라 별도로 만들지 않는다.
    fieldBlockedReason: fieldBlocked ? describeBlockingConditionKeys(blocking) : null,
    activityCount: history.length,
    anchorDate: anchorDate ?? null,
  })
}
