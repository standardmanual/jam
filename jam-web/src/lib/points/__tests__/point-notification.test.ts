/**
 * awardPoints() → 소식 #5(포인트 적립) / #44(운영진 지급·차감) 생성 규칙
 * 티켓 20260824_019 (3차 — 게이트 리뷰 FAIL 1)
 *
 * 검증 대상은 PRD §3 ①이 정한 #5의 트리거다:
 *   「`badge_point_reward` 중 **미션 보상 경유가 아닌 것**」
 *
 * `grantMissionRewards()`가 미션 보상 배지의 포인트도 같은 `badge_point_reward` reason으로
 * 지급하므로, reason만으로 판정하면 미션 완료 1건이 #5와 #22 두 줄로 보인다. 게다가 #5는
 * 하루 단위 `sumKeys:['amount']` 합산이라 금액 자체가 부풀려진다.
 */
import { vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}))

const createNotificationMock = vi.fn()
vi.mock('@/lib/notifications', () => ({
  createNotification: (input: unknown) => createNotificationMock(input),
  dailyGroupKey: (type: string) => `${type}:2026-08-24`,
}))

import { awardPoints } from '../index'

const USER = '00000000-0000-0000-0000-0000000000aa'
const BADGE = '00000000-0000-0000-0000-0000000000bb'
const MISSION = '00000000-0000-0000-0000-0000000000cc'

type NotifyInput = { type: string; groupKey?: string; sumKeys?: string[]; payload?: Record<string, unknown> }

function notifyCalls(): NotifyInput[] {
  return createNotificationMock.mock.calls.map((c) => c[0] as NotifyInput)
}

beforeEach(() => {
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: { id: 'tx-1' }, error: null })
  createNotificationMock.mockReset()
  createNotificationMock.mockResolvedValue(null)
})

describe('#5 포인트 적립 — 미션 보상 경유분은 제외한다', () => {
  it('미션 보상 배지의 포인트(sourceMissionId 있음)는 #5를 만들지 않는다', async () => {
    await awardPoints(USER, 500, 'badge_point_reward', {
      sourceBadgeId: BADGE,
      sourceMissionId: MISSION,
    })

    // #22(미션 완료 + 보상)가 이미 "배지 1개와 500P"로 이 보상을 전부 서술한다
    expect(notifyCalls().filter((c) => c.type === 'points_earned')).toHaveLength(0)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('미션을 거치지 않은 배지 포인트(동기화·드랍)는 여전히 #5를 만든다', async () => {
    await awardPoints(USER, 250, 'badge_point_reward', { sourceBadgeId: BADGE })

    const calls = notifyCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].type).toBe('points_earned')
    // 하루 단위 묶음 + amount 합산 (KST 기준 키)
    expect(calls[0].groupKey).toBe('points_earned:2026-08-24')
    expect(calls[0].sumKeys).toEqual(['amount'])
    expect(calls[0].payload).toEqual({ amount: 250, reason: 'badge_point_reward' })
  })

  it('원장에는 미션 귀속이 남는다 — award_points RPC에 p_source_mission_id를 넘긴다', async () => {
    await awardPoints(USER, 500, 'badge_point_reward', {
      sourceBadgeId: BADGE,
      sourceMissionId: MISSION,
    })

    const args = rpcMock.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_reason).toBe('badge_point_reward')
    expect(args.p_source_badge_id).toBe(BADGE)
    expect(args.p_source_mission_id).toBe(MISSION)
  })

  it('미션 자체 포인트(mission_point_reward)도 #5를 만들지 않는다', async () => {
    await awardPoints(USER, 300, 'mission_point_reward', { sourceMissionId: MISSION })
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('조합 보상(combine_pity_reward)도 #5를 만들지 않는다', async () => {
    await awardPoints(USER, 100, 'combine_pity_reward')
    expect(createNotificationMock).not.toHaveBeenCalled()
  })
})

describe('#44 운영진 지급·차감 — 묶지 않는다', () => {
  it('admin_grant는 group_key 없이 개별 행을 만든다', async () => {
    await awardPoints(USER, 1000, 'admin_grant', { adminReasonLabel: 'event_promotion' })

    const calls = notifyCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].type).toBe('admin_points_changed')
    expect(calls[0].groupKey).toBeUndefined()
    expect(calls[0].payload).toEqual({ amount: 1000, direction: 'grant', reason: 'event_promotion' })
  })

  it('admin_deduct는 절대값 + direction=deduct로 담는다', async () => {
    await awardPoints(USER, -300, 'admin_deduct', { adminReasonLabel: 'error_correction' })

    const calls = notifyCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].payload).toEqual({ amount: 300, direction: 'deduct', reason: 'error_correction' })
  })
})
