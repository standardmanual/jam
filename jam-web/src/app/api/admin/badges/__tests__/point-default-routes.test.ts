/**
 * 어드민 배지 생성 라우트(POST) — 포인트를 생략하면 일괄 값으로 채움 (티켓 20261022_1135 1회)
 *
 * 고정하는 것
 *  - `point_reward`를 생략(undefined)하면 배지 포인트 일괄 값(`badge_point_policy`)으로 채운다: 등급형은 등급 값, 레벨형은 레벨형 값, 숨김은 0.
 *    계열 화면의 «단계 추가»가 `point_reward` 없이 이 라우트를 부른다.
 *  - 값이 있으면 그대로다 — 0도 그대로다(0으로 보낸 값을 일괄 값으로 바꾸지 않는다).
 *  - 일괄 값을 바꾸면 채워지는 값도 바뀐다. 표를 읽지 못하면 코드 기본값(10·20·50·100·10)으로 채운다(생성이 막히지 않는다).
 *  - PUT은 바꾸지 않는다: 일괄 값을 읽지 않고 기존 포인트를 유지한다.
 *  - 공용 함수 `buildBadgeInsertPayload`의 «포인트가 없으면 0»은 그대로다(운영툴 등록·에셋 스크립트도 쓴다).
 * 실제 DB를 부르지 않는다: Supabase 클라이언트는 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/__tests__/point-default-routes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  /** `badge_point_policy` 행. 비우면(null) 행 없음 */
  policy: null as Record<string, unknown> | null,
  /** true면 일괄 값 조회가 오류로 답한다(표가 아직 없는 때) */
  policyError: false,
  /** 일괄 값 표를 읽은 횟수 */
  policyReads: 0,
}))

/** 어떤 필터 체인이든 받는다. 끝(await)은 빈 목록이다. */
function readBuilder(): unknown {
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') return (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null })
        if (method === 'single') {
          return () => Promise.resolve({ data: state.existing, error: state.existing ? null : { message: 'none' } })
        }
        return () => readBuilder()
      },
    }
  )
}

const fakeClient = {
  from: (table: string) => {
    if (table === 'badge_point_policy') {
      state.policyReads += 1
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                state.policyError
                  ? { data: null, error: { message: 'relation "badge_point_policy" does not exist' } }
                  : { data: state.policy, error: state.policy ? null : { message: 'none' } }
              ),
          }),
        }),
      }
    }
    return {
      select: () => readBuilder(),
      insert: (payload: Record<string, unknown>) => {
        state.inserts.push(payload)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new-badge', ...payload }, error: null }) }) }
      },
      update: (patch: Record<string, unknown>) => {
        state.updates.push(patch)
        return {
          eq: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { ...state.existing, ...patch }, error: null }) }),
          }),
        }
      },
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: 'admin-1', email: 'me@jam.app' }),
}))

const { POST } = await import('../route')
const { PUT } = await import('../[id]/route')
const { buildBadgeInsertPayload } = await import('@/lib/admin/badge-insert-payload')

/** 칸마다 다른 값을 줘서 엉뚱한 칸을 읽으면 드러나게 한다 */
const POLICY_ROW = { common_points: 11, rare_points: 22, epic_points: 55, mystic_points: 111, leveled_points: 7 }

const BASE_BODY = {
  name: '한강 라이더',
  description: '설명',
  type: 'activity',
  rarity: 'common',
  image_url: 'https://cdn.test/x.webp',
}

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, ...body }),
    })
  )

