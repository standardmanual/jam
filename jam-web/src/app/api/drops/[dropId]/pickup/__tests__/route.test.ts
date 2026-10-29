/**
 * POST /api/drops/[dropId]/pickup — JAM! 행동 지표(드랍·픽업 4종) 판정 연동 테스트 (티켓 20261001_0632)
 *
 * 검증 대상:
 *  - 성공 뒤 `after()`로 판정을 예약한다. 다른 유저의 드랍 → 줍는 사람 4키(픽업 개체·함께 픽업·잠긴 개체 픽업·다른 트라이브 종류 수)와 놓은 사람 2키(주워짐·내 드랍이 픽업된 아이템 수, 티켓 20261019_0542),
 *    시스템 드랍 → 줍는 사람 1키(픽업 개체)만, **자기 드랍 → 예약하지 않는다**
 *  - RPC 실패(409·422·403)·위치 검증 실패·GPS 의심·POI 블록 등 실패 분기에서는 예약하지 않는다
 *  - 응답 본문·상태 코드·에러 문구와 소식 #13(드랍한 사람에게 가는 알림)은 변경 전과 같다
 *  - (티켓 20261018_1812) 이용 정지 중이면 403 `user_suspended`이고 GPS 판정·RPC를 부르지 않는다. 꺼진 장소는 드랍이 없을 때와 같은 404이고,
 *    장소를 다시 켜면 줍는다. 자기 드랍 줍기는 허용이다. 잠긴 채 받은 개체는 이름·그림을 피드·소식에 싣지 않는다
 *  - 줍는 사람 판정이 거부돼도 놓은 사람 판정은 돈다
 *  - 서비스 활동 잼 «픽업»(티켓 20261028_1735 3회, 옛 챕터 점수 자리): 성공 뒤 같은 `after()` 콜백이 `jam_apply_service_activity`를 (pickup, `pickup:<경로의 드랍 id>`)로 부른다.
 *    자기 드랍을 자기가 주운 것은 부르지 않고(예약하는 콜백도 없다), 시스템 드랍과 잠긴 채 받은 픽업은 부른다. 응답 전에는 부르지 않고 실패 분기에서는 부르지 않으며 같은 픽업을 다시 보내도 같은 키다.
 *    옛 `chapter_add_score`는 더는 부르지 않는다. 규칙값 기본이 0이라 DB 함수가 `rule_zero`로 돌려주고 지급도 캡슐 채움도 없다(호출은 남는다).
 *    잼 실패(RPC 오류·예외)와 판정 실패는 서로의 실행과 응답을 바꾸지 않는다.
 *
 * `after()`는 요청 범위 밖에서 부를 수 없다. 콜백을 모아 두었다가 테스트가 「응답이 끝난 뒤」를 직접 흉내 낸다
 * (선례: `src/app/api/admin/ops-inbox/__tests__/route.test.ts`).
 *  - (티켓 20261022_0940) GPS 조작이 감지되면 응답을 보낸 뒤 `alertGpsSpoof`가 한 번 불린다(유저 ID·장소 이름·사유·차단 시간, 좌표는 없다). 감지되지 않거나 이미 막힌
 *    장소면 부르지 않고, 알림이 던져도 403과 장소 차단·기록 호출은 그대로다. 알림 모듈은 모킹한다(실제 슬랙을 부르지 않는다).
 *    장소 차단과 기록이 둘 다 저장됐을 때만 `sanctionStored: true`다. 장소 차단이 던지면(catch) 또는 기록이 `false`를 돌려주면(`logAbusingEvent`는 던지지
 *    않고 `false`를 돌려준다) `false`를 넘긴다(알림은 모든 경우에 보낸다).
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
  /** 이용 정지 중인가 */
  suspended: false,
  /** 정지 여부 조회가 실패하는가 */
  suspensionReadFails: false,
  /** 받은 개체가 잠겼는가 */
  pickedLocked: false,
  /** 잠긴 개체 조회가 실패하는가 */
  lockLookupFails: false,
  gpsCalls: 0,
  /** `pickup_drop` 호출 횟수 (서비스 활동 잼 RPC는 세지 않는다) */
  rpcCalls: 0,
  /** `jam_apply_service_activity` 호출 인자 */
  scoreCalls: [] as Record<string, unknown>[],
  /** 서비스 활동 잼 RPC의 결과(기본: 픽업 규칙값 0 → `rule_zero`). `'throw'`면 예외를 던진다 */
  scoreResult: { data: { ok: true, granted: 0, reason: 'rule_zero' } as unknown, error: null as unknown } as
    | { data: unknown; error: unknown }
    | 'throw',
  badgeReads: 0,
  afterCallbacks: [] as (() => unknown)[],
  /** 서비스 클라이언트가 `from()`으로 연 표 이름(옛 밴 표를 건드리지 않는지 확인하는 데 쓴다) */
  tablesTouched: [] as string[],
}))

