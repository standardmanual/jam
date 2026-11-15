/**
 * POST /api/onboarding/complete 회귀 테스트
 *
 * 검증 대상:
 *  - 2단계 성공 시 챕터 1 시작과 완료 배지 지급을 부른다(티켓 20261115_2056). 409·1단계는 부르지 않고, 둘이 던져도 응답은 `{ success: true }`다
 *  - 2단계 갱신은 «트라이브가 비어 있을 때만» 저장한다(티켓 20261021_1247): 갱신문에 `tribe_id IS NULL` 조건이 걸리고,
 *    바뀐 행이 없으면(다른 요청이 먼저 저장) 이미 설정됨(409 ALREADY_SET)으로 응답한다. 1단계 갱신에는 이 조건이 없다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/onboarding/complete/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = 'user-1'
const TRIBE_ID = 'tribe-1'

const chapterMocks = vi.hoisted(() => ({
  ensure: vi.fn<(client: unknown, userId: string) => Promise<void>>(async () => {}),
  grant: vi.fn<(client: unknown, userId: string) => Promise<string | null>>(async () => 'badge-id'),
}))
vi.mock('@/lib/chapter/start', () => ({ ensureChapterStarted: (c: unknown, u: string) => chapterMocks.ensure(c, u) }))
vi.mock('@/lib/chapter/signup-reward', () => ({ grantSignupBadge: (c: unknown, u: string) => chapterMocks.grant(c, u) }))

/** users 갱신 호출 기록과 결과 조절 — 2단계 갱신은 `.eq('id').is('tribe_id', null).select('id')` 체인이다 */
const usersUpdate = vi.hoisted(() => ({
  payloads: [] as Record<string, unknown>[],
  eqs: [] as Array<[string, unknown]>,
  iss: [] as Array<[string, unknown]>,
  selects: [] as string[],
  /** 2단계 갱신이 돌려줄 바뀐 행. 빈 배열이면 다른 요청이 먼저 저장한 것이다 */
  updatedRows: [{ id: 'user-1' }] as Array<{ id: string }>,
  error: null as { message: string } | null,
  /** 읽기 단계에서 보이는 현재 트라이브 */
  currentTribeId: null as string | null,
}))

function makeServiceClient() {
  const from = (table: string) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({ maybeSingle: async () => ({ data: null }) }),
            single: async () => ({ data: { tribe_id: usersUpdate.currentTribeId }, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          usersUpdate.payloads.push(payload)
          // 1단계 갱신은 `.eq()`를 바로 await 하고, 2단계 갱신은 `.eq().is().select()`까지 이어 간다
          const rows = { data: usersUpdate.updatedRows, error: usersUpdate.error }
          const afterEq = {
            then: (resolve: (v: { error: { message: string } | null }) => unknown) => resolve({ error: usersUpdate.error }),
            is: (col: string, val: unknown) => {
              usersUpdate.iss.push([col, val])
              return {
                select: async (cols: string) => {
                  usersUpdate.selects.push(cols)
                  return rows
                },
              }
            },
          }
          return {
            eq: (col: string, val: unknown) => {
              usersUpdate.eqs.push([col, val])
              return afterEq
            },
          }
        },
      }
    }
    if (table === 'tribes') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: TRIBE_ID } }) }),
          }),
        }),
      }
    }
    throw new Error(`알 수 없는 테이블: ${table}`)
  }
  return { from }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
  }),
  createServiceClient: () => makeServiceClient(),
}))

