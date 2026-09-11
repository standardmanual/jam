/**
 * JAM! 카테고리 — 서비스 사용량 배지(팔로워·팔로잉·하루 동기화 횟수) 회귀 테스트
 * (티켓 20260910_1557)
 *
 * 검증 대상:
 *  ① badge-engine(`evaluateConditionDetailed`)은 이 3개 조건 필드를 항상 fail 처리한다
 *     (mission_reward와 같은 자리 — 실제 판정은 usageBadges.ts가 전담)
 *  ② `evaluateUsageBadges()` — 조건 충족/미충족, 등급형 성장 티어(최상위 1개만),
 *     레벨형 연속 발급(보유 레벨+1부터), 섀도우밴 차단(등급형만), 멱등성
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/usage-badges.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateConditionDetailed } from '../index'
import { findBlockingConditionKeys } from '../conditionRegistry'
import type { BadgeCondition, BadgeRow } from '@/types/database'
import { kstDateString } from '@/lib/notifications/kst'

// ── 배지 fixture — badge-engine-v5.test.ts의 makeBadge()와 동일한 전체 컬럼 ──────
function makeBadge(overrides: Partial<BadgeRow>): BadgeRow {
  return {
    id: `badge-${Math.random()}`,
    name: 'Test Badge',
    description: '',
    type: 'activity',
    rarity: 'common',
    level: null,
    family_key: null,
    sort_order: 0,
    image_url: null,
    condition_json: {},
    activity_types: [],
    patch_available: false,
    patch_price_krw: null,
    tribe_id: null,
    item_book_id: null,
    category: null,
    admin_category: null,
    drop_weight: 0,
    drop_excluded: false,
    drop_condition_json: null,
    valid_from: null,
    valid_until: null,
    point_reward: 0,
    deleted_at: null,
    deactivated_by_item_book_id: null,
    created_at: '2026-01-01T00:00:00Z',
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_video_url: null,
    background_animation: null,
    image_gen_params: null,
    ...overrides,
  }
}

// ── 모킹 ─────────────────────────────────────────────────────────────────

const stub = vi.hoisted(() => ({
  badges: [] as BadgeRow[],
  ownedBadgeIds: [] as string[],
  insertedBadgeIds: [] as string[],
  /** true면 다음 badges 조회를 DB 오류로 만든다 */
  badgesQueryFails: false,
  /** increment_daily_sync_count RPC 호출 기록 — { p_user_id, p_sync_date }[] */
  syncCountRpcCalls: [] as { p_user_id: string; p_sync_date: string }[],
  /** RPC가 돌려줄 값. null이면 에러를 돌려준다 */
  syncCountRpcResult: null as number | null,
  syncCountRpcError: null as { message: string } | null,
  /** `user_daily_sync_counts` 조회가 돌려줄 동기화 발생일(KST) 목록 — daily_sync_streak_days 평가용 */
  syncStreakDates: [] as string[],
  syncStreakDatesError: null as { message: string } | null,
}))

const getUserBanLevelMock = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<'none' | 'soft' | 'hard'>>(async () => 'none')
)

function resetStub() {
  stub.badges = []
  stub.ownedBadgeIds = []
  stub.insertedBadgeIds = []
  stub.badgesQueryFails = false
  stub.syncCountRpcCalls = []
  stub.syncCountRpcResult = null
  stub.syncCountRpcError = null
  stub.syncStreakDates = []
  stub.syncStreakDatesError = null
  getUserBanLevelMock.mockReset()
  getUserBanLevelMock.mockResolvedValue('none')
}

