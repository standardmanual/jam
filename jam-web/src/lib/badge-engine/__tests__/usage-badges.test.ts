/**
 * JAM! 카테고리 — 서비스 사용량 배지(팔로워·팔로잉·하루 동기화 횟수) 회귀 테스트
 * (티켓 20260910_1557)
 *
 * 검증 대상:
 *  ① badge-engine(`evaluateConditionDetailed`)은 이 3개 조건 필드를 항상 fail 처리한다
 *     (mission_reward와 같은 자리 — 실제 판정은 usageBadges.ts가 전담)
 *  ② `evaluateUsageBadges()` — 조건 충족/미충족, 등급형 성장 티어(최상위 1개만),
 *     레벨형 연속 발급(보유 레벨+1부터), 고가치 등급 상한 없음(티켓 20261017_1426), 멱등성
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
    show_on_map: true,
    drop_weight: 0,
    drop_excluded: false,
    drop_condition_json: null,
    valid_from: null,
    valid_until: null,
    point_reward: 0,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_video_url: null,
    background_animation: null,
    image_gen_params: null,
    image_source: null,
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

  // ── evaluateCheckinUsageBadges() 전용 (티켓 20260914_1725) ────────────────
  /** `user_checkin_badge_earns` 조회가 돌려줄, 유저가 획득한(distinct) 체크인 배지 id */
  checkinEarnedBadgeIds: [] as string[],
  checkinEarnsQueryFails: false,
  /** 획득한 체크인 배지의 `badges.category`(어드민 직접 지정) — { id, category } */
  badgeCategoryRows: [] as { id: string; category: string | null }[],
  /** 획득한 체크인 배지에 연결된 poi의 카테고리(effective category 폴백) — { linked_badge_id, category } */
  poiCategoryRows: [] as { linked_badge_id: string; category: string }[],
  /** `checkin_badge_count`의 이름→id 해석에 쓰이는 `type='checkin'` 배지 카탈로그 */
  checkinBadgesByName: [] as { id: string; name: string }[],

  // ── 특성 시험용 관측·오류 주입 (티켓 20261019_1445 2회) ────────────────────
  /** `user_activity_badges`에 insert된 전체 페이로드 — `triggered_by` 문자열을 고정하려고 모은다 */
  insertedPayloads: [] as { user_id: string; badge_id: string; triggered_by: string }[],
  /** 읽은 표 — `badges`는 용도별로 `badges:candidates`·`badges:category`·`badges:names`로 나눠 적는다 */
  queryLog: [] as string[],
  /** true면 획득 배지 카테고리 조회(`badges` id,category)가 DB 오류를 돌려준다 */
  badgeCategoryQueryFails: false,
  /** true면 연결 지점 카테고리 조회(`poi`)가 DB 오류를 돌려준다 */
  poiCategoryQueryFails: false,
  /** true면 이름→id 해석 조회(`badges` type=checkin)가 DB 오류를 돌려준다 */
  checkinNamesQueryFails: false,
}))

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
  stub.checkinEarnedBadgeIds = []
  stub.checkinEarnsQueryFails = false
  stub.badgeCategoryRows = []
  stub.poiCategoryRows = []
  stub.checkinBadgesByName = []
  stub.insertedPayloads = []
  stub.queryLog = []
  stub.badgeCategoryQueryFails = false
  stub.poiCategoryQueryFails = false
  stub.checkinNamesQueryFails = false
}

