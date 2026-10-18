/**
 * POST /api/drops — JAM! 행동 지표(드랍한 아이템 수) 판정 연동 테스트 (티켓 20261001_0632)
 *
 * 검증 대상:
 *  - 드랍 성공 뒤 `after()`로 놓은 사람의 `drop_item_count` 판정을 1회 예약한다(콜백이 `runJamActionEvaluation`을 부른다)
 *  - 401·400·404·403·500·`ok: false` 실패 분기에서는 예약하지 않는다
 *  - 응답 본문·상태 코드·에러 문구는 변경 전과 같다. 판정이 거부돼도 응답은 그대로다
 *  - 잠긴 개체(티켓 20261018_0051·0657)는 DB 함수(마이그레이션 238)가 `locked_item`으로 거절하고, 라우트가 409 `locked_item_not_allowed`로 바꾼다. 트리거 오류도 같은 코드다.
 *  - 소유권 확인보다 앞선 잠김 사전 조회는 없다 — `inventory_items`를 읽으면 시험이 실패한다
 *
 * `after()`는 요청 범위 밖에서 부를 수 없다. 콜백을 모아 두었다가 테스트가 「응답이 끝난 뒤」를 직접 흉내 낸다
 * (선례: `src/app/api/admin/ops-inbox/__tests__/route.test.ts`).
 *
 * 실행: cd jam-web && npx vitest run src/app/api/drops/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d, t } from '@/lib/i18n'
import { DROP_RADIUS_METERS } from '@/lib/poi/proximity'

const USER_ID = 'user-1'

const state = vi.hoisted(() => ({
  authenticated: true,
  poi: { id: 'poi-1', is_active: true } as { id: string; is_active: boolean } | null,
  near: true,
  inventoryId: 'inv-1' as string | null,
  rpcResult: { data: { ok: true, drop_id: 'drop-1' } as unknown, error: null as unknown },
  /** `inventory_items`를 읽은 횟수 — 잠김 사전 조회가 없어야 하므로 항상 0이어야 한다 */
  inventoryItemReads: 0,
  rpcCalls: 0,
  afterCallbacks: [] as (() => unknown)[],
}))

const runJamActionMock = vi.hoisted(() => vi.fn<(userId: string, triggers: readonly string[]) => Promise<void>>())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'inventory_items') state.inventoryItemReads += 1
      if (table !== 'poi') throw new Error(`예상하지 못한 테이블: ${table}`)
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.single = async () =>
        state.poi ? { data: state.poi, error: null } : { data: null, error: { message: 'not found' } }
      return builder
    },
    rpc: async () => {
      state.rpcCalls += 1
      return state.rpcResult
    },
  }),
}))

vi.mock('@/lib/poi/proximity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/poi/proximity')>()
  return { ...actual, isUserNearPoi: () => state.near }
})
vi.mock('@/lib/inventory/get-or-create', () => ({ getOrCreateInventoryId: async () => state.inventoryId }))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (userId: string, triggers: readonly string[]) => runJamActionMock(userId, triggers),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void state.afterCallbacks.push(cb) }
})

import { POST } from '../route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/drops', { method: 'POST', body: JSON.stringify(body) })
}

const VALID_BODY = { poi_id: 'poi-1', inventory_item_id: 'item-1', user_lat: 37.5, user_lng: 127.0 }

/** 응답이 끝난 뒤를 흉내 낸다 — 예약된 `after` 콜백을 모두 실행한다 */
async function flushAfter() {
  const callbacks = state.afterCallbacks.splice(0)
  await Promise.allSettled(callbacks.map((cb) => cb()))
}

beforeEach(() => {
  vi.clearAllMocks()
  state.authenticated = true
  state.poi = { id: 'poi-1', is_active: true }
  state.near = true
  state.inventoryId = 'inv-1'
  state.rpcResult = { data: { ok: true, drop_id: 'drop-1' }, error: null }
  state.inventoryItemReads = 0
  state.rpcCalls = 0
  state.afterCallbacks = []
  runJamActionMock.mockResolvedValue(undefined)
})

