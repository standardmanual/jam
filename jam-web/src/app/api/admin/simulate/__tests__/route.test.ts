/**
 * POST /api/admin/simulate — 아이템 드랍 구간이 없다 (티켓 20261022_0938)
 *
 * 옛 드랍 엔진 미리 보기(`previewItemDrop`)를 지우면서 응답에서 아이템 드랍 필드를 뺐다.
 * 시뮬레이터 화면이 남겨 둔 구역(배지 획득·장소 매칭·컬렉션 완성·미획득 배지·확장 필드)이 쓰는 필드는 그대로 있어야 한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/simulate/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
  tablesRead: [] as string[],
  inventoryWrites: 0,
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine', () => ({
  evaluateBadgesDetailed: vi.fn(async () => ({
    earned: [{ id: 'b1', name: '한강 라이더', rarity: 'rare', reason: '거리 30km 이상' }],
    missed: [{ id: 'b2', name: '100km 울트라라이더', reason: '거리 부족', actual: '35.2km', required: '100km' }],
  })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      state.tablesRead.push(table)
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: async () => ({ data: [], error: null }),
        insert: async () => {
          if (table === 'inventory_items') state.inventoryWrites += 1
          return { error: null }
        },
        update: () => builder,
      }
      return builder
    },
  }),
}))

import { POST } from '../route'

function post(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ACTIVITY = {
  activityType: 'cycling',
  distanceKm: 35.2,
  movingTimeSec: 4500,
  elevationGainM: 120,
  averageSpeedKmh: 28.5,
  startDate: '2026-10-20T00:00:00Z',
  route: [],
}

beforeEach(() => {
  state.admin = { id: 'admin-1', email: 'admin@example.com' }
  state.tablesRead = []
  state.inventoryWrites = 0
})

describe('POST /api/admin/simulate', () => {
  it('비관리자는 403이다', async () => {
    state.admin = null
    const res = await POST(post({ userId: 'u1', dryRun: true, activity: ACTIVITY }))
    expect(res.status).toBe(403)
  })

  it('배지 판정·장소 매칭·컬렉션 완성 필드를 돌려주고 아이템 드랍 필드는 없다', async () => {
    const res = await POST(post({ userId: 'u1', dryRun: true, activity: ACTIVITY }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.badgesEarned).toHaveLength(1)
    expect(body.badgesMissed).toHaveLength(1)
    expect(body.poisMatched).toEqual([])
    expect(body.itemBooksCompleted).toEqual([])
    expect(body.applied).toBe(false)
    expect(body.parsed).toMatchObject({ distanceKm: 35.2, durationMin: 75, trackpointCount: 0 })

    expect(body).not.toHaveProperty('itemDrops')
    expect(body).not.toHaveProperty('itemDropSkips')
    expect(body).not.toHaveProperty('itemDropUnavailable')
  })

  it('적용 모드(dryRun=false)여도 인벤토리·드랍 상태를 읽거나 쓰지 않는다', async () => {
    const res = await POST(post({ userId: 'u1', dryRun: false, activity: ACTIVITY }))
    expect(res.status).toBe(200)
    expect((await res.json()).applied).toBe(true)

    expect(state.inventoryWrites).toBe(0)
    for (const table of ['inventory', 'inventory_items', 'user_drop_state', 'drop_policy', 'item_books']) {
      expect(state.tablesRead).not.toContain(table)
    }
  })

  it('필수 값이 없으면 400이다', async () => {
    const res = await POST(post({ dryRun: true }))
    expect(res.status).toBe(400)
  })
})