/** supabase-js 쿼리 빌더 흉내 — badge-engine-v5.test.ts의 mockSupabase()와 같은 최소 체인 */
function mockSupabase() {
  const from = (table: string) => {
    // 같은 `badges` 테이블을 세 가지 다른 select로 부른다(후보 조회 `*`, 카테고리 조회
    // `id, category`, 이름 해석 `id, name` + `type='checkin'` 필터) — 체인에 쌓인 select·eq·in을
    // 기록해 `.then`에서 구분한다.
    const state: { select?: string; eq: Record<string, unknown>; in: Record<string, unknown[]> } = { eq: {}, in: {} }
    const builder: Record<string, unknown> = {}
    builder.select = (cols: string) => {
      state.select = cols
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      state.eq[col] = val
      return builder
    }
    builder.is = () => builder
    builder.or = () => builder
    builder.in = (col: string, vals: unknown[]) => {
      state.in[col] = vals
      return builder
    }
    builder.order = () => builder
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
      stub.insertedPayloads.push(payload)
      stub.ownedBadgeIds.push(payload.badge_id)
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'badges') {
        if (state.select === '*') {
          stub.queryLog.push('badges:candidates')
          // evaluateUsageBadges/evaluateCheckinUsageBadges의 후보 조회
          if (stub.badgesQueryFails) {
            return Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
          }
          return Promise.resolve({ data: stub.badges, error: null }).then(resolve)
        }
        if (state.eq.type === 'checkin') {
          stub.queryLog.push('badges:names')
          if (stub.checkinNamesQueryFails) {
            return Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
          }
          // checkin_badge_count 이름→id 해석 — type='checkin' + name in (...)
          const names = (state.in.name ?? []) as string[]
          const rows = stub.checkinBadgesByName.filter((r) => names.includes(r.name))
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        }
        // checkin_category_count의 획득 배지 카테고리 조회 — id in (...)
        stub.queryLog.push('badges:category')
        if (stub.badgeCategoryQueryFails) {
          return Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
        }
        const ids = (state.in.id ?? []) as string[]
        const rows = stub.badgeCategoryRows.filter((r) => ids.includes(r.id))
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      }
      if (table === 'user_activity_badges') {
        return Promise.resolve({ data: stub.ownedBadgeIds.map((id) => ({ badge_id: id })), error: null }).then(
          resolve
        )
      }
      if (table === 'user_checkin_badge_earns') {
        stub.queryLog.push('user_checkin_badge_earns')
        if (stub.checkinEarnsQueryFails) {
          return Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
        }
        return Promise.resolve({
          data: stub.checkinEarnedBadgeIds.map((id) => ({ badge_id: id })),
          error: null,
        }).then(resolve)
      }
      if (table === 'poi') {
        stub.queryLog.push('poi')
        if (stub.poiCategoryQueryFails) {
          return Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
        }
        const ids = (state.in.linked_badge_id ?? []) as string[]
        const rows = stub.poiCategoryRows.filter((r) => ids.includes(r.linked_badge_id))
        return Promise.resolve({ data: rows, error: null }).then(resolve)
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
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

import { evaluateUsageBadges, recordDailySyncAndEvaluate, evaluateCheckinUsageBadges } from '../usageBadges'

beforeEach(() => {
  resetStub()
  vi.clearAllMocks()
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

describe('evaluateUsageBadges — 고가치 등급을 막는 상한이 없다 (티켓 20261017_1426, 옛 섀도우밴 코드는 20261021_1250에서 지움)', () => {
  it('mystic 등급형 배지도 그대로 발급된다', async () => {
    stub.badges = [makeBadge({ id: 'g-mystic', rarity: 'mystic', condition_json: { follower_count: 10 } })]
    const earned = await evaluateUsageBadges('user-1', 'follower_count', 10)
    expect(earned.map((e) => e.id)).toEqual(['g-mystic'])
    expect(stub.insertedBadgeIds).toEqual(['g-mystic'])
  })

  it('레벨형(rarity NULL)도 정상 발급된다', async () => {
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

// ═══════════════════════════════════════════════════════════════════════
// ⑤ evaluateCheckinUsageBadges() — 체크인 배지 보유 조건 2종 (티켓 20260914_1725)
// ═══════════════════════════════════════════════════════════════════════

describe('evaluateCheckinUsageBadges — checkin_category_count(카테고리 보유 개수)', () => {
  it('effective category(badges.category 우선) 기준으로 보유 개수를 세어 발급한다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-badge', condition_json: { checkin_category_count: { category: 'train_subway', count: 2 } } }),
    ]
    stub.checkinEarnedBadgeIds = ['station-a', 'station-b', 'restaurant-a']
    stub.badgeCategoryRows = [
      { id: 'station-a', category: 'train_subway' },
      { id: 'station-b', category: 'train_subway' },
      { id: 'restaurant-a', category: 'michelin' },
    ]

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned.map((e) => e.id)).toEqual(['cat-badge'])
    expect(stub.insertedBadgeIds).toEqual(['cat-badge'])
  })

  it('badges.category가 없으면 연결된 poi.category로 폴백한다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-badge', condition_json: { checkin_category_count: { category: 'michelin', count: 1 } } }),
    ]
    stub.checkinEarnedBadgeIds = ['restaurant-a']
    stub.badgeCategoryRows = [{ id: 'restaurant-a', category: null }]
    stub.poiCategoryRows = [{ linked_badge_id: 'restaurant-a', category: 'michelin' }]

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned.map((e) => e.id)).toEqual(['cat-badge'])
  })

  it('보유 개수가 조건 미만이면 발급되지 않는다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-badge', condition_json: { checkin_category_count: { category: 'train_subway', count: 5 } } }),
    ]
    stub.checkinEarnedBadgeIds = ['station-a']
    stub.badgeCategoryRows = [{ id: 'station-a', category: 'train_subway' }]

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned).toEqual([])
  })
})

