/**
 * GET·PUT /api/admin/balance/[section] (티켓 20261022_1132 1회)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의한다), 저장·읽기 처리(`lib/admin/balance/save.ts`)도 모의하지 않고 쓰되 서비스 클라이언트만 메모리 안의 가짜 표로 바꾼다
 * (실 DB에 접속하지 않는다). 지키는 것:
 * - 인증: 세션이 없거나 어드민이 아니면 403, 읽기 토큰만으로는 읽기도 저장도 막힌다(토큰 쓰기 예외는 운영 묶음 제출 경로 하나뿐). 인증이 먼저라 알 수 없는 구역도 비로그인에는 403이다
 * - 알 수 없는 구역은 읽기·저장 모두 404이고 아무것도 읽거나 쓰지 않는다
 * - GET: 현재 값·수정 시각·최근 변경(바꾼 사람은 표시 이름만). 값을 못 읽으면 고정 문장 500이고 DB 원문이 없다. 이력만 못 읽으면 200에 history null
 * - PUT: 본문 형식 오류는 400, 성공하면 값이 바뀌고 이력 한 줄이 어드민 ID로 남으며 응답에는 어드민 ID가 없다. 검증 400(칸별 문장)·바뀐 칸 없음 400·동시 수정 409·
 *   이력 실패 시 되돌림 500을 상태와 문장 그대로 돌려준다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  db: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
  createServiceClient: () => h.db,
}))

import { GET, PUT } from '../[section]/route'
import {
  BALANCE_CONFLICT_MESSAGE,
  BALANCE_HISTORY_FAILED_MESSAGE,
  BALANCE_INVALID_MESSAGE,
  BALANCE_LOAD_FAILED_MESSAGE,
  BALANCE_NO_CHANGE_MESSAGE,
  BALANCE_SECTION_NOT_FOUND_MESSAGE,
} from '@/lib/admin/balance/save'
import { createFakeDb, jamPolicyRow, JAM_ROW_STAMP, type FakeDb } from '@/lib/admin/balance/__tests__/fakeDb'

const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com' }
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const SECRET = 'relation "jam_policy" secret detail'

const params = (section = 'jam') => ({ params: Promise.resolve({ section }) })

function getRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/balance/jam', { method: 'GET', headers })
}

function putRequest(body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request('http://localhost/api/admin/balance/jam', { method: 'PUT', headers, body: text })
}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  values: { intensity_normal: 4 },
  expectedUpdatedAt: JAM_ROW_STAMP,
  note: '이벤트',
  ...overrides,
})

let db: FakeDb
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.user = null
  db = createFakeDb({
    jam_policy: [jamPolicyRow()],
    balance_setting_changes: [],
    users: [
      { id: ADMIN.id, username: 'karina', is_admin: false },
      { id: 'user-2', username: 'someone', is_admin: false },
    ],
  })
  h.db = db.client
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

describe('인증', () => {
  it('세션이 없으면 읽기·저장 모두 403이다(읽기 토큰만으로도 막힌다)', async () => {
    expect((await GET(getRequest(), params())).status).toBe(403)
    expect((await GET(getRequest({ 'x-admin-read-token': TOKEN }), params())).status).toBe(403)
    expect((await PUT(putRequest(validBody()), params())).status).toBe(403)
    expect((await PUT(putRequest(validBody(), { 'x-admin-read-token': TOKEN }), params())).status).toBe(403)
    expect(db.calls.filter((call) => call.startsWith('jam_policy') || call.startsWith('balance_setting_changes'))).toEqual([])
  })

  it('로그인했어도 어드민 권한이 없으면 403이다', async () => {
    h.user = { id: 'user-2', email: 'someone@example.com' }
    expect((await GET(getRequest(), params())).status).toBe(403)
    expect((await PUT(putRequest(validBody()), params())).status).toBe(403)
    expect(db.updates).toEqual([])
  })

  it('인증이 구역 찾기보다 먼저다(비로그인에는 구역이 있는지 알리지 않는다)', async () => {
    expect((await GET(getRequest(), params('nope'))).status).toBe(403)
    expect((await PUT(putRequest(validBody()), params('nope'))).status).toBe(403)
  })
})

describe('알 수 없는 구역', () => {
  it('읽기·저장 모두 404이고 아무것도 읽거나 쓰지 않는다', async () => {
    h.user = ADMIN
    for (const res of [await GET(getRequest(), params('nope')), await PUT(putRequest(validBody()), params('nope'))]) {
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: BALANCE_SECTION_NOT_FOUND_MESSAGE })
    }
    expect(db.calls).toEqual([])
  })
})

describe('GET', () => {
  beforeEach(() => {
    h.user = ADMIN
  })

  it('현재 값과 수정 시각과 최근 변경을 돌려준다(바꾼 사람은 표시 이름만)', async () => {
    db.tables.balance_setting_changes = [
      {
        id: 'h-1',
        section_key: 'jam',
        changes: [{ field: 'intensity_hard', from: 2, to: 3 }],
        note: null,
        affects_disclosure: false,
        changed_by: ADMIN.id,
        created_at: '2026-10-22T01:30:00.000+00:00',
      },
    ]
    const res = await GET(getRequest(), params())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updatedAt).toBe(JAM_ROW_STAMP)
    expect(body.values).toEqual({
      intensity_light: 1,
      intensity_normal: 2,
      intensity_hard: 3,
      mass_earn_alert_multiplier: 3,
      mass_earn_alert_weeks: 4,
      mass_earn_alert_no_history_amount: 1200,
    })
    expect(body.history).toHaveLength(1)
    expect(body.history[0].changedByName).toBe('karina')
    expect(JSON.stringify(body)).not.toContain(ADMIN.id)
    expect(JSON.stringify(body)).not.toContain(ADMIN.email)
    expect(db.updates).toEqual([])
  })

  it('값을 읽지 못하면 고정 문장 500이고 DB 원문은 싣지 않는다', async () => {
    db.readErrors.jam_policy = SECRET
    const res = await GET(getRequest(), params())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: BALANCE_LOAD_FAILED_MESSAGE })
  })

  it('이력만 읽지 못하면 200이고 history가 null이다', async () => {
    db.readErrors.balance_setting_changes = SECRET
    const res = await GET(getRequest(), params())
    expect(res.status).toBe(200)
    expect((await res.json()).history).toBeNull()
  })
})

describe('PUT', () => {
  beforeEach(() => {
    h.user = ADMIN
  })

  it('본문 형식이 틀리면 400이고 아무것도 쓰지 않는다', async () => {
    expect((await PUT(putRequest('{not json'), params())).status).toBe(400)
    expect((await PUT(putRequest('[1,2]'), params())).status).toBe(400)
    expect((await PUT(putRequest('null'), params())).status).toBe(400)
    expect((await PUT(putRequest(validBody({ note: 'ㄱ'.repeat(20_000) })), params())).status).toBe(400)
    expect(db.updates).toEqual([])
  })

  it('성공하면 값이 바뀌고 이력 한 줄이 어드민 ID로 남으며 응답에는 어드민 ID가 없다', async () => {
    const res = await PUT(putRequest(validBody()), params())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.values.intensity_normal).toBe(4)
    expect(body.changes).toEqual([{ field: 'intensity_normal', from: 2, to: 4 }])
    expect(body.affectsDisclosure).toBe(false)
    expect(body.updatedAt).toBe(db.tables.jam_policy[0].updated_at)
    expect(body.updatedAt).not.toBe(JAM_ROW_STAMP)
    expect(JSON.stringify(body)).not.toContain(ADMIN.id)

    expect(db.tables.jam_policy[0].intensity_normal).toBe(4)
    expect(db.tables.balance_setting_changes).toHaveLength(1)
    expect(db.tables.balance_setting_changes[0]).toMatchObject({
      section_key: 'jam',
      changes: [{ field: 'intensity_normal', from: 2, to: 4 }],
      note: '이벤트',
      changed_by: ADMIN.id,
    })
  })

  it('메모 없이도 저장된다(메모는 항상 선택)', async () => {
    const res = await PUT(putRequest({ values: { mass_earn_alert_weeks: 8 }, expectedUpdatedAt: JAM_ROW_STAMP }), params())
    expect(res.status).toBe(200)
    expect(db.tables.balance_setting_changes[0].note).toBeNull()
  })

  it('검증에 걸리면 400과 칸별 문장을 돌려주고 쓰지 않는다', async () => {
    const res = await PUT(putRequest(validBody({ values: { intensity_light: 1.5, mass_earn_alert_weeks: 0 } })), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: BALANCE_INVALID_MESSAGE,
      fieldErrors: {
        intensity_light: '0 이상의 정수로 입력해 주세요.',
        mass_earn_alert_weeks: '1 이상의 정수로 입력해 주세요.',
      },
    })
    expect(db.updates).toEqual([])
  })

  it('바뀐 칸이 없으면 400이다', async () => {
    const res = await PUT(putRequest(validBody({ values: { intensity_normal: 2 } })), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: BALANCE_NO_CHANGE_MESSAGE })
    expect(db.tables.balance_setting_changes).toEqual([])
  })

  it('화면이 본 수정 시각이 낡았으면 409이고 쓰지 않는다', async () => {
    const res = await PUT(putRequest(validBody({ expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })), params())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: BALANCE_CONFLICT_MESSAGE })
    expect(db.updates).toEqual([])
    expect(db.tables.balance_setting_changes).toEqual([])
  })

  it('이력을 쓰지 못하면 500이고 방금 저장이 되돌려지며 DB 원문은 싣지 않는다', async () => {
    db.writeErrors.balance_setting_changes = SECRET
    const res = await PUT(putRequest(validBody()), params())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(db.tables.jam_policy[0]).toMatchObject({ intensity_normal: 2, updated_at: JAM_ROW_STAMP })
  })
})

describe('동기화 구역 (2회)', () => {
  beforeEach(() => {
    h.user = ADMIN
  })

  it('GET은 동기화 열한 칸의 값을 돌려준다(잼 칸은 없다)', async () => {
    const res = await GET(getRequest(), params('sync'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body.values)).toHaveLength(11)
    expect(body.values).toMatchObject({ sync_item_guaranteed: 1, sync_rarity_epic: 2.5, locked_roll_probability: 0.25 })
    expect(body.values.intensity_light).toBeUndefined()
    expect(body.updatedAt).toBe(JAM_ROW_STAMP)
  })

  it('PUT: 등급 확률 합이 100이 아니면 400이고 쓰지 않는다', async () => {
    const res = await PUT(putRequest({ values: { sync_rarity_common: 80 }, expectedUpdatedAt: JAM_ROW_STAMP }), params('sync'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe(BALANCE_INVALID_MESSAGE)
    expect(Object.keys(body.fieldErrors).sort()).toEqual(['sync_rarity_common', 'sync_rarity_epic', 'sync_rarity_mystic', 'sync_rarity_rare'])
    expect(db.updates).toEqual([])
  })

  it('PUT: 0개(확정 0, 보너스 0)도 저장되고 이력은 sync 구역에 «확률 안내 반영»으로 남는다', async () => {
    const res = await PUT(
      putRequest({ values: { sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0, sync_item_bonus_rolls: 0 }, expectedUpdatedAt: JAM_ROW_STAMP }),
      params('sync')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.affectsDisclosure).toBe(true)
    expect(JSON.stringify(body)).not.toContain(ADMIN.id)
    expect(db.tables.balance_setting_changes[0]).toMatchObject({ section_key: 'sync', affects_disclosure: true, changed_by: ADMIN.id })
  })
})