/** supabase-js 쿼리 빌더 흉내 — badge-engine-v5.test.ts의 mockSupabase()와 같은 최소 체인 */
function mockSupabase() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    const self = () => builder
    builder.select = self
    builder.eq = self
    builder.is = self
    builder.or = self
    builder.in = self
    builder.order = self
    // `dailySyncStreak.ts`의 fetchCurrentSyncStreakDays()가 마지막에 부르는 체인 끝 —
    // user_daily_sync_counts만 스텁 값을 돌려주고, 그 외 테이블은 빈 결과로 폴백한다.
    builder.limit = () => {
      if (table !== 'user_daily_sync_counts') return Promise.resolve({ data: null, error: null })
      if (stub.syncStreakDatesError) return Promise.resolve({ data: null, error: stub.syncStreakDatesError })
      return Promise.resolve({ data: stub.syncStreakDates.map((d) => ({ sync_date: d })), error: null })
    }
    builder.insert = (payload: { user_id: string; badge_id: string; triggered_by: string }) => {
      if (table !== 'user_activity_badges') return Promise.resolve({ data: null, error: null })
      // UNIQUE(user_id, badge_id) — 이미 보유한 배지의 INSERT는 23505로 떨어진다
      if (stub.ownedBadgeIds.includes(payload.badge_id)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      stub.insertedBadgeIds.push(payload.badge_id)
      stub.ownedBadgeIds.push(payload.badge_id)
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'badges') {
        if (stub.badgesQueryFails) {
          return Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
        }
        return Promise.resolve({ data: stub.badges, error: null }).then(resolve)
      }
      if (table === 'user_activity_badges') {
        return Promise.resolve({ data: stub.ownedBadgeIds.map((id) => ({ badge_id: id })), error: null }).then(
          resolve
        )
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  }
  const rpc = (name: string, args: { p_user_id: string; p_sync_date: string }) => {
    if (name !== 'increment_daily_sync_count') return Promise.resolve({ data: null, error: null })
    stub.syncCountRpcCalls.push(args)
    if (stub.syncCountRpcError) return Promise.resolve({ data: null, error: stub.syncCountRpcError })
    return Promise.resolve({ data: stub.syncCountRpcResult, error: null })
  }
  return { from, rpc } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
// getUserBanLevel만 모킹하고 shouldAllowDrop·AbusingPolicy는 실제 구현을 쓴다 — rate 테이블이
// 결정론적이라(예: hard_mystic_rate=0.0) Math.random()에 기대지 않고도 차단/허용을 고정할 수 있다.
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: (userId: string) => getUserBanLevelMock(userId) }
})
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

import { evaluateUsageBadges, recordDailySyncAndEvaluate } from '../usageBadges'

beforeEach(() => {
  resetStub()
  vi.clearAllMocks()
  getUserBanLevelMock.mockResolvedValue('none')
})

// ═══════════════════════════════════════════════════════════════════════
// ① badge-engine 밖 — evaluateConditionDetailed는 항상 fail 처리한다
// ═══════════════════════════════════════════════════════════════════════

describe('badge-engine의 evaluateConditionDetailed는 서비스 사용량 조건을 절대 pass시키지 않는다', () => {
  it.each(['follower_count', 'following_count', 'daily_sync_count'] as const)(
    '%s 단독 조건은 「평가 가능한 조건 없음」으로 fail한다',
    (key) => {
      const cond = { [key]: 1 } as BadgeCondition
      const result = evaluateConditionDetailed(cond, [])
      expect(result.pass).toBe(false)
      expect(result.reason).toBe('평가 가능한 조건 없음')
    }
  )

  it('레지스트리는 이 3개 키를 알고 있다 — 오탈자로 분류되지 않는다', () => {
    const blocking = findBlockingConditionKeys({
      follower_count: 1,
      following_count: 1,
      daily_sync_count: 1,
    } as BadgeCondition)
    expect(blocking.unknown).toEqual([])
    expect(blocking.pending).toEqual([])
    expect(blocking.unpaired).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② evaluateUsageBadges() — 실제 판정·발급
// ═══════════════════════════════════════════════════════════════════════

describe('evaluateUsageBadges — 조건 충족/미충족', () => {
  it('조건을 충족하면 발급되고 부수효과(포인트·피드)가 일어난다', async () => {
    const b = makeBadge({
      id: 'follower-common',
      name: '친구부자',
      rarity: 'common',
      point_reward: 50,
      condition_json: { follower_count: 100 },
    })
    stub.badges = [b]

    const { awardPoints } = await import('@/lib/points')
    const { recordFeedEvent } = await import('@/lib/activity-feed')

    const earned = await evaluateUsageBadges('user-1', 'follower_count', 100)

    expect(earned).toEqual([{ id: 'follower-common', name: '친구부자' }])
    expect(stub.insertedBadgeIds).toEqual(['follower-common'])
    expect(vi.mocked(awardPoints)).toHaveBeenCalledWith('user-1', 50, 'badge_point_reward', {
      sourceBadgeId: 'follower-common',
    })
    expect(vi.mocked(recordFeedEvent)).toHaveBeenCalledWith(
      'user-1',
      'badge_earned',
      expect.objectContaining({ badge_id: 'follower-common', rarity: 'common', point_reward: 50 })
    )
  })

  it('조건을 충족하지 못하면 발급되지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'follower-common', condition_json: { follower_count: 100 } })]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 99)
    expect(earned).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })

  it('point_reward가 0이면 포인트를 지급하지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'b1', point_reward: 0, condition_json: { follower_count: 10 } })]
    const { awardPoints } = await import('@/lib/points')
    await evaluateUsageBadges('user-1', 'follower_count', 10)
    expect(vi.mocked(awardPoints)).not.toHaveBeenCalled()
  })

  it('다른 metric 조건을 가진 배지는 후보에 들어가지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'following-badge', condition_json: { following_count: 5 } })]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 999)
    expect(earned).toEqual([])
  })

  it('이미 보유한 배지는 재평가해도 다시 발급(insert)하지 않는다 — 멱등', async () => {
    const b = makeBadge({ id: 'follower-common', condition_json: { follower_count: 10 } })
    stub.badges = [b]
    stub.ownedBadgeIds = ['follower-common']
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 100)
    expect(earned).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })
})

