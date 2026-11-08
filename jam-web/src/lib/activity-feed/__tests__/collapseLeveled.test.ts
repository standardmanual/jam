import { describe, it, expect } from 'vitest'
import type { ActivityFeedRow, BadgeRow } from '@/types/database'
import { collapseLeveledBadgeBursts, pickHighestLevelPerFamily } from '../collapseLeveled'

function row(id: string, over: Partial<ActivityFeedRow> & { meta?: Record<string, unknown> }): ActivityFeedRow {
  const { meta, ...rest } = over
  return {
    id,
    user_id: 'u1',
    event_type: 'badge_earned',
    event_at: '2026-11-06T01:12:10Z',
    created_at: '2026-11-06T01:12:10Z',
    strava_activity_id: null,
    metadata: { badge_name: 'A', family_key: 'fam:A', level: 1, ...meta },
    ...rest,
  } as unknown as ActivityFeedRow
}
const at = (s: number) => new Date(Date.UTC(2026, 10, 6, 1, 12, 10 + s)).toISOString()
const lv = (r: ActivityFeedRow) => (r.metadata as Record<string, unknown>).level

describe('collapseLeveledBadgeBursts', () => {
  it('2초 안의 Lv.1~5는 Lv.5 한 건이 되고 point_reward가 합산된다', () => {
    const input = [5, 4, 3, 2, 1].map((n) => row(`r${n}`, { created_at: at(n - 1), meta: { level: n, point_reward: 10 } }))
    const out = collapseLeveledBadgeBursts(input)
    expect(out).toHaveLength(1)
    expect(lv(out[0])).toBe(5)
    expect((out[0].metadata as Record<string, unknown>).point_reward).toBe(50)
  })
  it('11분 떨어진 Lv.1과 Lv.2는 둘 다 남는다', () => {
    const out = collapseLeveledBadgeBursts([
      row('b', { created_at: at(660), meta: { level: 2 } }),
      row('a', { created_at: at(0), meta: { level: 1 } }),
    ])
    expect(out).toHaveLength(2)
  })
  it('다른 유저의 같은 계열은 섞이지 않는다', () => {
    const out = collapseLeveledBadgeBursts([
      row('b', { user_id: 'u2', created_at: at(1), meta: { level: 2 } }),
      row('a', { user_id: 'u1', created_at: at(0), meta: { level: 1 } }),
    ])
    expect(out).toHaveLength(2)
  })
  it('레벨 없는 배지·아이템 이벤트는 그대로 둔다', () => {
    const input = [
      row('g1', { created_at: at(1), meta: { level: null, rarity: 'rare' } }),
      row('g2', { created_at: at(0), meta: { level: null, rarity: 'rare' } }),
      row('d1', { event_type: 'item_dropped', created_at: at(0), meta: { level: 1 } }),
    ]
    expect(collapseLeveledBadgeBursts(input)).toEqual(input)
  })
  it('출력은 입력 순서를 유지하고 남긴 행은 제자리에 있다', () => {
    const other = row('x', { created_at: at(3), meta: { family_key: 'fam:B', level: 1 } })
    const out = collapseLeveledBadgeBursts([
      row('r3', { created_at: at(4), meta: { level: 3 } }),
      other,
      row('r2', { created_at: at(2), meta: { level: 2 } }),
      row('r1', { created_at: at(0), meta: { level: 1 } }),
    ])
    expect(out.map((r) => r.id)).toEqual(['r3', 'x'])
  })
  it('합이 0이면 point_reward 키를 싣지 않는다', () => {
    const out = collapseLeveledBadgeBursts([
      row('r2', { created_at: at(1), meta: { level: 2 } }),
      row('r1', { created_at: at(0), meta: { level: 1 } }),
    ])
    expect('point_reward' in (out[0].metadata as object)).toBe(false)
  })
  it('family_key가 없으면 이름으로 묶는다', () => {
    const out = collapseLeveledBadgeBursts([
      row('r2', { created_at: at(1), meta: { family_key: undefined, level: 2 } }),
      row('r1', { created_at: at(0), meta: { family_key: undefined, level: 1 } }),
    ])
    expect(out).toHaveLength(1)
    expect(lv(out[0])).toBe(2)
  })
})

describe('pickHighestLevelPerFamily', () => {
  const b = (id: string, over: Partial<BadgeRow>) => ({
    badge: { id, name: id, family_key: null, rarity: null, level: null, ...over } as unknown as BadgeRow,
    earned: id,
  })
  it('계열당 최고 레벨만 남기고 등급형은 그대로 둔다', () => {
    const rows = [
      b('a1', { family_key: 'f', level: 1 }),
      b('g1', { rarity: 'rare' }),
      b('a5', { family_key: 'f', level: 5 }),
      b('a3', { family_key: 'f', level: 3 }),
      b('g2', { rarity: 'rare' }),
    ]
    expect(pickHighestLevelPerFamily(rows).map((r) => r.earned)).toEqual(['g1', 'a5', 'g2'])
  })
})
