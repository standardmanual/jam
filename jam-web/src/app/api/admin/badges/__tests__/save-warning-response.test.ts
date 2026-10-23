/**
 * 배지 저장 응답의 회차 조건 경고 (티켓 20261021_1426).
 * 회차(`repeat_count`) 조건에 회차 판정이 다루지 못하는 키가 끼면 엔진이 회차를 0으로 처리해 발급이 멈춘다.
 * 저장은 막지 않고 응답에 `warning`을 담는다 — 막히지 않는 조합에는 `warning` 키가 아예 없다.
 * 판정(`findConditionShapeSaveWarning`)은 실제 가드 함수를 쓰고, DB와 다른 저장 검증만 대체한다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/__tests__/save-warning-response.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

/** 조회는 existingRow를, insert·update는 받은 페이로드를 합쳐 저장된 행으로 돌려준다 */
let existingRow: Row | null = null

function makeBuilder() {
  let insertPayload: Row | null = null
  let updatePayload: Row | null = null
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.insert = vi.fn((payload: Row) => {
    insertPayload = payload
    return builder
  })
  builder.update = vi.fn((payload: Row) => {
    updatePayload = payload
    return builder
  })
  builder.eq = vi.fn(() => builder)
  builder.single = vi.fn(async () =>
    insertPayload !== null
      ? { data: { id: 'new-row', ...insertPayload }, error: null }
      : updatePayload !== null
        ? { data: { ...existingRow, ...updatePayload }, error: null }
        : { data: existingRow, error: existingRow ? null : { message: 'not found' } }
  )
  builder.maybeSingle = vi.fn(async () => ({ data: existingRow, error: null }))
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => makeBuilder() }),
}))
vi.mock('@/lib/admin/auth', () => ({
  getAdminUser: async () => ({ id: 'admin-id', email: 'admin@jam.app' }),
  requireAdmin: async () => null,
}))
// 경고 판정만 실제 함수를 쓴다 — badge-validation은 서버 전용 의존(drop-engine → next/headers)을 끌고 오므로 나머지는 통과시킨다
vi.mock('@/lib/admin/badge-validation', async () => {
  const guards = await import('@/lib/admin/badge-condition-guards')
  return {
    findBadgeConditionSaveError: () => null,
    findConditionShapeSaveWarning: guards.findConditionShapeSaveWarning,
    findCheckinBadgeNamesNotFoundError: async () => null,
    findRecipeFirstSuccessNotFoundError: async () => null,
    findRarityLevelError: () => null,
    findHiddenBadgeReferenceError: async () => null,
  }
})

/** 계절 필터는 회차 판정이 읽지 않는 키다 — 엔진이 회차를 0으로 처리한다 */
const BLOCKED = { repeat_count: 5, duration_minutes: 60, season: 'winter' }
/** 회차 판정이 읽는 키만 있는 조건이다 */
const COUNTED = { repeat_count: 5, duration_minutes: 60, activity_type: 'running' }

const params = { params: Promise.resolve({ id: 'row-1' }) }

function postReq(body: Row): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/badges', { method: 'POST', body: JSON.stringify(body) })
}
function putReq(body: Row): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/badges/row-1', { method: 'PUT', body: JSON.stringify(body) })
}

beforeEach(() => {
  existingRow = null
})

describe('배지 POST 응답', () => {
  const create = (condition_json: Row, type = 'activity') =>
    postReq({ name: '배지', description: '설명', type, rarity: 'common', image_url: 'https://cdn.test.jam.app/a.png', condition_json })

  it('엔진이 회차를 0으로 처리하는 조건이면 201로 저장되고 warning이 담긴다', async () => {
    const { POST } = await import('../route')
    const res = await POST(create(BLOCKED))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.badge).toMatchObject({ id: 'new-row', condition_json: BLOCKED })
    expect(body.warning).toContain('발급되지 않아요')
    expect(body.warning).toContain('계절(season)')
  })

  it('회차 판정이 읽는 키만 있으면 warning 키가 없다', async () => {
    const { POST } = await import('../route')
    const res = await POST(create(COUNTED))
    expect(res.status).toBe(201)
    expect(await res.json()).not.toHaveProperty('warning')
  })

  it('활동 배지가 아니면(아이템) 같은 조건이어도 warning 키가 없다', async () => {
    const { POST } = await import('../route')
    const res = await POST(create(BLOCKED, 'item'))
    expect(res.status).toBe(201)
    expect(await res.json()).not.toHaveProperty('warning')
  })
})

describe('배지 PUT 응답', () => {
  const existing = {
    id: 'row-1',
    name: '배지',
    description: '설명',
    type: 'activity',
    rarity: 'common',
    level: null,
    condition_json: COUNTED,
    admin_category: null,
    image_url: 'https://cdn.test.jam.app/a.png',
  }

  it('엔진이 회차를 0으로 처리하는 조건으로 바꾸면 200으로 저장되고 warning이 담긴다', async () => {
    existingRow = existing
    const { PUT } = await import('../[id]/route')
    const res = await PUT(putReq({ condition_json: BLOCKED }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.badge).toMatchObject({ id: 'row-1', condition_json: BLOCKED })
    expect(body.warning).toContain('발급되지 않아요')
    expect(body.warning).toContain('계절(season)')
  })

  it('회차 판정이 읽는 키만 있으면 warning 키가 없다', async () => {
    existingRow = existing
    const { PUT } = await import('../[id]/route')
    const res = await PUT(putReq({ condition_json: COUNTED }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('warning')
  })

  it('JAM! 카테고리는 활동 엔진 후보에서 빠지므로 같은 조건이어도 warning 키가 없다', async () => {
    existingRow = { ...existing, admin_category: 'jam' }
    const { PUT } = await import('../[id]/route')
    const res = await PUT(putReq({ condition_json: BLOCKED }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('warning')
  })
})
