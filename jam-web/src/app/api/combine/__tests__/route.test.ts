/**
 * POST /api/combine — JAM! 행동 지표(믹스 시도·성공·실패·레시피 최초 성공) 판정 연동 테스트
 * (티켓 20261001_0631)
 *
 * 검증 대상:
 *  - 믹스 결과별로 다시 판정할 지표를 래퍼(`runJamActionEvaluation`)에 넘긴다(결과가 나온 뒤에 부른다)
 *  - 래퍼가 거부돼도 응답(상태 코드·JSON 키·message)은 래퍼가 정상일 때와 같다
 *  - 응답 JSON 키 집합과 「빈손 성공」 메시지는 변경 전과 같다
 *  - 401·400 입력 오류에서는 믹스도 판정도 하지 않는다
 *  - 운영자 판정(`hasAdminAccess`)을 `allowUnreleased`로 믹스 엔진에 넘기고, 시험 믹스(`testMix`) 응답은
 *    키만 더해지며 지표 판정을 하지 않는다. 판정이 실패하면 일반 유저처럼 닫는다(티켓 20261001_1159)
 *
 * 실행: cd jam-web && npx vitest run src/app/api/combine/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { CombineResult } from '@/lib/combine/index'
import { d } from '@/lib/i18n'

const USER_ID = 'user-1'

const USER_EMAIL = 'admin@example.com'

const state = vi.hoisted(() => ({
  authenticated: true,
  callOrder: [] as string[],
}))

const combineMock = vi.hoisted(() =>
  vi.fn<
    (userId: string, recipeId: string, itemIds: string[], options?: { allowUnreleased?: boolean }) => Promise<CombineResult>
  >()
)
const hasAdminAccessMock = vi.hoisted(() =>
  vi.fn<(userId: string, email: string | null | undefined) => Promise<boolean>>()
)
const runJamActionMock = vi.hoisted(() => vi.fn<(userId: string, triggers: readonly string[]) => Promise<void>>())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID, email: USER_EMAIL } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({}),
}))

// 믹스 엔진은 결과만 돌려받도록 갈아끼우고, 결과→트리거 변환은 실제 구현을 쓴다
vi.mock('@/lib/combine/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/combine/index')>()
  return {
    ...actual,
    combineRecipeAttempt: (
      userId: string,
      recipeId: string,
      itemIds: string[],
      options?: { allowUnreleased?: boolean }
    ) => {
      state.callOrder.push('combine')
      return combineMock(userId, recipeId, itemIds, options)
    },
  }
})
vi.mock('@/lib/admin/auth', () => ({
  hasAdminAccess: (userId: string, email: string | null | undefined) => hasAdminAccessMock(userId, email),
}))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (userId: string, triggers: readonly string[]) => {
    state.callOrder.push('jam_action')
    return runJamActionMock(userId, triggers)
  },
}))

import { POST } from '../route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/combine', { method: 'POST', body: JSON.stringify(body) })
}

const VALID_BODY = { recipe_id: 'recipe-1', item_ids: ['item-1', 'item-2'] }

const SUCCESS: CombineResult = {
  success: true,
  path: 'recipe',
  resultBadges: [{ id: 'b1', name: '보상 배지', rarity: 'rare' }],
  pointsAwarded: 120,
}
const EMPTY_HANDED: CombineResult = { success: true, path: 'recipe', resultBadges: [], pointsAwarded: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  state.authenticated = true
  state.callOrder = []
  combineMock.mockResolvedValue(SUCCESS)
  runJamActionMock.mockResolvedValue(undefined)
  hasAdminAccessMock.mockResolvedValue(false)
})

describe('결과별로 판정할 지표', () => {
  it('성공이면 시도·성공·레시피 최초 성공을 판정한다', async () => {
    await POST(request(VALID_BODY))
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, [
      'combine_attempt_count',
      'combine_success_count',
      'recipe_first_success',
    ])
  })

  it('빈손 성공도 성공으로 판정한다', async () => {
    combineMock.mockResolvedValue(EMPTY_HANDED)
    await POST(request(VALID_BODY))
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, [
      'combine_attempt_count',
      'combine_success_count',
      'recipe_first_success',
    ])
  })

  it('no_recipe_match이면 시도·실패를 판정한다', async () => {
    combineMock.mockResolvedValue({ success: false, reason: 'no_recipe_match', pointsAwarded: 5 })
    await POST(request(VALID_BODY))
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, ['combine_attempt_count', 'combine_fail_count'])
  })

  it.each(['invalid_count', 'items_not_found', 'recipe_not_found'] as const)(
    '%s(재료 소각 전 실패)는 판정할 지표가 없다',
    async (reason) => {
      combineMock.mockResolvedValue({ success: false, reason, pointsAwarded: 0 })
      await POST(request(VALID_BODY))
      expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, [])
    }
  )

  it('판정은 믹스 결과가 나온 뒤에 부른다', async () => {
    await POST(request(VALID_BODY))
    expect(state.callOrder).toEqual(['combine', 'jam_action'])
  })
})

describe('판정이 실패해도 응답은 그대로다', () => {
  const RESULTS: [string, CombineResult][] = [
    ['성공', SUCCESS],
    ['빈손 성공', EMPTY_HANDED],
    ['no_recipe_match', { success: false, reason: 'no_recipe_match', pointsAwarded: 5 }],
    ['recipe_not_found', { success: false, reason: 'recipe_not_found', pointsAwarded: 0 }],
  ]

  it.each(RESULTS)('%s — 래퍼가 거부돼도 상태 코드·본문이 래퍼가 정상일 때와 같다', async (_label, result) => {
    combineMock.mockResolvedValue(result)
    const okRes = await POST(request(VALID_BODY))
    const okBody = await okRes.json()

    runJamActionMock.mockRejectedValue(new Error('판정 폭발'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failRes = await POST(request(VALID_BODY))
    const failBody = await failRes.json()
    consoleError.mockRestore()

    expect(failRes.status).toBe(okRes.status)
    expect(failBody).toEqual(okBody)
  })
})

describe('응답 JSON 계약은 변경 전과 같다', () => {
  it('성공 응답의 키 집합은 success·path·resultBadges·pointsAwarded다(message 없음)', async () => {
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(['path', 'pointsAwarded', 'resultBadges', 'success'])
    expect(body).toEqual(SUCCESS)
  })

  it('빈손 성공은 message(recipeFail)가 붙는다', async () => {
    combineMock.mockResolvedValue(EMPTY_HANDED)
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['message', 'path', 'pointsAwarded', 'resultBadges', 'success'])
    expect(body.message).toBe(d.combine.recipeFail)
  })

  it('실패 응답의 키 집합은 success·reason·pointsAwarded·message다', async () => {
    combineMock.mockResolvedValue({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['message', 'pointsAwarded', 'reason', 'success'])
    expect(body.message).toBe(d.combine.itemsNotFound)
  })

  it('no_recipe_match에 포인트가 있으면 위로 문구를 이어 붙인다', async () => {
    combineMock.mockResolvedValue({ success: false, reason: 'no_recipe_match', pointsAwarded: 1500 })
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect(body.message).toBe(`${d.combine.recipeFail}. 그래도 1,500 포인트가 남았어요.`)
  })
})

describe('판정 없이 끝나는 요청', () => {
  it('로그인하지 않았으면 401이고 믹스도 판정도 하지 않는다', async () => {
    state.authenticated = false
    const res = await POST(request(VALID_BODY))
    expect(res.status).toBe(401)
    expect(combineMock).not.toHaveBeenCalled()
    expect(runJamActionMock).not.toHaveBeenCalled()
  })

  it('recipe_id가 없으면 400이고 믹스도 판정도 하지 않는다', async () => {
    const res = await POST(request({ item_ids: ['item-1', 'item-2'] }))
    expect(res.status).toBe(400)
    expect(combineMock).not.toHaveBeenCalled()
    expect(runJamActionMock).not.toHaveBeenCalled()
  })

  it('item_ids 개수가 범위를 벗어나면 400이고 믹스도 판정도 하지 않는다', async () => {
    const res = await POST(request({ recipe_id: 'recipe-1', item_ids: [] }))
    expect(res.status).toBe(400)
    expect(combineMock).not.toHaveBeenCalled()
    expect(runJamActionMock).not.toHaveBeenCalled()
  })
})

describe('운영자 시험 믹스 (티켓 20261001_1159)', () => {
  it('운영자 판정 결과를 allowUnreleased로 믹스 엔진에 넘긴다', async () => {
    hasAdminAccessMock.mockResolvedValue(true)
    await POST(request(VALID_BODY))
    expect(hasAdminAccessMock).toHaveBeenCalledWith(USER_ID, USER_EMAIL)
    expect(combineMock).toHaveBeenCalledWith(USER_ID, 'recipe-1', ['item-1', 'item-2'], { allowUnreleased: true })
  })

  it('운영자가 아니면 allowUnreleased: false로 넘긴다', async () => {
    hasAdminAccessMock.mockResolvedValue(false)
    await POST(request(VALID_BODY))
    expect(combineMock).toHaveBeenCalledWith(USER_ID, 'recipe-1', ['item-1', 'item-2'], { allowUnreleased: false })
  })

  it('운영자 판정이 예외로 실패하면 일반 유저처럼 allowUnreleased: false로 닫고 믹스는 진행한다(fail-closed)', async () => {
    hasAdminAccessMock.mockRejectedValue(new Error('조회 실패'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(request(VALID_BODY))
    consoleError.mockRestore()
    expect(res.status).toBe(200)
    expect(combineMock).toHaveBeenCalledWith(USER_ID, 'recipe-1', ['item-1', 'item-2'], { allowUnreleased: false })
  })

  it('시험 믹스 성공 응답은 기존 키에 testMix만 더해지고 지표 판정은 빈 목록이다', async () => {
    hasAdminAccessMock.mockResolvedValue(true)
    combineMock.mockResolvedValue({ ...SUCCESS, testMix: true })
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['path', 'pointsAwarded', 'resultBadges', 'success', 'testMix'])
    expect(body.testMix).toBe(true)
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, [])
  })

  it('시험 믹스의 미매칭 응답도 message·위로 문구는 그대로이고 testMix만 더해진다', async () => {
    hasAdminAccessMock.mockResolvedValue(true)
    combineMock.mockResolvedValue({ success: false, reason: 'no_recipe_match', pointsAwarded: 5, testMix: true })
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['message', 'pointsAwarded', 'reason', 'success', 'testMix'])
    expect(body.message).toBe(`${d.combine.recipeFail}. 그래도 5 포인트가 남았어요.`)
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, [])
  })

  it('일반 믹스 응답에는 testMix 키가 없다', async () => {
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect('testMix' in body).toBe(false)
  })

  it('일반 유저가 공개 전 레시피를 보내면 recipe_not_found 응답이고 testMix가 없다', async () => {
    hasAdminAccessMock.mockResolvedValue(false)
    combineMock.mockResolvedValue({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    const res = await POST(request(VALID_BODY))
    const body = await res.json()
    expect(body.reason).toBe('recipe_not_found')
    expect('testMix' in body).toBe(false)
  })

  it('401·400 입력 오류에서는 운영자 판정도 부르지 않는다', async () => {
    state.authenticated = false
    await POST(request(VALID_BODY))
    state.authenticated = true
    await POST(request({ item_ids: ['item-1', 'item-2'] }))
    await POST(request({ recipe_id: 'recipe-1', item_ids: [] }))
    expect(hasAdminAccessMock).not.toHaveBeenCalled()
  })
})