describe('evaluateUsageBadges — 등급형(이름 그룹) 성장 티어', () => {
  it('여러 등급을 한 번에 넘겨도 최상위 tier 1개만 발급된다', async () => {
    stub.badges = [
      makeBadge({ id: 'g-common', name: '친구부자', rarity: 'common', condition_json: { follower_count: 10 } }),
      makeBadge({ id: 'g-rare', name: '친구부자', rarity: 'rare', condition_json: { follower_count: 100 } }),
      makeBadge({ id: 'g-epic', name: '친구부자', rarity: 'epic', condition_json: { follower_count: 1000 } }),
    ]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 500)
    expect(earned.map((e) => e.id)).toEqual(['g-rare'])
    expect(stub.insertedBadgeIds).toEqual(['g-rare'])
  })

  it('이미 Common을 보유했으면 이후 평가에서 Common은 다시 발급되지 않고 Rare만 새로 발급된다', async () => {
    stub.badges = [
      makeBadge({ id: 'g-common', name: '친구부자', rarity: 'common', condition_json: { follower_count: 10 } }),
      makeBadge({ id: 'g-rare', name: '친구부자', rarity: 'rare', condition_json: { follower_count: 100 } }),
    ]
    stub.ownedBadgeIds = ['g-common']
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 200)
    expect(earned.map((e) => e.id)).toEqual(['g-rare'])
  })

  it('최상위 등급의 조건도 못 채우면 그 이름 그룹에서 아무것도 발급되지 않는다', async () => {
    stub.badges = [
      makeBadge({ id: 'g-common', name: '친구부자', rarity: 'common', condition_json: { follower_count: 10 } }),
      makeBadge({ id: 'g-rare', name: '친구부자', rarity: 'rare', condition_json: { follower_count: 100 } }),
    ]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 5)
    expect(earned).toEqual([])
  })
})

