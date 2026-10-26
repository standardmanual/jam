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

type PoiBadgeRow = {
  id: string
  name: string
  rarity: string
  type: string
  valid_from: string | null
  valid_until: string | null
}

const state = vi.hoisted(() => ({
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
  tablesRead: [] as string[],
  inventoryWrites: 0,
  // `badges` 조회(.in().is())가 돌려줄 POI 연결 배지 행, 그리고 기록(insert)이 일어난 테이블
  poiBadgeRows: [] as PoiBadgeRow[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
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
        in: () => builder,
        is: async () => ({ data: table === 'badges' ? state.poiBadgeRows : [], error: null }),
        insert: async (row: Record<string, unknown>) => {
          if (table === 'inventory_items') state.inventoryWrites += 1
          state.inserts.push({ table, row })
          return { error: null }
        },
        update: () => builder,
      }
      return builder
    },
  }),
}))

import { POST } from '../route'
import { matchPoisForActivity } from '@/lib/poi/matcher'

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
  state.poiBadgeRows = []
  state.inserts = []
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

// 공개 기간 필터 — 실제 동기화 경로(`lib/strava/sync.ts`)와 같은 `isActivityWithinBadgeWindow`를 쓴다
// (티켓 20260930_0015, 스펙 BADGE_ENGINE_UNIFIED §3.18). 기준 시각은 활동 시작 시각이다.
describe('POST /api/admin/simulate — POI 연결 배지의 공개 기간', () => {
  const ROUTE = [[37.5, 127.0]] as Array<[number, number]>
  const POI = { id: 'poi-1', name: '반포대교 남단', linked_badge_id: 'poi-badge-1' }

  function poiBadge(validFrom: string | null, validUntil: string | null, type = 'checkin'): PoiBadgeRow {
    return { id: 'poi-badge-1', name: '반포대교 체크인', rarity: 'common', type, valid_from: validFrom, valid_until: validUntil }
  }

  async function simulate(dryRun: boolean, row: PoiBadgeRow) {
    vi.mocked(matchPoisForActivity).mockResolvedValueOnce([POI] as never)
    state.poiBadgeRows = [row]
    const res = await POST(post({ userId: 'u1', dryRun, activity: { ...ACTIVITY, route: ROUTE } }))
    expect(res.status).toBe(200)
    return (await res.json()) as { badgesEarned: { id: string; reason: string }[]; poisMatched: { id: string }[] }
  }

  const poiEarned = (body: { badgesEarned: { id: string }[] }) => body.badgesEarned.filter((b) => b.id === 'poi-badge-1')

  it('활동 시작 시각이 기간 안이면 획득 예정에 넣고, 적용 모드(dryRun=false)에서는 체크인 이력에 기록한다', async () => {
    // ACTIVITY.startDate = 2026-10-20T00:00:00Z
    const dry = await simulate(true, poiBadge('2026-10-01T00:00:00+00:00', '2026-10-31T00:00:00+00:00'))
    expect(poiEarned(dry)).toHaveLength(1)
    expect(dry.badgesEarned.find((b) => b.id === 'poi-badge-1')?.reason).toBe('장소 통과: 반포대교 남단')
    expect(state.inserts).toEqual([])

    const applied = await simulate(false, poiBadge('2026-10-01T00:00:00+00:00', '2026-10-31T00:00:00+00:00'))
    expect(poiEarned(applied)).toHaveLength(1)
    expect(state.inserts).toEqual([
      {
        table: 'user_checkin_badge_earns',
        row: { user_id: 'u1', badge_id: 'poi-badge-1', poi_id: 'poi-1', triggered_by_activity_name: 'admin_simulate' },
      },
    ])
  })

  it('기간이 둘 다 비어 있으면(NULL) 제한 없이 획득 예정에 넣는다', async () => {
    const body = await simulate(true, poiBadge(null, null))
    expect(poiEarned(body)).toHaveLength(1)
  })

  it('경계 시각은 기간 안이다(활동 시작 시각 == valid_from, == valid_until)', async () => {
    expect(poiEarned(await simulate(true, poiBadge('2026-10-20T00:00:00Z', null)))).toHaveLength(1)
    expect(poiEarned(await simulate(true, poiBadge(null, '2026-10-20T00:00:00Z')))).toHaveLength(1)
  })

  it.each([
    ['시작 전(valid_from이 활동보다 뒤)', '2026-10-21T00:00:00+00:00', null],
    ['종료 후(valid_until이 활동보다 앞)', null, '2026-10-19T00:00:00+00:00'],
  ])('기간 밖(%s)이면 dryRun=true에서 획득 예정에 넣지 않는다', async (_label, validFrom, validUntil) => {
    const body = await simulate(true, poiBadge(validFrom, validUntil))
    expect(poiEarned(body)).toHaveLength(0)
    // 장소 매칭 자체는 그대로 보여 준다 — 배지만 빠진다
    expect(body.poisMatched).toEqual([{ id: 'poi-1', name: '반포대교 남단' }])
    expect(state.inserts).toEqual([])
  })

  it.each([
    ['시작 전(valid_from이 활동보다 뒤)', '2026-10-21T00:00:00+00:00', null],
    ['종료 후(valid_until이 활동보다 앞)', null, '2026-10-19T00:00:00+00:00'],
  ])('기간 밖(%s)이면 dryRun=false여도 기록하지 않는다', async (_label, validFrom, validUntil) => {
    const body = await simulate(false, poiBadge(validFrom, validUntil))
    expect(poiEarned(body)).toHaveLength(0)
    expect(state.inserts).toEqual([])
  })

  it('기간 밖이면 checkin 타입이 아닌 POI 배지도 활동 배지 이력에 기록하지 않는다', async () => {
    const body = await simulate(false, poiBadge(null, '2026-10-19T00:00:00Z', 'activity'))
    expect(poiEarned(body)).toHaveLength(0)
    expect(state.inserts).toEqual([])
  })

  it('기준 시각은 지금이 아니라 활동 시작 시각이다 — 지금은 기간이 끝났어도 활동이 기간 안이면 인정한다', async () => {
    // valid_until=2026-10-25는 오늘(2026-10-26)보다 앞이지만, 활동(2026-10-20)은 그 기간 안에 시작했다
    const body = await simulate(true, poiBadge('2026-10-01T00:00:00Z', '2026-10-25T00:00:00Z'))
    expect(poiEarned(body)).toHaveLength(1)
  })
})
