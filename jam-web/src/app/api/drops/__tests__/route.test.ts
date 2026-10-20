/**
 * POST /api/drops — JAM! 행동 지표(드랍한 아이템 수) 판정 연동 테스트 (티켓 20261001_0632)
 *
 * 검증 대상:
 *  - 드랍 성공 뒤 `after()`로 놓은 사람의 `drop_item_count` 판정을 1회 예약한다(콜백이 `runJamActionEvaluation`을 부른다)
 *  - 401·400·404·403·500·`ok: false` 실패 분기에서는 예약하지 않는다
 *  - 응답 본문·상태 코드·에러 문구는 변경 전과 같다. 판정이 거부돼도 응답은 그대로다
 *  - 잠긴 개체(티켓 20261018_1812)도 잠긴 채 드랍한다. 채운 양이 사라졌으면 응답이 `lostFill`로 알린다(열린 개체·채운 양 0이면 0).
 *    트리거 오류(`locked_item_cannot_be_dropped`)는 마지막 방어선으로 409 `locked_item_not_allowed`를 유지한다.
 *  - 소유권 확인보다 앞선 잠김 사전 조회는 없다 — `inventory_items`를 읽으면 시험이 실패한다
 *  - 이용 정지 중이면 403 `user_suspended`이고 위치·장소 검증·RPC 모두 부르지 않는다. DB 함수가 `user_suspended`로 거절해도 같은 403이다.
 *    정지 여부를 읽지 못하면 500이고 드랍하지 않는다.
 *  - 챕터 점수 «드랍»(티켓 20261019_1315): 성공 뒤 같은 `after()` 콜백이 `chapter_add_score`를 (drop, 드랍 id, 1)로 부른다. 응답을 보내기 전에는 부르지 않고,
 *    실패 분기에서는 부르지 않으며, 같은 드랍을 다시 보내도 같은 키다. 점수 실패(RPC 오류·예외)와 판정 실패는 서로의 실행과 응답을 바꾸지 않는다.
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
  /** `create_user_drop` 호출 횟수 (챕터 점수 RPC는 세지 않는다) */
  rpcCalls: 0,
  /** `chapter_add_score` 호출 인자 */
  scoreCalls: [] as Record<string, unknown>[],
  /** 챕터 점수 RPC의 결과. `'throw'`면 예외를 던진다 */
  scoreResult: { data: [{ score_added: 5, current_chapter: null, reached_chapters: [] }] as unknown, error: null as unknown } as
    | { data: unknown; error: unknown }
    | 'throw',
  poiReads: 0,
  /** 이용 정지 중인가 */
  suspended: false,
  /** 정지 여부 조회가 실패하는가 */
  suspensionReadFails: false,
  afterCallbacks: [] as (() => unknown)[],
}))

const runJamActionMock = vi.hoisted(() => vi.fn<(userId: string, triggers: readonly string[]) => Promise<void>>())
const logMock = vi.hoisted(() => vi.fn())

// 점수 실패 기록(logEngineDecision)이 실제 service 클라이언트를 만들지 않게 막는다
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

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
      state.poiReads += 1
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.single = async () =>
        state.poi ? { data: state.poi, error: null } : { data: null, error: { message: 'not found' } }
      return builder
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'chapter_add_score') {
        state.scoreCalls.push(args)
        if (state.scoreResult === 'throw') throw new Error('score network down')
        return state.scoreResult
      }
      state.rpcCalls += 1
      return state.rpcResult
    },
  }),
}))

vi.mock('@/lib/poi/proximity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/poi/proximity')>()
  return { ...actual, isUserNearPoi: () => state.near }
})
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
  state.scoreCalls = []
  state.scoreResult = { data: [{ score_added: 5, current_chapter: null, reached_chapters: [] }], error: null }
  state.poiReads = 0
  state.suspended = false
  state.suspensionReadFails = false
  state.afterCallbacks = []
  runJamActionMock.mockResolvedValue(undefined)
  logMock.mockResolvedValue(undefined)
})

