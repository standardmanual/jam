/**
 * GET /api/cron/ops-stop-signals — 운영툴 중단 신호 매시 점검 크론 (티켓 20261001_1154)
 *
 * 창 계산·고르기·글 형식은 `opsSignals/__tests__/stopAlert.test.ts`와 `opsInbox/__tests__/slack.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - `CRON_SECRET`이 비었거나 헤더가 없거나 다르면 401이고, 그 경우 맞추기도 점검도 부르지 않는다(「Bearer undefined」가 통과하지 않는다)
 * - 순서: 상태 맞추기 → 응답 뒤(`after`) 맞추기 글 예약 → 신호 점검. 맞추기 글은 점검보다 먼저 예약한다
 * - 상태 맞추기가 실패하면(실패 응답이거나 던짐) 예약 누락 알림만 건너뛰고(`skipMissedSchedule`) 점검은 하며 500이다. 맞추기 글은 올리지 않는다
 * - 묶음을 읽지 못하면 500, 슬랙에 올리지 못해도 500, 슬랙 값이 없으면 200이다
 * - 본문은 개수와 상태만 싣는다
 * - GET만 export하고 maxDuration이 60이다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/cron/ops-stop-signals/__tests__/route.test.ts
 */
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SECRET = 'test-cron-secret'

const h = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
  order: [] as string[],
  service: { tag: 'service-client' },
  reconcile: vi.fn(),
  notify: vi.fn(),
  check: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => h.service }))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (cb: () => unknown) => {
      h.order.push('after')
      h.afterCallbacks.push(cb)
    },
  }
})
vi.mock('@/lib/admin/opsInbox/execute/reconcile', () => ({
  reconcileOpsItems: (...args: unknown[]) => h.reconcile(...args),
  notifyReconcile: (...args: unknown[]) => h.notify(...args),
}))
vi.mock('@/lib/admin/opsSignals/stopAlert', () => ({ runStopSignalCheck: (...args: unknown[]) => h.check(...args) }))

const route = await import('../route')

function reconcileSuccess(overrides: Record<string, unknown> = {}) {
  return { ok: true, batchId: 'batch-1', published: [], ended: [], cancelled: [], failed: [], externalChanged: [], errors: 0, decisionLogFailed: false, ...overrides }
}

function checkSuccess(overrides: Record<string, unknown> = {}) {
  return { ok: true, counts: { missedSchedule: 2, routineFailed: 1 }, post: 'sent', ...overrides }
}

/** `auth`를 `null`로 주면 authorization 헤더 없이 보낸다. */
function request(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return new NextRequest('https://j-a-m.app/api/cron/ops-stop-signals', { headers: auth === null ? {} : { authorization: auth } })
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  h.afterCallbacks = []
  h.order = []
  h.reconcile.mockReset().mockImplementation(async () => {
    h.order.push('reconcile')
    return reconcileSuccess()
  })
  h.notify.mockReset().mockResolvedValue(undefined)
  h.check.mockReset().mockImplementation(async () => {
    h.order.push('check')
    return checkSuccess()
  })
  vi.spyOn(console, 'info').mockImplementation(() => {}).mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {}).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('인증', () => {
  it('헤더가 없으면 401이고 맞추기도 점검도 부르지 않는다', async () => {
    const res = await route.GET(request(null))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
    expect(h.check).not.toHaveBeenCalled()
    expect(h.afterCallbacks).toHaveLength(0)
  })

  it('비밀값이 다르면 401이다', async () => {
    const res = await route.GET(request('Bearer wrong'))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
    expect(h.check).not.toHaveBeenCalled()
  })

  it('CRON_SECRET이 비어 있으면 「Bearer undefined」를 보내도 401이다', async () => {
    delete process.env.CRON_SECRET
    const res = await route.GET(request('Bearer undefined'))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
    expect(h.check).not.toHaveBeenCalled()
  })

  it('CRON_SECRET이 빈 문자열이어도 「Bearer 」를 보내면 401이다', async () => {
    process.env.CRON_SECRET = ''
    const res = await route.GET(request('Bearer '))
    expect(res.status).toBe(401)
    expect(h.reconcile).not.toHaveBeenCalled()
    expect(h.check).not.toHaveBeenCalled()
  })
})

