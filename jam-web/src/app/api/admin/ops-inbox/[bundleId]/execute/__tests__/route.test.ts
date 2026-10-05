/**
 * POST /api/admin/ops-inbox/[bundleId]/execute — 예약 등록 (티켓 20261002_1123)
 *
 * 실행 규칙(선점·그룹 생성·되돌림·결정 기록)은 `opsInbox/execute/__tests__/run.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 비로그인·비관리자 403, UUID가 아니면 400, 본문 형식·크기 400
 * - 본문은 dryRun(사전 점검)·badgePreview(JAM! 배지 미리 세기, 티켓 20261005_1607)·itemIds(실행) 가운데 정확히 하나다
 * - dryRun은 사전 점검만 부르고 슬랙 글을 올리지 않는다. 배지 미리 세기도 읽기 전용이라 슬랙 글도 결정 기록도 없다. 실행은 행위자(관리자 ID)와 항목 ID를 넘기고 실패 상태·본문을 그대로 돌려준다
 * - 응답 뒤 슬랙 글: 요약 한 건(#jam-report), 실패가 있으면 한 건(#jam-alert). 슬랙이 실패하거나 던져도 응답은 200이다
 * - POST만 export하고 maxDuration이 60이며 읽기 토큰을 다루지 않는다
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => {
  const state = {
    admin: { id: 'admin-1', email: 'a@example.com' } as { id: string; email: string } | null,
    afterCallbacks: [] as Array<() => unknown>,
    decisionUpdates: [] as Array<{ payload: unknown; filters: Array<[string, unknown]> }>,
    postOpsSlack: vi.fn(),
    dryRunExecution: vi.fn(),
    badgePreviewExecution: vi.fn(),
    executeBundle: vi.fn(),
  }

  // 결정 기록에 slack_result를 채우는 update(...).eq(...).eq(...)만 흉내 낸다.
  class DecisionQuery {
    private payload: unknown
    private filters: Array<[string, unknown]> = []
    update(payload: unknown) {
      this.payload = payload
      return this
    }
    eq(col: string, val: unknown) {
      this.filters.push([col, val])
      return this
    }
    then<T>(onfulfilled?: (value: { error: null }) => T) {
      state.decisionUpdates.push({ payload: this.payload, filters: this.filters })
      return Promise.resolve({ error: null }).then(onfulfilled)
    }
  }
  return { state, DecisionQuery }
})

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => h.state.admin }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => new h.DecisionQuery() }),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void h.state.afterCallbacks.push(cb) }
})
vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.state.postOpsSlack }
})
// 처리 함수는 모의하고, 슬랙 결과를 채우는 notifyExecution은 실제 코드를 쓴다.
vi.mock('@/lib/admin/opsInbox/execute/run', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/execute/run')>()
  return { ...actual, dryRunExecution: h.state.dryRunExecution, badgePreviewExecution: h.state.badgePreviewExecution, executeBundle: h.state.executeBundle }
})

import { POST } from '../route'

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const I1 = '00000000-0000-4000-8000-000000000001'
const I2 = '00000000-0000-4000-8000-000000000002'

const PREVIEW = { totalUsers: 3, evaluatedUsers: 3, sampled: false, failedUsers: 0, lines: [{ itemId: I1, status: 'counted', userCount: 3, points: 30 }] }

function call(body: unknown, bundleId = B, raw?: string) {
  return POST(
    new Request(`http://localhost/api/admin/ops-inbox/${bundleId}/execute`, {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
    }),
    { params: Promise.resolve({ bundleId }) }
  )
}

async function flushAfter() {
  for (const cb of h.state.afterCallbacks.splice(0)) await cb()
}

function executed(extra: { failures?: Array<{ itemLabel: string; reason: string }> } = {}) {
  const failures = extra.failures ?? []
  return {
    ok: true as const,
    body: { ok: true, scheduled: [I1, I2], failed: [], skipped: [], excludedCount: 1 },
    batchId: 'batch-1',
    slack: { batchId: 'batch-1', isSample: false, scheduled: 2, excluded: 1, failures, decisionLogFailed: false },
  }
}

beforeEach(() => {
  h.state.admin = { id: 'admin-1', email: 'a@example.com' }
  h.state.afterCallbacks = []
  h.state.decisionUpdates = []
  for (const key of ['postOpsSlack', 'dryRunExecution', 'badgePreviewExecution', 'executeBundle'] as const) h.state[key].mockReset()
  h.state.dryRunExecution.mockResolvedValue({ ok: true, body: { ok: true, dryRun: true, ready: [I1], waiting: [], blocked: [], failClose: [], excluded: [], groups: [], warnings: [] } })
  h.state.badgePreviewExecution.mockResolvedValue({ ok: true, body: { ok: true, badgePreview: PREVIEW } })
  h.state.executeBundle.mockResolvedValue(executed())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const processors = () => [h.state.dryRunExecution, h.state.badgePreviewExecution, h.state.executeBundle]

describe('인증과 입력', () => {
  it('로그인하지 않았거나 관리자가 아니면 403이고 아무것도 처리하지 않는다', async () => {
    h.state.admin = null
    expect((await call({ dryRun: true })).status).toBe(403)
    expect((await call({ itemIds: [I1] })).status).toBe(403)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
    expect(h.state.afterCallbacks).toHaveLength(0)
  })

  it('UUID가 아닌 묶음 ID는 400이다', async () => {
    for (const bad of ['abc', '1', "x' or '1'='1"]) expect((await call({ dryRun: true }, bad)).status).toBe(400)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('본문이 JSON이 아니거나 객체가 아니면 400이다', async () => {
    expect((await call(null, B, 'not json')).status).toBe(400)
    expect((await call(null, B, '[]')).status).toBe(400)
    expect((await call(null, B, '"dryRun"')).status).toBe(400)
    expect((await call(null, B, '')).status).toBe(400)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('본문이 16KB를 넘으면 400이다', async () => {
    const res = await call({ itemIds: [I1], padding: 'x'.repeat(17_000) })
    expect(res.status).toBe(400)
    expect(h.state.executeBundle).not.toHaveBeenCalled()
  })

  it('dryRun·badgePreview·itemIds 중 정확히 하나만 받는다(둘 이상·모두 없음·dryRun이나 badgePreview가 true가 아님은 400)', async () => {
    for (const body of [
      {},
      { dryRun: true, itemIds: [I1] },
      { dryRun: false },
      { dryRun: 'true' },
      { dryRun: 1 },
      { dryRun: false, itemIds: [I1] },
      { action: 'execute' },
      { badgePreview: false },
      { badgePreview: 'true' },
      { badgePreview: 1 },
      { badgePreview: null },
      { badgePreview: true, dryRun: true },
      { badgePreview: true, itemIds: [I1] },
      { badgePreview: true, dryRun: true, itemIds: [I1] },
    ]) {
      expect((await call(body)).status, JSON.stringify(body)).toBe(400)
    }
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })
})

describe('사전 점검 { dryRun: true }', () => {
  it('사전 점검 결과를 200으로 돌려주고 실행·슬랙은 부르지 않는다', async () => {
    const res = await call({ dryRun: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, dryRun: true, ready: [I1] })
    expect(h.state.dryRunExecution).toHaveBeenCalledWith(expect.anything(), B)
    expect(h.state.executeBundle).not.toHaveBeenCalled()
    expect(h.state.afterCallbacks).toHaveLength(0)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled()
  })

  it('실패는 그 상태와 본문을 그대로 돌려준다', async () => {
    h.state.dryRunExecution.mockResolvedValue({ ok: false, status: 404, error: '찾을 수 없는 기획이에요.' })
    const res = await call({ dryRun: true })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: '찾을 수 없는 기획이에요.' })
  })
})

describe('배지 미리 세기 { badgePreview: true }', () => {
  it('미리 센 결과를 200으로 돌려주고 사전 점검·실행·슬랙은 부르지 않는다', async () => {
    const res = await call({ badgePreview: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, badgePreview: PREVIEW })
    expect(h.state.badgePreviewExecution).toHaveBeenCalledWith(expect.anything(), B)
    expect(h.state.dryRunExecution).not.toHaveBeenCalled()
    expect(h.state.executeBundle).not.toHaveBeenCalled()
    // 읽기 전용: 결정 기록도 슬랙 글도 없다
    expect(h.state.afterCallbacks).toHaveLength(0)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled()
    expect(h.state.decisionUpdates).toEqual([])
  })

  it('실패는 그 상태와 본문을 그대로 돌려준다', async () => {
    h.state.badgePreviewExecution.mockResolvedValue({ ok: false, status: 404, error: '찾을 수 없는 기획이에요.' })
    const res = await call({ badgePreview: true })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: '찾을 수 없는 기획이에요.' })
  })
})

describe('실행 { itemIds }', () => {
  it('행위자는 관리자 ID이고 항목 ID를 그대로 넘기며(검사는 처리 함수 몫) 결과 본문을 200으로 돌려준다', async () => {
    const res = await call({ itemIds: [I1, I2] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, scheduled: [I1, I2], failed: [], skipped: [], excludedCount: 1 })
    expect(h.state.executeBundle).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemIds: [I1, I2], actor: 'admin-1' })
    expect(h.state.dryRunExecution).not.toHaveBeenCalled()

    await call({ itemIds: 'not-a-list' })
    expect(h.state.executeBundle).toHaveBeenLastCalledWith(expect.anything(), { bundleId: B, itemIds: 'not-a-list', actor: 'admin-1' })
  })

  it('처리 실패는 그 상태와 본문(error·건너뛴 항목)을 그대로 돌려주고 슬랙 글을 올리지 않는다', async () => {
    h.state.executeBundle.mockResolvedValue({
      ok: false,
      status: 409,
      error: '예약할 수 있는 항목이 없어요.',
      extra: { skipped: [{ id: I1, reason: '이미 다른 곳에서 처리한 항목이에요' }], excludedCount: 1 },
    })
    const res = await call({ itemIds: [I1] })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: '예약할 수 있는 항목이 없어요.',
      skipped: [{ id: I1, reason: '이미 다른 곳에서 처리한 항목이에요' }],
      excludedCount: 1,
    })
    for (const status of [400, 404, 500] as const) {
      h.state.executeBundle.mockResolvedValue({ ok: false, status, error: '실패했어요.' })
      expect((await call({ itemIds: [I1] })).status).toBe(status)
    }
    expect(h.state.afterCallbacks).toHaveLength(0)
  })
})

describe('응답 뒤 슬랙 글', () => {
  it('성공하면 응답 뒤에 요약을 #jam-report에 올리고 결과를 execute 기록에 채운다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const res = await call({ itemIds: [I1, I2] })
    expect(res.status).toBe(200)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled() // 응답이 나가기 전에는 올리지 않는다
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls).toEqual([['report', '2개 예약 등록, 1개 제외']])
    expect(h.state.decisionUpdates).toEqual([
      {
        payload: { slack_result: { channel: 'report', ok: true } },
        filters: [
          ['batch_id', 'batch-1'],
          ['action', 'execute'],
        ],
      },
    ])
  })

  it('실패가 있으면 #jam-alert에 한 건을 더 올리고 fail 기록에 채운다', async () => {
    h.state.executeBundle.mockResolvedValue(executed({ failures: [{ itemLabel: '미션 · 10/10(토) 09:00', reason: '미션을 만들지 못했어요' }] }))
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    await call({ itemIds: [I1, I2] })
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls).toEqual([
      ['report', '2개 예약 등록, 1개 제외, 1개 실패'],
      ['alert', '예약 등록에 실패했어요 · 1건\n• 미션 · 10/10(토) 09:00 — 미션을 만들지 못했어요'],
    ])
    expect(h.state.decisionUpdates.map((update) => update.filters)).toEqual([
      [['batch_id', 'batch-1'], ['action', 'execute']],
      [['batch_id', 'batch-1'], ['action', 'fail']],
    ])
  })

  it('슬랙이 실패해도 응답은 200이고 실패가 slack_result에 남는다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
    const res = await call({ itemIds: [I1] })
    expect(res.status).toBe(200)
    await flushAfter()
    expect(h.state.decisionUpdates[0].payload).toEqual({ slack_result: { channel: 'report', ok: false, error: 'not_configured' } })
  })

  it('슬랙 게시가 던져도 응답은 200이다', async () => {
    h.state.postOpsSlack.mockRejectedValue(new Error('network down'))
    const res = await call({ itemIds: [I1] })
    expect(res.status).toBe(200)
    await expect(flushAfter()).resolves.toBeUndefined()
  })
})

describe('라우트 계약', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/admin/ops-inbox/[bundleId]/execute/route.ts'), 'utf8')

  it('POST만 export한다', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(source).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`))
      expect(source).not.toMatch(new RegExp(`export\\s+(const|let|var)\\s+${method}\\b`))
    }
  })

  it('요청 시간 60초(maxDuration)를 쓴다(PRD §8.2 한도, 저장소의 무거운 라우트 관례)', () => {
    expect(source).toMatch(/export\s+const\s+maxDuration\s*=\s*60/)
  })

  it('본문 상한이 있다', () => {
    expect(source).toMatch(/MAX_BODY_BYTES\s*=\s*16_384/)
    expect(source).toMatch(/Buffer\.byteLength\(text, 'utf8'\) > MAX_BODY_BYTES/)
  })

  it('읽기 토큰을 다루지 않는다(관리자 로그인만)', () => {
    expect(source).not.toMatch(/x-admin-read-token|isValidAdminReadToken|requireOpsInboxSubmit|isOpsInboxTokenRequest/)
    expect(source).toMatch(/getAdminUser\(\)/)
  })

  it('응답에 DB 오류 원문을 싣는 경로가 없다(처리 결과의 error·extra만 돌려준다)', () => {
    expect(source).not.toMatch(/\.message\b/)
    expect(source).not.toMatch(/console\./)
  })

  it('이 경로는 토큰 쓰기 예외에 해당하지 않는다(토큰 POST는 proxy가 로그인으로 돌려보낸다)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/admin/auth')>('@/lib/admin/auth')
    vi.stubEnv('ADMIN_API_READ_TOKEN', 'test-admin-read-token-abcdef')
    try {
      expect(actual.isOpsInboxTokenRequest('POST', `/api/admin/ops-inbox/${B}/execute`, 'test-admin-read-token-abcdef')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
