/**
 * GET /api/cron/notifications — 응답 계약 (티켓 20260825_002 3차 보강)
 *
 * **단계가 실패했는데 200을 주면 안 된다.** Vercel의 cron 실패 감지는 상태 코드 기준이라,
 * 마이그레이션 미적용(099) 같은 상태가 대시보드에서 **성공으로 보인다.** 실제로 그 경로로
 * `mission-rank` 단계가 매일 조용히 죽어 있어도 아무도 모르게 된다.
 */
import { NextRequest } from 'next/server'
import type { NotificationBatchResult } from '@/lib/notifications/batch'

const runNotificationBatch = vi.fn<() => Promise<NotificationBatchResult>>()
vi.mock('@/lib/notifications/batch', () => ({
  runNotificationBatch: (...args: unknown[]) =>
    (runNotificationBatch as unknown as (...a: unknown[]) => Promise<NotificationBatchResult>)(...args),
}))

const { GET } = await import('../route')

const SECRET = 'test-cron-secret'

function requestWith(auth?: string): NextRequest {
  return new NextRequest('https://j-a-m.app/api/cron/notifications', {
    headers: auth ? { authorization: auth } : {},
  })
}

function step(overrides: Partial<NotificationBatchResult['steps'][number]>) {
  return {
    step: 'collections',
    scanned: 10,
    drafts: 2,
    created: 2,
    failed: 0,
    durationMs: 12,
    error: null,
    ...overrides,
  }
}

function result(steps: NotificationBatchResult['steps']): NotificationBatchResult {
  return {
    startedAt: '2026-08-25T09:00:00.000Z',
    durationMs: 1200,
    scanned: steps.reduce((s, x) => s + x.scanned, 0),
    drafts: steps.reduce((s, x) => s + x.drafts, 0),
    created: steps.reduce((s, x) => s + x.created, 0),
    failed: steps.reduce((s, x) => s + x.failed, 0),
    steps,
  }
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  runNotificationBatch.mockReset()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/cron/notifications', () => {
  it('CRON_SECRET이 맞지 않으면 401', async () => {
    const res = await GET(requestWith('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    expect(runNotificationBatch).not.toHaveBeenCalled()
  })

  it('전 단계가 성공하면 200', async () => {
    runNotificationBatch.mockResolvedValue(result([step({}), step({ step: 'drop-spot', created: 0, drafts: 0 })]))
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, created: 2 })
  })

  it('단계가 하나라도 실패하면 500 — 200을 주면 Vercel 대시보드에 성공으로 뜬다', async () => {
    runNotificationBatch.mockResolvedValue(
      result([
        step({}),
        step({ step: 'mission-rank', created: 0, drafts: 0, scanned: 0, error: 'relation "mission_rank_snapshots" does not exist' }),
      ])
    )
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
    // 나머지 단계가 만든 소식은 그대로 남는다 (단계 격리) — 500은 "전부 실패"가 아니다
    expect(body.created).toBe(2)
    expect(body.steps.find((s: { step: string }) => s.step === 'mission-rank').error).toContain(
      'mission_rank_snapshots'
    )
  })

  it('요약 로그에 scanned·drafts·durationMs를 싣는다 — "정상 0건"과 "깨져서 0건"의 구분선', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    runNotificationBatch.mockResolvedValue(
      result([step({ step: 'missions', scanned: 137, drafts: 0, created: 0 })])
    )
    await GET(requestWith(`Bearer ${SECRET}`))
    const line = info.mock.calls[0]?.[0] as string
    expect(line).toContain('missions: 생성0/시도0/스캔137')
    expect(line).toContain('ms')
  })
})
