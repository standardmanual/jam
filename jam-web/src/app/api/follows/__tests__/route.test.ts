/**
 * POST /api/follows — JAM! 카테고리 서비스 사용량 배지 연동 회귀 테스트 (티켓 20260910_1557)
 *
 * 검증 대상:
 *  - 팔로우 성공(신규 insert) 직후 팔로우한 사람(following_count)·팔로우당한 사람
 *    (follower_count) 양쪽을 평가한다
 *  - 언팔로우는 이 라우트 대상이 아니다(DELETE는 별도 라우트, 애초에 평가 호출 없음)
 *  - 중복 팔로우(23505)는 평가를 트리거하지 않는다
 *  - 배지 평가가 예외를 던져도 팔로우 응답은 200으로 그대로 반환된다
 *  - 응답의 earnedBadges는 팔로우한 사람 본인의 획득분만 담는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/follows/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ACTOR_ID = 'actor-1'
const TARGET_ID = 'target-1'

const state = vi.hoisted(() => ({
  followingCount: 0,
  followerCount: 0,
  insertError: null as { code: string } | null,
}))

// 구현 함수 자체는 인자를 선언하지 않고 `vi.fn<T>()`의 타입 인자로만 시그니처를 준다 —
// 실제로 읽지 않는 인자를 이름 붙여 선언하면 no-unused-vars 경고가 난다.
const createNotificationMock = vi.hoisted(() => vi.fn<(input: unknown) => Promise<void>>(async () => {}))
const evaluateUsageBadgesMock = vi.hoisted(() =>
  vi.fn<(userId: string, metric: string, value: number) => Promise<{ id: string; name: string }[]>>(
    async () => []
  )
)
const buildEarnedBadgePayloadMock = vi.hoisted(() =>
  vi.fn<
    (
      client: unknown,
      ids: string[],
      userId: string
    ) => Promise<{
      earnedBadges: { id: string; name: string; description: string; imageUrl: string; rarity: 'common'; level: null; earnCount: number; type: 'activity' }[]
      earnedBadgesMore: number
      isFirstBadgeEver: boolean
    }>
  >(async (_client, ids) => ({
    earnedBadges: ids.map((id) => ({
      id,
      name: `badge-${id}`,
      description: '',
      imageUrl: '',
      rarity: 'common' as const,
      level: null,
      earnCount: 1,
      type: 'activity' as const,
    })),
    earnedBadgesMore: 0,
    isFirstBadgeEver: false,
  }))
)

vi.mock('@/lib/notifications', () => ({
  createNotification: (input: unknown) => createNotificationMock(input),
  dailyGroupKey: (type: string) => `daily:${type}`,
}))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  evaluateUsageBadges: (userId: string, metric: string, value: number) =>
    evaluateUsageBadgesMock(userId, metric, value),
}))
vi.mock('@/lib/strava/sync', () => ({
  buildEarnedBadgePayload: (client: unknown, ids: string[], userId: string) =>
    buildEarnedBadgePayloadMock(client, ids, userId),
}))

/** `user_follows` 한 테이블만 지원하는 최소 체인 — insert 1회 + count select 2회(양쪽 유저) */
function makeUserClient(userId: string) {
  const from = (table: string) => {
    if (table !== 'user_follows') {
      return { insert: async () => ({ error: null }) }
    }
    let filterCol: string | null = null
    const builder: Record<string, unknown> = {
      insert: async () => {
        if (state.insertError) return { error: state.insertError }
        return { error: null }
      },
      select: () => builder,
      eq: (col: string) => {
        filterCol = col
        return builder
      },
      then: (resolve: (v: unknown) => void) => {
        const count = filterCol === 'follower_id' ? state.followingCount : state.followerCount
        return Promise.resolve({ count, error: null }).then(resolve)
      },
    }
    return builder
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from,
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeUserClient(ACTOR_ID),
  createServiceClient: () => ({}),
}))

import { POST } from '../route'

function request(targetUserId: string | undefined): Request {
  return new Request('http://localhost/api/follows', {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId }),
  })
}

beforeEach(() => {
  state.followingCount = 0
  state.followerCount = 0
  state.insertError = null
  vi.clearAllMocks()
  evaluateUsageBadgesMock.mockResolvedValue([])
  buildEarnedBadgePayloadMock.mockImplementation(async (_client: unknown, ids: string[]) => ({
    earnedBadges: ids.map((id) => ({
      id,
      name: `badge-${id}`,
      description: '',
      imageUrl: '',
      rarity: 'common' as const,
      level: null,
      earnCount: 1,
      type: 'activity' as const,
    })),
    earnedBadgesMore: 0,
    isFirstBadgeEver: false,
  }))
})

