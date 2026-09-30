/**
 * 폼 저장 라우트 4종(배지 PUT·미션 PATCH·컬렉션 PUT·홈피드 PATCH)의 제작 경로 초기화
 * (티켓 20260925_1940 방침 A) — 이미지 컬럼이 실제로 바뀌면 update 페이로드에
 * `image_source: null`이 실리고, 다른 필드만 바꾸면 실리지 않는다.
 * 본문에 실린 `image_source`는 4개 라우트 모두 무시한다(티켓 20260925_2003 방침 A).
 * 생성(POST) 라우트 4종(배지·미션·컬렉션·홈피드)도 같다(티켓 20260925_2023 방침 A).
 * 실행: cd jam-web && npx vitest run src/app/api/admin/__tests__/image-source-reset.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

/** 조회는 existingRow를, update·insert는 페이로드를 기록하고 그 페이로드를 돌려준다 */
let existingRow: Row | null = null
const updateMock = vi.fn()
const insertMock = vi.fn()
const selectColumnsMock = vi.fn()

function makeBuilder() {
  let updatePayload: Row | null = null
  let insertPayload: Row | null = null
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((columns?: string) => {
    if (updatePayload === null && insertPayload === null) selectColumnsMock(columns)
    return builder
  })
  builder.insert = vi.fn((payload: Row) => {
    insertPayload = payload
    insertMock(payload)
    return builder
  })
  builder.update = vi.fn((payload: Row) => {
    updatePayload = payload
    updateMock(payload)
    return builder
  })
  builder.eq = vi.fn(() => builder)
  const result = () =>
    insertPayload !== null
      ? { data: { id: 'new-row', ...insertPayload }, error: null }
      : updatePayload !== null
      ? { data: { ...existingRow, ...updatePayload }, error: null }
      : { data: existingRow, error: existingRow ? null : { message: 'not found' } }
  builder.single = vi.fn(async () => result())
  // 실제 maybeSingle은 행이 없어도 에러 없이 data:null을 돌려준다
  builder.maybeSingle = vi.fn(async () => (updatePayload !== null ? result() : { data: existingRow, error: null }))
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => makeBuilder() }),
}))
vi.mock('@/lib/admin/auth', () => ({
  getAdminUser: async () => ({ id: 'admin-id', email: 'admin@jam.app' }),
  requireAdmin: async () => null,
}))
// 배지 PUT의 조건 검증은 이 테스트의 관심사가 아니다 — 통과시킨다
vi.mock('@/lib/admin/badge-validation', () => ({
  findBadgeConditionSaveError: () => null,
  findCheckinBadgeNamesNotFoundError: async () => null,
  findRecipeFirstSuccessNotFoundError: async () => null,
  findRarityLevelError: () => null,
}))

const OLD = 'https://cdn.test.jam.app/old.png'
const NEW = 'https://cdn.test.jam.app/new.png'

function req(body: Row): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/x/1', { method: 'PUT', body: JSON.stringify(body) })
}
const params = { params: Promise.resolve({ id: 'row-1' }) }

function lastUpdate(): Row {
  return updateMock.mock.calls.at(-1)![0] as Row
}

function lastInsert(): Row {
  return insertMock.mock.calls.at(-1)![0] as Row
}

function postReq(body: Row): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/x', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  updateMock.mockReset()
  insertMock.mockReset()
  selectColumnsMock.mockReset()
  existingRow = null
})

describe('배지 PUT', () => {
  const load = async () => (await import('../badges/[id]/route')).PUT
  const badge = { id: 'row-1', name: '배지', type: 'activity', rarity: 'common', level: null, condition_json: {}, image_url: OLD, image_source: 'admin-generator' }

  it('이미지를 바꾸면 image_source를 NULL로 되돌린다', async () => {
    existingRow = badge
    const res = await (await load())(req({ image_url: NEW }), params)
    expect(res.status).toBe(200)
    expect(lastUpdate()).toMatchObject({ image_url: NEW, image_source: null })
  })

  it('같은 이미지로 다른 필드만 바꾸면 image_source를 건드리지 않는다', async () => {
    existingRow = badge
    await (await load())(req({ image_url: OLD, name: '새 이름' }), params)
    expect(lastUpdate()).toMatchObject({ name: '새 이름', image_url: OLD })
    expect(lastUpdate()).not.toHaveProperty('image_source')
  })

  it('본문에 이미지가 없으면 image_source를 건드리지 않는다', async () => {
    existingRow = badge
    await (await load())(req({ name: '새 이름' }), params)
    expect(lastUpdate()).not.toHaveProperty('image_source')
  })

  it('이미지가 그대로일 때 본문의 image_source는 update 페이로드에 들어가지 않는다', async () => {
    existingRow = badge
    await (await load())(req({ image_url: OLD, name: '새 이름', image_source: 'jam-img' }), params)
    expect(lastUpdate()).not.toHaveProperty('image_source')
  })
})

