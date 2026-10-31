/**
 * GET /api/cron/capsule-signals — 캡슐·소멸 운영 신호 일일 요약 크론 (티켓 20261031_1525)
 *
 * 읽기와 글 형식은 `lib/capsule/__tests__/dailySignals.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - `CRON_SECRET`이 비었거나 헤더가 없거나 다르면 401이고 아무것도 읽지 않는다
 * - 슬랙에 올리면 200 sent, 슬랙 값이 없으면 200 none, 슬랙 실패는 500 failed
 * - 세 항목을 모두 못 읽으면 글을 올리지 않고 500
 * - 본문은 개수와 상태만 싣고 글 내용·개인 값은 싣지 않는다
 * - GET만 export하고 maxDuration이 60 이하다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/cron/capsule-signals/__tests__/route.test.ts
 */
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SECRET = 'test-cron-secret'

const h = vi.hoisted(() => ({
  read: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ tag: 'service-client' }) }))
vi.mock('@/lib/admin/opsInbox/slack', () => ({ postOpsSlack: (...args: unknown[]) => h.post(...args) }))
vi.mock('@/lib/capsule/dailySignals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/capsule/dailySignals')>()
  return { ...actual, readCapsuleDailySignals: (...args: unknown[]) => h.read(...args) }
})

const route = await import('../route')

function loaded() {
  return {
    day: '2026-10-30',
    forfeit: { users: 2, amount: 80, weekUsers: 3, weekAmount: 120 },
    opens: { total: 9, maxPerUser: 4 },
    pending: { pendingUsers: 5, blockedUsers: 1, totalUsers: 100 },
  }
}

function request(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return new NextRequest('https://j-a-m.app/api/cron/capsule-signals', { headers: auth === null ? {} : { authorization: auth } })
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  h.read.mockReset().mockResolvedValue(loaded())
  h.post.mockReset().mockResolvedValue({ ok: true })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('인증', () => {
  it('헤더가 없으면 401이고 읽지 않는다', async () => {
    const res = await route.GET(request(null))
    expect(res.status).toBe(401)
    expect(h.read).not.toHaveBeenCalled()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('헤더가 다르면 401이다', async () => {
    expect((await route.GET(request('Bearer wrong'))).status).toBe(401)
  })

  it('CRON_SECRET이 비어 있으면 «Bearer undefined»도 401이다', async () => {
    delete process.env.CRON_SECRET
    expect((await route.GET(request('Bearer undefined'))).status).toBe(401)
    process.env.CRON_SECRET = ''
    expect((await route.GET(request('Bearer '))).status).toBe(401)
    expect(h.read).not.toHaveBeenCalled()
  })
})

describe('게시', () => {
  it('#jam-alert에 한 건 올리고 200 sent이며 본문에는 개수만 있다', async () => {
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect(h.post).toHaveBeenCalledTimes(1)
    expect(h.post.mock.calls[0][0]).toBe('alert')
    expect(h.post.mock.calls[0][1]).toContain('캡슐 운영 신호 · 어제 요약')
    expect(await res.json()).toEqual({ ok: true, forfeitUsers: 2, openedCapsules: 9, pendingUsers: 5, post: 'sent' })
  })

  it('슬랙 값이 없으면 200이고 post는 none이다', async () => {
    h.post.mockResolvedValue({ ok: false, error: 'not_configured' })
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect((await res.json()).post).toBe('none')
  })

  it('슬랙 게시가 실패하면 던지지 않고 500이다', async () => {
    h.post.mockResolvedValue({ ok: false, error: 'http_500' })
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, post: 'failed', error: 'slack_failed' })
  })

  it('일부만 못 읽었으면 «읽지 못했어요»로 적고 올린다', async () => {
    h.read.mockResolvedValue({ ...loaded(), forfeit: null })
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect(h.post.mock.calls[0][1]).toContain('잼 소멸: 읽지 못했어요')
    expect((await res.json()).forfeitUsers).toBeNull()
  })

  it('세 항목을 모두 못 읽으면 글을 올리지 않고 500이다', async () => {
    h.read.mockResolvedValue({ day: '2026-10-30', forfeit: null, opens: null, pending: null })
    const res = await route.GET(request())
    expect(res.status).toBe(500)
    expect(h.post).not.toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ ok: false, post: 'none', error: 'load_failed' })
  })
})

describe('모양', () => {
  it('GET만 export하고 maxDuration은 60 이하다', () => {
    expect(typeof route.GET).toBe('function')
    expect(route.maxDuration).toBeLessThanOrEqual(60)
    expect(Object.keys(route).filter((k) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(k))).toEqual([])
  })
})