describe('evaluateCheckinUsageBadges — checkin_badge_count(지정 목록 보유 개수)', () => {
  it('지정한 이름 목록 중 보유한 이름 개수 ≥ count면 발급된다', async () => {
    stub.badges = [
      makeBadge({
        id: 'list-badge',
        condition_json: { checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역', '건대입구역'], count: 2 } },
      }),
    ]
    stub.checkinBadgesByName = [
      { id: 'seongsu', name: '성수역' },
      { id: 'wangsimni', name: '왕십리역' },
      { id: 'konkuk', name: '건대입구역' },
    ]
    stub.checkinEarnedBadgeIds = ['seongsu', 'wangsimni']

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned.map((e) => e.id)).toEqual(['list-badge'])
  })

  it('목록에 존재하지 않는 이름은 무시하고 나머지 이름만으로 판정한다 (AC5 — 평가 시점 방어)', async () => {
    stub.badges = [
      makeBadge({
        id: 'list-badge',
        condition_json: { checkin_badge_count: { checkin_badge_names: ['성수역', '존재하지않는이름'], count: 1 } },
      }),
    ]
    stub.checkinBadgesByName = [{ id: 'seongsu', name: '성수역' }]
    stub.checkinEarnedBadgeIds = ['seongsu']

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned.map((e) => e.id)).toEqual(['list-badge'])
  })

  it('보유한 이름 개수가 조건 미만이면 발급되지 않는다', async () => {
    stub.badges = [
      makeBadge({
        id: 'list-badge',
        condition_json: { checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 2 } },
      }),
    ]
    stub.checkinBadgesByName = [
      { id: 'seongsu', name: '성수역' },
      { id: 'wangsimni', name: '왕십리역' },
    ]
    stub.checkinEarnedBadgeIds = ['seongsu']

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned).toEqual([])
  })

  it('동명이인 방지 — 이름은 type=checkin 배지로만 해석한다(§2.8)', async () => {
    // 카탈로그에 같은 이름의 checkin 배지 없이 activity 배지만 있으면(모킹상 badges 테이블의
    // type='checkin' 필터로만 조회하므로) 그 이름은 매칭되지 않는다.
    stub.badges = [
      makeBadge({
        id: 'list-badge',
        condition_json: { checkin_badge_count: { checkin_badge_names: ['성수역'], count: 1 } },
      }),
    ]
    stub.checkinBadgesByName = [] // type='checkin' 카탈로그에 '성수역'이 없음(동명이인은 activity 배지)
    stub.checkinEarnedBadgeIds = ['some-activity-badge-with-same-name']

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned).toEqual([])
  })
})

