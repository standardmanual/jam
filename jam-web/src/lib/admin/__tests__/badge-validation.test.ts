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

import {
  findUnknownConditionKeyError,
  findCumulativeConditionError,
  findBadgeConditionSaveError,
  findCheckinBadgeNamesNotFoundError,
  findRecipeFirstSuccessNotFoundError,
} from '../badge-validation'
import { CONDITION_META_KEYS, USAGE_METRIC_CONDITION_KEYS } from '@/lib/badge-engine/conditionRegistry'
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

// 믹스 행동 지표 4종 — 저장 시점 가드 (티켓 20261001_0631)
describe('findBadgeConditionSaveError — 믹스 행동 지표 4종', () => {
  const badge = { name: '믹스 배지', family_key: 'jam:combine' }
  const COMBINE_KEYS = ['combine_attempt_count', 'combine_success_count', 'combine_fail_count', 'recipe_first_success'] as const
  const valueOf = (key: string) => (key === 'recipe_first_success' ? { recipe_id: '3f2a1c7e-8b4d-4e6f-9a10-2b3c4d5e6f70' } : 10)

  it.each(COMBINE_KEYS)('%s 단독 조건은 저장된다', (key) => {
    const cond = { [key]: valueOf(key) } as unknown as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).toBeNull()
  })

  it.each(COMBINE_KEYS)('%s + repeat_count는 저장을 막는다', (key) => {
    const cond = { [key]: valueOf(key), repeat_count: 3 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('등급형·레벨형')
  })

  it.each(COMBINE_KEYS)('%s + 다른 measurable 조건(distance_km)은 저장을 막는다', (key) => {
    const cond = { [key]: valueOf(key), distance_km: 5 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('서비스 사용량 지표')
  })

  it('CONDITION_META_KEYS에서 mission_reward와 보조 키를 뺀 모든 키가 repeat_count 가드에 걸린다 — 지표를 더하면 가드가 자동으로 붙는다', () => {
    // 보조 키(signup_recent_active_days, 티켓 20261001_0633)는 지표가 아니라 `days_since_signup`의 짝이다.
    // 혼자 저장되는 조합은 짝 필드 가드가 다른 문구로 막는다(아래 0633 describe에서 확인한다).
    // `active_week_min_days`(티켓 20261019_0542)도 같은 보조 키다 — 짝은 `active_week_streak`.
    // `jam_week_min_earned`(티켓 20261019_0542 2회)도 보조 키다 — 짝은 `jam_week_count`·`jam_week_streak`.
    const usageKeys = CONDITION_META_KEYS.filter(
      (k) =>
        k !== 'mission_reward' &&
        k !== 'signup_recent_active_days' &&
        k !== 'active_week_min_days' &&
        k !== 'jam_week_min_earned'
    )
    expect(usageKeys.length).toBeGreaterThanOrEqual(10)
    for (const key of usageKeys) {
      const cond = { [key]: 1, repeat_count: 3 } as unknown as BadgeCondition
      const error = findBadgeConditionSaveError(badge, 'activity', cond)
      expect(error, `${key}가 가드에 걸리지 않았다`).not.toBeNull()
      expect(error).toContain('등급형·레벨형')
    }
  })

  it('회귀: mission_reward는 사용량 지표 가드의 대상이 아니다', () => {
    expect(findBadgeConditionSaveError(badge, 'activity', { mission_reward: true, repeat_count: 3 })).toBeNull()
  })
})

// 드랍·픽업 행동 지표 4종 — 저장 시점 가드 (티켓 20261001_0632)
describe('findBadgeConditionSaveError — 드랍·픽업 행동 지표 4종', () => {
  const badge = { name: '드랍 배지', family_key: 'jam:drop' }
  const DROP_PICKUP_KEYS = [
    'drop_item_count',
    'pickup_item_count',
    'pickup_from_user_count',
    'picked_up_by_user_count',
  ] as const

  it.each(DROP_PICKUP_KEYS)('%s 단독 조건은 저장된다', (key) => {
    const cond = { [key]: 5 } as unknown as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).toBeNull()
  })

  it.each(DROP_PICKUP_KEYS)('%s + repeat_count는 저장을 막는다', (key) => {
    const cond = { [key]: 5, repeat_count: 3 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('등급형·레벨형')
  })

  it.each(DROP_PICKUP_KEYS)('%s + 다른 measurable 조건(distance_km)은 저장을 막는다', (key) => {
    const cond = { [key]: 5, distance_km: 5 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('서비스 사용량 지표')
  })

  it('4키는 사용량 지표 목록(USAGE_METRIC_CONDITION_KEYS)에 들어 있다 — 레지스트리 파생이라 가드가 자동으로 붙는다', () => {
    for (const key of DROP_PICKUP_KEYS) {
      expect(USAGE_METRIC_CONDITION_KEYS, `${key}가 사용량 지표 목록에 없다`).toContain(key)
    }
  })

  it('드랍·픽업 지표 둘 이상을 한 배지에 함께 저장하는 것도 막는다(0712 가드)', () => {
    const cond = { drop_item_count: 5, pickup_item_count: 20 } as unknown as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).not.toBeNull()
  })
})

// 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표 — 저장 시점 가드 (티켓 20261001_0633)
describe('findBadgeConditionSaveError — 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표', () => {
  const badge = { name: '진행 배지', family_key: 'jam:progress' }
  const MAIN_KEYS = [
    'mission_complete_count',
    'collection_complete_count',
    'days_since_signup',
    'weekly_active_days',
    'same_spot_checkin_days',
    // 새 JAM 조건 5종과 잼·챕터 3종 (티켓 20261018_1815)
    'capsule_open_count',
    'locked_item_open_count',
    'locked_item_pickup_count',
    'other_tribe_item_kinds_count',
    'cross_tribe_combine_success_count',
    'jam_total_earned',
    'jam_weekly_earned',
    'chapter_reached',
  ] as const

  it.each(MAIN_KEYS)('%s 단독 조건은 저장된다', (key) => {
    const cond = { [key]: 3 } as unknown as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).toBeNull()
  })

  it.each(MAIN_KEYS)('%s + repeat_count는 저장을 막는다', (key) => {
    const cond = { [key]: 3, repeat_count: 3 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('등급형·레벨형')
  })

  it.each(MAIN_KEYS)('%s + 다른 measurable 조건(distance_km)은 저장을 막는다', (key) => {
    const cond = { [key]: 3, distance_km: 5 } as unknown as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('서비스 사용량 지표')
  })

  it('주 키 5개는 사용량 지표 목록에 들어 있다 — 레지스트리 파생이라 가드가 자동으로 붙는다', () => {
    for (const key of MAIN_KEYS) {
      expect(USAGE_METRIC_CONDITION_KEYS, `${key}가 사용량 지표 목록에 없다`).toContain(key)
    }
  })

  it('가입 경과일 + 보조 키(최근 30일 활동일)는 저장된다 — 「한 배지에 사용량 지표 하나」 가드에 걸리지 않는다', () => {
    const cond = { days_since_signup: 100, signup_recent_active_days: 4 } as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).toBeNull()
    expect(USAGE_METRIC_CONDITION_KEYS).not.toContain('signup_recent_active_days')
  })

  it('보조 키 + repeat_count도 짝 없이는 저장을 막는다', () => {
    expect(
      findBadgeConditionSaveError(badge, 'activity', { signup_recent_active_days: 4, repeat_count: 3 } as BadgeCondition)
    ).not.toBeNull()
  })

  it('보조 키만 있으면 저장을 막는다 — 기존 짝 필드 오류 문구 형식', () => {
    const error = findBadgeConditionSaveError(badge, 'activity', { signup_recent_active_days: 4 })
    expect(error).not.toBeNull()
    expect(error).toContain('짝 필드가 없어')
    expect(error).toContain('signup_recent_active_days')
  })

  it('가입 경과일 + 보조 키 + 다른 사용량 지표는 저장을 막는다', () => {
    const cond = { days_since_signup: 100, signup_recent_active_days: 4, weekly_active_days: 3 } as BadgeCondition
    const error = findBadgeConditionSaveError(badge, 'activity', cond)
    expect(error).not.toBeNull()
    expect(error).toContain('한 배지에 하나만')
  })

  it('가입 경과일 + 보조 키 + repeat_count는 저장을 막는다', () => {
    const cond = { days_since_signup: 100, signup_recent_active_days: 4, repeat_count: 3 } as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).not.toBeNull()
  })

  it('가입 경과일 + 보조 키 + 다른 measurable 조건(distance_km)은 저장을 막는다', () => {
    const cond = { days_since_signup: 100, signup_recent_active_days: 4, distance_km: 5 } as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).not.toBeNull()
  })

  it('주 키 5개를 둘 이상 함께 쓰는 것도 막는다(0712 가드)', () => {
    const cond = { mission_complete_count: 3, weekly_active_days: 3 } as BadgeCondition
    expect(findBadgeConditionSaveError(badge, 'activity', cond)).not.toBeNull()
  })
})

