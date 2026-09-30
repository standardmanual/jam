/**
 * POST /api/drops/[dropId]/pickup — JAM! 행동 지표(드랍·픽업 4종) 판정 연동 테스트 (티켓 20261001_0632)
 *
 * 검증 대상:
 *  - 성공 뒤 `after()`로 판정을 예약한다. 다른 유저의 드랍 → 줍는 사람 2키(픽업 개체·함께 픽업)와 놓은 사람 1키(주워짐),
 *    시스템 드랍 → 줍는 사람 1키(픽업 개체)만, **자기 드랍 → 예약하지 않는다**
 *  - RPC 실패(409·422·403)·위치 검증 실패·GPS 의심·POI 블록 등 실패 분기에서는 예약하지 않는다
 *  - 응답 본문·상태 코드·에러 문구와 소식 #13(드랍한 사람에게 가는 알림)은 변경 전과 같다
 *  - 줍는 사람 판정이 거부돼도 놓은 사람 판정은 돈다
 *
 * `after()`는 요청 범위 밖에서 부를 수 없다. 콜백을 모아 두었다가 테스트가 「응답이 끝난 뒤」를 직접 흉내 낸다
 * (선례: `src/app/api/admin/ops-inbox/__tests__/route.test.ts`).
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/drops/[dropId]/pickup/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d, t } from '@/lib/i18n'
import { DROP_RADIUS_METERS } from '@/lib/poi/proximity'

const PICKER = 'user-picker'
const DROPPER = 'user-dropper'

type DropRow = {
  id: string
  poi_id: string
  badge_id: string
  dropper_user_id: string | null
  is_available: boolean
}

const state = vi.hoisted(() => ({
  authenticated: true,
  drop: null as unknown,
  poi: null as unknown,
  near: true,
  blocked: false,
  gpsDetected: false,
  inventoryId: 'inv-1' as string | null,
  rpcResult: { data: null as unknown, error: null as unknown },
  afterCallbacks: [] as (() => unknown)[],
}))

const runJamActionMock = vi.hoisted(() => vi.fn<(userId: string, triggers: readonly string[]) => Promise<void>>())
const createNotificationMock = vi.hoisted(() => vi.fn(async () => {}))
const recordFeedEventMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: PICKER } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.single = async () => {
        if (table === 'poi_drops') {
          return state.drop ? { data: state.drop, error: null } : { data: null, error: { message: 'not found' } }
        }
        if (table === 'poi') {
          return state.poi ? { data: state.poi, error: null } : { data: null, error: { message: 'not found' } }
        }
        if (table === 'badges') {
          return { data: { id: 'badge-1', name: '배지', image_url: 'x.png', rarity: 'common' }, error: null }
        }
        throw new Error(`예상하지 못한 테이블: ${table}`)
      }
      return builder
    },
    rpc: async () => state.rpcResult,
  }),
}))

vi.mock('@/lib/poi/proximity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/poi/proximity')>()
  return { ...actual, isUserNearPoi: () => state.near }
})
vi.mock('@/lib/abusing/policy', () => ({ getAbusingPolicy: async () => ({ poi_block_hours: 24 }) }))
vi.mock('@/lib/abusing/poi-block', () => ({
  isPoiBlocked: async () => state.blocked,
  blockPoiForUser: async () => {},
}))
vi.mock('@/lib/abusing/gps-detector', () => ({
  checkAndUpdateLocation: async () =>
    state.gpsDetected ? { detected: true, reason: 'speed', speedKmh: 400, dailyDistanceKm: 0 } : { detected: false },
}))
vi.mock('@/lib/abusing/shadow-ban', () => ({ applyBan: async () => {}, logAbusingEvent: async () => {} }))
vi.mock('@/lib/inventory/get-or-create', () => ({ getOrCreateInventoryId: async () => state.inventoryId }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: recordFeedEventMock }))
vi.mock('@/lib/notifications', () => ({
  createNotification: createNotificationMock,
  sixHourGroupKey: () => 'group-key',
}))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (userId: string, triggers: readonly string[]) => runJamActionMock(userId, triggers),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void state.afterCallbacks.push(cb) }
})

import { POST } from '../route'

const BODY = { user_lat: 37.5, user_lng: 127.0 }

function request(body: unknown = BODY): NextRequest {
  return new NextRequest('http://localhost/api/drops/drop-1/pickup', { method: 'POST', body: JSON.stringify(body) })
}
const params = () => ({ params: Promise.resolve({ dropId: 'drop-1' }) })

function dropOf(dropperId: string | null, overrides: Partial<DropRow> = {}): DropRow {
  return { id: 'drop-1', poi_id: 'poi-1', badge_id: 'badge-1', dropper_user_id: dropperId, is_available: true, ...overrides }
}

/** 응답이 끝난 뒤를 흉내 낸다 — 예약된 `after` 콜백을 모두 실행한다 */
async function flushAfter() {
  const callbacks = state.afterCallbacks.splice(0)
  await Promise.allSettled(callbacks.map((cb) => cb()))
}