import { POST } from '../route'

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  usersUpdate.payloads = []
  usersUpdate.eqs = []
  usersUpdate.iss = []
  usersUpdate.selects = []
  usersUpdate.updatedRows = [{ id: USER_ID }]
  usersUpdate.error = null
  usersUpdate.currentTribeId = null
  vi.clearAllMocks()
  chapterMocks.ensure.mockResolvedValue(undefined)
  chapterMocks.grant.mockResolvedValue('badge-id')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/onboarding/complete — 트라이브가 비어 있을 때만 저장 (티켓 20261021_1247)', () => {
  it('2단계 갱신은 내 행에 «tribe_id IS NULL» 조건을 걸고 바뀐 행을 되받는다', async () => {
    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))

    expect(res.status).toBe(200)
    expect(usersUpdate.payloads).toHaveLength(1)
    expect(usersUpdate.payloads[0]).toMatchObject({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID })
    expect(typeof usersUpdate.payloads[0].onboarding_completed_at).toBe('string')
    expect(usersUpdate.eqs).toEqual([['id', USER_ID]])
    expect(usersUpdate.iss).toEqual([['tribe_id', null]])
    expect(usersUpdate.selects).toEqual(['id'])
  })

  it('바뀐 행이 없으면(다른 요청이 먼저 저장) 이미 설정됨 409로 응답한다', async () => {
    usersUpdate.updatedRows = []

    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'ALREADY_SET' })
  })

  it('읽을 때 이미 트라이브가 있으면 갱신을 시도하지 않고 같은 409로 응답한다(기존 동작)', async () => {
    usersUpdate.currentTribeId = 'tribe-0'

    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'ALREADY_SET' })
    expect(usersUpdate.payloads).toEqual([])
  })

  it('갱신 오류는 500 SERVER_ERROR다 — 409(이미 설정됨)와 섞이지 않는다', async () => {
    usersUpdate.error = { message: 'DB 오류' }
    usersUpdate.updatedRows = []

    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'SERVER_ERROR' })
  })

  it('1단계(tribe_id 없이) 갱신에는 트라이브 조건을 걸지 않고 tribe_id·onboarding_completed_at을 쓰지 않는다', async () => {
    const res = await POST(request({ username: 'jam.user', display_name: '잼유저' }))

    expect(res.status).toBe(200)
    expect(usersUpdate.payloads).toEqual([{ username: 'jam.user', display_name: '잼유저' }])
    expect(usersUpdate.iss).toEqual([])
  })
})

describe('POST /api/onboarding/complete — 챕터 1 시작·완료 배지 지급 (티켓 20261115_2056)', () => {
  const body2 = { username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }

  it('2단계 성공 시 챕터 1 시작과 완료 배지 지급을 이 유저로 한 번씩 부른다', async () => {
    const res = await POST(request(body2))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(chapterMocks.ensure).toHaveBeenCalledTimes(1)
    expect(chapterMocks.ensure.mock.calls[0][1]).toBe(USER_ID)
    expect(chapterMocks.grant).toHaveBeenCalledTimes(1)
    expect(chapterMocks.grant.mock.calls[0][1]).toBe(USER_ID)
  })

  it('1단계 호출은 챕터 시작도 배지 지급도 하지 않는다', async () => {
    await POST(request({ username: 'jam.user', display_name: '잼유저' }))

    expect(chapterMocks.ensure).not.toHaveBeenCalled()
    expect(chapterMocks.grant).not.toHaveBeenCalled()
  })

  it('이미 설정됨(409 — 읽기 단계·경합 둘 다)이면 부르지 않아 재호출로 중복 지급이 없다', async () => {
    usersUpdate.currentTribeId = 'tribe-0'
    expect((await POST(request(body2))).status).toBe(409)

    usersUpdate.currentTribeId = null
    usersUpdate.updatedRows = []
    expect((await POST(request(body2))).status).toBe(409)

    expect(chapterMocks.ensure).not.toHaveBeenCalled()
    expect(chapterMocks.grant).not.toHaveBeenCalled()
  })

  it('챕터 시작·배지 지급이 던져도 응답은 200 { success: true }다', async () => {
    chapterMocks.ensure.mockRejectedValue(new Error('chapter down'))
    chapterMocks.grant.mockRejectedValue(new Error('grant down'))

    const res = await POST(request(body2))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(console.error).toHaveBeenCalled()
  })

  it('챕터 시작이 던져도 배지 지급은 이어지고 응답은 성공이다', async () => {
    chapterMocks.ensure.mockRejectedValue(new Error('chapter down'))

    const res = await POST(request(body2))

    expect(res.status).toBe(200)
    expect(chapterMocks.grant).toHaveBeenCalledTimes(1)
  })
})
