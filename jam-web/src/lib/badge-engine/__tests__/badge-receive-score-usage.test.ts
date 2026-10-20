/**
 * 사용량·행동 지표 배지 새 발급(`issueQualifyingBadges`) → 챕터 점수 «배지 받기» 연결 (티켓 20261019_1315 2a회, 운영 로직 12.2절)
 *
 * `issueQualifyingBadges`는 서비스 사용량(팔로워·팔로잉·동기화)·체크인 보유·JAM! 행동 지표 배지가 공유하는 발급 함수다.
 * `user_activity_badges`에 **새 행을 실제로 넣은** 발급마다 `chapter_add_score('badge_receive')`를 부르는지 고정한다.
 *
 * 검증 대상:
 *  - 새로 발급한 배지는 (유저, 배지) 결정적 원천 id로 센다. 레벨형 연속 발급은 레벨마다 센다
 *  - 세지 않는 것: 23505(이미 보유) · dryRun · 카탈로그 재평가 배치(`triggeredByPrefix: catalog_reevaluation`) · 팔로워·팔로잉 조건 배지 · 이용 정지 유저
 *    (배지 발급 자체는 일어난다)
 *  - 점수 호출이 실패해도 발급 결과·포인트·피드는 그대로다
 *
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/badge-receive-score-usage.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeRow } from '@/types/database'
import { deterministicSourceId } from '@/lib/chapter/source-id'
import { CATALOG_REEVALUATION_TRIGGER } from '../reevaluateCatalog'

const awardPointsMock = vi.hoisted(() => vi.fn(async () => null))
const recordFeedEventMock = vi.hoisted(() => vi.fn(async () => {}))
const logEngineMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/points', () => ({ awardPoints: awardPointsMock }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: recordFeedEventMock }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: logEngineMock }))

import { issueQualifyingBadges } from '../usageBadges'

const USER = 'user-usage-score'

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

interface FakeOptions {
  owned?: string[]
  /** 이 배지 id의 insert는 23505로 거절된다 */
  conflictBadgeIds?: string[]
  suspended?: boolean
  scoreRpcFails?: boolean
}

function fakeClient(options: FakeOptions = {}) {
  const inserts: { user_id: string; badge_id: string; triggered_by: string }[] = []
  const scoreCalls: Record<string, unknown>[] = []
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.is = () => builder
    builder.in = () => builder
    builder.maybeSingle = async () => ({
      data: table === 'user_suspensions' && options.suspended ? { id: 's-1', reason: '운영 정책 위반', suspended_at: '2026-10-01T00:00:00Z' } : null,
      error: null,
    })
    builder.insert = async (payload: { user_id: string; badge_id: string; triggered_by: string }) => {
      inserts.push(payload)
      if (options.conflictBadgeIds?.includes(payload.badge_id)) return { error: { code: '23505', message: 'duplicate key' } }
      return { error: null }
    }
    builder.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: table === 'user_activity_badges' ? (options.owned ?? []).map((id) => ({ badge_id: id })) : [], error: null }).then(resolve)
    return builder
  }
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'chapter_add_score') return { data: null, error: null }
    scoreCalls.push(args)
    if (options.scoreRpcFails) return { data: null, error: { message: '점수 함수 오류' } }
    return { data: [{ score_added: 10, current_chapter: null, reached_chapters: [] }], error: null }
  })
  return { client: { from, rpc } as unknown as SupabaseClient, inserts, scoreCalls }
}

/** 조건값이 항상 임계값을 넘는 발급 호출 */
async function issue(client: SupabaseClient, candidates: BadgeRow[], options?: Parameters<typeof issueQualifyingBadges>[7]) {
  return issueQualifyingBadges(
    client,
    USER,
    candidates,
    () => 1,
    () => 99,
    (b) => `usage_metric:${b.id}`,
    'test',
    options
  )
}

