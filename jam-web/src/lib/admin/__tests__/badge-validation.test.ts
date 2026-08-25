/**
 * badge-validation — condition_json 데이터 계약 검증 회귀 테스트 (티켓 20260825_029)
 *
 * 배경: 마이그레이션 084_badge_condition_cleanup.sql이 표시용으로 넣은
 * `{"mission_reward": true}`가 badge-engine에서 "알려진 조건 필드 없음 → 검사 스킵 →
 * pass:true"로 처리되어 미션 완료 없이 미션보상배지가 발급된 사고(티켓 20260825_028)로
 * 이어졌다. `findUnknownConditionKeyError`는 이런 "엔진이 모르는 필드"가 애초에 저장되지
 * 못하도록 어드민 API 단계에서 막는다(DB CHECK 제약 102_condition_json_check_constraint.sql
 * 이 최후 방어선이며, 이 테스트는 그와 동일한 규칙을 애플리케이션 레벨에서 검증한다).
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/badge-validation.test.ts`
 */

import { findUnknownConditionKeyError, findCumulativeConditionError } from '../badge-validation'
import { ALL_CONDITION_KEYS } from '@/lib/badge-engine/condition-schema'
import type { BadgeCondition } from '@/types/database'

describe('findUnknownConditionKeyError', () => {
  it('condition이 null이면 통과한다', () => {
    expect(findUnknownConditionKeyError(null)).toBeNull()
  })

  it('허용된 필드만 있는 조건은 통과한다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', distance_km: 30 }
    expect(findUnknownConditionKeyError(cond)).toBeNull()
  })

  it('ALL_CONDITION_KEYS에 정의된 모든 필드는 개별적으로 통과한다', () => {
    for (const key of ALL_CONDITION_KEYS) {
      const cond = { [key]: true } as unknown as BadgeCondition
      expect(findUnknownConditionKeyError(cond)).toBeNull()
    }
  })

  it('mission_reward 단독 조건은 통과한다 (084 사고의 원인 필드지만 허용 목록에 있음)', () => {
    expect(findUnknownConditionKeyError({ mission_reward: true })).toBeNull()
  })

  it('엔진이 모르는 필드가 있으면 에러 메시지를 반환한다', () => {
    const cond = { some_future_field: 123 } as unknown as BadgeCondition
    const error = findUnknownConditionKeyError(cond)
    expect(error).not.toBeNull()
    expect(error).toContain('some_future_field')
  })

  it('알려진 필드와 모르는 필드가 섞여 있어도 잡아낸다', () => {
    const cond = { distance_km: 30, mystery_key: 'x' } as unknown as BadgeCondition
    const error = findUnknownConditionKeyError(cond)
    expect(error).not.toBeNull()
    expect(error).toContain('mystery_key')
    expect(error).not.toContain('distance_km')
  })

  it('빈 객체는 통과한다', () => {
    expect(findUnknownConditionKeyError({})).toBeNull()
  })
})

// findCumulativeConditionError는 기존 함수 — findUnknownConditionKeyError와 나란히 호출되므로
// 회귀 확인 차원에서 최소 동작만 함께 검증한다.
describe('findCumulativeConditionError (기존 동작 확인)', () => {
  it('item 배지에 누적조건이 있으면 에러를 반환한다', () => {
    expect(findCumulativeConditionError('item', { monthly_km: 100 })).not.toBeNull()
  })

  it('activity 배지는 누적조건이 있어도 통과한다', () => {
    expect(findCumulativeConditionError('activity', { monthly_km: 100 })).toBeNull()
  })
})
