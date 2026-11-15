/**
 * lib/chapter/signup-reward — 가입 완료 배지 «JAM!» 지급 (티켓 20261115_2056)
 *
 * 고정하는 것:
 * - 새로 넣은 경우에만 배지 정보 조회 → 챕터 점수 → 포인트(`point_reward` > 0일 때) → 피드 순서로 부수효과가 난다.
 * - 23505(이미 보유)면 포인트·점수·피드를 하지 않는다(재호출 멱등). 다른 insert 오류도 부수효과 없이 null이다.
 * - 배지 정보 조회 실패는 지급 성공으로 보되 점수·포인트·피드를 생략한다.
 * - `triggered_by`는 기존 값 `'onboarding_quest'`를 유지한다.
 * - 절대 던지지 않는다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/signup-reward.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { awardPointsMock, recordFeedEventMock, awardScoreMock } = vi.hoisted(() => ({
  awardPointsMock: vi.fn(async () => null),
  recordFeedEventMock: vi.fn(async () => {}),
  awardScoreMock: vi.fn(async () => ({ status: 'scored' })),
}))

vi.mock('@/lib/points', () => ({ awardPoints: awardPointsMock }))
vi.mock('@/lib/chapter/badgeReceive', () => ({ awardBadgeReceiveScore: awardScoreMock }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: recordFeedEventMock }))

import { grantSignupBadge, SIGNUP_COMPLETION_BADGE_ID } from '../signup-reward'

const USER_ID = 'user-signup-reward'
const BADGE_ROW = {
  name: 'JAM!',
  image_url: 'https://example.com/badge.png',
  rarity: null,
  point_reward: 100,
  type: 'activity',
  is_hidden: false,
  condition_json: { mission_reward: true },
}

function fakeClient(opts: {
  insertError?: { code?: string; message: string } | null
  insertThrows?: boolean
  badge?: typeof BADGE_ROW | null
  badgeError?: { message: string } | null
}) {
  const inserts: unknown[] = []
  const client = {
    from: (table: string) => {
      if (table === 'user_activity_badges') {
        return {
          insert: async (payload: unknown) => {
            inserts.push(payload)
            if (opts.insertThrows) throw new Error('network down')
            return { error: opts.insertError ?? null }
          },
        }
      }
      if (table === 'badges') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: opts.badge === undefined ? BADGE_ROW : opts.badge,
                  error: opts.badgeError ?? null,
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`예상치 못한 테이블 — ${table}`)
    },
  } as unknown as SupabaseClient
  return { client, inserts }
}

beforeEach(() => {
  vi.clearAllMocks()
  awardScoreMock.mockResolvedValue({ status: 'scored' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('grantSignupBadge', () => {
  it('고정 배지 id를 기존 triggered_by로 넣고 점수·포인트·피드를 한 번씩 남긴다', async () => {
    const { client, inserts } = fakeClient({})

    const result = await grantSignupBadge(client, USER_ID)

    expect(result).toBe(SIGNUP_COMPLETION_BADGE_ID)
    expect(SIGNUP_COMPLETION_BADGE_ID).toBe('cd20f271-9445-42cc-ac51-d8a96b25e1c3')
    expect(inserts).toEqual([{ user_id: USER_ID, badge_id: SIGNUP_COMPLETION_BADGE_ID, triggered_by: 'onboarding_quest' }])
    expect(awardScoreMock).toHaveBeenCalledTimes(1)
    expect(awardScoreMock).toHaveBeenCalledWith(client, {
      userId: USER_ID,
      badge: { id: SIGNUP_COMPLETION_BADGE_ID, type: 'activity', is_hidden: false, condition_json: { mission_reward: true } },
      origin: { triggeredBy: 'onboarding_quest' },
    })
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, 100, 'badge_point_reward', { sourceBadgeId: SIGNUP_COMPLETION_BADGE_ID })
    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock).toHaveBeenCalledWith(
      USER_ID,
      'badge_earned',
      expect.objectContaining({ badge_id: SIGNUP_COMPLETION_BADGE_ID, badge_name: 'JAM!', point_reward: 100 })
    )
  })

  it('point_reward가 0이면 포인트를 주지 않고 피드에도 point_reward를 싣지 않는다', async () => {
    const { client } = fakeClient({ badge: { ...BADGE_ROW, point_reward: 0 } })

    expect(await grantSignupBadge(client, USER_ID)).toBe(SIGNUP_COMPLETION_BADGE_ID)

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock.mock.calls[0]).toEqual([USER_ID, 'badge_earned', expect.not.objectContaining({ point_reward: expect.anything() })])
  })

  it('이미 보유(23505)면 재호출해도 점수·포인트·피드가 나가지 않고 null이다', async () => {
    const { client } = fakeClient({ insertError: { code: '23505', message: 'duplicate key' } })

    expect(await grantSignupBadge(client, USER_ID)).toBeNull()

    expect(awardScoreMock).not.toHaveBeenCalled()
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('23505가 아닌 insert 오류는 기록만 남기고 부수효과 없이 null이다', async () => {
    const { client } = fakeClient({ insertError: { code: '23503', message: 'fk violation' } })

    expect(await grantSignupBadge(client, USER_ID)).toBeNull()

    expect(console.error).toHaveBeenCalledWith('[grantSignupBadge] 배지 발급 오류:', 'fk violation')
    expect(awardScoreMock).not.toHaveBeenCalled()
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('배지 정보 조회가 실패하면 지급은 성공으로 보되 점수·포인트·피드를 생략한다', async () => {
    const { client } = fakeClient({ badge: null })

    expect(await grantSignupBadge(client, USER_ID)).toBe(SIGNUP_COMPLETION_BADGE_ID)

    expect(awardScoreMock).not.toHaveBeenCalled()
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('예외가 나도 던지지 않고 null이다', async () => {
    const { client } = fakeClient({ insertThrows: true })

    await expect(grantSignupBadge(client, USER_ID)).resolves.toBeNull()
    expect(console.error).toHaveBeenCalledWith('[grantSignupBadge] 예외:', expect.any(Error))
  })
})