describe('evaluateUsageBadges — 레벨형(family_key) 연속 발급', () => {
  it('보유 레벨이 없으면 Lv.1부터 조건을 만족하는 만큼 연속 발급된다', async () => {
    const fam = 'daily-sync-family'
    stub.badges = [
      makeBadge({ id: `${fam}-lv1`, name: '동기화 마스터', rarity: null, level: 1, family_key: fam, condition_json: { daily_sync_count: 3 } }),
      makeBadge({ id: `${fam}-lv2`, name: '동기화 마스터', rarity: null, level: 2, family_key: fam, condition_json: { daily_sync_count: 5 } }),
      makeBadge({ id: `${fam}-lv3`, name: '동기화 마스터', rarity: null, level: 3, family_key: fam, condition_json: { daily_sync_count: 10 } }),
    ]
    const earned = await evaluateUsageBadges('user-1', 'daily_sync_count', 7)
    // Lv1(3)·Lv2(5)는 통과, Lv3(10)은 미달 — 중간 단계 누락 없이 연속 2개만 발급
    expect(earned.map((e) => e.id)).toEqual([`${fam}-lv1`, `${fam}-lv2`])
  })

  it('보유 레벨 + 1부터 이어서 발급된다 — 이미 보유한 레벨은 재발급되지 않는다', async () => {
    const fam = 'daily-sync-family'
    stub.badges = [
      makeBadge({ id: `${fam}-lv1`, rarity: null, level: 1, family_key: fam, condition_json: { daily_sync_count: 3 } }),
      makeBadge({ id: `${fam}-lv2`, rarity: null, level: 2, family_key: fam, condition_json: { daily_sync_count: 5 } }),
      makeBadge({ id: `${fam}-lv3`, rarity: null, level: 3, family_key: fam, condition_json: { daily_sync_count: 10 } }),
    ]
    stub.ownedBadgeIds = [`${fam}-lv1`]
    const earned = await evaluateUsageBadges('user-1', 'daily_sync_count', 12)
    expect(earned.map((e) => e.id)).toEqual([`${fam}-lv2`, `${fam}-lv3`])
  })

  it('중간 레벨 조건을 못 채우면 그 이후 레벨은 프런티어가 막혀 발급되지 않는다', async () => {
    const fam = 'daily-sync-family'
    stub.badges = [
      makeBadge({ id: `${fam}-lv1`, rarity: null, level: 1, family_key: fam, condition_json: { daily_sync_count: 3 } }),
      makeBadge({ id: `${fam}-lv2`, rarity: null, level: 2, family_key: fam, condition_json: { daily_sync_count: 5 } }),
      makeBadge({ id: `${fam}-lv3`, rarity: null, level: 3, family_key: fam, condition_json: { daily_sync_count: 10 } }),
    ]
    const earned = await evaluateUsageBadges('user-1', 'daily_sync_count', 4)
    // Lv2(5) 미달이라 Lv3(10, 조건상으로는 미달이지만 애초에 프런티어가 아니므로 검사조차 안 됨)도 막힌다
    expect(earned.map((e) => e.id)).toEqual([`${fam}-lv1`])
  })
})

describe('evaluateUsageBadges — 섀도우밴은 등급형(rarity)만 차단한다', () => {
  it('hard 밴 유저는 mystic 등급형 배지가 차단된다 (hard_mystic_rate=0.0)', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    stub.badges = [makeBadge({ id: 'g-mystic', rarity: 'mystic', condition_json: { follower_count: 10 } })]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 10)
    expect(earned).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })

  it('hard 밴이어도 common 등급형은 차단되지 않는다 (hard_common_rate=1.0)', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    stub.badges = [makeBadge({ id: 'g-common', rarity: 'common', condition_json: { follower_count: 10 } })]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 10)
    expect(earned.map((e) => e.id)).toEqual(['g-common'])
  })

  it('밴이 없는(none) 유저는 정상 발급된다', async () => {
    stub.badges = [makeBadge({ id: 'g-mystic', rarity: 'mystic', condition_json: { follower_count: 10 } })]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 10)
    expect(earned.map((e) => e.id)).toEqual(['g-mystic'])
  })

  it('hard 밴이어도 레벨형(rarity NULL)은 섀도우밴 게이트의 대상이 아니다', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    stub.badges = [makeBadge({ id: 'lv1', rarity: null, level: 1, family_key: 'fam', condition_json: { daily_sync_count: 3 } })]
    const earned = await evaluateUsageBadges('user-1', 'daily_sync_count', 3)
    expect(earned.map((e) => e.id)).toEqual(['lv1'])
  })
})

