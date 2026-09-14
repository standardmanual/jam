import type { SupabaseClient } from '@supabase/supabase-js'
import { CUMULATIVE_CONDITION_FIELDS } from '@/lib/drop-engine/index'
import { ALL_CONDITION_KEYS } from '@/lib/badge-engine/condition-schema'
// 순수 판정은 서버 전용 의존이 없는 파일에 있다 — 어드민 조건 폼(클라이언트 컴포넌트)이
// **같은 문자열**을 쓰려면 이 파일(→ drop-engine → next/headers)을 import할 수 없다.
import {
  findConditionShapeSaveError,
  findUnpairedConditionError,
  findRepeatRestConflictError,
  findUsageMetricRepeatConflictError,
  findRarityLevelError,
  findCrossGateShapeError,
} from './badge-condition-guards'
import type { BadgeCondition, BadgeRow } from '@/types/database'

export {
  findConditionShapeSaveError,
  findUnpairedConditionError,
  findRepeatRestConflictError,
  findUsageMetricRepeatConflictError,
  findRarityLevelError,
  findCrossGateShapeError,
}

/**
 * 아이템 배지(type='item')에 누적조건(monthly_km 등)을 걸면 drop-engine의
 * hasCumulativeCondition()이 항상 true를 반환해 이 배지가 구조적으로 영원히
 * 드랍 후보에 오르지 못한다 — 저장 단계에서 미리 막는다.
 */
export function findCumulativeConditionError(type: string, condition: BadgeCondition | null): string | null {
  if (type !== 'item' || !condition) return null
  const offending = CUMULATIVE_CONDITION_FIELDS.filter((f) => condition[f] !== undefined)
  if (offending.length === 0) return null
  return `아이템 배지에는 누적조건(${offending.join(', ')})을 설정할 수 없습니다. 이 조건이 있으면 드랍 후보에서 영구 제외됩니다.`
}

/**
 * condition_json에 badge-engine이 모르는 필드가 있으면 저장 단계에서 미리 막는다.
 * DB CHECK 제약(badges_condition_json_known_keys, 마이그레이션 102)이 최후 방어선이지만,
 * 그 위반 시 raw Postgres 에러가 그대로 어드민 사용자에게 노출되면 불친절하다 — API
 * 사전 검증으로 한국어 에러 메시지를 먼저 준다(티켓 20260825_031).
 *
 * 배경: 마이그레이션 084가 미션보상배지 15종에 넣은 {"mission_reward": true}처럼, 엔진이
 * 모르는 필드만 있는 조건이 "검사 스킵 → pass:true"로 새어나가 미션 없이 배지가 발급되는
 * 사고가 있었다(티켓 20260825_028). 허용 필드 목록 밖의 키는 애초에 저장을 막는다.
 */
export function findUnknownConditionKeyError(condition: BadgeCondition | null): string | null {
  if (!condition) return null
  const allowed = new Set<string>(ALL_CONDITION_KEYS)
  const unknown = Object.keys(condition).filter((key) => !allowed.has(key))
  if (unknown.length === 0) return null
  return `condition_json에 엔진이 모르는 필드(${unknown.join(', ')})가 있습니다. 허용된 필드만 저장할 수 있습니다.`
}

/**
 * `checkin_badge_count`의 배지 이름 목록(CSV로 입력)에 실제로 존재하지 않는 체크인 배지
 * 이름이 있으면 저장을 막는다(AC5, 티켓 20260914_1725 — "구현 중 택1, 저장 시점 검증을
 * 우선한다"). 이름은 `type='checkin'` 배지로만 해석한다(§2.8 "이름은 유일 식별자가 아니다" —
 * 동명이인이 있어도 체크인 배지로 한정하면 판정 대상이 명확하다).
 *
 * DB 조회가 필요해(체크인 배지 카탈로그 대조) 이 파일의 나머지 검사와 달리 **비동기**다 —
 * `findBadgeConditionSaveError`의 동기 체인에 합류시키지 않고 API 라우트가 별도로 await한다.
 * 조회 자체가 실패하면(DB 장애) 저장을 막지 않는다 — 평가 시점(`evaluateCheckinUsageBadges`)의
 * "카탈로그에 없는 이름은 무시" 처리가 최종 안전망이다.
 */
export async function findCheckinBadgeNamesNotFoundError(
  condition: BadgeCondition | null,
  supabase: SupabaseClient
): Promise<string | null> {
  const names = condition?.checkin_badge_count?.checkin_badge_names
  if (!names || names.length === 0) return null

  const { data, error } = await supabase.from('badges').select('name').eq('type', 'checkin').in('name', names)
  if (error) {
    console.error('[findCheckinBadgeNamesNotFoundError] 체크인 배지 이름 조회 오류:', error)
    return null
  }
  const found = new Set((data ?? []).map((r: { name: string }) => r.name))
  const missing = names.filter((n) => !found.has(n))
  if (missing.length === 0) return null
  return `저장할 수 없습니다. 체크인 배지 이름 목록에 존재하지 않는 이름이 있습니다 — ${missing.join(', ')}. 실제 체크인 배지(type='checkin') 이름과 정확히 일치해야 저장할 수 있어요.`
}

/**
 * 조건 저장 전 검사 전체를 한 번에 돌린다 — 어드민 POST·PUT이 같은 순서로 같은 규칙을
 * 적용하도록 진입점을 하나로 둔다. 첫 번째 오류만 돌려준다(한 번에 한 가지씩 고치게 한다).
 */
export function findBadgeConditionSaveError(
  badge: Pick<BadgeRow, 'name' | 'family_key'>,
  type: string,
  condition: BadgeCondition | null
): string | null {
  return (
    findCumulativeConditionError(type, condition) ??
    findUnknownConditionKeyError(condition) ??
    findConditionShapeSaveError(badge, condition)
  )
}
