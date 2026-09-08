/**
 * 조건 저장 전 사전 시뮬레이션 — 배지·미션 공용 판정 헬퍼 (티켓 20260908_1554, 20260908_1632)
 *
 * 배지 조건(`/api/admin/badges/simulate-condition`)과 미션 `engine_condition` 조건
 * (`/api/admin/missions/simulate-condition`)이 **같은 판정 함수**를 쓴다는 걸 코드로 강제하기
 * 위해 이 파일 하나로 뽑았다. 두 API 라우트는 이 함수를 부르는 얇은 래퍼일 뿐이다.
 *
 * ## 어떻게 판정하는가
 * `evaluateConditionDetailed`(badge-engine)는 이미 순수 함수 형태로 조건 하나를 활동 배열에
 * 대해 평가한다 — 저장 여부와 무관하게 호출할 수 있다. 선택한 유저의 실제 활동 이력(가입
 * 앵커 이후, 발급 판정과 동일한 창)을 그대로 대입해 「지금 이 조건으로 저장하면 이 유저는
 * 어떻게 판정될까」를 계산한다. DB에는 아무것도 쓰지 않는다(dry run 전용) — 조회만 한다.
 *
 * ## ⚠️ 미션 `engine_condition` 타입에 쓸 때의 한계
 * `engine_condition` 미션의 실제 달성 판정은 `evaluateEngineMissionCondition`
 * (`@/lib/missions/engineCondition.ts`)이 맡는다. 그 함수는 이 헬퍼가 쓰는
 * `evaluateConditionDetailed`에 위임 가능한 필드(distance_km·streak_days 등, `BadgeCondition`과
 * 동일 어휘)만 이 함수로 판정하고, 미션 전용 어휘(`weekly_streak_min_count`·`monthly_streak`·
 * `distinct_weekday_count`·`time_band_counts`·`distinct_months_required` 등,
 * `MISSION_ONLY_CONDITION_KEYS`)는 `evaluateEngineMissionCondition`이 별도 로직으로 직접
 * 판정한다 — 이 헬퍼는 그 부분을 평가하지 않는다. 미션 라우트는 `extraAllowedKeys`로 그 키들이
 * "알 수 없는 필드"로 오탐되지 않게만 열어 두고, 그런 키가 조건에 있으면 응답에 표시해 호출부가
 * 고지하게 한다(그 키들이 있으면 이 시뮬레이션 결과가 실제 판정과 다를 수 있다).
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
import { createServiceClient } from '@/lib/supabase/server'
import { evaluateConditionDetailed } from '@/lib/badge-engine'
import { getActivityHistory, getSignupAnchorDate } from '@/lib/strava/activity-history'
import {
  findBlockingConditionKeys,
  describeBlockingConditionKeys,
  hasBlockingConditionKeys,
} from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition } from '@/types/database'

/**
 * `evaluateConditionDetailed`가 «활동 값과 무관하게 항상 같은 이유»로 떨어뜨리는 분기의
 * 고정 문구. 필드 자체가 레지스트리에 없거나(unknown/pending/unpaired) 문제인 경우는
 * `findBlockingConditionKeys`로 먼저 잡히므로 여기 겹치지 않는다 — 그 검사를 통과한
 * 조건인데도 구조적으로 막히는 나머지 분기만 담는다(badge-engine/index.ts 참조).
 */
const STRUCTURAL_BLOCK_REASONS = new Set([
  '조건 없음',
  '회차와 함께 쓸 수 없는 조건',
  '미션 보상 배지 — 미션 완료로만 지급',
  'GPS 경로 매칭으로 별도 발급',
  '평가 가능한 조건 없음',
])

export interface SimulateConditionResult {
  result: { pass: boolean; reason: string; actual: string; required: string }
  kind: 'pass' | 'blocked' | 'unmet'
  fieldBlockedReason: string | null
  activityCount: number
  anchorDate: string | null
}

export type SimulateConditionOutcome =
  | { ok: true; data: SimulateConditionResult }
  | { ok: false; status: number; error: string }

/**
 * 저장하지 않은 조건값을 그대로 선택한 유저의 실제 활동 이력에 대입해 판정한다.
 *
 * @param extraAllowedKeys 레지스트리에 없어도 "알 수 없는 필드"로 막지 않을 키 집합.
 *   미션 전용 어휘를 여는 용도(위 파일 주석 참고) — 배지 라우트는 넘기지 않는다.
 */
export async function simulateCondition(
  condition: Record<string, unknown> | null | undefined,
  userId: string | undefined,
  extraAllowedKeys?: ReadonlySet<string>
): Promise<SimulateConditionOutcome> {
  if (!userId) {
    return { ok: false, status: 400, error: '대상 유저를 선택해주세요.' }
  }

  const supabase = createServiceClient()
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (userError) return { ok: false, status: 500, error: userError.message }
  if (!userRow) return { ok: false, status: 404, error: '유저를 찾을 수 없습니다.' }

  // 필드 자체의 구조적 차단(레지스트리에 없는 키·평가 대기·짝 필드 누락)은 활동 이력을
  // 조회하지 않고도 판정 가능하다 — 먼저 계산해 결과에 함께 실어 보낸다.
  const blocking = findBlockingConditionKeys(condition as BadgeCondition | undefined, extraAllowedKeys)
  const fieldBlocked = hasBlockingConditionKeys(blocking)

  // 실제 발급 판정과 동일한 이력 창 — 가입 앵커 이후 이력 (badge-engine/index.ts
  // evaluateBadgesDetailed와 같은 조회 순서: 앵커 → 그 앵커로 자른 이력).
  const anchorDate = await getSignupAnchorDate(supabase, userId)
  const history = await getActivityHistory(supabase, userId, anchorDate)

  // extraAllowedKeys는 위 findBlockingConditionKeys뿐 아니라 evaluateConditionDetailed
  // 내부의 같은 검사(fail-closed 진입점)에도 그대로 넘겨야 한다 — 안 넘기면 미션 전용 키가
  // 있는 조건이 여기서 다시 "알 수 없는 필드"로 걸려 위에서 계산한 fieldBlocked=false와
  // 모순되는 reason 문구가 나온다(발견: 이 헬퍼 작성 중 curl 검증, 티켓 20260908_1632).
  const evalResult = evaluateConditionDetailed((condition ?? {}) as BadgeCondition, history, {
    anchorDate,
    extraAllowedKeys,
  })

  const kind: 'pass' | 'blocked' | 'unmet' = evalResult.pass
    ? 'pass'
    : fieldBlocked || STRUCTURAL_BLOCK_REASONS.has(evalResult.reason)
      ? 'blocked'
      : 'unmet'

  return {
    ok: true,
    data: {
      result: evalResult,
      kind,
      // fieldBlocked일 때만 의미 있는 구조적 사유 문구 — kind==='blocked'이지만 필드 문제가
      // 아니라 STRUCTURAL_BLOCK_REASONS로 걸린 경우는 evalResult.reason이 이미 사람이 읽을 수
      // 있는 문구라 별도로 만들지 않는다.
      fieldBlockedReason: fieldBlocked ? describeBlockingConditionKeys(blocking) : null,
      activityCount: history.length,
      anchorDate: anchorDate ?? null,
    },
  }
}
