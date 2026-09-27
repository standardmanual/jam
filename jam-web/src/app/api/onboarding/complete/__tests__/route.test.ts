/**
 * POST /api/onboarding/complete — user_onboarding_quests 행 생성 회귀 테스트 (티켓 20260927_2124)
 *
 * 검증 대상:
 *  - 2단계(tribe_id 포함) 완료 시, 기능 스위치가 켜져 있으면 user_onboarding_quests에
 *    upsert(ignoreDuplicates)로 행을 만든다
 *  - 기능 스위치(ONBOARDING_QUEST_ENABLED)가 꺼져 있으면 행을 만들지 않는다
 *  - 1단계(tribe_id 없이) 호출은 스위치와 무관하게 행을 만들지 않는다
 *  - 행 생성이 실패해도 온보딩 완료 응답은 그대로 200 성공이다
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

function makeServiceClient() {
  const from = (table: string) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({ maybeSingle: async () => ({ data: null }) }),
            single: async () => ({ data: { tribe_id: null }, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
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
  vi.clearAllMocks()
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
