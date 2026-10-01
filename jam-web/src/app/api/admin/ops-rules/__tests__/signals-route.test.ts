/**
 * PATCH·DELETE /api/admin/ops-rules/signals/... (티켓 20260930_1459 조각 C)
 *
 * 저장·되돌리기의 처리(카드 검증·맞물림·칸별 409·기본값과 같은 값은 행 없음)는 `opsSignals/__tests__/saveThresholds.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다.
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션·읽기 토큰만 모의한다), 처리 함수는 모의한다:
 * - 읽기 토큰만으로는 PATCH·DELETE 모두 막힌다(403, 처리 함수를 부르지 않는다). 관리자 세션만 통과하고 행위자는 관리자 ID다
 * - PATCH: 본문 형식 오류(JSON 아님·객체 아님·너무 큼)는 400, 처리 실패(400 칸별 오류·404·409·500)는 상태와 본문을 그대로 돌려준다
 * - DELETE: 쿼리 `expectedUpdatedAt`을 처리 함수에 넘기고, 처리 실패는 상태와 문장을 그대로 돌려준다
 * 두 파일이 각자 PATCH만, DELETE만 export하는지는 `admin/__tests__/token-write-contract.test.ts`가 소스로 지킨다.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  saveSignalThresholds: vi.fn(),
  revertSignalThreshold: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
}))
vi.mock('@/lib/admin/opsSignals/saveThresholds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsSignals/saveThresholds')>()
  return { ...actual, saveSignalThresholds: h.saveSignalThresholds, revertSignalThreshold: h.revertSignalThreshold }
})

import { PATCH } from '../signals/[signalKey]/route'
import { DELETE } from '../signals/[signalKey]/[thresholdKey]/route'

const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const STAMP = '2026-10-01T06:20:00+00:00'
const RECORD = { ruleKey: 'approvalDeadlineHours', group: 'signal', value: 36, defaultValue: 48, changed: true }

function patchRequest(body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request('http://localhost/api/admin/ops-rules/signals/approval_deadline', { method: 'PATCH', headers, body: text })
}

function deleteRequest(query = `?expectedUpdatedAt=${encodeURIComponent(STAMP)}`, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/ops-rules/signals/approval_deadline/approvalDeadlineHours${query}`, { method: 'DELETE', headers })
}

const patchParams = (signalKey = 'approval_deadline') => ({ params: Promise.resolve({ signalKey }) })
const deleteParams = (signalKey = 'approval_deadline', thresholdKey = 'approvalDeadlineHours') => ({
  params: Promise.resolve({ signalKey, thresholdKey }),
})

const BODY = { values: { approvalDeadlineHours: 36 }, expectedUpdatedAt: { approvalDeadlineHours: null } }

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.user = null
  h.saveSignalThresholds.mockReset()
  h.saveSignalThresholds.mockResolvedValue({ ok: true, changed: true, thresholds: [RECORD] })
  h.revertSignalThreshold.mockReset()
  h.revertSignalThreshold.mockResolvedValue({ ok: true, threshold: { ...RECORD, value: 48, changed: false } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/ops-rules/signals/[signalKey]', () => {
  it('읽기 토큰만으로는 막힌다(403, 저장하지 않는다)', async () => {
    const res = await PATCH(patchRequest(BODY, { 'x-admin-read-token': TOKEN }), patchParams())
    expect(res.status).toBe(403)
    expect(h.saveSignalThresholds).not.toHaveBeenCalled()
  })

  it('세션이 없거나 관리자가 아니면 403이다', async () => {
    expect((await PATCH(patchRequest(BODY), patchParams())).status).toBe(403)
    h.user = { id: 'user-2', email: 'someone@example.com' }
    expect((await PATCH(patchRequest(BODY), patchParams())).status).toBe(403)
    expect(h.saveSignalThresholds).not.toHaveBeenCalled()
  })

  it('관리자는 신호 키와 본문 칸을 처리 함수에 넘기고(행위자는 관리자 ID) 200 { thresholds, changed }를 받는다', async () => {
    h.user = ADMIN
    const res = await PATCH(patchRequest(BODY), patchParams())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ thresholds: [RECORD], changed: true })
    expect(h.saveSignalThresholds).toHaveBeenCalledWith(expect.anything(), {
      signalKey: 'approval_deadline',
      values: BODY.values,
      expectedUpdatedAt: BODY.expectedUpdatedAt,
      actor: ADMIN.id,
    })
  })

  it('응답에 관리자 사용자 ID가 없다', async () => {
    h.user = ADMIN
    const res = await PATCH(patchRequest(BODY), patchParams())
    expect(JSON.stringify(await res.json())).not.toContain(ADMIN.id)
  })

  it('JSON이 아니거나 객체가 아니거나 너무 크면 400이다', async () => {
    h.user = ADMIN
    expect((await PATCH(patchRequest('{not json'), patchParams())).status).toBe(400)
    expect((await PATCH(patchRequest('[1,2]'), patchParams())).status).toBe(400)
    expect((await PATCH(patchRequest('null'), patchParams())).status).toBe(400)
    expect((await PATCH(patchRequest({ values: {}, expectedUpdatedAt: { x: 'x'.repeat(20_000) } }), patchParams())).status).toBe(400)
    expect(h.saveSignalThresholds).not.toHaveBeenCalled()
  })

  it('처리 실패는 상태와 본문(error, fieldErrors)을 그대로 돌려준다', async () => {
    h.user = ADMIN
    h.saveSignalThresholds.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: '값을 확인해 주세요.',
      fieldErrors: { minLiveCards: '최소 장수는 최대 장수(5장)보다 클 수 없어요' },
    })
    const bad = await PATCH(patchRequest(BODY), patchParams())
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: '값을 확인해 주세요.', fieldErrors: { minLiveCards: '최소 장수는 최대 장수(5장)보다 클 수 없어요' } })

    h.saveSignalThresholds.mockResolvedValueOnce({ ok: false, status: 409, error: '그사이 바뀌었어요' })
    const conflict = await PATCH(patchRequest(BODY), patchParams())
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ error: '그사이 바뀌었어요' })

    h.saveSignalThresholds.mockResolvedValueOnce({ ok: false, status: 404, error: '찾을 수 없는 신호예요.' })
    expect((await PATCH(patchRequest(BODY), patchParams('nope'))).status).toBe(404)
    expect(h.saveSignalThresholds.mock.calls.at(-1)?.[1].signalKey).toBe('nope')

    h.saveSignalThresholds.mockResolvedValueOnce({ ok: false, status: 500, error: '기준값을 저장하지 못했어요.' })
    expect((await PATCH(patchRequest(BODY), patchParams())).status).toBe(500)
  })
})

describe('DELETE /api/admin/ops-rules/signals/[signalKey]/[thresholdKey]', () => {
  it('읽기 토큰만으로는 막힌다(403, 지우지 않는다)', async () => {
    const res = await DELETE(deleteRequest(undefined, { 'x-admin-read-token': TOKEN }), deleteParams())
    expect(res.status).toBe(403)
    expect(h.revertSignalThreshold).not.toHaveBeenCalled()
  })

  it('세션이 없거나 관리자가 아니면 403이다', async () => {
    expect((await DELETE(deleteRequest(), deleteParams())).status).toBe(403)
    h.user = { id: 'user-2', email: 'someone@example.com' }
    expect((await DELETE(deleteRequest(), deleteParams())).status).toBe(403)
    expect(h.revertSignalThreshold).not.toHaveBeenCalled()
  })

  it('관리자는 신호 키·기준값 키·쿼리의 수정 시각을 처리 함수에 넘기고 200 { threshold }를 받는다', async () => {
    h.user = ADMIN
    const res = await DELETE(deleteRequest(), deleteParams())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ threshold: { ...RECORD, value: 48, changed: false } })
    expect(h.revertSignalThreshold).toHaveBeenCalledWith(expect.anything(), {
      signalKey: 'approval_deadline',
      thresholdKey: 'approvalDeadlineHours',
      expectedUpdatedAt: STAMP,
    })
  })

  it('수정 시각 쿼리가 없으면 null로 넘기고 처리 함수의 400을 그대로 돌려준다', async () => {
    h.user = ADMIN
    h.revertSignalThreshold.mockResolvedValueOnce({ ok: false, status: 400, error: '기준값의 수정 시각이 필요해요.' })
    const res = await DELETE(deleteRequest(''), deleteParams())
    expect(res.status).toBe(400)
    expect(h.revertSignalThreshold.mock.calls[0][1].expectedUpdatedAt).toBeNull()
  })

  it('처리 실패(404·409·500)는 상태와 문장을 그대로 돌려준다', async () => {
    h.user = ADMIN
    for (const status of [404, 409, 500]) {
      h.revertSignalThreshold.mockResolvedValueOnce({ ok: false, status, error: `실패 ${status}` })
      const res = await DELETE(deleteRequest(), deleteParams())
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ error: `실패 ${status}` })
    }
  })
})
