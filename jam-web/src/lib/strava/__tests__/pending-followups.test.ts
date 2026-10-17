/**
 * strava/pending-followups — 보류에서 받은 개체의 후속 처리 (티켓 20261017_1425 2회, 서버 보정 a)
 *
 * 고정하는 것:
 * - 받은 개체마다 `badge.point_reward`가 있으면 `awardPoints`(`badge_point_reward`)를, 없으면 부르지 않는다. 피드 `item_dropped`는 개체마다 남기고
 *   바로 지급(`syncIssueRun`)과 같은 메타데이터(`point_reward`는 있을 때만)·활동 귀속(strava id·시작 시각)을 쓴다.
 * - 결산 알림은 활동 하나당 한 조각(`activity_ids: [stravaId]`, `item_badges`)이고, 활동을 모르는 개체는 결산을 만들지 않는다.
 * - 각 후속 처리의 실패(포인트·피드·결산·조회)는 던지지 않고 다음 단계로 간다 — 고르기 응답을 바꾸지 않는다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/pending-followups.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))

import { runPendingFollowUps } from '../pending-followups'
import { recordFeedEvent } from '@/lib/activity-feed'
import { awardPoints } from '@/lib/points'
import { recordActivityRecap } from '@/lib/notifications/recap'

const USER_ID = 'user-1'

interface World {
  claimed: { source_activity_id: string | null; badge_id: string; rarity: string; inventory_item_id: string | null }[]
  badges: { id: string; name: string; image_url: string | null; point_reward: number | null }[]
  activities: { id: string; strava_id: number; start_date: string }[]
  claimedError?: { message: string }
  activityError?: { message: string }
}

function makeFake(world: World): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      maybeSingle: async () => {
        if (table === 'users') return { data: { tribe_id: 'tribe-1' }, error: null }
        if (table === 'tribes') return { data: { name: '바람 트라이브' }, error: null }
        return { data: null, error: null }
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const result =
          table === 'sync_pending_items'
            ? { data: world.claimed, error: world.claimedError ?? null }
            : table === 'badges'
              ? { data: world.badges, error: null }
              : table === 'strava_activities'
                ? { data: world.activities, error: world.activityError ?? null }
                : { data: [], error: null }
        return Promise.resolve(result).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

function baseWorld(): World {
  return {
    claimed: [
      { source_activity_id: 'act-1', badge_id: 'b-rare', rarity: 'rare', inventory_item_id: 'item-1' },
      { source_activity_id: 'act-1', badge_id: 'b-plain', rarity: 'common', inventory_item_id: 'item-2' },
      { source_activity_id: 'act-2', badge_id: 'b-plain', rarity: 'common', inventory_item_id: 'item-3' },
    ],
    badges: [
      { id: 'b-rare', name: '바람의 깃', image_url: 'https://img/rare.png', point_reward: 30 },
      { id: 'b-plain', name: '들꽃', image_url: null, point_reward: null },
    ],
    activities: [
      { id: 'act-1', strava_id: 1001, start_date: '2026-10-16T06:00:00Z' },
      { id: 'act-2', strava_id: 1002, start_date: '2026-10-17T06:00:00Z' },
    ],
  }
}

beforeEach(() => {
  vi.mocked(recordFeedEvent).mockReset().mockResolvedValue(undefined)
  vi.mocked(awardPoints).mockReset().mockResolvedValue(null)
  vi.mocked(recordActivityRecap).mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runPendingFollowUps — 포인트와 피드', () => {
  it('point_reward가 있는 개체만 포인트를 주고, 개체마다 피드를 남긴다', async () => {
    await runPendingFollowUps(makeFake(baseWorld()), USER_ID, ['item-1', 'item-2', 'item-3'])

    expect(awardPoints).toHaveBeenCalledTimes(1)
    expect(awardPoints).toHaveBeenCalledWith(USER_ID, 30, 'badge_point_reward', { sourceBadgeId: 'b-rare' })
    expect(recordFeedEvent).toHaveBeenCalledTimes(3)
  })

  it('피드는 바로 지급과 같은 메타데이터와 활동 귀속을 쓴다', async () => {
    await runPendingFollowUps(makeFake(baseWorld()), USER_ID, ['item-1', 'item-2', 'item-3'])

    expect(recordFeedEvent).toHaveBeenCalledWith(
      USER_ID,
      'item_dropped',
      {
        inventory_item_id: 'item-1',
        badge_id: 'b-rare',
        badge_name: '바람의 깃',
        badge_image_url: 'https://img/rare.png',
        rarity: 'rare',
        poi_name: '',
        tribe_name: '바람 트라이브',
        is_last_piece: false,
        point_reward: 30,
      },
      '2026-10-16T06:00:00Z',
      1001
    )
    // point_reward가 없는 개체는 메타데이터에 point_reward가 없다
    const plainCall = vi.mocked(recordFeedEvent).mock.calls.find((c) => (c[2] as { inventory_item_id: string }).inventory_item_id === 'item-2')
    expect(plainCall?.[2]).not.toHaveProperty('point_reward')
    expect((plainCall?.[2] as { badge_image_url: string }).badge_image_url).toBe('')
  })
})

describe('runPendingFollowUps — 결산 알림', () => {
  it('활동 하나당 한 조각으로 묶는다', async () => {
    await runPendingFollowUps(makeFake(baseWorld()), USER_ID, ['item-1', 'item-2', 'item-3'])

    expect(recordActivityRecap).toHaveBeenCalledTimes(2)
    expect(recordActivityRecap).toHaveBeenCalledWith(USER_ID, {
      activity_ids: [1001],
      item_badges: [
        { inventory_item_id: 'item-1', badge_id: 'b-rare', name: '바람의 깃', rarity: 'rare' },
        { inventory_item_id: 'item-2', badge_id: 'b-plain', name: '들꽃', rarity: 'common' },
      ],
    })
    expect(recordActivityRecap).toHaveBeenCalledWith(USER_ID, {
      activity_ids: [1002],
      item_badges: [{ inventory_item_id: 'item-3', badge_id: 'b-plain', name: '들꽃', rarity: 'common' }],
    })
  })

  it('활동을 모르는 개체는 결산을 만들지 않지만 포인트·피드는 남긴다', async () => {
    const world = baseWorld()
    world.claimed = [{ source_activity_id: null, badge_id: 'b-rare', rarity: 'rare', inventory_item_id: 'item-1' }]

    await runPendingFollowUps(makeFake(world), USER_ID, ['item-1'])

    expect(recordActivityRecap).not.toHaveBeenCalled()
    expect(awardPoints).toHaveBeenCalledTimes(1)
    expect(recordFeedEvent).toHaveBeenCalledWith(USER_ID, 'item_dropped', expect.anything(), undefined, null)
  })
})

describe('runPendingFollowUps — 실패는 던지지 않는다', () => {
  it('포인트 지급이 던져도 피드와 결산은 이어진다', async () => {
    vi.mocked(awardPoints).mockRejectedValue(new Error('points down'))

    await expect(runPendingFollowUps(makeFake(baseWorld()), USER_ID, ['item-1', 'item-2', 'item-3'])).resolves.toBeUndefined()

    expect(recordFeedEvent).toHaveBeenCalledTimes(3)
    expect(recordActivityRecap).toHaveBeenCalledTimes(2)
  })

  it('피드가 던져도 결산은 이어진다', async () => {
    vi.mocked(recordFeedEvent).mockRejectedValue(new Error('feed down'))

    await expect(runPendingFollowUps(makeFake(baseWorld()), USER_ID, ['item-1', 'item-2', 'item-3'])).resolves.toBeUndefined()

    expect(recordActivityRecap).toHaveBeenCalledTimes(2)
  })

  it('결산이 던져도 끝까지 간다', async () => {
    vi.mocked(recordActivityRecap).mockRejectedValue(new Error('recap down'))

    await expect(runPendingFollowUps(makeFake(baseWorld()), USER_ID, ['item-1', 'item-2', 'item-3'])).resolves.toBeUndefined()

    expect(recordActivityRecap).toHaveBeenCalledTimes(2)
  })

  it('보류 기록 조회가 실패하면 아무것도 하지 않고 던지지 않는다', async () => {
    const world = baseWorld()
    world.claimedError = { message: 'db down' }

    await expect(runPendingFollowUps(makeFake(world), USER_ID, ['item-1'])).resolves.toBeUndefined()

    expect(awardPoints).not.toHaveBeenCalled()
    expect(recordFeedEvent).not.toHaveBeenCalled()
    expect(recordActivityRecap).not.toHaveBeenCalled()
  })

  it('활동 조회가 실패해도 포인트·피드는 남기고 결산만 건너뛴다', async () => {
    const world = baseWorld()
    world.activityError = { message: 'db down' }
    world.activities = []

    await expect(runPendingFollowUps(makeFake(world), USER_ID, ['item-1', 'item-2', 'item-3'])).resolves.toBeUndefined()

    expect(awardPoints).toHaveBeenCalledTimes(1)
    expect(recordFeedEvent).toHaveBeenCalledTimes(3)
    expect(recordActivityRecap).not.toHaveBeenCalled()
  })

  it('받은 개체가 없으면 아무것도 읽지 않는다', async () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient

    await runPendingFollowUps(supabase, USER_ID, [])

    expect(supabase.from).not.toHaveBeenCalled()
    expect(recordFeedEvent).not.toHaveBeenCalled()
  })
})
