/**
 * POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/cancel — 공개 전 취소 (티켓 20261002_1256)
 *
 * 취소 규칙(범위·자원 취소·상태·결정 기록)은 `opsInbox/execute/__tests__/cancel.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 비로그인·비관리자 403, 두 ID가 UUID가 아니면 400, 본문 형식·크기 400
 * - 본문은 `{ dryRun: true }`이거나 `{ reason? }`다: 사유는 앞뒤 공백을 빼고 500자까지, 빈 문자열은 없음, 둘을 함께 보내거나 다른 키를 보내면 400
 * - 미리 보기는 미리 보기만 부르고 슬랙 글을 올리지 않는다. 취소는 행위자(관리자 ID)와 사유를 넘기고 실패 상태·본문(error·extra)을 그대로 돌려준다
 * - 응답 뒤 슬랙 글: 취소 요약(#jam-report), 끝내지 못한 항목은 알림(#jam-alert). 슬랙이 실패하거나 던져도 응답은 그대로다
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
    previewCancel: vi.fn(),
    cancelItem: vi.fn(),
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
// 처리 함수는 모의하고, 슬랙 결과를 채우는 notifyCancel은 실제 코드를 쓴다.
vi.mock('@/lib/admin/opsInbox/execute/cancel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/execute/cancel')>()
  return { ...actual, previewCancel: h.state.previewCancel, cancelItem: h.state.cancelItem }
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
    new Request(`http://localhost/api/admin/ops-inbox/${bundleId}/items/${itemId}/cancel`, {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
    }),
    { params: Promise.resolve({ bundleId, itemId }) }
  )
}

async function flushAfter() {
  for (const cb of h.state.afterCallbacks.splice(0)) await cb()
}

function cancelled(extra: { problems?: Array<{ itemLabel: string; reason: string }> } = {}) {
  return {
    ok: true as const,
    body: { ok: true, cancelled: [I2, I1], missing: [] },
    batchId: 'batch-1',
    slack: { batchId: 'batch-1', isSample: false, cancelledLabels: [LABEL, '미션 · 10/10(토) 09:00'], problems: extra.problems ?? [], decisionLogFailed: false },
  }
}

beforeEach(() => {
  h.state.admin = { id: 'admin-1', email: 'a@example.com' }
  h.state.afterCallbacks = []
  h.state.decisionUpdates = []
  for (const key of ['postOpsSlack', 'previewCancel', 'cancelItem'] as const) h.state[key].mockReset()
  h.state.previewCancel.mockResolvedValue({ ok: true, body: { ok: true, dryRun: true, cancelIds: [I2, I1], blockers: [] } })
  h.state.cancelItem.mockResolvedValue(cancelled())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const processors = () => [h.state.previewCancel, h.state.cancelItem]

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
    expect((await call(null, {}, 'not json')).status).toBe(400)
    expect((await call(null, {}, '[]')).status).toBe(400)
    expect((await call(null, {}, '"cancel"')).status).toBe(400)
    expect((await call(null, {}, 'null')).status).toBe(400)
    expect((await call(null, {}, '')).status).toBe(400)
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
      { dryRun: true, reason: '일정 변경' },
      { dryRun: false, reason: '일정 변경' },
      { dryrun: true },
      { reason: '일정 변경', extra: 1 },
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
    expect(h.state.cancelItem).not.toHaveBeenCalled()

    expect((await call({ reason: 'x'.repeat(500) })).status).toBe(200)
    expect((await call({ reason: `  ${'x'.repeat(500)}  ` })).status).toBe(200) // 공백을 뺀 길이로 센다
    expect(h.state.cancelItem).toHaveBeenCalledTimes(2)
  })
})

describe('미리 보기 { dryRun: true }', () => {
  it('함께 취소될 항목과 막는 항목을 200으로 돌려주고 취소·슬랙은 부르지 않는다', async () => {
    h.state.previewCancel.mockResolvedValue({
      ok: true,
      body: { ok: true, dryRun: true, cancelIds: [I1], blockers: [{ id: I2, reason: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.' }] },
    })
    const res = await call({ dryRun: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      dryRun: true,
      cancelIds: [I1],
      blockers: [{ id: I2, reason: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.' }],
    })
    expect(h.state.previewCancel).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemId: I1 })
    expect(h.state.cancelItem).not.toHaveBeenCalled()
    expect(h.state.afterCallbacks).toHaveLength(0)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled()
  })

  it('실패는 그 상태와 본문을 그대로 돌려준다', async () => {
    h.state.previewCancel.mockResolvedValue({ ok: false, status: 409, error: '예약됨 항목만 취소할 수 있어요' })
    const res = await call({ dryRun: true })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: '예약됨 항목만 취소할 수 있어요' })
    for (const status of [404, 500] as const) {
      h.state.previewCancel.mockResolvedValue({ ok: false, status, error: '실패했어요.' })
      expect((await call({ dryRun: true })).status).toBe(status)
    }
  })
})

describe('취소 { reason? }', () => {
  it('행위자는 관리자 ID이고 사유가 없으면 null이다. 결과 본문을 200으로 돌려준다', async () => {
    const res = await call({})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, cancelled: [I2, I1], missing: [] })
    expect(h.state.cancelItem).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: null })
    expect(h.state.previewCancel).not.toHaveBeenCalled()
  })

  it('사유는 앞뒤 공백을 빼고 넘긴다. 빈 문자열·공백뿐인 사유는 없음이다', async () => {
    await call({ reason: '  일정이 바뀌었어요  ' })
    expect(h.state.cancelItem).toHaveBeenLastCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: '일정이 바뀌었어요' })
    await call({ reason: '' })
    expect(h.state.cancelItem).toHaveBeenLastCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: null })
    await call({ reason: ' \n ' })
    expect(h.state.cancelItem).toHaveBeenLastCalledWith(expect.anything(), { bundleId: B, itemId: I1, actor: 'admin-1', reason: null })
  })

  it('처리 실패는 그 상태와 본문(error·extra)을 그대로 돌려주고 슬랙 글을 올리지 않는다', async () => {
    h.state.cancelItem.mockResolvedValue({
      ok: false,
      status: 409,
      error: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.',
      extra: { blockers: [{ id: I2, reason: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.' }] },
    })
    const res = await call({})
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.',
      blockers: [{ id: I2, reason: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.' }],
    })
    for (const status of [404, 500] as const) {
      h.state.cancelItem.mockResolvedValue({ ok: false, status, error: '실패했어요.' })
      expect((await call({})).status).toBe(status)
    }
    expect(h.state.afterCallbacks).toHaveLength(0)
  })
})

describe('응답 뒤 슬랙 글', () => {
  it('성공하면 응답 뒤에 요약을 #jam-report에 올리고 결과를 cancel 기록에 채운다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const res = await call({})
    expect(res.status).toBe(200)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled() // 응답이 나가기 전에는 올리지 않는다
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls).toEqual([['report', `공개 전 취소 2건\n• ${LABEL}\n• 미션 · 10/10(토) 09:00`]])
    expect(h.state.decisionUpdates).toEqual([
      {
        payload: { slack_result: { channel: 'report', ok: true } },
        filters: [
          ['batch_id', 'batch-1'],
          ['action', 'cancel'],
        ],
      },
    ])
  })

  it('일부만 지우고 멈춘 500은 응답 본문을 그대로 돌려주고 요약과 알림을 올린다', async () => {
    h.state.cancelItem.mockResolvedValue({
      ok: false,
      status: 500,
      error: '일부만 취소했어요. 나머지는 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.',
      extra: { cancelled: [I2] },
      slack: {
        batchId: 'batch-1',
        isSample: false,
        cancelledLabels: [LABEL],
        problems: [{ itemLabel: '미션 · 10/10(토) 09:00', reason: '미션을 지우지 못했어요' }],
        decisionLogFailed: false,
      },
    })
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const res = await call({})
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: '일부만 취소했어요. 나머지는 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.', cancelled: [I2] })
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls).toEqual([
      ['report', `공개 전 취소 1건\n• ${LABEL}`],
      ['alert', `공개 전 취소를 끝내지 못했어요 · 1건 취소, 1건 남음\n• 미션 · 10/10(토) 09:00 — 미션을 지우지 못했어요`],
    ])
  })

  it('끝내지 못한 항목이 있어도 취소한 항목이 없으면 알림만 올린다', async () => {
    h.state.cancelItem.mockResolvedValue({
      ok: false,
      status: 500,
      error: '항목 상태를 바꾸지 못했어요. 잠시 뒤 화면을 새로 고쳐 확인해 주세요.',
      extra: { cancelled: [] },
      slack: { batchId: 'batch-1', isSample: false, cancelledLabels: [], problems: [{ itemLabel: LABEL, reason: '사유' }], decisionLogFailed: false },
    })
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    await call({})
    await flushAfter()
    expect(h.state.postOpsSlack.mock.calls.map((args) => args[0])).toEqual(['alert'])
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
  const source = readFileSync(join(process.cwd(), 'src/app/api/admin/ops-inbox/[bundleId]/items/[itemId]/cancel/route.ts'), 'utf8')

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

  it('응답에 DB 오류 원문을 싣는 경로가 없다(처리 결과의 error·extra만 돌려준다)', () => {
    expect(source).not.toMatch(/\.message\b/)
    expect(source).not.toMatch(/console\./)
  })

  it('이 경로는 토큰 쓰기 예외에 해당하지 않는다(토큰 POST는 proxy가 로그인으로 돌려보낸다)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/admin/auth')>('@/lib/admin/auth')
    vi.stubEnv('ADMIN_API_READ_TOKEN', 'test-admin-read-token-abcdef')
    try {
      expect(actual.isOpsInboxTokenRequest('POST', `/api/admin/ops-inbox/${B}/items/${I1}/cancel`, 'test-admin-read-token-abcdef')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