const runJamActionMock = vi.hoisted(() => vi.fn<(userId: string, triggers: readonly string[]) => Promise<void>>())
const createNotificationMock = vi.hoisted(() =>
  vi.fn<(input: { payload?: Record<string, unknown>; appendKeys?: string[] } & Record<string, unknown>) => Promise<void>>(async () => {}),
)
const recordFeedEventMock = vi.hoisted(() => vi.fn(async () => {}))
const logMock = vi.hoisted(() => vi.fn())
const blockPoiMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}))
// 실제 `logAbusingEvent`는 던지지 않고 저장 성공 여부(true/false)를 돌려준다 — 기본은 저장 성공이다(티켓 20261022_0940).
const logAbusingEventMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true))
const alertGpsSpoofMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true))

// 잼 지급 실패 기록(logEngineDecision)이 실제 service 클라이언트를 만들지 않게 막는다
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

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
      state.tablesTouched.push(table)
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
          state.badgeReads += 1
          return { data: { id: 'badge-1', name: '배지', image_url: 'x.png', rarity: 'common' }, error: null }
        }
        throw new Error(`예상하지 못한 테이블: ${table}`)
      }
      return builder
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'jam_apply_service_activity') {
        state.scoreCalls.push(args)
        if (state.scoreResult === 'throw') throw new Error('jam network down')
        return state.scoreResult
      }
      if (fn === 'pickup_drop') state.rpcCalls += 1
      return state.rpcResult
    },
  }),
}))

vi.mock('@/lib/poi/proximity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/poi/proximity')>()
  return { ...actual, isUserNearPoi: () => state.near }
})
vi.mock('@/lib/abusing/policy', () => ({ getAbusingPolicy: async () => ({ poi_block_hours: 24 }) }))
vi.mock('@/lib/abusing/poi-block', () => ({
  isPoiBlocked: async () => state.blocked,
  blockPoiForUser: (...args: unknown[]) => blockPoiMock(...args),
}))
vi.mock('@/lib/abusing/gps-detector', () => ({
  checkAndUpdateLocation: async () =>
    (state.gpsCalls += 1) && state.gpsDetected ? { detected: true, reason: 'speed', speedKmh: 400, dailyDistanceKm: 0 } : { detected: false },
}))
// 옛 섀도우밴 모듈(`shadow-ban.ts`)은 모킹하지 않는다. 라우트가 옛 밴을 다시 부르면 실제 `applyBan`이 `user_shadow_bans`를 열어
// `state.tablesTouched`에 남아 시험이 실패한다(티켓 20261021_1250).
vi.mock('@/lib/abusing/abusing-log', () => ({ logAbusingEvent: (...args: unknown[]) => logAbusingEventMock(...args) }))
// 실제 슬랙(`postOpsSlack`)을 부르지 않게 알림 모듈 전체를 막는다(티켓 20261022_0940). 글의 내용은 `lib/abusing/__tests__/gpsSpoofAlert.test.ts`가 본다.
vi.mock('@/lib/abusing/gpsSpoofAlert', () => ({ alertGpsSpoof: (...args: unknown[]) => alertGpsSpoofMock(...args) }))
vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return {
    ...actual,
    assertNotSuspended: async () => {
      if (state.suspensionReadFails) throw new Error('user_suspensions 조회 실패')
      if (state.suspended) throw new actual.UserSuspendedError({ reason: '시험', suspendedAt: '2026-10-18T00:00:00Z' })
    },
  }
})
vi.mock('@/lib/inventory/lockedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/inventory/lockedItem')>()
  return {
    ...actual,
    findLockedItemIds: async (_client: unknown, ids: readonly string[]) => {
      if (state.lockLookupFails) throw new Error('잠긴 개체 조회 실패')
      return state.pickedLocked ? [...ids] : []
    },
  }
})
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
  state.poi = { id: 'poi-1', name: '성수역', is_active: true }
  state.near = true
  state.blocked = false
  state.gpsDetected = false
  state.inventoryId = 'inv-1'
  state.rpcResult = { data: { ok: true, inventory_item_id: 'item-1' }, error: null }
  state.suspended = false
  state.suspensionReadFails = false
  state.pickedLocked = false
  state.lockLookupFails = false
  state.gpsCalls = 0
  state.rpcCalls = 0
  state.scoreCalls = []
  state.scoreResult = { data: { ok: true, granted: 0, reason: 'rule_zero' }, error: null }
  state.badgeReads = 0
  state.afterCallbacks = []
  state.tablesTouched = []
  runJamActionMock.mockResolvedValue(undefined)
  logMock.mockResolvedValue(undefined)
  alertGpsSpoofMock.mockResolvedValue(true)
})

