/**
 * POST /api/admin/ops-inbox/[bundleId]/decisions — 결정하기 (티켓 20260930_1818)
 *
 * 처리 규칙(조건부 update·결정 기록·수정)은 `opsInbox/__tests__/decide.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 비로그인·비관리자 403, UUID가 아니면 400, 본문 형식·알 수 없는 action 400
 * - action마다 처리 함수에 알맞은 인자(행위자는 관리자 ID)를 넘기고 실패 상태·본문을 그대로 돌려준다
 * - 응답 뒤 슬랙 글: 실패하거나 던져도 응답은 200이고 결과가 결정 기록의 slack_result에 남는다
 * - POST만 export하고 읽기 토큰을 다루지 않는다
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
    approveItem: vi.fn(),
    rejectItem: vi.fn(),
    bulkApprove: vi.fn(),
    editItem: vi.fn(),
    revertLastEdit: vi.fn(),
    fillColor: vi.fn(),
  }

  // 결정 기록에 slack_result를 채우는 update(...).eq(...)만 흉내 낸다.
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
// 처리 함수는 모의하고, 슬랙 결과를 채우는 notifyDecision은 실제 코드를 쓴다.
vi.mock('@/lib/admin/opsInbox/decide', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/decide')>()
  return {
    ...actual,
    approveItem: h.state.approveItem,
    rejectItem: h.state.rejectItem,
    bulkApprove: h.state.bulkApprove,
    editItem: h.state.editItem,
    revertLastEdit: h.state.revertLastEdit,
    fillColor: h.state.fillColor,
  }
})

import { POST } from '../route'

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const I = '00000000-0000-4000-8000-000000000001'

function call(body: unknown, bundleId = B, raw?: string) {
  return POST(
    new Request(`http://localhost/api/admin/ops-inbox/${bundleId}/decisions`, {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
    }),
    { params: Promise.resolve({ bundleId }) }
  )
}

async function flushAfter() {
  for (const cb of h.state.afterCallbacks.splice(0)) await cb()
}

function ok(extra: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    body: { ok: true },
    decisionIds: ['dec-1'],
    batchId: null,
    slack: { action: 'approve' as const, isSample: true, itemLabel: '홈피드 카드 · 10/5(월) 09:00' },
    ...extra,
  }
}

beforeEach(() => {
  h.state.admin = { id: 'admin-1', email: 'a@example.com' }
  h.state.afterCallbacks = []
  h.state.decisionUpdates = []
  for (const key of ['postOpsSlack', 'approveItem', 'rejectItem', 'bulkApprove', 'editItem', 'revertLastEdit', 'fillColor'] as const) {
    h.state[key].mockReset()
  }
  h.state.approveItem.mockResolvedValue(ok())
  h.state.rejectItem.mockResolvedValue(ok())
  h.state.bulkApprove.mockResolvedValue(ok({ body: { ok: true, approved: 2, skipped: 0, excluded: 0 } }))
  h.state.editItem.mockResolvedValue(ok({ body: { ok: true, updatedAt: 'now', changed: ['copy.title'] } }))
  h.state.revertLastEdit.mockResolvedValue(ok())
  h.state.fillColor.mockResolvedValue(ok({ body: { ok: true, updatedAt: 'now', changed: ['color_pending'] } }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const processors = () => [h.state.approveItem, h.state.rejectItem, h.state.bulkApprove, h.state.editItem, h.state.revertLastEdit, h.state.fillColor]

describe('인증과 입력', () => {
  it('로그인하지 않았거나 관리자가 아니면 403이고 아무것도 처리하지 않는다', async () => {
    h.state.admin = null
    const res = await call({ action: 'approve', itemId: I })
    expect(res.status).toBe(403)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
    expect(h.state.afterCallbacks).toHaveLength(0)
  })

  it('UUID가 아닌 묶음 ID는 400이다', async () => {
    for (const bad of ['abc', '1', "x' or '1'='1"]) expect((await call({ action: 'approve', itemId: I }, bad)).status).toBe(400)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('본문이 JSON이 아니거나 객체가 아니면 400이다', async () => {
    expect((await call(null, B, 'not json')).status).toBe(400)
    expect((await call(null, B, '[]')).status).toBe(400)
    expect((await call(null, B, '"approve"')).status).toBe(400)
    expect((await call(null, B, '')).status).toBe(400)
  })

  it('알 수 없거나 없는 action은 400이다', async () => {
    for (const action of ['delete', 'submit', 'APPROVE', '', 5, null, undefined]) {
      expect((await call({ action, itemId: I })).status, String(action)).toBe(400)
    }
    expect((await call({ itemId: I })).status).toBe(400)
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('항목 하나를 다루는 action은 UUID인 itemId가 있어야 한다(일괄 승인은 itemIds)', async () => {
    for (const action of ['approve', 'reject', 'edit', 'revert', 'fill_color']) {
      expect((await call({ action })).status, action).toBe(400)
      expect((await call({ action, itemId: 'nope' })).status, action).toBe(400)
      expect((await call({ action, itemId: 5 })).status, action).toBe(400)
    }
    for (const fn of processors()) expect(fn).not.toHaveBeenCalled()
  })

  it('본문이 너무 크면 400이다', async () => {
    const res = await call({ action: 'edit', itemId: I, values: { 'copy.title': 'x'.repeat(300_000) } })
    expect(res.status).toBe(400)
    expect(h.state.editItem).not.toHaveBeenCalled()
  })
})

describe('action별 처리', () => {
  it('approve: 행위자는 관리자 ID이고 처리 결과 본문을 200으로 돌려준다', async () => {
    const res = await call({ action: 'approve', itemId: I })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.state.approveItem).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemId: I, actor: 'admin-1' })
  })

  it('reject: 사유를 그대로 넘긴다(다듬기·필수 검사는 처리 함수 몫)', async () => {
    await call({ action: 'reject', itemId: I, reason: ' 톤이 달라요 ' })
    expect(h.state.rejectItem).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemId: I, actor: 'admin-1', reason: ' 톤이 달라요 ' })
  })

  it('bulk_approve: itemIds를 넘기고 개수를 돌려준다', async () => {
    const res = await call({ action: 'bulk_approve', itemIds: [I] })
    expect(await res.json()).toEqual({ ok: true, approved: 2, skipped: 0, excluded: 0 })
    expect(h.state.bulkApprove).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemIds: [I], actor: 'admin-1' })
  })

  it('edit: 값·사유·화면이 본 수정 시각을 넘긴다', async () => {
    const res = await call({ action: 'edit', itemId: I, values: { 'copy.title': '새 제목' }, reason: '오타', expectedUpdatedAt: 'T0' })
    expect((await res.json()).changed).toEqual(['copy.title'])
    expect(h.state.editItem).toHaveBeenCalledWith(expect.anything(), {
      bundleId: B,
      itemId: I,
      actor: 'admin-1',
      values: { 'copy.title': '새 제목' },
      reason: '오타',
      expectedUpdatedAt: 'T0',
    })
  })

  it('fill_color: 시작색·끝색·화면이 본 수정 시각을 넘긴다', async () => {
    const res = await call({ action: 'fill_color', itemId: I, bg: '#8a5a2e', end: '#3d2812', expectedUpdatedAt: 'T0' })
    expect(res.status).toBe(200)
    expect((await res.json()).changed).toEqual(['color_pending'])
    expect(h.state.fillColor).toHaveBeenCalledWith(expect.anything(), {
      bundleId: B,
      itemId: I,
      actor: 'admin-1',
      bg: '#8a5a2e',
      end: '#3d2812',
      expectedUpdatedAt: 'T0',
    })
  })

  it('revert', async () => {
    expect((await call({ action: 'revert', itemId: I })).status).toBe(200)
    expect(h.state.revertLastEdit).toHaveBeenCalledWith(expect.anything(), { bundleId: B, itemId: I, actor: 'admin-1' })
  })

  it('처리 실패는 그 상태와 본문(error·칸별 문장·개수)을 그대로 돌려주고 슬랙 글을 올리지 않는다', async () => {
    h.state.editItem.mockResolvedValue({ ok: false, status: 400, error: '고친 내용을 저장하지 못했어요.', extra: { fieldErrors: { ends_at: '늦어야 해요' } } })
    const res = await call({ action: 'edit', itemId: I, values: {}, expectedUpdatedAt: 'T0' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '고친 내용을 저장하지 못했어요.', fieldErrors: { ends_at: '늦어야 해요' } })

    h.state.approveItem.mockResolvedValue({ ok: false, status: 409, error: '이미 다른 곳에서 처리한 항목이에요.' })
    const conflict = await call({ action: 'approve', itemId: I })
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ error: '이미 다른 곳에서 처리한 항목이에요.' })
    expect(h.state.afterCallbacks).toHaveLength(0)
  })
})

describe('응답 뒤 슬랙 글', () => {
  it('성공하면 응답 뒤에 결정 글을 올리고 결과를 그 결정 기록에 채운다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const res = await call({ action: 'approve', itemId: I })
    expect(res.status).toBe(200)
    expect(h.state.postOpsSlack).not.toHaveBeenCalled() // 응답이 나가기 전에는 올리지 않는다
    await flushAfter()
    expect(h.state.postOpsSlack).toHaveBeenCalledWith('report', '[시험] 승인했어요 · 홈피드 카드 · 10/5(월) 09:00')
    expect(h.state.decisionUpdates).toEqual([{ payload: { slack_result: { channel: 'report', ok: true } }, filters: [['id', 'dec-1']] }])
  })

  it('슬랙이 실패해도 응답은 200이고 실패가 slack_result에 남는다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
    const res = await call({ action: 'approve', itemId: I })
    expect(res.status).toBe(200)
    await flushAfter()
    expect(h.state.decisionUpdates[0].payload).toEqual({ slack_result: { channel: 'report', ok: false, error: 'not_configured' } })
  })

  it('슬랙 게시가 던져도 응답은 200이다', async () => {
    h.state.postOpsSlack.mockRejectedValue(new Error('network down'))
    const res = await call({ action: 'approve', itemId: I })
    expect(res.status).toBe(200)
    await expect(flushAfter()).resolves.toBeUndefined()
  })

  it('일괄 승인은 같은 batch_id의 결정 기록 전부에 결과를 채운다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    h.state.bulkApprove.mockResolvedValue(
      ok({
        decisionIds: ['dec-1', 'dec-2'],
        batchId: 'batch-1',
        slack: { action: 'bulk_approve', isSample: false, approved: 2, excluded: 1, skipped: 0 },
      })
    )
    await call({ action: 'bulk_approve', itemIds: [I] })
    await flushAfter()
    expect(h.state.postOpsSlack).toHaveBeenCalledTimes(1)
    expect(h.state.postOpsSlack).toHaveBeenCalledWith('report', '일괄 승인했어요 · 2개 승인, 1개 제외')
    expect(h.state.decisionUpdates).toHaveLength(1)
    expect(h.state.decisionUpdates[0].filters).toEqual([['batch_id', 'batch-1']])
  })
})

describe('라우트 계약', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/admin/ops-inbox/[bundleId]/decisions/route.ts'), 'utf8')

  it('POST만 export한다', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(source).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`))
      expect(source).not.toMatch(new RegExp(`export\\s+(const|let|var)\\s+${method}\\b`))
    }
  })

  it('읽기 토큰을 다루지 않는다(관리자 로그인만)', () => {
    expect(source).not.toMatch(/x-admin-read-token|isValidAdminReadToken|requireOpsInboxSubmit|isOpsInboxTokenRequest/)
    expect(source).toMatch(/getAdminUser\(\)/)
  })

  it('이 경로는 토큰 쓰기 예외에 해당하지 않는다(토큰 POST는 proxy가 로그인으로 돌려보낸다)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/admin/auth')>('@/lib/admin/auth')
    vi.stubEnv('ADMIN_API_READ_TOKEN', 'test-admin-read-token-abcdef')
    try {
      expect(actual.isOpsInboxTokenRequest('POST', `/api/admin/ops-inbox/${B}/decisions`, 'test-admin-read-token-abcdef')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