describe('findRecipeFirstSuccessNotFoundError', () => {
  const EXISTING_ID = '3f2a1c7e-8b4d-4e6f-9a10-2b3c4d5e6f70'
  const MISSING_ID = '11111111-2222-4333-8444-555555555555'

  function makeSupabase(existingRecipeIds: string[]): { client: SupabaseClient; queried: string[] } {
    const queried: string[] = []
    const from = (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (_col: string, id: string) => {
          if (table === 'combination_recipes') queried.push(id)
          return builder
        },
        maybeSingle: () => {
          const id = queried[queried.length - 1]
          return Promise.resolve({ data: existingRecipeIds.includes(id) ? { id } : null, error: null })
        },
      }
      return builder
    }
    return { client: { from } as unknown as SupabaseClient, queried }
  }

  it('condition이 null이거나 recipe_first_success 키가 없으면 통과하고 DB를 조회하지 않는다', async () => {
    const { client, queried } = makeSupabase([])
    expect(await findRecipeFirstSuccessNotFoundError(null, client)).toBeNull()
    expect(await findRecipeFirstSuccessNotFoundError({ distance_km: 10 }, client)).toBeNull()
    expect(queried).toEqual([])
  })

  it('존재하는 레시피 ID는 통과한다', async () => {
    const { client } = makeSupabase([EXISTING_ID])
    expect(await findRecipeFirstSuccessNotFoundError({ recipe_first_success: { recipe_id: EXISTING_ID } }, client)).toBeNull()
  })

  it('존재하지 않는 레시피 ID는 저장을 막는다', async () => {
    const { client } = makeSupabase([EXISTING_ID])
    const error = await findRecipeFirstSuccessNotFoundError({ recipe_first_success: { recipe_id: MISSING_ID } }, client)
    expect(error).toContain('저장할 수 없습니다')
    expect(error).toContain('존재하지 않는 레시피 ID')
  })

  it.each([
    ['UUID가 아닌 문자열', { recipe_id: 'not-a-uuid' }],
    ['빈 문자열', { recipe_id: '' }],
    ['앞뒤 공백이 붙은 ID', { recipe_id: ` ${EXISTING_ID} ` }],
    ['recipe_id 없음', {}],
    ['숫자', { recipe_id: 123 }],
    ['객체가 아닌 값', 'abc'],
    ['null', null],
    ['배열', [EXISTING_ID]],
  ])('형식이 올바르지 않으면(%s) 저장을 막고 DB를 조회하지 않는다', async (_label, value) => {
    const { client, queried } = makeSupabase([EXISTING_ID])
    const cond = { recipe_first_success: value } as unknown as BadgeCondition
    const error = await findRecipeFirstSuccessNotFoundError(cond, client)
    expect(error).toContain('저장할 수 없습니다')
    expect(error).toContain('레시피 ID 형식이 올바르지 않아요')
    expect(queried).toEqual([])
  })

  it('DB 조회가 실패하면 저장을 막지 않는다', async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'DB 장애' } }) }),
        }),
      }),
    } as unknown as SupabaseClient
    expect(await findRecipeFirstSuccessNotFoundError({ recipe_first_success: { recipe_id: EXISTING_ID } }, failing)).toBeNull()
  })
})