beforeEach(() => {
  awardPointsMock.mockClear()
  recordFeedEventMock.mockClear()
  logEngineMock.mockClear()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('issueQualifyingBadges 새 발급 → «배지 받기» 점수', () => {
  it('새로 발급한 배지는 badge_receive 1단위로 센다 — 원천 id는 (유저, 배지) 결정적 id, 날짜는 보내지 않는다', async () => {
    const { client, inserts, scoreCalls } = fakeClient()

    const earned = await issue(client, [makeBadge({ id: 'sync-badge', name: '동기화', condition_json: { daily_sync_count: 3 } })])

    expect(earned.map((b) => b.id)).toEqual(['sync-badge'])
    expect(inserts).toHaveLength(1)
    expect(scoreCalls).toEqual([
      {
        p_user_id: USER,
        p_activity_kind: 'badge_receive',
        p_source_id: deterministicSourceId('badge_receive', USER, 'sync-badge'),
        p_amount: 1,
      },
    ])
  })

  it('레벨형 연속 발급은 레벨마다 다른 원천 id로 각각 센다', async () => {
    const { client, scoreCalls } = fakeClient()
    const levels = [1, 2, 3].map((level) =>
      makeBadge({ id: `streak-lv${level}`, name: '연속 동기화', rarity: null, level, family_key: 'sync:streak', condition_json: { daily_sync_streak_days: level } })
    )

    const earned = await issue(client, levels)

    expect(earned.map((b) => b.id)).toEqual(['streak-lv1', 'streak-lv2', 'streak-lv3'])
    expect(scoreCalls.map((c) => c.p_source_id)).toEqual(
      ['streak-lv1', 'streak-lv2', 'streak-lv3'].map((id) => deterministicSourceId('badge_receive', USER, id))
    )
  })

  it('등급형은 계열의 최상위 1개만 발급되므로 1번만 센다', async () => {
    const { client, scoreCalls } = fakeClient()
    const tiers = [
      makeBadge({ id: 'g-common', name: '꾸준', rarity: 'common', condition_json: { daily_sync_count: 1 } }),
      makeBadge({ id: 'g-rare', name: '꾸준', rarity: 'rare', condition_json: { daily_sync_count: 2 } }),
    ]

    const earned = await issue(client, tiers)

    expect(earned.map((b) => b.id)).toEqual(['g-rare'])
    expect(scoreCalls.map((c) => c.p_source_id)).toEqual([deterministicSourceId('badge_receive', USER, 'g-rare')])
  })
})

describe('issueQualifyingBadges 새 발급 → 세지 않는 것', () => {
  it('동시 발급 경합(23505)은 이미 보유한 것이라 센다고 하지 않는다', async () => {
    const { client, inserts, scoreCalls } = fakeClient({ conflictBadgeIds: ['sync-badge'] })

    const earned = await issue(client, [makeBadge({ id: 'sync-badge', condition_json: { daily_sync_count: 3 } })])

    expect(earned).toEqual([])
    expect(inserts).toHaveLength(1)
    expect(scoreCalls).toEqual([])
  })

  it('이미 보유한 배지는 후보에서 빠져 센다고 하지 않는다', async () => {
    const { client, inserts, scoreCalls } = fakeClient({ owned: ['sync-badge'] })

    const earned = await issue(client, [makeBadge({ id: 'sync-badge', condition_json: { daily_sync_count: 3 } })])

    expect(earned).toEqual([])
    expect(inserts).toEqual([])
    expect(scoreCalls).toEqual([])
  })

  it('dryRun은 DB에 쓰지 않고 점수도 부르지 않는다', async () => {
    const { client, inserts, scoreCalls } = fakeClient()

    const earned = await issue(client, [makeBadge({ id: 'sync-badge', condition_json: { daily_sync_count: 3 } })], { dryRun: true })

    expect(earned.map((b) => b.id)).toEqual(['sync-badge'])
    expect(inserts).toEqual([])
    expect(scoreCalls).toEqual([])
  })

  it('카탈로그 재평가 배치로 소급 발급된 배지는 발급은 되지만 세지 않는다', async () => {
    const { client, inserts, scoreCalls } = fakeClient()

    const earned = await issue(client, [makeBadge({ id: 'sync-badge', condition_json: { daily_sync_count: 3 } })], {
      silent: true,
      triggeredByPrefix: CATALOG_REEVALUATION_TRIGGER,
    })

    expect(earned.map((b) => b.id)).toEqual(['sync-badge'])
    expect(inserts.map((p) => p.triggered_by)).toEqual([`${CATALOG_REEVALUATION_TRIGGER}:usage_metric:sync-badge`])
    expect(scoreCalls).toEqual([])
  })

  it.each(['follower_count', 'following_count'])('조건 키 %s가 있는 팔로우 배지는 발급은 되지만 세지 않는다', async (key) => {
    const { client, scoreCalls } = fakeClient()

    const earned = await issue(client, [
      makeBadge({ id: 'follow-badge', name: '팔로우', condition_json: { [key]: 10 } }),
      makeBadge({ id: 'sync-badge', name: '동기화', condition_json: { daily_sync_count: 3 } }),
    ])

    expect(earned.map((b) => b.id).sort()).toEqual(['follow-badge', 'sync-badge'])
    expect(scoreCalls.map((c) => c.p_source_id)).toEqual([deterministicSourceId('badge_receive', USER, 'sync-badge')])
  })

  it('이용 정지 중인 유저가 받은 배지는 발급은 되지만 세지 않는다', async () => {
    const { client, inserts, scoreCalls } = fakeClient({ suspended: true })

    const earned = await issue(client, [makeBadge({ id: 'sync-badge', condition_json: { daily_sync_count: 3 } })])

    expect(earned.map((b) => b.id)).toEqual(['sync-badge'])
    expect(inserts).toHaveLength(1)
    expect(scoreCalls).toEqual([])
  })
})

describe('issueQualifyingBadges 새 발급 → 점수 실패는 발급을 막지 않는다', () => {
  it('점수 RPC가 오류여도 발급 결과·포인트·피드는 그대로이고 실패를 기록한다', async () => {
    const { client, inserts, scoreCalls } = fakeClient({ scoreRpcFails: true })
    const badges = [
      makeBadge({ id: 'a', name: 'A', point_reward: 30, condition_json: { daily_sync_count: 1 } }),
      makeBadge({ id: 'b', name: 'B', condition_json: { daily_sync_count: 1 } }),
    ]

    const earned = await issue(client, badges)

    expect(earned.map((b) => b.id).sort()).toEqual(['a', 'b'])
    expect(inserts).toHaveLength(2)
    expect(scoreCalls).toHaveLength(2) // 한 배지의 점수 실패가 다음 배지의 점수를 막지 않는다
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 30, 'badge_point_reward', { sourceBadgeId: 'a' })
    expect(recordFeedEventMock).toHaveBeenCalledTimes(2)
    expect(logEngineMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'badge_receive' }))
  })
})
