/**
 * PATCH /api/admin/ops-patterns/taste-signals/[signalId], PATCH /api/admin/ops-patterns/common-rules/[ruleNo],
 * GET /api/admin/ops-patterns/[patternNo]/rejections (티켓 20261008_1712, 상위 20260930_1503 ⑩b-1)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의한다), 처리 함수(`lib/admin/opsPatterns/tasteWrite.ts`)도 모의하지 않는다. 서비스 클라이언트만
 * 메모리 DB(`opsPatterns/__tests__/fakePatternDb.ts`)로 바꿔서 라우트 → 처리 → 응답 본문까지 실제 코드로 지나가게 한다.
 * 검사·확정·근거 규칙 자체는 `tasteWrite.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 쓰기 두 경로는 관리자 세션만: 세션이 없으면 403(읽기 토큰만 있어도 403)이고 DB를 건드리지 않는다
 * - 읽기 경로는 세션 또는 읽기 토큰, 둘 다 없으면 403
 * - 형식 오류: signalId가 UUID 아님·ruleNo가 양의 정수 아님은 404, patternNo 형식·offset이 틀리면 400, 본문 JSON 아님·객체 아님·64KB 초과는 400
 * - 200/400/404/409를 그대로 전달하고, 응답에 관리자 ID·`actor` 원문이 없다
 * - 정적 세그먼트(taste-signals·common-rules)가 `[patternNo]` 경로와 겹치지 않는다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fakeDb, patternRow, bundleItemRow, bundleRow, commonRuleRow, decisionRow, tasteSignalRow } from '@/lib/admin/opsPatterns/__tests__/fakePatternDb'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'

const h = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }))

vi.mock('@/lib/supabase/server', async () => {
  const { fakeService } = await import('@/lib/admin/opsPatterns/__tests__/fakePatternDb')
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
    createServiceClient: () => fakeService,
  }
})

import { PATCH as PATCH_SIGNAL } from '../taste-signals/[signalId]/route'
import { PATCH as PATCH_RULE } from '../common-rules/[ruleNo]/route'
import { GET as GET_REJECTIONS } from '../[patternNo]/rejections/route'

const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const AUTH = { 'x-admin-read-token': TOKEN }
const T1 = '2026-10-01T01:00:00+00:00'
const SIG = '00000000-0000-4000-8000-000000000001'
const D_OK = '00000000-0000-4000-8000-000000000101'

const signalParams = (signalId: string) => ({ params: Promise.resolve({ signalId }) })
const ruleParams = (ruleNo: string) => ({ params: Promise.resolve({ ruleNo }) })
const patternParams = (patternNo: string) => ({ params: Promise.resolve({ patternNo }) })

function patchRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/ops-patterns/${path}`, {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function rejectionsRequest(query = '', headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/ops-patterns/P10/rejections${query}`, { headers })
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.user = ADMIN
  fakeDb.reset()
  fakeDb.tables.ops_patterns = [patternRow('P10')]
  fakeDb.tables.ops_pattern_taste_signals = [tasteSignalRow(SIG, 'P10', { confirmed_by: 'secret-confirmer' })]
  fakeDb.tables.ops_pattern_common_rules = [commonRuleRow(1), commonRuleRow(2)]
  fakeDb.tables.ops_bundles = [bundleRow('b1')]
  fakeDb.tables.ops_bundle_items = [bundleItemRow('i10', 'P10')]
  fakeDb.tables.ops_decisions = [decisionRow(D_OK, 'b1', 'i10', { actor: 'token:routine-agent' })]
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/ops-patterns/taste-signals/[signalId]', () => {
  const patch = (body: unknown, headers: Record<string, string> = {}, signalId = SIG) =>
    PATCH_SIGNAL(patchRequest(`taste-signals/${signalId}`, body, headers), signalParams(signalId))

  it('관리자 세션이 없으면 403이고 DB를 건드리지 않는다. 읽기 토큰만으로는 쓸 수 없다', async () => {
    h.user = null
    const body = { reason: '이유', expectedUpdatedAt: T1 }
    expect((await patch(body)).status).toBe(403)
    expect((await patch(body, AUTH)).status).toBe(403)
    expect(fakeDb.writeCalls).toBe(0)
    expect(fakeDb.tables.ops_pattern_taste_signals[0].basis).toBe('estimate')
  })

  it('관리자 세션이면 200 { signal, changed }로 확정한다. 응답에 관리자 ID가 없다', async () => {
    const res = await patch({ reason: '고친 이유', evidenceDecisionId: D_OK, expectedUpdatedAt: T1 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['changed', 'signal'])
    expect(body.changed).toBe(true)
    expect(body.signal).toMatchObject({ id: SIG, reason: '고친 이유', basis: 'confirmed', evidenceDecisionId: D_OK })
    expect(typeof body.signal.confirmedAt).toBe('string')
    const text = JSON.stringify(body)
    for (const forbidden of ['confirmed_by', 'confirmedBy', 'secret-confirmer', ADMIN.id]) expect(text).not.toContain(forbidden)
    expect(fakeDb.tables.ops_pattern_taste_signals[0]).toMatchObject({ confirmed_by: ADMIN.id })
  })

  it('signalId가 UUID가 아니거나 없는 신호는 404다', async () => {
    expect((await patch({ reason: '이유', expectedUpdatedAt: T1 }, {}, 'P10')).status).toBe(404)
    expect((await patch({ reason: '이유', expectedUpdatedAt: T1 }, {}, '00000000-0000-4000-8000-000000000999')).status).toBe(404)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('본문 오류는 400이다: JSON 아님·객체 아님·64KB 초과·내용 검사 실패·시각 없음', async () => {
    expect((await patch('{ 깨진')).status).toBe(400)
    expect((await patch('[1]')).status).toBe(400)
    expect((await patch('null')).status).toBe(400)
    const big = await patch({ reason: '가'.repeat(70_000), expectedUpdatedAt: T1 })
    expect(big.status).toBe(400)
    expect((await big.json()).error).toBe('본문이 너무 커요.')
    const invalid = await patch({ reason: ' ', expectedUpdatedAt: T1 })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).fieldErrors).toMatchObject({ reason: '이유를 적어 주세요.' })
    expect((await patch({ reason: '이유' })).status).toBe(400)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('다른 패턴의 반려 기록을 근거로 붙이면 400과 fieldErrors다', async () => {
    fakeDb.tables.ops_bundle_items = [bundleItemRow('i10', 'P11')]
    const res = await patch({ reason: '이유', evidenceDecisionId: D_OK, expectedUpdatedAt: T1 })
    expect(res.status).toBe(400)
    expect((await res.json()).fieldErrors).toEqual({ evidenceDecisionId: '이 패턴의 반려 기록만 근거로 붙일 수 있어요.' })
  })

  it('화면이 본 시각과 다르면 409를 그대로 전달한다(DB 그대로)', async () => {
    const res = await patch({ reason: '이유', expectedUpdatedAt: '2026-09-30T00:00:00+00:00' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('그사이 다른 곳에서 이 취향 신호를 고쳤어요. 최신 값을 불러와 주세요.')
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('같은 값을 다시 보내면 200이고 changed:false다', async () => {
    await patch({ reason: '이유', expectedUpdatedAt: T1 })
    const current = fakeDb.tables.ops_pattern_taste_signals[0].updated_at as string
    const res = await patch({ reason: '이유', expectedUpdatedAt: current })
    expect(res.status).toBe(200)
    expect((await res.json()).changed).toBe(false)
  })
})

describe('PATCH /api/admin/ops-patterns/common-rules/[ruleNo]', () => {
  const patch = (body: unknown, headers: Record<string, string> = {}, ruleNo = '2') =>
    PATCH_RULE(patchRequest(`common-rules/${ruleNo}`, body, headers), ruleParams(ruleNo))

  it('관리자 세션이 없으면 403이고 DB를 건드리지 않는다. 읽기 토큰만으로는 쓸 수 없다', async () => {
    h.user = null
    const body = { title: '제목', body: '본문', expectedUpdatedAt: T1 }
    expect((await patch(body)).status).toBe(403)
    expect((await patch(body, AUTH)).status).toBe(403)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('관리자 세션이면 200 { rule, changed }로 고친다. 응답에 관리자 ID가 없다', async () => {
    const res = await patch({ title: '새 제목', body: '새 본문', expectedUpdatedAt: T1 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['changed', 'rule'])
    expect(body).toMatchObject({ changed: true, rule: { ruleNo: 2, title: '새 제목', body: '새 본문' } })
    const text = JSON.stringify(body)
    for (const forbidden of ['updated_by', 'updatedBy', ADMIN.id]) expect(text).not.toContain(forbidden)
    expect(fakeDb.tables.ops_pattern_common_rules[1]).toMatchObject({ updated_by: ADMIN.id })
  })

  it('ruleNo가 양의 정수가 아니거나 없는 번호는 404다. 추가 경로는 없다', async () => {
    for (const ruleNo of ['0', '-1', 'abc', '1.5', '8']) {
      expect((await patch({ title: '제목', body: '본문', expectedUpdatedAt: T1 }, {}, ruleNo)).status).toBe(404)
    }
    expect(fakeDb.tables.ops_pattern_common_rules).toHaveLength(2)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('길이를 넘기면 400과 fieldErrors, 본문이 JSON이 아니면 400이다', async () => {
    const res = await patch({ title: '가'.repeat(61), body: '본문', expectedUpdatedAt: T1 })
    expect(res.status).toBe(400)
    expect((await res.json()).fieldErrors).toMatchObject({ title: expect.any(String) })
    expect((await patch('{ 깨진')).status).toBe(400)
    expect((await patch({ title: '제목', body: '본문' })).status).toBe(400)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('화면이 본 시각과 다르면 409를 그대로 전달한다', async () => {
    const res = await patch({ title: '제목', body: '본문', expectedUpdatedAt: '2026-09-30T00:00:00+00:00' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('그사이 다른 곳에서 이 공통 규칙을 고쳤어요. 최신 값을 불러와 주세요.')
  })
})

describe('GET /api/admin/ops-patterns/[patternNo]/rejections', () => {
  it('세션도 토큰도 없으면 403이다. 읽기 토큰으로도, 관리자 세션으로도 읽힌다', async () => {
    h.user = null
    expect((await GET_REJECTIONS(rejectionsRequest(), patternParams('P10'))).status).toBe(403)
    expect((await GET_REJECTIONS(rejectionsRequest('', AUTH), patternParams('P10'))).status).toBe(200)
    h.user = ADMIN
    expect((await GET_REJECTIONS(rejectionsRequest(), patternParams('P10'))).status).toBe(200)
  })

  it('{ rejections, hasMore, total }을 싣고 actor 원문·관리자 ID가 없다', async () => {
    const res = await GET_REJECTIONS(rejectionsRequest('', AUTH), patternParams('P10'))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['hasMore', 'rejections', 'total'])
    expect(body).toMatchObject({ hasMore: false, total: 1 })
    expect(body.rejections[0]).toEqual({
      id: D_OK,
      createdAt: '2026-10-05T00:00:00+00:00',
      actorType: 'agent',
      agentName: 'routine-agent',
      bundleId: 'b1',
      itemId: 'i10',
      itemName: '항목 i10',
      reason: '반려 이유',
    })
    const text = JSON.stringify(body)
    for (const forbidden of ['"actor"', 'token:', 'secret-admin-user-id', 'slack_result']) expect(text).not.toContain(forbidden)
  })

  it('patternNo 형식이 틀리면 400이다', async () => {
    for (const patternNo of ['taste-signals', 'T01', 'p10', 'P1']) {
      expect((await GET_REJECTIONS(rejectionsRequest('', AUTH), patternParams(patternNo))).status).toBe(400)
    }
  })

  it('offset이 0 이상 정수가 아니거나 1,000을 넘으면 400이다. 없으면 0이다', async () => {
    for (const query of ['?offset=-1', '?offset=abc', '?offset=1.5', '?offset=1001', '?offset=']) {
      expect((await GET_REJECTIONS(rejectionsRequest(query, AUTH), patternParams('P10'))).status).toBe(400)
    }
    expect((await GET_REJECTIONS(rejectionsRequest('?offset=1000', AUTH), patternParams('P10'))).status).toBe(200)
    expect((await (await GET_REJECTIONS(rejectionsRequest('?offset=10', AUTH), patternParams('P10'))).json()).rejections).toEqual([])
  })

  it('반려 기록이 없는 패턴은 빈 목록이다', async () => {
    const body = await (await GET_REJECTIONS(rejectionsRequest('', AUTH), patternParams('P99'))).json()
    expect(body).toEqual({ rejections: [], hasMore: false, total: 0 })
  })

  it('조회 오류는 고정 문장 500이다', async () => {
    fakeDb.readError = 'db down secret'
    const res = await GET_REJECTIONS(rejectionsRequest('', AUTH), patternParams('P10'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})

describe('경로 겹침', () => {
  it('정적 세그먼트 이름(taste-signals·common-rules)은 패턴 번호 형식(P..)과 겹치지 않는다', () => {
    for (const segment of ['taste-signals', 'common-rules', 'draw']) expect(OPS_PATTERN_NO_PATTERN.test(segment)).toBe(false)
  })
})