describe('성공 — 드랍 출처별로 판정할 지표', () => {
  it('다른 유저의 드랍 → 줍는 사람 4키와 놓은 사람 2키(주워짐·내 드랍이 픽업된 아이템 수)를 판정한다', async () => {
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
    expect(state.afterCallbacks).toHaveLength(1)
    expect(runJamActionMock).not.toHaveBeenCalled() // 응답 전에는 돌리지 않는다

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(2)
    expect(runJamActionMock).toHaveBeenCalledWith(PICKER, [
      'pickup_item_count',
      'pickup_from_user_count',
      'locked_item_pickup_count',
      'other_tribe_item_kinds_count',
    ])
    expect(runJamActionMock).toHaveBeenCalledWith(DROPPER, ['picked_up_by_user_count', 'dropped_item_picked_up_count'])
  })

  it('시스템 드랍(놓은 사람 없음) → 줍는 사람의 픽업 개체·잠긴 개체 픽업·다른 트라이브 종류 수만 판정한다', async () => {
    state.drop = dropOf(null)
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
    expect(state.afterCallbacks).toHaveLength(1)

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    expect(runJamActionMock).toHaveBeenCalledWith(PICKER, ['pickup_item_count', 'locked_item_pickup_count', 'other_tribe_item_kinds_count'])
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
    expect(runJamActionMock).toHaveBeenCalledWith(DROPPER, ['picked_up_by_user_count', 'dropped_item_picked_up_count'])
  })

  it('놓은 사람 판정이 거부돼도 응답은 그대로고 줍는 사람 판정은 돈다', async () => {
    runJamActionMock.mockImplementation(async (userId) => {
      if (userId === DROPPER) throw new Error('판정 장애')
    })

    const res = await POST(request(), params())
    expect(res.status).toBe(200)

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledWith(PICKER, [
      'pickup_item_count',
      'pickup_from_user_count',
      'locked_item_pickup_count',
      'other_tribe_item_kinds_count',
    ])
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

describe('자기 드랍 줍기는 허용이다 (티켓 20261018_1812)', () => {
  it('자기 드랍도 줍고 놓은 사람 알림은 보내지 않는다', async () => {
    state.drop = dropOf(PICKER)
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(state.rpcCalls).toBe(1)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })
})

describe('잠긴 채 받은 개체는 이름·그림을 싣지 않는다 (티켓 20261018_1812, 운영 로직 7.3절)', () => {
  it('응답은 개체 id뿐이고 피드를 남기지 않으며 배지를 읽지도 않는다', async () => {
    state.pickedLocked = true
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
    expect(state.badgeReads).toBe(0)
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('놓은 사람에게는 배지 id·이름 없이 잠긴 개체 소식만 간다 (티켓 20261018_1817)', async () => {
    state.pickedLocked = true
    await POST(request(), params())

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    const input = createNotificationMock.mock.calls[0][0]
    expect(input).toMatchObject({ userId: DROPPER, type: 'drop_picked_up', actorUserId: PICKER })
    expect(input.appendKeys).toEqual(['actor_ids', 'locked_item_ids'])
    expect(input.payload).toEqual({ actor_ids: [PICKER], locked_item_ids: [expect.any(String)], poi_id: expect.anything() })
    expect(input.payload).not.toHaveProperty('badge_ids')
    expect(input.payload).not.toHaveProperty('badge_name')
  })

  it('자기 드랍이나 시스템 드랍이면 잠긴 소식도 보내지 않는다', async () => {
    state.pickedLocked = true
    state.drop = dropOf(PICKER)
    await POST(request(), params())
    state.drop = dropOf(null)
    await POST(request(), params())

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('잠긴 채 받아도 횟수 판정은 그대로 예약한다', async () => {
    state.pickedLocked = true
    await POST(request(), params())

    expect(state.afterCallbacks).toHaveLength(1)
    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledWith(PICKER, [
      'pickup_item_count',
      'pickup_from_user_count',
      'locked_item_pickup_count',
      'other_tribe_item_kinds_count',
    ])
  })

  it('열린 개체는 피드·소식이 그대로다', async () => {
    state.pickedLocked = false
    await POST(request(), params())

    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('잠김 여부를 읽지 못하면 잠긴 것으로 보고 피드를 남기지 않고 이름 없는 소식만 보낸다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.lockLookupFails = true
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(recordFeedEventMock).not.toHaveBeenCalled()
    expect(createNotificationMock.mock.calls[0][0].payload).not.toHaveProperty('badge_name')
    consoleError.mockRestore()
  })
})

describe('이용 정지 (티켓 20261018_1812, 운영 로직 9.5절)', () => {
  it('정지 중이면 403 user_suspended이고 GPS 판정·RPC를 부르지 않는다', async () => {
    state.suspended = true
    const res = await POST(request(), params())

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.pickupBlocked, code: 'user_suspended' })
    expect(state.gpsCalls).toBe(0)
    expect(state.rpcCalls).toBe(0)
    expect(state.afterCallbacks).toHaveLength(0)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('RPC가 user_suspended로 거절해도 같은 403이다(앱 검사와 RPC 사이에 정지가 걸린 경우)', async () => {
    state.rpcResult = { data: { ok: false, error: 'user_suspended' }, error: null }
    const res = await POST(request(), params())

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.pickupBlocked, code: 'user_suspended' })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('정지 여부를 읽지 못하면 500이고 줍지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.suspensionReadFails = true
    const res = await POST(request(), params())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.drops.pickupFailed })
    expect(state.rpcCalls).toBe(0)
    consoleError.mockRestore()
  })
})

describe('꺼진 장소 (티켓 20261018_1812)', () => {
  it('꺼진 장소는 드랍이 없을 때와 같은 404이고 GPS 판정·RPC를 부르지 않는다', async () => {
    state.poi = { id: 'poi-1', name: '성수역', is_active: false }
    const res = await POST(request(), params())

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.pickupDropNotFound, code: 'drop_gone' })
    expect(state.gpsCalls).toBe(0)
    expect(state.rpcCalls).toBe(0)
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('장소를 다시 켜면 줍는다(드랍은 지워지지 않았다)', async () => {
    state.poi = { id: 'poi-1', name: '성수역', is_active: false }
    expect((await POST(request(), params())).status).toBe(404)

    state.poi = { id: 'poi-1', name: '성수역', is_active: true }
    const res = await POST(request(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
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
    expect(await res.json()).toEqual({ error: d.drops.pickupDropNotFound, code: 'drop_gone' })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('409 이미 픽업된 드랍(is_available false)', async () => {
    state.drop = dropOf(DROPPER, { is_available: false })
    const res = await POST(request(), params())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.drops.pickupAlreadyDone, code: 'already_picked_up' })
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
    expect(await res.json()).toEqual({ error: d.drops.pickupPoiBlocked, code: 'poi_blocked' })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('403 GPS 조작 의심 — 행동 지표·서비스 활동 잼 판정은 예약하지 않고 운영자 알림 한 건만 예약한다 (티켓 20261022_0940)', async () => {
    state.gpsDetected = true
    const res = await POST(request(), params())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupLocationUnverified })
    expect(state.afterCallbacks).toHaveLength(1)

    await flushAfter()
    expect(runJamActionMock).not.toHaveBeenCalled()
    expect(state.scoreCalls).toHaveLength(0)
    expect(alertGpsSpoofMock).toHaveBeenCalledTimes(1)
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
    ['already_picked_up', 409, d.drops.pickupAlreadyDone, 'already_picked_up'],
    ['poi_inactive', 404, d.drops.pickupDropNotFound, 'drop_gone'],
    ['inventory_not_found', 404, d.drops.loadInventoryFailed, undefined],
    ['inventory_full', 422, d.drops.pickupInventoryFull, 'inventory_full'],
    ['item_not_found', 404, d.drops.pickupFailed, undefined],
    ['unknown_code', 400, d.drops.pickupFailed, undefined],
  ])('ok:false(%s) → %i, 화면이 가르는 막힘만 code를 싣는다 (티켓 20261018_1817)', async (code, status, message, blockCode) => {
    state.rpcResult = { data: { ok: false, error: code }, error: null }
    const res = await POST(request(), params())
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual(blockCode ? { error: message, code: blockCode } : { error: message })
    expect(state.afterCallbacks).toHaveLength(0)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })
})

describe('GPS 조작 의심 제재 — 픽업 거부·장소 차단·기록만 남는다 (티켓 20261021_1250, 정책 20번 4절)', () => {
  it('403으로 거부하고 이 장소를 차단하고 gps_spoof_detected를 기록한다', async () => {
    state.gpsDetected = true
    const res = await POST(request(), params())

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupLocationUnverified })
    expect(blockPoiMock).toHaveBeenCalledTimes(1)
    expect(blockPoiMock).toHaveBeenCalledWith(PICKER, 'poi-1', { poi_block_hours: 24 }, 'gps_spoof_detected (속도 400km/h)')
    expect(logAbusingEventMock).toHaveBeenCalledTimes(1)
    expect(logAbusingEventMock).toHaveBeenCalledWith(PICKER, 'gps_spoof_detected', {
      poi_id: 'poi-1',
      reason: 'speed',
      speed_kmh: 400,
      daily_distance_km: 0,
      lat: BODY.user_lat,
      lng: BODY.user_lng,
    })
    expect(state.rpcCalls).toBe(0)
  })

  it('옛 섀도우밴 표(user_shadow_bans)에 쓰지 않고 이용 정지도 자동으로 걸지 않는다', async () => {
    state.gpsDetected = true
    await POST(request(), params())

    expect(state.tablesTouched).not.toContain('user_shadow_bans')
    expect(state.tablesTouched).not.toContain('user_suspensions')
  })

  it('장소 차단·기록 저장이 실패해도 이번 픽업은 403으로 막고 서버 로그를 남긴다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.gpsDetected = true
    blockPoiMock.mockRejectedValueOnce(new Error('poi_blocks upsert 실패'))
    const res = await POST(request(), params())

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupLocationUnverified })
    expect(state.rpcCalls).toBe(0)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('GPS가 정상이면 장소 차단도 기록도 하지 않는다', async () => {
    await POST(request(), params())

    expect(blockPoiMock).not.toHaveBeenCalled()
    expect(logAbusingEventMock).not.toHaveBeenCalled()
  })
})

describe('GPS 조작 의심 운영자 알림 (티켓 20261022_0940, 운영 로직 16.5절)', () => {
  it('감지되면 응답을 보낸 뒤 알림이 한 번 불리고 인자에 유저 ID·장소 이름·사유·차단 시간이 있다 (좌표는 없다)', async () => {
    state.gpsDetected = true
    const res = await POST(request(), params())

    expect(res.status).toBe(403)
    expect(state.afterCallbacks).toHaveLength(1)
    expect(alertGpsSpoofMock).not.toHaveBeenCalled() // 응답 전에는 보내지 않는다

    await flushAfter()
    expect(alertGpsSpoofMock).toHaveBeenCalledTimes(1)
    expect(alertGpsSpoofMock).toHaveBeenCalledWith({
      userId: PICKER,
      poiName: '성수역',
      reason: 'speed',
      speedKmh: 400,
      dailyDistanceKm: 0,
      blockHours: 24,
      sanctionStored: true,
    })
    const [input] = alertGpsSpoofMock.mock.calls[0] as [Record<string, unknown>]
    expect(Object.keys(input)).not.toContain('lat')
    expect(Object.keys(input)).not.toContain('lng')
    expect(JSON.stringify(input)).not.toContain(String(BODY.user_lat))
  })

  it('감지되지 않으면 알림을 부르지 않는다', async () => {
    const res = await POST(request(), params())
    expect(res.status).toBe(200)

    await flushAfter()
    expect(alertGpsSpoofMock).not.toHaveBeenCalled()
  })

  it('이미 막힌 장소는 감지 전에 끝나므로 알림이 없다', async () => {
    state.blocked = true
    const res = await POST(request(), params())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupPoiBlocked, code: 'poi_blocked' })
    expect(state.gpsCalls).toBe(0)

    await flushAfter()
    expect(alertGpsSpoofMock).not.toHaveBeenCalled()
  })

  it('알림이 던져도 403 본문과 장소 차단·기록 호출은 그대로다', async () => {
    state.gpsDetected = true
    alertGpsSpoofMock.mockRejectedValue(new Error('slack down'))
    const res = await POST(request(), params())
    await flushAfter()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupLocationUnverified })
    expect(blockPoiMock).toHaveBeenCalledTimes(1)
    expect(blockPoiMock).toHaveBeenCalledWith(PICKER, 'poi-1', { poi_block_hours: 24 }, 'gps_spoof_detected (속도 400km/h)')
    expect(logAbusingEventMock).toHaveBeenCalledTimes(1)
    expect(state.rpcCalls).toBe(0)
  })

  it('장소 차단·기록 저장이 실패해도 알림은 보내고 sanctionStored: false로 글이 저장 실패를 알리게 한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.gpsDetected = true
    blockPoiMock.mockRejectedValueOnce(new Error('poi_blocks upsert 실패'))
    const res = await POST(request(), params())
    await flushAfter()

    expect(res.status).toBe(403)
    expect(alertGpsSpoofMock).toHaveBeenCalledTimes(1)
    expect(alertGpsSpoofMock).toHaveBeenCalledWith(expect.objectContaining({ sanctionStored: false }))
    consoleError.mockRestore()
  })

  it('기록 저장이 실패해 logAbusingEvent가 던지지 않고 false를 돌려줘도 알림은 한 번 불리고 sanctionStored: false다', async () => {
    // 실제 함수는 insert 오류·예외를 삼키고 false를 돌려준다. 그래서 장소 차단이 성공해도 catch로 오지 않는다.
    state.gpsDetected = true
    logAbusingEventMock.mockResolvedValueOnce(false)
    const res = await POST(request(), params())
    await flushAfter()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.drops.pickupLocationUnverified })
    expect(blockPoiMock).toHaveBeenCalledTimes(1)
    expect(logAbusingEventMock).toHaveBeenCalledTimes(1)
    expect(alertGpsSpoofMock).toHaveBeenCalledTimes(1)
    expect(alertGpsSpoofMock).toHaveBeenCalledWith(expect.objectContaining({ sanctionStored: false }))
  })

  it('장소 차단과 기록이 둘 다 저장되면(logAbusingEvent가 true) sanctionStored: true다', async () => {
    state.gpsDetected = true
    const res = await POST(request(), params())
    await flushAfter()

    expect(res.status).toBe(403)
    expect(logAbusingEventMock).toHaveBeenCalledTimes(1)
    expect(alertGpsSpoofMock).toHaveBeenCalledTimes(1)
    expect(alertGpsSpoofMock).toHaveBeenCalledWith(expect.objectContaining({ sanctionStored: true }))
  })

  it('이용 정지를 자동으로 걸지 않는다 (알림은 운영자에게 알릴 뿐이다)', async () => {
    state.gpsDetected = true
    await POST(request(), params())
    await flushAfter()

    expect(state.tablesTouched).not.toContain('user_suspensions')
    expect(state.tablesTouched).not.toContain('user_shadow_bans')
  })
})

