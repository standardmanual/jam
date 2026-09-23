/**
 * hydrateFeedBadgeInfo() — 반복 발급형 배지의 회차별 가상 피드 항목 (티켓 20260923_1237)
 *
 * 반복 발급형 배지는 재발급돼도 user_activity_feed 행이 새로 생기지 않는다(티켓
 * 20260905_0030 §2). "최근 활동" 피드는 활동 단위로 그 활동에서 얻은 것을 보여주는
 * 화면이므로, user_activity_badges.earn_history(회차별 {earned_at, strava_activity_id})를
 * 렌더 시점에 펼쳐 회차마다 가상 피드 항목을 만들어야 각 회차가 실제로 일어난 활동의
 * 그룹에 나타난다.
 */
import { vi, beforeEach } from 'vitest'

type Row = { id: string; name: string; image_url: string | null; rarity: string | null; level: number | null; deleted_at: string | null }
type EarnRow = { user_id: string; badge_id: string; earn_count: number | null; earn_history: unknown }

let badgesResult: { data: Row[] }
let earnRowsResult: { data: EarnRow[] }

function makeBuilder(result: { data: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  }
  return builder
}

const fromMock = vi.fn((table: string) => {
  if (table === 'badges') return makeBuilder(badgesResult)
  if (table === 'user_activity_badges') return makeBuilder(earnRowsResult)
  throw new Error(`unexpected table: ${table}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: fromMock }),
}))

import { hydrateFeedBadgeInfo } from '../hydrate'
import type { ActivityFeedRow } from '@/types/database'

function badgeEarnedItem(overrides: Partial<ActivityFeedRow> = {}): ActivityFeedRow {
  return {
    id: 'feed-1',
    user_id: 'u-1',
    event_type: 'badge_earned',
    event_at: '2026-09-01T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    strava_activity_id: 111,
    metadata: { badge_id: 'badge-1' },
    ...overrides,
  }
}

const liveBadge: Row = {
  id: 'badge-1',
  name: '이번 주의 약속',
  image_url: 'https://example.com/badge.png',
  rarity: 'common',
  level: null,
  deleted_at: null,
}

describe('hydrateFeedBadgeInfo — 반복 발급형 회차별 가상 피드 항목', () => {
  beforeEach(() => {
    fromMock.mockClear()
    badgesResult = { data: [liveBadge] }
  })

  it('earn_history 회차마다 가상 항목을 만들어 각 회차의 활동 그룹(strava_activity_id)에 배치한다', async () => {
    earnRowsResult = {
      data: [
        {
          user_id: 'u-1',
          badge_id: 'badge-1',
          earn_count: 3,
          earn_history: [
            { earned_at: '2026-08-01T00:00:00.000Z', strava_activity_id: 111 },
            { earned_at: '2026-09-10T00:00:00.000Z', strava_activity_id: 222 },
            { earned_at: '2026-09-20T12:34:56.000Z', strava_activity_id: 333 },
          ],
        },
      ],
    }

    const result = await hydrateFeedBadgeInfo([
      badgeEarnedItem({ metadata: { badge_id: 'badge-1', point_reward: 50 } }),
    ])

    expect(result).toHaveLength(3)
    expect(result.map((r) => r.created_at)).toEqual([
      '2026-08-01T00:00:00.000Z',
      '2026-09-10T00:00:00.000Z',
      '2026-09-20T12:34:56.000Z',
    ])
    expect(result.map((r) => r.strava_activity_id)).toEqual([111, 222, 333])
    // React key로 쓰일 id가 회차마다 달라야 하고, 같은 입력엔 항상 같은 값이어야 한다.
    expect(result.map((r) => r.id)).toEqual(['feed-1::0', 'feed-1::1', 'feed-1::2'])
    // 포인트는 최초 발급(첫 회차)에만 실린다 — 이중 계산 금지 (badge-engine awardPoints는 1회만 지급).
    expect(result[0].metadata.point_reward).toBe(50)
    expect(result[1].metadata.point_reward).toBeUndefined()
    expect(result[2].metadata.point_reward).toBeUndefined()
    // 가상 항목은 항상 단건 취급이라 "×N" 회차 칩(earn_count)을 그리지 않는다.
    expect(result.every((r) => r.metadata.earn_count === undefined)).toBe(true)
    // 배지 메타데이터는 최신값으로 갱신된다.
    expect(result.every((r) => r.metadata.badge_name === '이번 주의 약속')).toBe(true)
  })

  it('반복형이 아닌 배지(earn_history 1건)는 가상 항목도 1개만 생성돼 카드 수가 바뀌지 않는다', async () => {
    earnRowsResult = {
      data: [
        {
          user_id: 'u-1',
          badge_id: 'badge-1',
          earn_count: 1,
          earn_history: [{ earned_at: '2026-09-01T00:00:00.000Z', strava_activity_id: 111 }],
        },
      ],
    }

    const result = await hydrateFeedBadgeInfo([badgeEarnedItem({ created_at: '2026-09-01T00:00:00.000Z' })])

    expect(result).toHaveLength(1)
    expect(result[0].created_at).toBe('2026-09-01T00:00:00.000Z')
    expect(result[0].strava_activity_id).toBe(111)
  })

  it('user_activity_badges 행이 없으면(체크인 배지 등) 원래 항목을 그대로 단건 반환한다', async () => {
    earnRowsResult = { data: [] }

    const result = await hydrateFeedBadgeInfo([badgeEarnedItem({ created_at: '2026-09-01T00:00:00.000Z' })])

    expect(result).toHaveLength(1)
    expect(result[0].created_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('earn_history 형태가 어긋나면(빈 배열·문자열이 아닌 earned_at) 원래 항목을 그대로 단건 반환한다', async () => {
    earnRowsResult = {
      data: [
        { user_id: 'u-1', badge_id: 'badge-1', earn_count: 1, earn_history: [] },
      ],
    }

    const result = await hydrateFeedBadgeInfo([badgeEarnedItem({ created_at: '2026-09-01T00:00:00.000Z' })])

    expect(result).toHaveLength(1)
    expect(result[0].created_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('strava_activity_id가 없는 회차(체크인·POI 트리거)는 원본 항목의 strava_activity_id로 대체된다', async () => {
    earnRowsResult = {
      data: [
        {
          user_id: 'u-1',
          badge_id: 'badge-1',
          earn_count: 1,
          earn_history: [{ earned_at: '2026-09-05T00:00:00.000Z' }],
        },
      ],
    }

    const result = await hydrateFeedBadgeInfo([badgeEarnedItem({ strava_activity_id: 999 })])

    expect(result).toHaveLength(1)
    expect(result[0].strava_activity_id).toBe(999)
  })
})
