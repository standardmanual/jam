/**
 * badge-validation — condition_json 데이터 계약 검증 회귀 테스트 (티켓 20260825_031)
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

import { findUnknownConditionKeyError, findCumulativeConditionError, findBadgeConditionSaveError, findCheckinBadgeNamesNotFoundError } from '../badge-validation'
import type { SupabaseClient } from '@supabase/supabase-js'
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

/**
 * 사용량 지표(팔로워·팔로잉·일일동기화) + repeat_count 조합 — 저장 시점 가드 (티켓 20260910_1719)
 *
 * 배경: usageBadges.ts는 등급형·레벨형만 지원하는데, isLeveledBadge()가 rarity==null 여부로만
 * 이진 판정해 이 3개 키 중 하나 + repeat_count(반복 획득)를 함께 저장하면 에러 없이 저장은
 * 되지만 실제로는 등급형 경로로 흘러가 repeat_count가 조용히 무시된다. 어드민 저장 API가
 * 실제로 부르는 진입점(findBadgeConditionSaveError)에서 막히고, 그 구체적인 안내 메시지가
 * 나오는지 확인한다(이 3개 키는 티켓 20260910_1557이 `ALL_CONDITION_KEYS`에 이미 등록했으므로
 * `findUnknownConditionKeyError`가 먼저 걸리지 않는다).
 */
describe('findBadgeConditionSaveError — 사용량 지표 + repeat_count 조합 거부 (티켓 20260910_1719)', () => {
  const badge = { name: '테스트 배지', family_key: 'jam:test' }

  it('follower_count + repeat_count는 저장을 막는다', () => {
    const cond = { follower_count: 100, repeat_count: 3 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('등급형·레벨형')
    expect(error).not.toContain('모르는 필드')
  })

  it('following_count + repeat_count는 저장을 막는다', () => {
    const cond = { following_count: 20, repeat_count: 3 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('등급형·레벨형')
  })

  it('daily_sync_count + repeat_count는 저장을 막는다', () => {
    const cond = { daily_sync_count: 7, repeat_count: 3 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('등급형·레벨형')
  })

  it('daily_sync_streak_days + repeat_count는 저장을 막는다 (티켓 20260911_2304)', () => {
    const cond = { daily_sync_streak_days: 7, repeat_count: 3 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('등급형·레벨형')
  })

  it('회귀: 기존에 repeat_count를 쓰는 활동 기반 배지는 영향받지 않는다', () => {
    expect(findBadgeConditionSaveError(badge, 'activity', { repeat_count: 10, distance_km: 5 })).toBeNull()
    expect(
      findBadgeConditionSaveError(badge, 'activity', { repeat_count: 5, activity_type: 'running', total_count: 20 })
    ).toBeNull()
  })

  it('회귀: repeat_count 없는 정상 사용량 지표 조건(등급형·레벨형)은 그대로 저장된다', () => {
    expect(findBadgeConditionSaveError(badge, 'activity', { follower_count: 100 })).toBeNull()
    expect(findBadgeConditionSaveError(badge, 'activity', { following_count: 50 })).toBeNull()
    expect(findBadgeConditionSaveError(badge, 'activity', { daily_sync_count: 7 })).toBeNull()
    expect(findBadgeConditionSaveError(badge, 'activity', { daily_sync_streak_days: 7 })).toBeNull()
  })
})

// findCheckinBadgeNamesNotFoundError — checkin_badge_count의 이름 목록 존재 검증
// (AC5, 티켓 20260914_1725 — "구현 중 택1, 저장 시점 검증을 우선한다")
describe('findCheckinBadgeNamesNotFoundError', () => {
  function makeSupabase(existingCheckinBadgeNames: string[]): SupabaseClient {
    const from = () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: (col: string, names: string[]) => {
          const found = names.filter((n) => existingCheckinBadgeNames.includes(n))
          return Promise.resolve({ data: found.map((name) => ({ name })), error: null })
        },
      }
      return builder
    }
    return { from } as unknown as SupabaseClient
  }

  it('condition이 null이거나 checkin_badge_count가 없으면 통과한다', async () => {
    const supabase = makeSupabase([])
    expect(await findCheckinBadgeNamesNotFoundError(null, supabase)).toBeNull()
    expect(await findCheckinBadgeNamesNotFoundError({ distance_km: 10 }, supabase)).toBeNull()
  })

  it('목록의 이름이 전부 실제 체크인 배지면 통과한다', async () => {
    const supabase = makeSupabase(['성수역', '왕십리역'])
    const cond: BadgeCondition = { checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 } }
    expect(await findCheckinBadgeNamesNotFoundError(cond, supabase)).toBeNull()
  })

  it('존재하지 않는 이름이 있으면 저장을 막고 그 이름을 메시지에 담는다', async () => {
    const supabase = makeSupabase(['성수역'])
    const cond: BadgeCondition = { checkin_badge_count: { checkin_badge_names: ['성수역', '존재하지않는역'], count: 1 } }
    const error = await findCheckinBadgeNamesNotFoundError(cond, supabase)
    expect(error).not.toBeNull()
    expect(error).toContain('존재하지않는역')
    expect(error).not.toContain('checkin_badge_names": ["성수역"')
  })

  it('DB 조회가 실패하면 저장을 막지 않는다(평가 시점이 최종 안전망)', async () => {
    const failingSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: null, error: { message: 'DB 장애' } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient
    const cond: BadgeCondition = { checkin_badge_count: { checkin_badge_names: ['성수역'], count: 1 } }
    expect(await findCheckinBadgeNamesNotFoundError(cond, failingSupabase)).toBeNull()
  })
})