const put = (body: Record<string, unknown>) =>
  PUT(
    new NextRequest('https://j-a-m.app/api/admin/badges/b1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'b1' }) }
  )

beforeEach(() => {
  state.existing = {
    id: 'b1',
    name: '한강 라이더',
    description: '설명',
    type: 'activity',
    rarity: 'rare',
    level: null,
    family_key: null,
    image_url: 'https://cdn.test/x.webp',
    condition_json: null,
    point_reward: 3,
    is_hidden: false,
    branch_key: null,
  }
  state.inserts = []
  state.updates = []
  state.policy = { ...POLICY_ROW }
  state.policyError = false
  state.policyReads = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/badges — 포인트를 생략하면 일괄 값', () => {
  it('등급형은 등급마다 그 등급의 일괄 값으로 채운다', async () => {
    for (const [rarity, points] of [
      ['common', 11],
      ['rare', 22],
      ['epic', 55],
      ['mystic', 111],
    ] as const) {
      state.inserts = []
      const res = await post({ rarity })
      expect(res.status, rarity).toBe(201)
      expect(state.inserts[0], rarity).toMatchObject({ rarity, point_reward: points })
    }
  })

  it('레벨형(등급 없음)은 레벨형 값으로 채운다', async () => {
    const res = await post({ rarity: null, level: 3 })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ rarity: null, level: 3, point_reward: 7 })
  })

  it('숨김 배지는 일괄 값이 있어도 0으로 채운다', async () => {
    const res = await post({ is_hidden: true })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ is_hidden: true, rarity: 'common', point_reward: 0 })
  })

  it('아이템·체크인 배지도 등급 값으로 채운다', async () => {
    const item = await post({ type: 'item', rarity: 'epic' })
    expect(item.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ type: 'item', point_reward: 55 })

    const checkin = await post({ type: 'checkin', rarity: 'rare' })
    expect(checkin.status).toBe(201)
    expect(state.inserts[1]).toMatchObject({ type: 'checkin', point_reward: 22 })
  })

  it('저장된 일괄 값이 바뀌면 채워지는 값도 바뀐다', async () => {
    state.policy = { ...POLICY_ROW, rare_points: 30 }
    await post({ rarity: 'rare' })

    expect(state.inserts[0]).toMatchObject({ point_reward: 30 })
  })

  it('일괄 값이 0이면 0으로 채운다', async () => {
    state.policy = { ...POLICY_ROW, mystic_points: 0 }
    await post({ rarity: 'mystic' })

    expect(state.inserts[0]).toMatchObject({ point_reward: 0 })
  })

  it('일괄 값 표를 읽지 못하면 코드 기본값(Common 10 · Rare 20 · Epic 50 · Mystic 100 · 레벨형 10)으로 채운다', async () => {
    state.policyError = true
    for (const [body, points] of [
      [{ rarity: 'common' }, 10],
      [{ rarity: 'rare' }, 20],
      [{ rarity: 'epic' }, 50],
      [{ rarity: 'mystic' }, 100],
      [{ rarity: null, level: 2 }, 10],
    ] as const) {
      state.inserts = []
      const res = await post(body)
      expect(res.status, JSON.stringify(body)).toBe(201)
      expect(state.inserts[0], JSON.stringify(body)).toMatchObject({ point_reward: points })
    }
  })

  it('일괄 값 행이 없으면 코드 기본값으로 채운다', async () => {
    state.policy = null
    await post({ rarity: 'epic' })

    expect(state.inserts[0]).toMatchObject({ point_reward: 50 })
  })
})

describe('POST /api/admin/badges — 포인트가 있으면 그대로', () => {
  it('보낸 값을 그대로 저장하고 일괄 값을 읽지 않는다', async () => {
    const res = await post({ rarity: 'rare', point_reward: 5 })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ point_reward: 5 })
    expect(state.policyReads).toBe(0)
  })

  it('0으로 보낸 값도 일괄 값으로 바꾸지 않는다', async () => {
    const res = await post({ rarity: 'rare', point_reward: 0 })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ point_reward: 0 })
    expect(state.policyReads).toBe(0)
  })

  it('숨김 배지에 0이 아닌 포인트를 보내면 여전히 400이다', async () => {
    const res = await post({ is_hidden: true, point_reward: 10 })

    expect(res.status).toBe(400)
    expect(state.inserts).toEqual([])
  })
})

describe('PUT /api/admin/badges/[id] — 바꾸지 않는다', () => {
  it('포인트를 보내지 않으면 기존 포인트를 유지하고 일괄 값을 읽지 않는다', async () => {
    const res = await put({ description: '새 설명' })

    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ point_reward: 3 })
    expect(state.policyReads).toBe(0)
  })

  it('등급을 바꿔도 포인트를 일괄 값으로 바꾸지 않는다', async () => {
    const res = await put({ rarity: 'mystic' })

    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ rarity: 'mystic', point_reward: 3 })
    expect(state.policyReads).toBe(0)
  })
})

describe('buildBadgeInsertPayload — 공용 함수는 그대로', () => {
  it('포인트가 없으면 0이다(운영툴 등록·에셋 스크립트의 기존 동작)', () => {
    const payload = buildBadgeInsertPayload({ ...BASE_BODY, rarity: 'epic' })

    expect(payload.point_reward).toBe(0)
  })

  it('포인트가 있으면 음수를 막고 정수로 자른다', () => {
    expect(buildBadgeInsertPayload({ ...BASE_BODY, point_reward: 12.9 }).point_reward).toBe(12)
    expect(buildBadgeInsertPayload({ ...BASE_BODY, point_reward: -4 }).point_reward).toBe(0)
  })
})
