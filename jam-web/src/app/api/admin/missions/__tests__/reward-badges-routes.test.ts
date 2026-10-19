/**
 * 어드민 미션 저장 라우트(POST·PATCH) — 보상 배지·게이트 배지 검증 (티켓 20261019_1313 2회, 티켓 20261019_0012)
 *
 * 고정하는 것
 *  - 보상 배지는 존재(삭제 제외)·유형(액티비티·아이템만, 체크인 거절)·숨김 거절·중복 제거를 서버가 검증한다. 어기면 400이고 저장하지 않는다.
 *  - 정상이면 중복을 없앤 소문자 id 목록을 저장한다.
 *  - 게이트 배지(`gated_badge_id`)가 숨김이면 400이다.
 *  - 배지를 읽지 못하면 통과시키지 않고 500이며, DB 오류 원문은 응답에 싣지 않는다.
 *  - PATCH는 부분 갱신이라 `reward_badge_ids`가 본문에 없으면 보상 배지를 검사하지 않는다(다른 칸 수정은 막지 않는다).
 * 실제 DB를 부르지 않는다: Supabase 클라이언트는 기록형 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/missions/__tests__/reward-badges-routes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  /** 배지 읽기 질의가 돌려줄 행. 필터는 따지지 않는다(라우트가 행의 값으로 판정한다) */
  badges: [] as Record<string, unknown>[],
  /** 배지 읽기 오류 */
  badgeError: null as { message: string } | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  badgeReads: 0,
}))

/** 배지 질의: 어떤 필터 체인이든 받고, 끝(await·`maybeSingle()`)에서 `state.badges`를 돌려준다. */
function badgeQuery(): unknown {
  const result = () => {
    state.badgeReads += 1
    return state.badgeError ? { data: null, error: state.badgeError } : { data: state.badges, error: null }
  }
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') return (resolve: (value: unknown) => unknown) => resolve(result())
        if (method === 'maybeSingle') {
          return () => {
            const { data, error } = result()
            return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error })
          }
        }
        return () => badgeQuery()
      },
    }
  )
}

const fakeClient = {
  from: (table: string) => {
    if (table === 'badges') return { select: () => badgeQuery() }
    return {
      // PATCH가 기존 행을 읽는 경로(이미지·게이트·조건). 이 시험의 본문은 그 칸을 건드리지 않아 거의 읽지 않는다.
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { id: 'm1' }, error: null }),
          maybeSingle: () => Promise.resolve({ data: { id: 'm1', image_url: null }, error: null }),
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        state.inserts.push(payload)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new-mission', ...payload }, error: null }) }) }
      },
      update: (patch: Record<string, unknown>) => {
        state.updates.push(patch)
        return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'm1', ...patch }, error: null }) }) }) }
      },
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { POST } = await import('../route')
const { PATCH } = await import('../[id]/route')

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const BASE_BODY = {
  title: '주말 러닝',
  mission_type: 'distance',
  condition_json: { activity_type: 'running', distance_km: 30 },
}

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, ...body }),
    })
  )

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest('https://j-a-m.app/api/admin/missions/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'm1' }) }
  )

const activity = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `배지 ${id.slice(0, 2)}`,
  type: 'activity',
  is_hidden: false,
  ...overrides,
})