describe('성공 — after()로 놓은 사람의 drop_item_count를 판정한다', () => {
  it('판정을 1회 예약하고, 콜백이 놓은 사람의 drop_item_count로 runJamActionEvaluation을 부른다', async () => {
    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drop_id: 'drop-1', lostFill: 0 })
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
    expect(await res.json()).toEqual({ drop_id: 'drop-1', lostFill: 0 })

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

describe('잠긴 개체 (티켓 20261018_1812)', () => {
  it('채우다 만 잠긴 개체를 드랍하면 사라진 채운 양을 lostFill로 알리고 판정을 예약한다', async () => {
    state.rpcResult = { data: { ok: true, drop_id: 'drop-1', lost_fill: 60 }, error: null }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drop_id: 'drop-1', lostFill: 60 })
    expect(state.rpcCalls).toBe(1)
    expect(state.afterCallbacks).toHaveLength(1)
  })

  it('DB가 더는 돌려주지 않는 locked_item 코드는 알 수 없는 코드로 보고 400을 낸다', async () => {
    state.rpcResult = { data: { ok: false, error: 'locked_item' }, error: null }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.drops.dropFailed })
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

describe('이용 정지 (티켓 20261018_1812, 운영 로직 9.3절)', () => {
  it('정지 중이면 403 user_suspended이고 장소 조회·RPC를 부르지 않는다', async () => {
    state.suspended = true
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.dropBlocked, code: 'user_suspended' })
    expect(state.poiReads).toBe(0)
    expect(state.rpcCalls).toBe(0)
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('입력 오류보다 정지가 먼저 막는다', async () => {
    state.suspended = true
    const res = await POST(request({ ...VALID_BODY, poi_id: '' }))
    expect(res.status).toBe(403)
    expect(state.rpcCalls).toBe(0)
  })

  it('RPC가 user_suspended로 거절해도 같은 403이다(앱 검사와 RPC 사이에 정지가 걸린 경우)', async () => {
    state.rpcResult = { data: { ok: false, error: 'user_suspended' }, error: null }
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.dropBlocked, code: 'user_suspended' })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('정지 여부를 읽지 못하면 500이고 드랍하지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.suspensionReadFails = true
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.drops.dropFailed })
    expect(state.rpcCalls).toBe(0)
    consoleError.mockRestore()
  })
})

describe('챕터 점수 «드랍» (티켓 20261019_1315)', () => {
  const SCORE_ARGS = { p_user_id: USER_ID, p_activity_kind: 'drop', p_source_id: 'drop-1', p_amount: 1 }

  it('응답을 보낸 뒤 같은 after 콜백이 드랍 id를 원천으로 한 번 센다(날짜는 보내지 않는다)', async () => {
    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(200)
    expect(state.afterCallbacks).toHaveLength(1)
    // 응답 전에는 세지 않는다
    expect(state.scoreCalls).toEqual([])

    await flushAfter()
    expect(state.scoreCalls).toEqual([SCORE_ARGS])
    expect(Object.keys(state.scoreCalls[0])).not.toContain('p_occurred_on')
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
  })

  it('같은 드랍을 다시 보내도 같은 (활동 종류, 원천 id)다', async () => {
    await POST(request(VALID_BODY))
    await POST(request(VALID_BODY))
    await flushAfter()

    expect(state.scoreCalls).toHaveLength(2)
    expect(state.scoreCalls[1]).toEqual(state.scoreCalls[0])
  })

  it('실패 분기(정지·반경 밖·RPC 거절 등)에서는 세지 않는다', async () => {
    state.suspended = true
    await POST(request(VALID_BODY))
    state.suspended = false

    state.near = false
    await POST(request(VALID_BODY))
    state.near = true

    state.rpcResult = { data: { ok: false, error: 'already_dropped' }, error: null }
    await POST(request(VALID_BODY))

    state.authenticated = false
    await POST(request(VALID_BODY))

    await flushAfter()
    expect(state.scoreCalls).toEqual([])
  })

  it('점수 RPC가 오류를 돌려줘도 응답은 같고 판정은 돌며 실패를 기록한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.scoreResult = { data: null, error: { message: 'score rpc failed' } }

    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drop_id: 'drop-1', lostFill: 0 })

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER_ID, expect.objectContaining({ kind: 'drop', sourceId: 'drop-1' }))
    consoleError.mockRestore()
  })

  it('점수 RPC가 예외를 던져도 응답은 같고 판정은 돈다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.scoreResult = 'throw'

    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drop_id: 'drop-1', lostFill: 0 })

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('판정이 거부돼도 점수는 센다', async () => {
    runJamActionMock.mockRejectedValue(new Error('판정 장애'))

    await POST(request(VALID_BODY))
    await flushAfter()

    expect(state.scoreCalls).toEqual([SCORE_ARGS])
  })

  it('성공 응답에 드랍 id가 없으면 세지 않고 판정은 그대로 돈다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpcResult = { data: { ok: true }, error: null }

    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(200)

    await flushAfter()
    expect(state.scoreCalls).toEqual([])
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