describe('evaluateUsageBadges — 조회 실패는 예외를 던지지 않는다', () => {
  it('badges 조회가 실패하면 빈 배열을 반환한다', async () => {
    stub.badgesQueryFails = true
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 100)
    expect(earned).toEqual([])
  })

  it('후보가 없으면(0건) 밴 조회조차 하지 않는다', async () => {
    stub.badges = []
    await evaluateUsageBadges('user-1', 'follower_count', 100)
    expect(getUserBanLevelMock).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ recordDailySyncAndEvaluate() — increment_daily_sync_count RPC + daily_sync_count 평가
// ═══════════════════════════════════════════════════════════════════════

describe('recordDailySyncAndEvaluate — 하루 동기화 카운터 증가 + 배지 평가', () => {
  it('RPC를 오늘(KST) 날짜로 호출하고, 반환된 카운트로 daily_sync_count 배지를 평가한다', async () => {
    stub.syncCountRpcResult = 7
    stub.badges = [makeBadge({ id: 'sync-7', condition_json: { daily_sync_count: 7 } })]

    const earned = await recordDailySyncAndEvaluate('user-1')

    expect(stub.syncCountRpcCalls).toHaveLength(1)
    expect(stub.syncCountRpcCalls[0].p_user_id).toBe('user-1')
    // KST 날짜 형식(YYYY-MM-DD)만 확인한다 — 정확한 「오늘」 값은 테스트 실행 시각에 의존한다
    expect(stub.syncCountRpcCalls[0].p_sync_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(earned.map((e) => e.id)).toEqual(['sync-7'])
  })

  it('카운트가 조건 미만이면 발급되지 않는다', async () => {
    stub.syncCountRpcResult = 3
    stub.badges = [makeBadge({ id: 'sync-7', condition_json: { daily_sync_count: 7 } })]
    const earned = await recordDailySyncAndEvaluate('user-1')
    expect(earned).toEqual([])
  })

  it('RPC가 실패하면 예외를 던지지 않고 빈 배열을 반환한다 — 평가 자체를 시도하지 않는다', async () => {
    stub.syncCountRpcError = { message: 'RPC 실패' }
    stub.badges = [makeBadge({ id: 'sync-7', condition_json: { daily_sync_count: 7 } })]
    const earned = await recordDailySyncAndEvaluate('user-1')
    expect(earned).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ recordDailySyncAndEvaluate() — 연속 동기화 일수(daily_sync_streak_days) 평가
//    (티켓 20260911_2304)
// ═══════════════════════════════════════════════════════════════════════

describe('recordDailySyncAndEvaluate — 연속 동기화 일수 평가', () => {
  it('오늘까지 연속인 날짜가 있으면 그 길이로 daily_sync_streak_days 배지를 평가한다', async () => {
    const today = kstDateString()
    const yesterday = kstDateString(new Date(Date.now() - 86_400_000))
    stub.syncCountRpcResult = 1
    stub.syncStreakDates = [today, yesterday]
    stub.badges = [makeBadge({ id: 'streak-2', condition_json: { daily_sync_streak_days: 2 } })]

    const earned = await recordDailySyncAndEvaluate('user-1')
    expect(earned.map((e) => e.id)).toEqual(['streak-2'])
  })

  it('연속일수가 조건 미만이면 발급되지 않는다', async () => {
    stub.syncCountRpcResult = 1
    stub.syncStreakDates = [kstDateString()] // 오늘 하루뿐 — 연속 1일
    stub.badges = [makeBadge({ id: 'streak-7', condition_json: { daily_sync_streak_days: 7 } })]

    const earned = await recordDailySyncAndEvaluate('user-1')
    expect(earned).toEqual([])
  })

  it('연속 동기화 기록 조회가 실패해도 daily_sync_count 평가는 그대로 진행된다', async () => {
    stub.syncCountRpcResult = 5
    stub.syncStreakDatesError = { message: 'DB 장애' }
    stub.badges = [
      makeBadge({ id: 'sync-5', condition_json: { daily_sync_count: 5 } }),
      makeBadge({ id: 'streak-3', condition_json: { daily_sync_streak_days: 3 } }),
    ]

    const earned = await recordDailySyncAndEvaluate('user-1')
    // 스트릭 조회 실패는 0으로 폴백해 streak-3은 발급되지 않지만, daily_sync_count 평가는 영향받지 않는다.
    expect(earned.map((e) => e.id)).toEqual(['sync-5'])
  })

  it('daily_sync_count·daily_sync_streak_days 둘 다 충족하면 함께 발급된다', async () => {
    const today = kstDateString()
    stub.syncCountRpcResult = 3
    stub.syncStreakDates = [today]
    stub.badges = [
      makeBadge({ id: 'sync-3', condition_json: { daily_sync_count: 3 } }),
      makeBadge({ id: 'streak-1', condition_json: { daily_sync_streak_days: 1 } }),
    ]

    const earned = await recordDailySyncAndEvaluate('user-1')
    expect(new Set(earned.map((e) => e.id))).toEqual(new Set(['sync-3', 'streak-1']))
  })
})