describe('서비스 활동 잼 «픽업» (티켓 20261028_1735 3회)', () => {
  const SCORE_ARGS = { p_user_id: PICKER, p_kind: 'pickup', p_event_key: 'pickup:drop-1' }

  it('다른 유저의 드랍을 주우면 응답을 보낸 뒤 드랍 id를 원천으로 한 번 부른다(양·날짜는 보내지 않는다 — 값은 DB 설정이 갖는다)', async () => {
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(state.afterCallbacks).toHaveLength(1)
    expect(state.scoreCalls).toEqual([]) // 응답 전에는 부르지 않는다

    await flushAfter()
    expect(state.scoreCalls).toEqual([SCORE_ARGS])
    expect(Object.keys(state.scoreCalls[0]).sort()).toEqual(['p_event_key', 'p_kind', 'p_user_id'])
    // 놓은 사람이 아니라 줍는 사람의 몫이다
    expect(state.scoreCalls.every((c) => c.p_user_id === PICKER)).toBe(true)
  })

  it('시스템 드랍(놓은 사람 없음)을 주워도 부른다', async () => {
    state.drop = dropOf(null)

    await POST(request(), params())
    await flushAfter()

    expect(state.scoreCalls).toEqual([SCORE_ARGS])
  })

  it('잠긴 채 받은 개체를 주워도 부른다', async () => {
    state.pickedLocked = true

    await POST(request(), params())
    await flushAfter()

    expect(state.scoreCalls).toEqual([SCORE_ARGS])
  })

  it('자기 드랍을 자기가 주우면 부르지 않는다(줍기는 허용이고 응답은 그대로다)', async () => {
    state.drop = dropOf(PICKER)

    const res = await POST(request(), params())
    await flushAfter()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })
    expect(state.rpcCalls).toBe(1)
    expect(state.scoreCalls).toEqual([])
  })

  it('같은 픽업을 다시 보내도 같은 (활동 종류, 원천 id)다', async () => {
    await POST(request(), params())
    await POST(request(), params())
    await flushAfter()

    expect(state.scoreCalls).toHaveLength(2)
    expect(state.scoreCalls[1]).toEqual(state.scoreCalls[0])
  })

  it('실패 분기(정지·이미 주워짐·인벤토리 가득·반경 밖 등)에서는 부르지 않는다', async () => {
    state.suspended = true
    await POST(request(), params())
    state.suspended = false

    state.near = false
    await POST(request(), params())
    state.near = true

    state.rpcResult = { data: { ok: false, error: 'already_picked_up' }, error: null }
    await POST(request(), params())
    state.rpcResult = { data: { ok: false, error: 'inventory_full' }, error: null }
    await POST(request(), params())
    state.rpcResult = { data: { ok: true, inventory_item_id: 'item-1' }, error: null }

    state.drop = dropOf(DROPPER, { is_available: false })
    await POST(request(), params())

    await flushAfter()
    expect(state.scoreCalls).toEqual([])
  })

  it('잼 RPC가 오류를 돌려줘도 응답은 같고 판정은 돌며 실패를 기록한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.scoreResult = { data: null, error: { message: 'jam rpc failed' } }

    const res = await POST(request(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inventory_item_id: 'item-1' })

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(2)
    expect(logMock).toHaveBeenCalledWith('points', 'service_jam_failed', PICKER, expect.objectContaining({ kind: 'pickup', sourceId: 'drop-1' }))
    consoleError.mockRestore()
  })

  it('잼 RPC가 예외를 던져도 응답은 같고 판정은 돈다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.scoreResult = 'throw'

    const res = await POST(request(), params())
    expect(res.status).toBe(200)

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })

  it('판정이 거부돼도 잼 지급은 부른다', async () => {
    runJamActionMock.mockRejectedValue(new Error('판정 장애'))

    await POST(request(), params())
    await flushAfter()

    expect(state.scoreCalls).toEqual([SCORE_ARGS])
  })
})