beforeEach(() => {
  state.badges = []
  state.badgeError = null
  state.inserts = []
  state.updates = []
  state.badgeReads = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/missions — 보상 배지 검증', () => {
  it('숨김 배지를 보상으로 저장하면 400이고 저장하지 않는다', async () => {
    state.badges = [activity(ID_A, { name: '비밀 배지', is_hidden: true })]

    const res = await post({ reward_badge_ids: [ID_A] })

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toContain('숨김 배지가 있어요(「비밀 배지」)')
    expect(error).toContain('숨김이 아닌 배지로 바꿔 주세요')
    expect(state.inserts).toEqual([])
  })

  it('체크인 배지를 보상으로 저장하면 400이고 저장하지 않는다', async () => {
    state.badges = [activity(ID_A, { name: '카페 체크인', type: 'checkin' })]

    const res = await post({ reward_badge_ids: [ID_A] })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('체크인 배지: 「카페 체크인」')
    expect(state.inserts).toEqual([])
  })

  it('삭제됐거나 없는 배지를 보상으로 저장하면 400이다(삭제된 배지는 읽히지 않는다)', async () => {
    state.badges = [activity(ID_A)]

    const res = await post({ reward_badge_ids: [ID_A, ID_B] })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(ID_B)
    expect(state.inserts).toEqual([])
  })

  it('UUID가 아닌 id는 DB를 읽기 전에 400이다', async () => {
    const res = await post({ reward_badge_ids: ['not-a-uuid'] })

    expect(res.status).toBe(400)
    expect(state.badgeReads).toBe(0)
    expect(state.inserts).toEqual([])
  })

  it('배지를 읽지 못하면 통과시키지 않고 500이다. DB 오류 원문은 싣지 않는다', async () => {
    state.badgeError = { message: 'db-internal-host timeout' }

    const res = await post({ reward_badge_ids: [ID_A] })

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('db-internal-host')
    expect(state.inserts).toEqual([])
  })

  it('정상이면 중복을 없앤 소문자 id 목록을 저장한다. 액티비티와 아이템 배지를 모두 쓸 수 있다', async () => {
    state.badges = [activity(ID_A), activity(ID_B, { type: 'item' })]

    const res = await post({ reward_badge_ids: [ID_A, ID_B, ID_A.toUpperCase()], reward_points: 100 })

    expect(res.status).toBe(200)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ title: '주말 러닝', reward_points: 100, reward_badge_ids: [ID_A, ID_B] })
  })

  it('보상 배지를 보내지 않으면 배지를 읽지 않고 본문 그대로 저장한다', async () => {
    const res = await post({})

    expect(res.status).toBe(200)
    expect(state.badgeReads).toBe(0)
    expect(state.inserts[0]).not.toHaveProperty('reward_badge_ids')
  })

  it('빈 보상 배지 목록은 저장한다(보상 없는 미션)', async () => {
    const res = await post({ reward_badge_ids: [] })

    expect(res.status).toBe(200)
    expect(state.inserts[0]).toMatchObject({ reward_badge_ids: [] })
    expect(state.badgeReads).toBe(0)
  })
})

describe('POST /api/admin/missions — 게이트 배지 검증', () => {
  it('게이트 배지가 숨김이면 400이고 저장하지 않는다', async () => {
    state.badges = [activity(ID_A, { name: '비밀 배지', is_hidden: true })]

    const res = await post({ gated_badge_id: ID_A })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('게이트 배지로 쓸 수 없는 숨김 배지예요(「비밀 배지」)')
    expect(state.inserts).toEqual([])
  })

  it('게이트 배지가 숨김이 아니면 저장한다', async () => {
    state.badges = [activity(ID_A)]

    const res = await post({ gated_badge_id: ID_A })

    expect(res.status).toBe(200)
    expect(state.inserts[0]).toMatchObject({ gated_badge_id: ID_A })
  })
})

describe('PATCH /api/admin/missions/[id] — 보상 배지 검증', () => {
  it('숨김 배지로 바꾸는 수정은 400이고 저장하지 않는다', async () => {
    state.badges = [activity(ID_A, { name: '비밀 배지', is_hidden: true })]

    const res = await patch({ reward_badge_ids: [ID_A] })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('숨김 배지가 있어요(「비밀 배지」)')
    expect(state.updates).toEqual([])
  })

  it('체크인 배지로 바꾸는 수정은 400이다', async () => {
    state.badges = [activity(ID_A, { type: 'checkin' })]

    const res = await patch({ reward_badge_ids: [ID_A] })

    expect(res.status).toBe(400)
    expect(state.updates).toEqual([])
  })

  it('정상이면 중복을 없앤 목록으로 수정한다', async () => {
    state.badges = [activity(ID_A)]

    const res = await patch({ reward_badge_ids: [ID_A, ID_A] })

    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ reward_badge_ids: [ID_A] }])
  })

  it('보상 배지 칸을 보내지 않는 수정은 배지를 읽지 않는다(다른 칸 수정은 막지 않는다)', async () => {
    state.badges = [activity(ID_A, { is_hidden: true })]

    const res = await patch({ title: '새 제목' })

    expect(res.status).toBe(200)
    expect(state.badgeReads).toBe(0)
    expect(state.updates).toEqual([{ title: '새 제목' }])
  })

  it('배지를 읽지 못하면 500이다', async () => {
    state.badgeError = { message: 'boom' }

    const res = await patch({ reward_badge_ids: [ID_A] })

    expect(res.status).toBe(500)
    expect(state.updates).toEqual([])
  })

  it('게이트 배지가 숨김이면 400이다', async () => {
    state.badges = [activity(ID_A, { is_hidden: true })]

    const res = await patch({ gated_badge_id: ID_A })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('게이트 배지로 쓸 수 없는 숨김 배지')
    expect(state.updates).toEqual([])
  })
})