describe('evaluateCheckinUsageBadges — 등급형/레벨형 발급, 고가치 등급 상한 없음', () => {
  it('등급형은 이름 그룹 내 최상위 tier 1개만 발급된다', async () => {
    stub.badges = [
      makeBadge({
        id: 'cat-common',
        name: '지하철 마스터',
        rarity: 'common',
        condition_json: { checkin_category_count: { category: 'train_subway', count: 2 } },
      }),
      makeBadge({
        id: 'cat-rare',
        name: '지하철 마스터',
        rarity: 'rare',
        condition_json: { checkin_category_count: { category: 'train_subway', count: 5 } },
      }),
    ]
    stub.checkinEarnedBadgeIds = ['s1', 's2', 's3', 's4', 's5']
    stub.badgeCategoryRows = ['s1', 's2', 's3', 's4', 's5'].map((id) => ({ id, category: 'train_subway' }))

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned.map((e) => e.id)).toEqual(['cat-rare'])
  })

  it('레벨형은 보유 레벨+1부터 연속 발급된다', async () => {
    const fam = 'checkin-family'
    stub.badges = [
      makeBadge({
        id: `${fam}-lv1`,
        rarity: null,
        level: 1,
        family_key: fam,
        condition_json: { checkin_category_count: { category: 'train_subway', count: 1 } },
      }),
      makeBadge({
        id: `${fam}-lv2`,
        rarity: null,
        level: 2,
        family_key: fam,
        condition_json: { checkin_category_count: { category: 'train_subway', count: 3 } },
      }),
    ]
    stub.checkinEarnedBadgeIds = ['s1', 's2', 's3']
    stub.badgeCategoryRows = ['s1', 's2', 's3'].map((id) => ({ id, category: 'train_subway' }))

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned.map((e) => e.id)).toEqual([`${fam}-lv1`, `${fam}-lv2`])
  })

  it('mystic 등급형 배지도 그대로 발급된다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-mystic', rarity: 'mystic', condition_json: { checkin_category_count: { category: 'train_subway', count: 1 } } }),
    ]
    stub.checkinEarnedBadgeIds = ['s1']
    stub.badgeCategoryRows = [{ id: 's1', category: 'train_subway' }]

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned.map((e) => e.id)).toEqual(['cat-mystic'])
  })
})

describe('evaluateCheckinUsageBadges — 조회 실패·후보 없음은 예외를 던지지 않는다', () => {
  it('후보 배지가 없으면 조회 없이 빈 배열을 반환한다', async () => {
    stub.badges = [makeBadge({ id: 'unrelated', condition_json: { follower_count: 10 } })]
    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned).toEqual([])
  })

  it('체크인 이력 조회가 실패하면 빈 배열을 반환한다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-badge', condition_json: { checkin_category_count: { category: 'train_subway', count: 1 } } }),
    ]
    stub.checkinEarnsQueryFails = true

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(earned).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑥ 특성 시험 — 계산을 순수 함수로 분리하기 전의 현재 동작을 고정한다 (티켓 20261019_1445 2회)
//
// `evaluateCheckinUsageBadges`의 장소 종류·체크인 배지 목록 계산이 `checkinHoldings.ts`의 순수 함수로 옮겨 가도
// 배지 발급 동작은 같아야 한다. 이 블록은 분리 전에 먼저 쓰고, 분리 뒤에도 고치지 않은 채 통과해야 한다.
// 위 ⑤ 블록이 정상 경로를 고정하고, 이 블록은 «경계·중복·오류·값 모양·조회 범위»를 고정한다.
// ═══════════════════════════════════════════════════════════════════════

const CATEGORY_CONDITION = (category: string, count: number): BadgeCondition => ({
  checkin_category_count: { category, count },
})
const LIST_CONDITION = (names: string[], count: number): BadgeCondition => ({
  checkin_badge_count: { checkin_badge_names: names, count },
})

