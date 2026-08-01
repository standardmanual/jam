import { CUMULATIVE_CONDITION_FIELDS } from '@/lib/drop-engine/index'
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