describe('컬렉션 PUT', () => {
  const load = async () => (await import('../itembooks/[id]/route')).PUT
  const book = { id: 'row-1', name: '컬렉션', image_url: OLD, image_source: 'admin-generator', reward_points: 0, is_active: true }

  it('이미지를 바꾸면 image_source를 NULL로 되돌린다', async () => {
    existingRow = book
    const res = await (await load())(req({ image_url: NEW }), params)
    expect(res.status).toBe(200)
    expect(lastUpdate()).toMatchObject({ image_url: NEW, image_source: null })
  })

  it('같은 이미지로 다른 필드만 바꾸면 image_source를 건드리지 않는다', async () => {
    existingRow = book
    await (await load())(req({ image_url: OLD, name: '새 이름' }), params)
    expect(lastUpdate()).toMatchObject({ name: '새 이름' })
    expect(lastUpdate()).not.toHaveProperty('image_source')
  })

  it('본문에 이미지가 없으면 image_source를 건드리지 않는다', async () => {
    existingRow = book
    await (await load())(req({ name: '새 이름' }), params)
    expect(lastUpdate()).not.toHaveProperty('image_source')
  })

  it('이미지가 그대로일 때 본문의 image_source는 update 페이로드에 들어가지 않는다', async () => {
    existingRow = book
    await (await load())(req({ image_url: OLD, name: '새 이름', image_source: 'agent-generator' }), params)
    expect(lastUpdate()).not.toHaveProperty('image_source')
  })
})

