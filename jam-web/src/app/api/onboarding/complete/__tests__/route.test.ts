/**
 * POST /api/onboarding/complete — user_onboarding_quests 행 생성 회귀 테스트 (티켓 20260927_2124)
 *
 * 검증 대상:
 *  - 2단계(tribe_id 포함) 완료 시, 기능 스위치가 켜져 있으면 user_onboarding_quests에
 *    upsert(ignoreDuplicates)로 행을 만든다
 *  - 기능 스위치(ONBOARDING_QUEST_ENABLED)가 꺼져 있으면 행을 만들지 않는다
 *  - 1단계(tribe_id 없이) 호출은 스위치와 무관하게 행을 만들지 않는다
 *  - 행 생성이 실패해도 온보딩 완료 응답은 그대로 200 성공이다
 *  - 2단계 갱신은 «트라이브가 비어 있을 때만» 저장한다(티켓 20261021_1247): 갱신문에 `tribe_id IS NULL` 조건이 걸리고,
 *    바뀐 행이 없으면(다른 요청이 먼저 저장) 이미 설정됨(409 ALREADY_SET)으로 응답하며 퀘스트 행을 만들지 않는다. 1단계 갱신에는 이 조건이 없다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/onboarding/complete/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = 'user-1'
const TRIBE_ID = 'tribe-1'

const state = vi.hoisted(() => ({
  questEnabled: true,
  questUpsertError: null as { message: string } | null,
}))

vi.mock('@/lib/onboarding-quest/config', () => ({
  get ONBOARDING_QUEST_ENABLED() {
    return state.questEnabled
  },
}))

const questUpsertMock = vi.hoisted(() => vi.fn<(row: unknown, opts: unknown) => void>(() => {}))

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
    if (table === 'user_onboarding_quests') {
      return {
        upsert: (row: unknown, opts: unknown) => {
          questUpsertMock(row, opts)
          return Promise.resolve({ error: state.questUpsertError })
        },
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
  state.questEnabled = true
  state.questUpsertError = null
  usersUpdate.payloads = []
  usersUpdate.eqs = []
  usersUpdate.iss = []
  usersUpdate.selects = []
  usersUpdate.updatedRows = [{ id: USER_ID }]
  usersUpdate.error = null
  usersUpdate.currentTribeId = null
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/onboarding/complete — user_onboarding_quests 행 생성', () => {
  it('2단계 완료 + 기능 스위치 ON이면 upsert(ignoreDuplicates)로 행을 만든다', async () => {
    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(questUpsertMock).toHaveBeenCalledTimes(1)
    expect(questUpsertMock).toHaveBeenCalledWith(
      { user_id: USER_ID },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
  })

  it('기능 스위치가 꺼져 있으면 2단계를 완료해도 행을 만들지 않는다', async () => {
    state.questEnabled = false

    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(questUpsertMock).not.toHaveBeenCalled()
  })

  it('1단계(tribe_id 없이) 호출은 스위치가 켜져 있어도 행을 만들지 않는다', async () => {
    const res = await POST(request({ username: 'jam.user', display_name: '잼유저' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(questUpsertMock).not.toHaveBeenCalled()
  })

  it('행 생성이 실패해도 온보딩 완료 응답은 200 성공이다', async () => {
    state.questUpsertError = { message: 'DB 오류' }

    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })
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

  it('바뀐 행이 없으면(다른 요청이 먼저 저장) 이미 설정됨 409로 응답하고 퀘스트 행을 만들지 않는다', async () => {
    usersUpdate.updatedRows = []

    const res = await POST(request({ username: 'jam.user', display_name: '잼유저', tribe_id: TRIBE_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'ALREADY_SET' })
    expect(questUpsertMock).not.toHaveBeenCalled()
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
