/**
 * POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/end — 공개 뒤 「지금 종료」 (티켓 20261006_0950)
 *
 * 종료 규칙(상태 선점·자원 종료·되돌림·결정 기록)은 `opsInbox/execute/__tests__/end.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 비로그인·비관리자 403, 두 ID가 UUID가 아니면 400, 본문 형식·크기 400
 * - 본문은 `{ dryRun: true }`이거나 `{ reason? }`다: 사유는 앞뒤 공백을 빼고 500자까지, 빈 문자열은 없음, 둘을 함께 보내거나 다른 키를 보내면 400
 * - 미리 보기는 미리 보기만 부르고 슬랙 글을 올리지 않는다. 종료는 행위자(관리자 ID)와 사유를 넘기고 실패 상태·본문(error)을 그대로 돌려준다
 * - 응답 뒤 슬랙 글: 종료 요약(#jam-report), 끝내지 못한 일은 알림(#jam-alert). 슬랙이 실패하거나 던져도 응답은 그대로다
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
    previewEnd: vi.fn(),
    endItem: vi.fn(),
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
// 처리 함수는 모의하고, 슬랙 결과를 채우는 notifyEnd는 실제 코드를 쓴다.
vi.mock('@/lib/admin/opsInbox/execute/end', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/execute/end')>()
  return { ...actual, previewEnd: h.state.previewEnd, endItem: h.state.endItem }
})

import { POST } from '../route'

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const I1 = '00000000-0000-4000-8000-000000000001'
const I2 = '00000000-0000-4000-8000-000000000002'
const LABEL = '홈피드 카드 · 10/10(토) 09:00'

function call(body: unknown, ids: { bundleId?: string; itemId?: string } = {}, raw?: string) {
  const bundleId = ids.bundleId ?? B
  const itemId = ids.itemId ?? I1
  return POST(
    new Request(`http://localhost/api/admin/ops-inbox/${bundleId}/items/${itemId}/end`, {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
    }),
    { params: Promise.resolve({ bundleId, itemId }) }
  )
}

async function flushAfter() {
  for (const cb of h.state.afterCallbacks.splice(0)) await cb()
}

function ended(extra: { problem?: string | null; resourceState?: 'ended' | 'alreadyEnded' | 'missing' | null; reason?: string | null } = {}) {
  return {
    ok: true as const,
    body: { ok: true, itemId: I1, resourceState: 'ended' },
    batchId: 'batch-1',
    slack: { batchId: 'batch-1', isSample: false, itemLabel: LABEL, reason: '표기 오류', resourceState: 'ended', problem: null, decisionLogFailed: false, ...extra },
  }
}

beforeEach(() => {
  h.state.admin = { id: 'admin-1', email: 'a@example.com' }
  h.state.afterCallbacks = []
  h.state.decisionUpdates = []
  for (const key of ['postOpsSlack', 'previewEnd', 'endItem'] as const) h.state[key].mockReset()
  h.state.previewEnd.mockResolvedValue({
    ok: true,
    body: { ok: true, dryRun: true, isSample: false, kind: 'mission', pointedByLive: [{ id: I2, kind: 'home_feed_card', label: LABEL }], impact: { participants: 12, inProgressUsers: 5 } },
  })
  h.state.endItem.mockResolvedValue(ended())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const processors = () => [h.state.previewEnd, h.state.endItem]

describe('인증과 입력', () => {
  it('로그인하지 않았거나 관리자가 아니면 403이고 아무것도 처리하지 않는다', async () => {
    h.state.admin = null
    expect((await call({ dryRun: true })).status).toBe(403)
    expect((await call({})).status).toBe(403)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
    expect(h.state.afterCallbacks).toHaveLength(0)
  })

  it('UUID가 아닌 묶음 ID·항목 ID는 400이다', async () => {
    for (const bad of ['abc', '1', "x' or '1'='1"]) {
      expect((await call({}, { bundleId: bad })).status).toBe(400)
      expect((await call({}, { itemId: bad })).status).toBe(400)
    }
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('본문이 JSON이 아니거나 객체가 아니면 400이다', async () => {
    for (const raw of ['not json', '[]', '"end"', 'null', '']) expect((await call(null, {}, raw)).status, raw).toBe(400)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('본문이 16KB를 넘으면 400이다', async () => {
    const res = await call({ reason: 'x'.repeat(17_000) })
    expect(res.status).toBe(400)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('dryRun은 true만 받고 사유와 함께 보낼 수 없다. 다른 키(오타 포함)는 받지 않는다', async () => {
    for (const body of [
      { dryRun: false },
      { dryRun: 'true' },
      { dryRun: 1 },
      { dryRun: null },
      { dryRun: true, reason: '표기 오류' },
      { dryRun: false, reason: '표기 오류' },
      { dryrun: true },
      { reason: '표기 오류', extra: 1 },
      { itemIds: [I1] },
    ]) {
      expect((await call(body)).status, JSON.stringify(body)).toBe(400)
    }
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('사유는 문자열이어야 하고 앞뒤 공백을 뺀 500자까지다', async () => {
    for (const reason of [1, null, true, ['a'], { a: 1 }, 'x'.repeat(501), ` ${'x'.repeat(501)} `]) {
      expect((await call({ reason })).status, JSON.stringify(reason)).toBe(400)
    }
    expect(h.state.endItem).not.toHaveBeenCalled()

    expect((await call({ reason: 'x'.repeat(500) })).status).toBe(200)
    expect((await call({ reason: `  ${'x'.repeat(500)}  ` })).status).toBe(200) // 공백을 뺀 길이로 센다
    expect(h.state.endItem).toHaveBeenCalledTimes(2)
  })
})

describe('미리 보기 { dryRun: true }', () => {
  it('가리키는 게재 중 항목과 영향 유저 수를 200으로 돌려주고 종료·슬랙은 부르지 않는다', async () => {
    const res = await call({ dryRun: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      dryRun: true,
      isSample: false,
      kind: 'mission',
      pointedByLive: [{ id: I2, kind: 'home_feed_card', label: LABEL }],
      impact: { participants: 12, inProgressUsers: 5 },
    })
    expect(h.state.previewEnd).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemId: I1 })
    expect(h.state.endItem).not.toHaveBeenCalled()
    expect(h.state.afterCallbacks).toHaveLength(0)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled()
  })

  it('실패는 그 상태와 본문을 그대로 돌려준다', async () => {
    h.state.previewEnd.mockResolvedValue({ ok: false, status: 409, error: '게재중인 항목만 지금 종료할 수 있어요. 화면을 새로 고쳐 상태를 확인해 주세요.' })
    const res = await call({ dryRun: true })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: '게재중인 항목만 지금 종료할 수 있어요. 화면을 새로 고쳐 상태를 확인해 주세요.' })
    for (const status of [404, 500] as const) {
      h.state.previewEnd.mockResolvedValue({ ok: false, status, error: '실패했어요.' })
      expect((await call({ dryRun: true })).status).toBe(status)
    }
  })
})

describe('지금 종료 { reason? }', () => {
  it('행위자는 관리자 ID이고 사유가 없으면 null이다. 결과 본문을 200으로 돌려준다', async () => {
    const res = await call({})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, itemId: I1, resourceState: 'ended' })
    expect(h.state.endItem).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: null })
    expect(h.state.previewEnd).not.toHaveBeenCalled()
  })

  it('사유는 앞뒤 공백을 빼고 넘긴다. 빈 문자열·공백뿐인 사유는 없음이다', async () => {
    await call({ reason: '  표기 오류가 있었어요  ' })
    expect(h.state.endItem).toHaveBeenLastCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: '표기 오류가 있었어요' })
    await call({ reason: '' })
    expect(h.state.endItem).toHaveBeenLastCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: null })
    await call({ reason: ' \n ' })
    expect(h.state.endItem).toHaveBeenLastCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: null })
  })

  it('처리 실패는 그 상태와 본문(error)을 그대로 돌려주고 슬랙 글을 올리지 않는다', async () => {
    h.state.endItem.mockResolvedValue({ ok: false, status: 409, error: '게재중인 항목만 지금 종료할 수 있어요. 화면을 새로 고쳐 상태를 확인해 주세요.' })
    const res = await call({})
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: '게재중인 항목만 지금 종료할 수 있어요. 화면을 새로 고쳐 상태를 확인해 주세요.' })
    for (const status of [404, 500] as const) {
      h.state.endItem.mockResolvedValue({ ok: false, status, error: '실패했어요.' })
      expect((await call({})).status).toBe(status)
    }
    expect(h.state.afterCallbacks).toHaveLength(0)
  })
})

describe('응답 뒤 슬랙 글', () => {
  it('성공하면 응답 뒤에 요약을 #jam-report에 올리고 결과를 end 기록에 채운다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const res = await call({})
    expect(res.status).toBe(200)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled() // 응답이 나가기 전에는 올리지 않는다
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls).toEqual([['report', `지금 종료 1건\n• ${LABEL}\n사유: 표기 오류`]])
    expect(h.state.decisionUpdates).toEqual([
      {
        payload: { slack_result: { channel: 'report', ok: true } },
        filters: [
          ['batch_id', 'batch-1'],
          ['action', 'end'],
        ],
      },
    ])
  })

  it('종료는 했지만 결정 기록을 남기지 못했으면 요약과 알림을 올린다', async () => {
    h.state.endItem.mockResolvedValue({ ...ended(), body: { ok: true, itemId: I1, resourceState: 'ended', decisionLogFailed: true }, slack: { ...ended().slack, decisionLogFailed: true } })
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const res = await call({})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, itemId: I1, resourceState: 'ended', decisionLogFailed: true })
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls.map((args) => args[0])).toEqual(['report', 'alert'])
    expect(h.state.postOpsSlack.mock.calls[1][1]).toBe('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
  })

  it('되돌림까지 실패한 500은 응답 본문을 그대로 돌려주고 알림만 올린다', async () => {
    h.state.endItem.mockResolvedValue({
      ok: false,
      status: 500,
      error: '지금 종료하지 못했어요. 항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요. 기존 어드민에서 종료 시각을 확인해 주세요.',
      slack: { batchId: 'batch-1', isSample: false, itemLabel: LABEL, reason: null, resourceState: null, problem: '항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요', decisionLogFailed: false },
    })
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const res = await call({})
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: '지금 종료하지 못했어요. 항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요. 기존 어드민에서 종료 시각을 확인해 주세요.' })
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls).toEqual([['alert', `지금 종료를 끝내지 못했어요\n• ${LABEL} — 항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요`]])
  })

  it('슬랙이 실패해도 응답은 200이고 실패가 slack_result에 남는다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
    const res = await call({})
    expect(res.status).toBe(200)
    await flushAfter()
    expect(h.state.decisionUpdates[0].payload).toEqual({ slack_result: { channel: 'report', ok: false, error: 'not_configured' } })
  })

  it('슬랙 게시가 던져도 응답은 200이다', async () => {
    h.state.postOpsSlack.mockRejectedValue(new Error('network down'))
    const res = await call({})
    expect(res.status).toBe(200)
    await expect(flushAfter()).resolves.toBeUndefined()
  })
})

describe('라우트 계약', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/admin/ops-inbox/[bundleId]/items/[itemId]/end/route.ts'), 'utf8')

  it('POST만 export한다', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(source).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`))
      expect(source).not.toMatch(new RegExp(`export\\s+(const|let|var)\\s+${method}\\b`))
    }
  })

  it('요청 시간 60초(maxDuration)를 쓴다', () => {
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

  it('응답에 DB 오류 원문을 싣는 경로가 없다(처리 결과의 error만 돌려준다)', () => {
    expect(source).not.toMatch(/\.message\b/)
    expect(source).not.toMatch(/console\./)
  })

  it('이 경로는 토큰 쓰기 예외에 해당하지 않는다(토큰 POST는 proxy가 로그인으로 돌려보낸다)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/admin/auth')>('@/lib/admin/auth')
    vi.stubEnv('ADMIN_API_READ_TOKEN', 'test-admin-read-token-abcdef')
    try {
      expect(actual.isOpsInboxTokenRequest('POST', `/api/admin/ops-inbox/${B}/items/${I1}/end`, 'test-admin-read-token-abcdef')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