describe('성공 — after()로 놓은 사람의 drop_item_count를 판정한다', () => {
  it('판정을 1회 예약하고, 콜백이 놓은 사람의 drop_item_count로 runJamActionEvaluation을 부른다', async () => {
    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drop_id: 'drop-1' })
    expect(state.afterCallbacks).toHaveLength(1)
    // 응답을 보내기 전에는 판정을 돌리지 않는다 — after 콜백이 실행될 때만 부른다
    expect(runJamActionMock).not.toHaveBeenCalled()

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, ['drop_item_count'])
  })

  it('판정이 거부돼도 응답은 판정이 정상일 때와 같다', async () => {
    runJamActionMock.mockRejectedValue(new Error('판정 장애'))

    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drop_id: 'drop-1' })

    // 콜백이 거부돼도 이미 보낸 응답에는 영향이 없다(테스트 헬퍼가 거부를 삼킨다)
    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
  })
})

describe('실패 분기에서는 판정을 예약하지 않는다 — 응답은 그대로다', () => {
  it('401 세션 없음', async () => {
    state.authenticated = false
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.drops.sessionExpired })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it.each([
    ['poi_id 없음', { ...VALID_BODY, poi_id: '' }],
    ['inventory_item_id 없음', { ...VALID_BODY, inventory_item_id: '' }],
    ['user_lat 숫자 아님', { ...VALID_BODY, user_lat: 'abc' }],
    ['user_lng 숫자 아님', { ...VALID_BODY, user_lng: 'abc' }],
  ])('400 입력 오류 — %s', async (_name, body) => {
    const res = await POST(request(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.drops.locationMissing })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('404 지점을 찾지 못함', async () => {
    state.poi = null
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.dropPoiNotFound })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('404 비활성 지점', async () => {
    state.poi = { id: 'poi-1', is_active: false }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.dropPoiNotFound })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('403 지점 반경 밖', async () => {
    state.near = false
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: t(d.drops.dropOutOfRange, { m: DROP_RADIUS_METERS }) })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('404 인벤토리를 만들지 못함', async () => {
    state.inventoryId = null
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.loadInventoryFailed })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('500 RPC 오류', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpcResult = { data: null, error: { message: 'rpc 장애' } }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.drops.dropFailed })
    expect(state.afterCallbacks).toHaveLength(0)
    consoleError.mockRestore()
  })

  it.each([
    ['inventory_not_found', 404, d.drops.loadInventoryFailed],
    ['item_not_found', 404, d.drops.dropItemNotFound],
    ['item_slotted', 409, d.drops.dropItemSlotted],
    ['already_dropped', 409, d.drops.dropAlreadyDropped],
    ['unknown_code', 400, d.drops.dropFailed],
  ])('ok:false(%s) → %i', async (code, status, message) => {
    state.rpcResult = { data: { ok: false, error: code }, error: null }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message })
    expect(state.afterCallbacks).toHaveLength(0)
  })
})

describe('잠긴 개체 (티켓 20261018_0051·0657)', () => {
  it('DB가 locked_item으로 거절하면 409 locked_item_not_allowed로 바꾸고 판정을 예약하지 않는다', async () => {
    state.rpcResult = { data: { ok: false, error: 'locked_item' }, error: null }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.lockedItem.drop, code: 'locked_item_not_allowed' })
    expect(state.rpcCalls).toBe(1)
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('남의 개체는 item_not_found로 돌아가 잠김 여부가 새지 않는다', async () => {
    state.rpcResult = { data: { ok: false, error: 'item_not_found' }, error: null }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.drops.dropItemNotFound })
  })

  it('소유권 확인보다 앞선 잠김 사전 조회는 하지 않는다', async () => {
    await POST(request(VALID_BODY))
    expect(state.inventoryItemReads).toBe(0)
    expect(state.rpcCalls).toBe(1)
  })

  it('열린 개체는 그대로 드랍한다', async () => {
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(200)
    expect(state.rpcCalls).toBe(1)
  })

  it('RPC가 트리거 오류(locked_item_cannot_be_dropped)를 올려도 같은 코드로 409를 낸다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpcResult = { data: null, error: { message: 'locked_item_cannot_be_dropped' } }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.lockedItem.drop, code: 'locked_item_not_allowed' })
    expect(state.afterCallbacks).toHaveLength(0)
    consoleError.mockRestore()
  })
})
