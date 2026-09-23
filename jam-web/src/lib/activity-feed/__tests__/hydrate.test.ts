/**
 * hydrateFeedBadgeInfo() — 반복 발급형 배지의 피드 표시 시각 (티켓 20260923_1237)
 *
 * 반복 발급형 배지는 재발급돼도 user_activity_feed 행이 새로 생기지 않는다(티켓
 * 20260905_0030 §2). 그래서 화면에 뜨는 created_at은 최초 발급 시각에 멈춰 있으면 안 되고,
 * user_activity_badges.earn_history의 마지막 원소(가장 최근 회차) 시각으로 덮어써야 한다.
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
    strava_activity_id: null,
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

describe('hydrateFeedBadgeInfo — 반복 발급형 표시 시각', () => {
  beforeEach(() => {
    fromMock.mockClear()
    badgesResult = { data: [liveBadge] }
  })

  it('earn_history 마지막 원소의 earned_at으로 created_at을 덮어쓴다 (반복 재발급)', async () => {
    earnRowsResult = {
      data: [
        {
          user_id: 'u-1',
          badge_id: 'badge-1',
          earn_count: 3,
          earn_history: [
            { earned_at: '2026-08-01T00:00:00.000Z' },
            { earned_at: '2026-09-10T00:00:00.000Z' },
            { earned_at: '2026-09-20T12:34:56.000Z' },
          ],
        },
      ],
    }

    const [result] = await hydrateFeedBadgeInfo([badgeEarnedItem()])

    expect(result.created_at).toBe('2026-09-20T12:34:56.000Z')
  })

  it('반복형이 아닌 배지(earn_history 1건)는 그 1건 시각을 그대로 써서 사실상 변화가 없다', async () => {
    earnRowsResult = {
      data: [
        {
          user_id: 'u-1',
          badge_id: 'badge-1',
          earn_count: 1,
          earn_history: [{ earned_at: '2026-09-01T00:00:00.000Z' }],
        },
      ],
    }

    const [result] = await hydrateFeedBadgeInfo([badgeEarnedItem({ created_at: '2026-09-01T00:00:00.000Z' })])

    expect(result.created_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('user_activity_badges 행이 없으면(체크인 배지 등) 원래 created_at을 그대로 둔다', async () => {
    earnRowsResult = { data: [] }

    const [result] = await hydrateFeedBadgeInfo([badgeEarnedItem({ created_at: '2026-09-01T00:00:00.000Z' })])

    expect(result.created_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('earn_history 형태가 어긋나면(빈 배열·문자열이 아닌 earned_at) created_at으로 폴백한다', async () => {
    earnRowsResult = {
      data: [
        { user_id: 'u-1', badge_id: 'badge-1', earn_count: 1, earn_history: [] },
      ],
    }

    const [result] = await hydrateFeedBadgeInfo([badgeEarnedItem({ created_at: '2026-09-01T00:00:00.000Z' })])

    expect(result.created_at).toBe('2026-09-01T00:00:00.000Z')
  })
})