describe('evaluateCheckinUsageBadges 특성 시험 — checkin_category_count 계산', () => {
  it('같은 배지의 방문 기록이 여러 줄이어도 1개로 센다 (distinct)', async () => {
    stub.badges = [makeBadge({ id: 'cat-2', condition_json: CATEGORY_CONDITION('train_subway', 2) })]
    stub.checkinEarnedBadgeIds = ['station-a', 'station-a', 'station-a']
    stub.badgeCategoryRows = [{ id: 'station-a', category: 'train_subway' }]

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })

  it('현재값이 조건값과 같으면 발급한다 (≥, 경계)', async () => {
    stub.badges = [makeBadge({ id: 'cat-2', condition_json: CATEGORY_CONDITION('train_subway', 2) })]
    stub.checkinEarnedBadgeIds = ['station-a', 'station-b']
    stub.badgeCategoryRows = [
      { id: 'station-a', category: 'train_subway' },
      { id: 'station-b', category: 'train_subway' },
    ]

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['cat-2'])
  })

  it('badges.category가 있으면 연결 지점의 카테고리는 쓰지 않는다 (badges.category 우선)', async () => {
    stub.badges = [makeBadge({ id: 'cat-poi', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = ['x']
    stub.badgeCategoryRows = [{ id: 'x', category: 'michelin' }]
    stub.poiCategoryRows = [{ linked_badge_id: 'x', category: 'train_subway' }]

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
  })

  it('연결 지점이 여럿이면 먼저 읽은 줄의 카테고리만 쓴다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-first', condition_json: CATEGORY_CONDITION('michelin', 1) }),
      makeBadge({ id: 'cat-second', name: 'Second', condition_json: CATEGORY_CONDITION('train_subway', 1) }),
    ]
    stub.checkinEarnedBadgeIds = ['x']
    stub.badgeCategoryRows = [{ id: 'x', category: null }]
    stub.poiCategoryRows = [
      { linked_badge_id: 'x', category: 'michelin' },
      { linked_badge_id: 'x', category: 'train_subway' },
    ]

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['cat-first'])
  })

  it('카테고리가 badges에도 연결 지점에도 없는 배지는 어느 카테고리에도 세지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'cat-1', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = ['x']
    stub.badgeCategoryRows = [{ id: 'x', category: null }]
    stub.poiCategoryRows = []

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
  })

  it('방문 기록에는 있어도 badges 표에 행이 없는 배지는 세지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'cat-2', condition_json: CATEGORY_CONDITION('train_subway', 2) })]
    stub.checkinEarnedBadgeIds = ['ghost', 'station-a']
    stub.badgeCategoryRows = [{ id: 'station-a', category: 'train_subway' }]

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
  })

  it('다른 카테고리의 배지는 세지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'cat-2', condition_json: CATEGORY_CONDITION('train_subway', 2) })]
    stub.checkinEarnedBadgeIds = ['station-a', 'restaurant-a']
    stub.badgeCategoryRows = [
      { id: 'station-a', category: 'train_subway' },
      { id: 'restaurant-a', category: 'michelin' },
    ]

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
  })

  it('서로 다른 카테고리를 요구하는 후보는 각자의 카테고리 개수로 판정한다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-subway', name: 'A', condition_json: CATEGORY_CONDITION('train_subway', 2) }),
      makeBadge({ id: 'cat-michelin', name: 'B', condition_json: CATEGORY_CONDITION('michelin', 2) }),
    ]
    stub.checkinEarnedBadgeIds = ['s1', 's2', 'm1']
    stub.badgeCategoryRows = [
      { id: 's1', category: 'train_subway' },
      { id: 's2', category: 'train_subway' },
      { id: 'm1', category: 'michelin' },
    ]

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['cat-subway'])
  })

  it('조건값이 0이면 방문 기록이 없어도 발급된다 (현재 동작 — 0 ≥ 0)', async () => {
    stub.badges = [makeBadge({ id: 'cat-0', condition_json: CATEGORY_CONDITION('train_subway', 0) })]
    stub.checkinEarnedBadgeIds = []

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['cat-0'])
  })

  it('방문 기록이 하나도 없으면 카테고리·연결 지점을 조회하지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'cat-1', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = []

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
    expect(stub.queryLog).toContain('user_checkin_badge_earns')
    expect(stub.queryLog).not.toContain('badges:category')
    expect(stub.queryLog).not.toContain('poi')
  })

  it('획득 배지 카테고리 조회가 오류면 던지지 않고 카테고리를 0개로 보아 발급하지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'cat-1', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = ['station-a']
    stub.badgeCategoryRows = [{ id: 'station-a', category: 'train_subway' }]
    stub.poiCategoryRows = [{ linked_badge_id: 'station-a', category: 'train_subway' }]
    stub.badgeCategoryQueryFails = true

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })

  it('연결 지점 조회만 오류면 badges.category만으로 센다', async () => {
    stub.badges = [makeBadge({ id: 'cat-1', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = ['station-a', 'station-b']
    stub.badgeCategoryRows = [
      { id: 'station-a', category: 'train_subway' },
      { id: 'station-b', category: null },
    ]
    stub.poiCategoryRows = [{ linked_badge_id: 'station-b', category: 'train_subway' }]
    stub.poiCategoryQueryFails = true

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['cat-1'])
  })

  it('triggered_by는 «checkin_category_count:<카테고리>»다', async () => {
    stub.badges = [makeBadge({ id: 'cat-1', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = ['station-a']
    stub.badgeCategoryRows = [{ id: 'station-a', category: 'train_subway' }]

    await evaluateCheckinUsageBadges('user-1')
    expect(stub.insertedPayloads).toEqual([
      { user_id: 'user-1', badge_id: 'cat-1', triggered_by: 'checkin_category_count:train_subway' },
    ])
  })
})

describe('evaluateCheckinUsageBadges 특성 시험 — checkin_badge_count 계산', () => {
  it('같은 이름의 체크인 배지가 둘이면 어느 쪽을 방문해도 그 이름 1개로 센다', async () => {
    stub.badges = [makeBadge({ id: 'list-1', condition_json: LIST_CONDITION(['성수역'], 1) })]
    stub.checkinBadgesByName = [
      { id: 'seongsu-a', name: '성수역' },
      { id: 'seongsu-b', name: '성수역' },
    ]
    stub.checkinEarnedBadgeIds = ['seongsu-b']

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['list-1'])
  })

  it('같은 이름의 배지를 둘 다 방문해도 그 이름은 1개다', async () => {
    stub.badges = [makeBadge({ id: 'list-2', condition_json: LIST_CONDITION(['성수역', '왕십리역'], 2) })]
    stub.checkinBadgesByName = [
      { id: 'seongsu-a', name: '성수역' },
      { id: 'seongsu-b', name: '성수역' },
      { id: 'wangsimni', name: '왕십리역' },
    ]
    stub.checkinEarnedBadgeIds = ['seongsu-a', 'seongsu-b']

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
  })

  it('목록에 같은 이름이 두 번 들어 있으면 두 번 센다 (현재 동작)', async () => {
    stub.badges = [makeBadge({ id: 'list-dup', condition_json: LIST_CONDITION(['성수역', '성수역'], 2) })]
    stub.checkinBadgesByName = [{ id: 'seongsu', name: '성수역' }]
    stub.checkinEarnedBadgeIds = ['seongsu']

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['list-dup'])
  })

  it('현재값이 조건값과 같으면 발급한다 (≥, 경계)', async () => {
    stub.badges = [makeBadge({ id: 'list-2', condition_json: LIST_CONDITION(['성수역', '왕십리역', '건대입구역'], 2) })]
    stub.checkinBadgesByName = [
      { id: 'seongsu', name: '성수역' },
      { id: 'wangsimni', name: '왕십리역' },
      { id: 'konkuk', name: '건대입구역' },
    ]
    stub.checkinEarnedBadgeIds = ['wangsimni', 'konkuk']

    expect((await evaluateCheckinUsageBadges('user-1')).map((e) => e.id)).toEqual(['list-2'])
  })

  it('이름 조회가 오류면 던지지 않고 보유 이름을 0개로 보아 발급하지 않는다', async () => {
    stub.badges = [makeBadge({ id: 'list-1', condition_json: LIST_CONDITION(['성수역'], 1) })]
    stub.checkinBadgesByName = [{ id: 'seongsu', name: '성수역' }]
    stub.checkinEarnedBadgeIds = ['seongsu']
    stub.checkinNamesQueryFails = true

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
    expect(stub.insertedBadgeIds).toEqual([])
  })

  it('목록 후보만 있으면 이름만 조회하고, 카테고리 후보만 있으면 카테고리·연결 지점만 조회한다', async () => {
    stub.badges = [makeBadge({ id: 'list-1', condition_json: LIST_CONDITION(['성수역'], 1) })]
    stub.checkinBadgesByName = [{ id: 'seongsu', name: '성수역' }]
    stub.checkinEarnedBadgeIds = ['seongsu']
    await evaluateCheckinUsageBadges('user-1')
    expect(stub.queryLog).toContain('badges:names')
    expect(stub.queryLog).not.toContain('badges:category')
    expect(stub.queryLog).not.toContain('poi')

    stub.queryLog = []
    stub.badges = [makeBadge({ id: 'cat-1', name: 'Cat', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.badgeCategoryRows = [{ id: 'seongsu', category: 'train_subway' }]
    await evaluateCheckinUsageBadges('user-1')
    expect(stub.queryLog).toContain('badges:category')
    expect(stub.queryLog).toContain('poi')
    expect(stub.queryLog).not.toContain('badges:names')
  })

  it('triggered_by는 «checkin_badge_count»다 (접두어 옵션이 있으면 «접두어:checkin_badge_count»)', async () => {
    stub.badges = [makeBadge({ id: 'list-1', name: 'A', condition_json: LIST_CONDITION(['성수역'], 1) })]
    stub.checkinBadgesByName = [{ id: 'seongsu', name: '성수역' }]
    stub.checkinEarnedBadgeIds = ['seongsu']

    await evaluateCheckinUsageBadges('user-1')
    expect(stub.insertedPayloads.map((p) => p.triggered_by)).toEqual(['checkin_badge_count'])

    stub.insertedPayloads = []
    stub.insertedBadgeIds = []
    stub.ownedBadgeIds = []
    await evaluateCheckinUsageBadges('user-1', undefined, { triggeredByPrefix: 'reeval' })
    expect(stub.insertedPayloads.map((p) => p.triggered_by)).toEqual(['reeval:checkin_badge_count'])
  })
})

describe('evaluateCheckinUsageBadges 특성 시험 — 두 지표 함께·값 모양·dryRun', () => {
  it('한 호출에 카테고리 후보와 목록 후보가 함께 있으면 둘 다 판정해 발급한다', async () => {
    stub.badges = [
      makeBadge({ id: 'cat-1', name: 'Cat', condition_json: CATEGORY_CONDITION('train_subway', 1) }),
      makeBadge({ id: 'list-1', name: 'List', condition_json: LIST_CONDITION(['성수역'], 1) }),
    ]
    stub.checkinBadgesByName = [{ id: 'seongsu', name: '성수역' }]
    stub.checkinEarnedBadgeIds = ['seongsu']
    stub.badgeCategoryRows = [{ id: 'seongsu', category: 'train_subway' }]

    const earned = await evaluateCheckinUsageBadges('user-1')
    expect(new Set(earned.map((e) => e.id))).toEqual(new Set(['cat-1', 'list-1']))
    expect(stub.insertedPayloads.map((p) => p.triggered_by).sort()).toEqual([
      'checkin_badge_count',
      'checkin_category_count:train_subway',
    ])
  })

  it('값 모양이 틀린 조건은 후보에서 빠지고 방문 기록도 읽지 않는다', async () => {
    const malformed = (value: unknown): BadgeCondition => value as BadgeCondition
    stub.badges = [
      makeBadge({ id: 'bad-1', name: 'A', condition_json: malformed({ checkin_category_count: { category: 'train_subway' } }) }),
      makeBadge({ id: 'bad-2', name: 'B', condition_json: malformed({ checkin_category_count: { count: 1 } }) }),
      makeBadge({ id: 'bad-3', name: 'C', condition_json: malformed({ checkin_badge_count: { checkin_badge_names: '성수역', count: 1 } }) }),
      makeBadge({ id: 'bad-4', name: 'D', condition_json: malformed({ checkin_badge_count: { checkin_badge_names: ['성수역'], count: '1' } }) }),
      makeBadge({ id: 'bad-5', name: 'E', condition_json: malformed({ checkin_category_count: null }) }),
    ]
    stub.checkinEarnedBadgeIds = ['seongsu']

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
    expect(stub.queryLog).toEqual(['badges:candidates'])
  })

  it('dryRun이면 insert 없이 받게 될 배지만 돌려준다', async () => {
    stub.badges = [makeBadge({ id: 'cat-1', name: 'Cat', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = ['station-a']
    stub.badgeCategoryRows = [{ id: 'station-a', category: 'train_subway' }]

    const earned = await evaluateCheckinUsageBadges('user-1', undefined, { dryRun: true })
    expect(earned).toEqual([{ id: 'cat-1', name: 'Cat' }])
    expect(stub.insertedPayloads).toEqual([])
  })

  it('이미 보유한 배지는 다시 발급하지 않는다 (멱등)', async () => {
    stub.badges = [makeBadge({ id: 'cat-1', condition_json: CATEGORY_CONDITION('train_subway', 1) })]
    stub.checkinEarnedBadgeIds = ['station-a']
    stub.badgeCategoryRows = [{ id: 'station-a', category: 'train_subway' }]
    stub.ownedBadgeIds = ['cat-1']

    expect(await evaluateCheckinUsageBadges('user-1')).toEqual([])
    expect(stub.insertedPayloads).toEqual([])
  })
})
