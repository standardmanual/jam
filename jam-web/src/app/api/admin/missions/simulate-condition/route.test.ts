/**
 * POST /api/admin/missions/simulate-condition — DB 기록 키 안내 (티켓 20261019_1445 1회)
 *
 * 미션의 DB 기록 조건(믹스·드랍·캡슐 등)은 «참가한 뒤, 미션 기간 안»의 DB 기록으로 판정하므로 이 시뮬레이션이 평가하지 못한다.
 * 조건에 그런 키가 있으면 응답의 `missionDbKeysPresent`로 알려 화면이 고지하게 한다. 판정 자체는 `simulateCondition`이
 * 하므로 모조로 바꾸고, 응답에 안내 키가 실리는지만 본다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/missions/simulate-condition/route.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'admin-1' }) }))
vi.mock('@/lib/admin/conditionSimulation', () => ({
  simulateCondition: async () => ({
    ok: true,
    data: {
      result: { pass: false, reason: '', actual: '', required: '' },
      kind: 'unmet',
      fieldBlockedReason: null,
      activityCount: 0,
      anchorDate: null,
    },
  }),
}))

const { POST } = await import('./route')

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/missions/simulate-condition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

describe('POST /api/admin/missions/simulate-condition — DB 기록 키 안내', () => {
  it('조건에 든 DB 기록 키를 missionDbKeysPresent로 알려 준다', async () => {
    const res = await post({ condition: { distance_km: 10, combine_success_count: 2, recipe_first_success: { recipe_id: 'r1' } }, userId: 'u1' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.missionDbKeysPresent).toEqual(['combine_success_count', 'recipe_first_success'])
  })

  it('2회(티켓 20261019_1445): 날짜·체크인 키도 안내한다', async () => {
    const res = await post({
      condition: { weekly_active_days: 3, checkin_category_count: { category: 'train_subway', count: 2 }, new_checkin_badge_count: 1 },
      userId: 'u1',
    })
    const body = await res.json()
    expect(body.missionDbKeysPresent).toEqual(['weekly_active_days', 'new_checkin_badge_count', 'checkin_category_count'])
  })

  it('3-A회(티켓 20261019_1445): 미션 전용 jam_period_earned도 DB 기록 키로 안내한다 (미션 전용 키 목록에도 함께 실린다)', async () => {
    const res = await post({ condition: { distance_km: 10, jam_period_earned: 100 }, userId: 'u1' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.missionDbKeysPresent).toEqual(['jam_period_earned'])
    expect(body.missionOnlyKeysPresent).toEqual(['jam_period_earned'])
  })

  it('DB 기록 키가 없으면 빈 목록이다', async () => {
    const res = await post({ condition: { distance_km: 10, weekly_streak_min_count: 2 }, userId: 'u1' })
    const body = await res.json()
    expect(body.missionDbKeysPresent).toEqual([])
    expect(body.missionOnlyKeysPresent).toEqual(['weekly_streak_min_count'])
  })

  it('조건이 비어 있어도 터지지 않는다', async () => {
    const res = await post({ condition: null, userId: 'u1' })
    expect((await res.json()).missionDbKeysPresent).toEqual([])
  })
})