describe('미션 PATCH', () => {
  const load = async () => (await import('../missions/[id]/route')).PATCH
  const mission = { id: 'row-1', title: '미션', image_url: OLD, image_source: 'admin-generator' }

  it('이미지를 바꾸면 image_source를 NULL로 되돌린다', async () => {
    existingRow = mission
    const res = await (await load())(req({ image_url: NEW, title: '미션' }), params)
    expect(res.status).toBe(200)
    expect(lastUpdate()).toMatchObject({ image_url: NEW, image_source: null })
  })

  it('같은 이미지로 다른 필드만 바꾸면 image_source를 건드리지 않는다', async () => {
    existingRow = mission
    await (await load())(req({ image_url: OLD, title: '새 제목' }), params)
    expect(lastUpdate()).toEqual({ image_url: OLD, title: '새 제목' })
  })

  it('본문에 이미지가 없으면 기존 행을 조회하지 않고 본문을 그대로 update한다', async () => {
    existingRow = mission
    await (await load())(req({ title: '새 제목' }), params)
    expect(selectColumnsMock).not.toHaveBeenCalled()
    expect(lastUpdate()).toEqual({ title: '새 제목' })
  })

  it('이미지가 그대로일 때 본문의 image_source는 update 페이로드에 들어가지 않는다', async () => {
    existingRow = mission
    await (await load())(req({ image_url: OLD, title: '새 제목', image_source: 'agent-generator' }), params)
    expect(lastUpdate()).toEqual({ image_url: OLD, title: '새 제목' })
  })

  it('본문에 이미지가 없어도 본문의 image_source는 update 페이로드에 들어가지 않는다', async () => {
    existingRow = mission
    await (await load())(req({ title: '새 제목', image_source: 'agent-generator' }), params)
    expect(lastUpdate()).toEqual({ title: '새 제목' })
  })

  it('이미지를 바꾸면 본문의 image_source 대신 NULL이 들어간다', async () => {
    existingRow = mission
    await (await load())(req({ image_url: NEW, image_source: 'agent-generator' }), params)
    expect(lastUpdate()).toEqual({ image_url: NEW, image_source: null })
  })

  it('이미지를 바꾸려는데 미션이 없으면 404이고 update하지 않는다', async () => {
    existingRow = null
    const res = await (await load())(req({ image_url: NEW }), params)
    expect(res.status).toBe(404)
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('홈피드 PATCH', () => {
  const load = async () => (await import('../today/[id]/route')).PATCH
  const card = { id: 'row-1', title: '카드', cover_image_url: OLD, image_source: 'admin-generator' }

  it('커버 이미지를 바꾸면 image_source를 NULL로 되돌린다', async () => {
    existingRow = card
    const res = await (await load())(req({ cover_image_url: NEW }), params)
    expect(res.status).toBe(200)
    expect(lastUpdate()).toMatchObject({ cover_image_url: NEW, image_source: null })
  })

  it('같은 커버로 다른 필드만 바꾸면 image_source를 건드리지 않는다', async () => {
    existingRow = card
    await (await load())(req({ cover_image_url: OLD, title: '새 제목' }), params)
    expect(lastUpdate()).toEqual({ cover_image_url: OLD, title: '새 제목' })
  })

  it('본문에 커버가 없으면 기존 행을 조회하지 않고 본문을 그대로 update한다', async () => {
    existingRow = card
    await (await load())(req({ title: '새 제목' }), params)
    expect(selectColumnsMock).not.toHaveBeenCalled()
    expect(lastUpdate()).toEqual({ title: '새 제목' })
  })

  it('커버가 그대로일 때 본문의 image_source는 update 페이로드에 들어가지 않는다', async () => {
    existingRow = card
    await (await load())(req({ cover_image_url: OLD, title: '새 제목', image_source: 'agent-generator' }), params)
    expect(lastUpdate()).toEqual({ cover_image_url: OLD, title: '새 제목' })
  })

  it('본문에 커버가 없어도 본문의 image_source는 update 페이로드에 들어가지 않는다', async () => {
    existingRow = card
    await (await load())(req({ title: '새 제목', image_source: 'agent-generator' }), params)
    expect(lastUpdate()).toEqual({ title: '새 제목' })
  })

  it('커버를 바꾸면 본문의 image_source 대신 NULL이 들어간다', async () => {
    existingRow = card
    await (await load())(req({ cover_image_url: NEW, image_source: 'agent-generator' }), params)
    expect(lastUpdate()).toEqual({ cover_image_url: NEW, image_source: null })
  })

  it('커버를 바꾸려는데 카드가 없으면 404이고 update하지 않는다', async () => {
    existingRow = null
    const res = await (await load())(req({ cover_image_url: NEW }), params)
    expect(res.status).toBe(404)
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('생성(POST) 라우트는 본문의 image_source를 insert 페이로드에 넣지 않는다', () => {
  it('배지 POST', async () => {
    const POST = (await import('../badges/route')).POST
    const res = await POST(postReq({ name: '배지', description: '설명', type: 'activity', rarity: 'common', image_url: NEW, image_source: 'admin-generator' }))
    expect(res.status).toBe(201)
    expect(lastInsert()).not.toHaveProperty('image_source')
    expect(lastInsert()).toMatchObject({ name: '배지', image_url: NEW })
  })

  it('컬렉션 POST', async () => {
    const POST = (await import('../itembooks/route')).POST
    const res = await POST(postReq({ name: '컬렉션', description: '설명', required_activity_badge_id: 'badge-1', image_url: NEW, image_source: 'agent-generator' }))
    expect(res.status).toBe(201)
    expect(lastInsert()).not.toHaveProperty('image_source')
    expect(lastInsert()).toMatchObject({ name: '컬렉션', image_url: NEW })
  })

  it('미션 POST — 다른 필드는 본문 그대로 저장한다', async () => {
    const POST = (await import('../missions/route')).POST
    const res = await POST(postReq({ title: '미션', image_url: NEW, image_source: 'admin-generator' }))
    expect(res.status).toBe(200)
    expect(lastInsert()).toEqual({ title: '미션', image_url: NEW })
  })

  it('미션 POST — 이미지 없이도 본문의 image_source는 들어가지 않는다', async () => {
    const POST = (await import('../missions/route')).POST
    await POST(postReq({ title: '미션', image_source: 'agent-generator' }))
    expect(lastInsert()).toEqual({ title: '미션' })
  })

  it('홈피드 POST — created_by와 다른 필드는 그대로 저장한다', async () => {
    const POST = (await import('../today/route')).POST
    const res = await POST(postReq({ title: '카드', cover_image_url: NEW, image_source: 'admin-generator' }))
    expect(res.status).toBe(200)
    expect(lastInsert()).toEqual({ title: '카드', cover_image_url: NEW, created_by: 'admin-id' })
  })
})