describe('POST /api/follows — 신규 팔로우 성공', () => {
  it('양쪽 유저를 각자의 지표로 평가한다 — following_count(본인)·follower_count(상대)', async () => {
    state.followingCount = 7
    state.followerCount = 42

    await POST(request(TARGET_ID))

    expect(evaluateUsageBadgesMock).toHaveBeenCalledWith(ACTOR_ID, 'following_count', 7)
    expect(evaluateUsageBadgesMock).toHaveBeenCalledWith(TARGET_ID, 'follower_count', 42)
    expect(evaluateUsageBadgesMock).toHaveBeenCalledTimes(2)
  })

  it('응답에 팔로우한 사람 본인이 획득한 배지만 earnedBadges로 담는다', async () => {
    evaluateUsageBadgesMock.mockImplementation(async (userId: string, metric: string) => {
      if (userId === ACTOR_ID && metric === 'following_count') return [{ id: 'b-actor', name: '내 배지' }]
      if (userId === TARGET_ID && metric === 'follower_count') return [{ id: 'b-target', name: '상대 배지' }]
      return []
    })

    const res = await POST(request(TARGET_ID))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    // 팔로우당한 사람(TARGET_ID)이 획득한 배지(b-target)는 응답에 실리지 않는다
    expect(body.earnedBadges).toEqual([
      expect.objectContaining({ id: 'b-actor' }),
    ])
    expect(body.earnedBadges.some((b: { id: string }) => b.id === 'b-target')).toBe(false)
  })

  it('획득한 배지가 없으면 earnedBadges는 빈 배열이지만 필드 자체는 항상 존재한다', async () => {
    const res = await POST(request(TARGET_ID))
    const body = await res.json()
    expect(body.earnedBadges).toEqual([])
  })

  // SyncButton(/api/strava/sync)과 동일한 계약을 맞춘다 — buildEarnedBadgePayload가 계산한
  // earnedBadgesMore·isFirstBadgeEver가 응답에서 누락되던 결함 (티켓 20260910_2056).
  it('buildEarnedBadgePayload의 earnedBadgesMore를 응답에 그대로 싣는다', async () => {
    evaluateUsageBadgesMock.mockImplementation(async (userId: string, metric: string) => {
      if (userId === ACTOR_ID && metric === 'following_count') return [{ id: 'b-actor', name: '내 배지' }]
      return []
    })
    buildEarnedBadgePayloadMock.mockResolvedValueOnce({
      earnedBadges: [
        {
          id: 'b-actor',
          name: 'badge-b-actor',
          description: '',
          imageUrl: '',
          rarity: 'common' as const,
          level: null,
          earnCount: 1,
          type: 'activity' as const,
        },
      ],
      earnedBadgesMore: 3,
      isFirstBadgeEver: false,
    })

    const res = await POST(request(TARGET_ID))
    const body = await res.json()

    expect(body.earnedBadgesMore).toBe(3)
  })

  it('buildEarnedBadgePayload의 isFirstBadgeEver를 응답에 그대로 싣는다', async () => {
    evaluateUsageBadgesMock.mockImplementation(async (userId: string, metric: string) => {
      if (userId === ACTOR_ID && metric === 'following_count') return [{ id: 'b-actor', name: '내 배지' }]
      return []
    })
    buildEarnedBadgePayloadMock.mockResolvedValueOnce({
      earnedBadges: [
        {
          id: 'b-actor',
          name: 'badge-b-actor',
          description: '',
          imageUrl: '',
          rarity: 'common' as const,
          level: null,
          earnCount: 1,
          type: 'activity' as const,
        },
      ],
      earnedBadgesMore: 0,
      isFirstBadgeEver: true,
    })

    const res = await POST(request(TARGET_ID))
    const body = await res.json()

    expect(body.isFirstBadgeEver).toBe(true)
  })
})

describe('POST /api/follows — 배지 평가 실패는 팔로우 응답을 막지 않는다', () => {
  it('following_count 평가가 예외를 던져도 200 + ok:true는 그대로다', async () => {
    evaluateUsageBadgesMock.mockImplementation(async (userId: string) => {
      if (userId === ACTOR_ID) throw new Error('DB 장애')
      return []
    })

    const res = await POST(request(TARGET_ID))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.earnedBadges).toEqual([])
    // 반대편(TARGET_ID) 평가는 격리돼 있어 여전히 호출된다
    expect(evaluateUsageBadgesMock).toHaveBeenCalledWith(TARGET_ID, 'follower_count', 0)
  })

  it('follower_count 평가가 예외를 던져도 응답과 following_count 평가에 영향을 주지 않는다', async () => {
    evaluateUsageBadgesMock.mockImplementation(async (userId: string) => {
      if (userId === TARGET_ID) throw new Error('DB 장애')
      return [{ id: 'b-actor', name: '내 배지' }]
    })

    const res = await POST(request(TARGET_ID))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.earnedBadges).toEqual([expect.objectContaining({ id: 'b-actor' })])
  })
})

describe('POST /api/follows — 중복 팔로우는 평가를 트리거하지 않는다', () => {
  it('23505(unique 위반)는 already:true를 반환하고 배지 평가를 호출하지 않는다', async () => {
    state.insertError = { code: '23505' }

    const res = await POST(request(TARGET_ID))
    const body = await res.json()

    expect(body).toEqual({ ok: true, already: true })
    expect(evaluateUsageBadgesMock).not.toHaveBeenCalled()
  })
})