describe('순서 — 상태 맞추기 → 맞추기 글 예약 → 신호 점검', () => {
  it('맞추기가 끝난 뒤 맞추기 글을 예약하고 그 다음에 신호를 점검한다', async () => {
    await route.GET(request())
    expect(h.order).toEqual(['reconcile', 'after', 'check'])
  })

  it('서비스 클라이언트로 맞추기를 한 번 부르고 맞추기 글은 응답 뒤에만 올린다', async () => {
    await route.GET(request())
    expect(h.reconcile).toHaveBeenCalledTimes(1)
    expect(h.reconcile.mock.calls[0][0]).toBe(h.service)
    expect(h.notify).not.toHaveBeenCalled()
    expect(h.afterCallbacks).toHaveLength(1)
    await h.afterCallbacks[0]()
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.notify.mock.calls[0][0]).toBe(h.service)
    expect(h.notify.mock.calls[0][1]).toMatchObject({ ok: true, batchId: 'batch-1' })
  })

  it('맞추기가 정상이면 예약 누락 알림을 건너뛰지 않는다', async () => {
    await route.GET(request())
    expect(h.check).toHaveBeenCalledTimes(1)
    expect(h.check).toHaveBeenCalledWith({ skipMissedSchedule: false })
  })
})

describe('상태 맞추기가 실패했을 때', () => {
  it('실패 응답이면 예약 누락 알림만 건너뛰고 점검은 하며 500이다. 맞추기 글은 예약하지 않는다', async () => {
    h.reconcile.mockImplementation(async () => {
      h.order.push('reconcile')
      return { ok: false, status: 500, error: '상태를 맞추지 못했어요.' }
    })
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(h.check).toHaveBeenCalledWith({ skipMissedSchedule: true })
    expect(h.order).toEqual(['reconcile', 'check'])
    expect(h.afterCallbacks).toHaveLength(0)
    expect(await res.json()).toEqual({ ok: false, reconcile: 'failed', missedSchedule: 2, routineFailed: 1, post: 'sent' })
  })

  it('맞추기가 던져도 던지지 않고 같은 처리를 한다', async () => {
    h.reconcile.mockRejectedValue(new Error('db down'))
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(h.check).toHaveBeenCalledWith({ skipMissedSchedule: true })
    expect(h.afterCallbacks).toHaveLength(0)
  })

  it('건너뛴 항목이 있어도(errors > 0) 맞추기는 성공이라 200이고 예약 누락 알림도 건너뛰지 않는다', async () => {
    h.reconcile.mockResolvedValue(reconcileSuccess({ errors: 2 }))
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect(h.check).toHaveBeenCalledWith({ skipMissedSchedule: false })
    expect(h.afterCallbacks).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('점검 결과', () => {
  it('성공이면 200이고 본문은 개수와 상태만 싣는다', async () => {
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, reconcile: 'ok', missedSchedule: 2, routineFailed: 1, post: 'sent' })
    const text = JSON.stringify(body)
    expect(text).not.toContain('batch-1')
    expect(text).not.toContain(SECRET)
  })

  it('걸린 것이 없어도 200이다', async () => {
    h.check.mockResolvedValue(checkSuccess({ counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' }))
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reconcile: 'ok', missedSchedule: 0, routineFailed: 0, post: 'none' })
  })

  it('슬랙 값이 없어 건너뛰어도(not_configured) 오류가 아니라 200이다', async () => {
    h.check.mockResolvedValue(checkSuccess({ post: 'not_configured' }))
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect((await res.json()).post).toBe('not_configured')
  })

  it('묶음을 읽지 못하면(load_failed) 500이고 글은 올리지 않았다고 알린다', async () => {
    h.check.mockResolvedValue({ ok: false, error: 'load_failed', counts: { missedSchedule: 0, routineFailed: 0 } })
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, reconcile: 'ok', missedSchedule: 0, routineFailed: 0, post: 'none', error: 'load_failed' })
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('슬랙에 올리지 못하면(slack_failed) 500이다', async () => {
    h.check.mockResolvedValue({ ok: false, error: 'slack_failed', counts: { missedSchedule: 1, routineFailed: 0 } })
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, reconcile: 'ok', missedSchedule: 1, routineFailed: 0, post: 'failed', error: 'slack_failed' })
  })

  it('점검이 실패해도 맞추기 글은 예약한다', async () => {
    h.check.mockResolvedValue({ ok: false, error: 'load_failed', counts: { missedSchedule: 0, routineFailed: 0 } })
    await route.GET(request())
    expect(h.afterCallbacks).toHaveLength(1)
  })
})

describe('라우트 모양', () => {
  it('GET만 export하고 maxDuration이 60이다', () => {
    expect(route.maxDuration).toBe(60)
    expect(Object.keys(route).sort()).toEqual(['GET', 'maxDuration'])
  })
})
