/**
 * 피드 행에 미션·컬렉션 대표 이미지를 붙이는 서버 함수 (2026-11-09 사용자 지시)
 *
 * 고정하는 것: 미션 이벤트(참가·완료·취소)에는 `mission_image_url`, 컬렉션 등급 완성에는 `collection_image_url`을 붙인다.
 * 이미지가 없는 대상·조회 실패·배지 이벤트는 행을 그대로 둔다. 한 종류의 대상은 한 번에 모아 읽는다. 공용 DB는 부르지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/activity-feed/__tests__/attachImages.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ActivityFeedRow, ActivityFeedEventType } from '@/types/database'

type Result = { data: unknown; error: unknown }
const state = vi.hoisted(() => ({ tables: {} as Record<string, Result>, calls: [] as { table: string; ids: unknown[] }[] }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: async (_column: string, ids: unknown[]) => {
          state.calls.push({ table, ids })
          return state.tables[table] ?? { data: [], error: null }
        },
      }),
    }),
  }),
}))

import { attachFeedImages } from '../attachImages'

function row(eventType: ActivityFeedEventType, metadata: Record<string, unknown>, id = `f-${eventType}`): ActivityFeedRow {
  return { id, user_id: 'u1', event_type: eventType, event_at: '2026-11-09T00:00:00Z', created_at: '2026-11-09T00:00:00Z', strava_activity_id: null, metadata } as ActivityFeedRow
}

const meta = (r: ActivityFeedRow) => r.metadata as Record<string, unknown>

beforeEach(() => {
  state.tables = {}
  state.calls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('attachFeedImages', () => {
  it('미션 이벤트에는 미션 대표 이미지를, 컬렉션 완성에는 컬렉션 대표 이미지를 붙인다', async () => {
    state.tables.missions = { data: [{ id: 'm1', image_url: '/m1.png' }], error: null }
    state.tables.item_books = { data: [{ id: 'c1', image_url: '/c1.png' }], error: null }
    const items = [
      row('mission_joined', { mission_id: 'm1', mission_title: 'A' }, 'a'),
      row('mission_completed', { mission_id: 'm1', mission_title: 'A' }, 'b'),
      row('collection_tier_completed', { collection_id: 'c1', collection_name: 'X' }, 'c'),
    ]

    const out = await attachFeedImages(items)

    expect(meta(out[0]).mission_image_url).toBe('/m1.png')
    expect(meta(out[1]).mission_image_url).toBe('/m1.png')
    expect(meta(out[2]).collection_image_url).toBe('/c1.png')
    // 원본은 바뀌지 않는다
    expect('mission_image_url' in meta(items[0])).toBe(false)
  })

  it('같은 종류의 대상은 한 번에 모아 읽는다(중복 제거)', async () => {
    state.tables.missions = { data: [], error: null }
    await attachFeedImages([
      row('mission_joined', { mission_id: 'm1' }, 'a'),
      row('mission_cancelled', { mission_id: 'm1' }, 'b'),
      row('mission_joined', { mission_id: 'm2' }, 'c'),
    ])

    expect(state.calls).toEqual([{ table: 'missions', ids: ['m1', 'm2'] }])
  })

  it('이미지가 없는 대상과 조회 실패는 행을 그대로 둔다', async () => {
    state.tables.missions = { data: [{ id: 'm1', image_url: null }, { id: 'm2', image_url: '' }], error: null }
    const items = [row('mission_joined', { mission_id: 'm1' }, 'a'), row('mission_joined', { mission_id: 'm2' }, 'b')]
    expect(await attachFeedImages(items)).toBe(items)

    state.tables.missions = { data: null, error: { message: 'boom' } }
    expect(await attachFeedImages(items)).toBe(items)
    expect(console.error).toHaveBeenCalled()
  })

  it('배지 이벤트·챕터 오름은 읽지도 바꾸지도 않는다 — 조회 자체가 없다', async () => {
    const items = [
      row('badge_earned', { badge_id: 'b1', badge_image_url: '/b.png' }, 'a'),
      row('item_dropped', { badge_id: 'b2' }, 'b'),
      row('chapter_up', { chapter_no: 3 }, 'c'),
    ]

    expect(await attachFeedImages(items)).toBe(items)
    expect(state.calls).toEqual([])
  })

  it('id가 없거나 문자열이 아니면 건너뛴다', async () => {
    const items = [row('mission_joined', {}, 'a'), row('mission_joined', { mission_id: 5 }, 'b')]

    expect(await attachFeedImages(items)).toBe(items)
    expect(state.calls).toEqual([])
  })
})
