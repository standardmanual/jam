import { CUMULATIVE_CONDITION_FIELDS } from '@/lib/drop-engine/index'
import { ALL_CONDITION_KEYS } from '@/lib/badge-engine/condition-schema'
import type { BadgeCondition } from '@/types/database'

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