beforeEach(() => {
  vi.clearAllMocks()
  state.authenticated = true
  state.drop = dropOf(DROPPER)
  state.poi = { id: 'poi-1', name: '성수역' }
  state.near = true
  state.blocked = false
  state.gpsDetected = false
  state.inventoryId = 'inv-1'
  state.rpcResult = { data: { ok: true, inventory_item_id: 'item-1' }, error: null }
  state.afterCallbacks = []
  runJamActionMock.mockResolvedValue(undefined)
})

describe('성공 — 드랍 출처별로 판정할 지표', () => {
  it('다른 유저의 드랍 → 줍는 사람 2키와 놓은 사람 1키를 판정한다', async () => {
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
    expect(state.afterCallbacks).toHaveLength(1)
    expect(runJamActionMock).not.toHaveBeenCalled() // 응답 전에는 돌리지 않는다

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(2)
    expect(runJamActionMock).toHaveBeenCalledWith(PICKER, ['pickup_item_count', 'pickup_from_user_count'])
    expect(runJamActionMock).toHaveBeenCalledWith(DROPPER, ['picked_up_by_user_count'])
  })

  it('시스템 드랍(놓은 사람 없음) → 줍는 사람 pickup_item_count만 판정한다', async () => {
    state.drop = dropOf(null)
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
    expect(state.afterCallbacks).toHaveLength(1)

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    expect(runJamActionMock).toHaveBeenCalledWith(PICKER, ['pickup_item_count'])
  })

  it('자기 드랍 → 판정을 예약하지 않는다', async () => {
    state.drop = dropOf(PICKER)
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
    expect(state.afterCallbacks).toHaveLength(0)
    expect(runJamActionMock).not.toHaveBeenCalled()
  })

  it('줍는 사람 판정이 거부돼도 응답은 그대로고 놓은 사람 판정은 돈다', async () => {
    runJamActionMock.mockImplementation(async (userId) => {
      if (userId === PICKER) throw new Error('판정 장애')
    })

    const res = await POST(request(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledWith(DROPPER, ['picked_up_by_user_count'])
  })

  it('놓은 사람 판정이 거부돼도 응답은 그대로고 줍는 사람 판정은 돈다', async () => {
    runJamActionMock.mockImplementation(async (userId) => {
      if (userId === DROPPER) throw new Error('판정 장애')
    })

    const res = await POST(request(), params())
    expect(res.status).toBe(200)

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledWith(PICKER, ['pickup_item_count', 'pickup_from_user_count'])
  })
})

describe('소식 #13과 피드는 변경 전과 같다', () => {
  it('다른 유저의 드랍을 주우면 놓은 사람에게 drop_picked_up 알림이 가고 피드를 남긴다', async () => {
    await POST(request(), params())

    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DROPPER, type: 'drop_picked_up', actorUserId: PICKER })
    )
  })

  it('시스템 드랍은 알림을 보낼 사람이 없다', async () => {
    state.drop = dropOf(null)
    await POST(request(), params())

    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })
})

describe('실패 분기에서는 판정을 예약하지 않는다 — 응답은 그대로다', () => {
  it('401 세션 없음', async () => {
    state.authenticated = false
    const res = await POST(request(), params())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.drops.sessionExpired })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('400 위치 누락', async () => {
    const res = await POST(request({ user_lat: 'abc', user_lng: 127 }), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.drops.locationMissing })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('404 드랍을 찾지 못함', async () => {
    state.drop = null
    const res = await POST(request(), params())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.pickupDropNotFound })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('409 이미 픽업된 드랍(is_available false)', async () => {
    state.drop = dropOf(DROPPER, { is_available: false })
    const res = await POST(request(), params())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.drops.pickupAlreadyDone })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('404 지점을 찾지 못함', async () => {
    state.poi = null
    const res = await POST(request(), params())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.pickupPoiNotFound })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('403 위치 검증 실패(반경 밖)', async () => {
    state.near = false
    const res = await POST(request(), params())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: t(d.drops.pickupOutOfRange, { m: DROP_RADIUS_METERS }) })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('403 POI 블록', async () => {
    state.blocked = true
    const res = await POST(request(), params())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupPoiBlocked })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('403 GPS 조작 의심', async () => {
    state.gpsDetected = true
    const res = await POST(request(), params())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupLocationUnverified })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('404 인벤토리를 만들지 못함', async () => {
    state.inventoryId = null
    const res = await POST(request(), params())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.loadInventoryFailed })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('500 RPC 오류', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpcResult = { data: null, error: { message: 'rpc 장애' } }
    const res = await POST(request(), params())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.drops.pickupFailed })
    expect(state.afterCallbacks).toHaveLength(0)
    consoleError.mockRestore()
  })

  it.each([
    ['already_picked_up', 409, d.drops.pickupAlreadyDone],
    ['cannot_pickup_own_drop', 403, d.drops.pickupOwnDrop],
    ['inventory_not_found', 404, d.drops.loadInventoryFailed],
    ['inventory_full', 422, d.drops.pickupInventoryFull],
    ['item_not_found', 404, d.drops.pickupFailed],
    ['unknown_code', 400, d.drops.pickupFailed],
  ])('ok:false(%s) → %i', async (code, status, message) => {
    state.rpcResult = { data: { ok: false, error: code }, error: null }
    const res = await POST(request(), params())
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message })
    expect(state.afterCallbacks).toHaveLength(0)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })
})
