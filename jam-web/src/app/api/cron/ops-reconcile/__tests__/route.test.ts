/**
 * GET /api/cron/ops-reconcile — 운영툴 상태 맞추기 크론 (티켓 20261002_1814)
 *
 * 상태 맞추기 규칙(판정·상태·결정 기록)은 `opsInbox/execute/__tests__/reconcile*.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - `CRON_SECRET`이 비었거나 헤더가 없거나 다르면 401이고, 그 경우 상태 맞추기를 부르지 않는다(「Bearer undefined」가 통과하지 않는다)
 * - 읽기 재료를 읽지 못한 `RunFailure`는 그 상태 코드와 `{ ok: false, error }`이고 슬랙 글을 올리지 않는다
 * - 성공 본문은 개수만 싣는다(항목 ID·사유 없음). 건너뛴 항목이 없으면 200, 있으면 500
 * - 성공이면 오류가 있어도 응답 뒤(`after`) 슬랙 글을 올린다
 * - GET만 export하고 maxDuration이 60이다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/cron/ops-reconcile/__tests__/route.test.ts
 */
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SECRET = 'test-cron-secret'

const h = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
  service: { tag: 'service-client' },
  reconcile: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => h.service }))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void h.afterCallbacks.push(cb) }
})
vi.mock('@/lib/admin/opsInbox/execute/reconcile', () => ({
  reconcileOpsItems: (...args: unknown[]) => h.reconcile(...args),
  notifyReconcile: (...args: unknown[]) => h.notify(...args),
}))

const route = await import('../route')

function change(id: string) {
  return { itemId: id, bundleId: 'b-1', itemLabel: `항목 ${id}`, resourceId: `r-${id}`, isSample: false, action: null, reason: `사유 ${id}` }
}

function success(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    batchId: 'batch-1',
    published: [change('1'), change('2')],
    ended: [change('3')],
    cancelled: [],
    failed: [change('4')],
    externalChanged: [{ itemId: '5', bundleId: 'b-1', itemLabel: '항목 5', isSample: false, diff: { is_active: { item: true, resource: false } } }],
    errors: 0,
    decisionLogFailed: false,
    ...overrides,
  }
}

/** `auth`를 `null`로 주면 authorization 헤더 없이 보낸다. */
function request(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return new NextRequest('https://j-a-m.app/api/cron/ops-reconcile', { headers: auth === null ? {} : { authorization: auth } })
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  h.afterCallbacks = []
  h.reconcile.mockReset().mockResolvedValue(success())
  h.notify.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('인증', () => {
  it('헤더가 없으면 401이고 상태 맞추기를 부르지 않는다', async () => {
    const res = await route.GET(request(null))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
    expect(h.afterCallbacks).toHaveLength(0)
  })

  it('비밀값이 다르면 401이다', async () => {
    const res = await route.GET(request('Bearer wrong'))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
  })

  it('CRON_SECRET이 비어 있으면 「Bearer undefined」를 보내도 401이다', async () => {
    delete process.env.CRON_SECRET
    const res = await route.GET(request('Bearer undefined'))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
  })

  it('CRON_SECRET이 빈 문자열이어도 「Bearer 」를 보내면 401이다', async () => {
    process.env.CRON_SECRET = ''
    const res = await route.GET(request('Bearer '))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
  })
})

describe('RunFailure', () => {
  it('그 상태 코드와 { ok: false, error }를 돌려주고 슬랙을 올리지 않는다', async () => {
    h.reconcile.mockResolvedValue({ ok: false, status: 500, error: '상태를 맞추지 못했어요.', extra: { items: ['x'] } })
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: '상태를 맞추지 못했어요.' })
    expect(h.afterCallbacks).toHaveLength(0)
  })
})

describe('성공', () => {
  it('서비스 클라이언트로 상태 맞추기를 한 번 부른다', async () => {
    await route.GET(request())
    expect(h.reconcile).toHaveBeenCalledTimes(1)
    expect(h.reconcile.mock.calls[0][0]).toBe(h.service)
  })

  it('오류가 없으면 200이고 본문은 개수만 싣는다', async () => {
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, published: 2, ended: 1, cancelled: 0, failed: 1, externalChanged: 1, errors: 0 })
    const text = JSON.stringify(body)
    expect(text).not.toContain('batch-1')
    expect(text).not.toContain('사유')
    expect(text).not.toContain('r-1')
  })

  it('건너뛴 항목이 있으면 500이고 개수는 그대로 싣는다', async () => {
    h.reconcile.mockResolvedValue(success({ errors: 2 }))
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, published: 2, ended: 1, cancelled: 0, failed: 1, externalChanged: 1, errors: 2 })
  })

  it('응답 뒤(after) 슬랙 글을 한 번 올린다 — 응답이 나가는 동안에는 부르지 않는다', async () => {
    await route.GET(request())
    expect(h.notify).not.toHaveBeenCalled()
    expect(h.afterCallbacks).toHaveLength(1)
    await h.afterCallbacks[0]()
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.notify.mock.calls[0][0]).toBe(h.service)
    expect(h.notify.mock.calls[0][1]).toMatchObject({ ok: true, batchId: 'batch-1' })
  })

  it('오류가 있어 500이어도 슬랙 글은 올린다', async () => {
    h.reconcile.mockResolvedValue(success({ errors: 1 }))
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(h.afterCallbacks).toHaveLength(1)
    await h.afterCallbacks[0]()
    expect(h.notify).toHaveBeenCalledTimes(1)
  })

  it('바뀐 것이 없어도 200이다', async () => {
    h.reconcile.mockResolvedValue(success({ published: [], ended: [], failed: [], externalChanged: [] }))
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, published: 0, ended: 0, cancelled: 0, failed: 0, externalChanged: 0, errors: 0 })
  })
})

describe('라우트 모양', () => {
  it('GET만 export하고 maxDuration이 60이다', () => {
    expect(route.maxDuration).toBe(60)
    expect(Object.keys(route).sort()).toEqual(['GET', 'maxDuration'])
  })
})
