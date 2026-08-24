/**
 * createNotification() — RPC 인자 계약 + 실패 격리
 * 티켓 20260824_019
 *
 * 묶음 병합(`actor_count + 1`, payload 합산)의 **실제 증분은 SQL 쪽**
 * (마이그레이션 096의 `create_notification()`)에서 일어난다. 여기서는 그 함수에
 * 넘어가는 인자가 규칙대로 만들어지는지, 그리고 **실패가 호출부로 새어나가지 않는지**를
 * 검증한다. SQL 병합 자체는 마이그레이션 적용 후 통합 확인 대상이다.
 */
import { vi, beforeEach, afterEach } from 'vitest'

const rpcMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc: rpcMock,
    from: () => ({ upsert: upsertMock }),
  }),
}))

import { createNotification, recordPoiView } from '../index'

function lastRpcArgs(): Record<string, unknown> {
  return rpcMock.mock.calls[rpcMock.mock.calls.length - 1][1] as Record<string, unknown>
}

describe('createNotification — RPC 인자', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    rpcMock.mockResolvedValue({ data: { id: 'n-1' }, error: null })
  })

  it('bumps_badge를 호출부가 아니라 type에서 파생한다', async () => {
    await createNotification({ userId: 'u-1', type: 'badge_earned' })
    expect(lastRpcArgs().p_bumps_badge).toBe(false)

    await createNotification({ userId: 'u-1', type: 'drop_picked_up' })
    expect(lastRpcArgs().p_bumps_badge).toBe(true)
  })

  it('기본 모드는 merge — group_key가 있으면 기존 묶음에 합쳐진다', async () => {
    await createNotification({
      userId: 'u-1',
      type: 'points_earned',
      groupKey: 'points_earned:2026-08-25',
      sumKeys: ['amount'],
      payload: { amount: 250, reason: 'badge_point_reward' },
    })
    const args = lastRpcArgs()
    expect(args.p_mode).toBe('merge')
    expect(args.p_group_key).toBe('points_earned:2026-08-25')
    expect(args.p_sum_keys).toEqual(['amount'])
    expect(args.p_payload).toEqual({ amount: 250, reason: 'badge_point_reward' })
  })

  it('once 모드는 그대로 전달된다 (구간당 1회 소식)', async () => {
    await createNotification({
      userId: 'u-1',
      type: 'mission_milestone',
      groupKey: 'mission_milestone:m-1:50',
      mode: 'once',
      payload: { mission_id: 'm-1', mission_title: '한강 100km', current: 52, target: 100, unit: 'km', milestone: 50 },
    })
    expect(lastRpcArgs().p_mode).toBe('once')
  })

  it('group_key·actor_user_id를 생략하면 null로 넘어간다 (항상 새 행)', async () => {
    await createNotification({ userId: 'u-1', type: 'mission_completed' })
    const args = lastRpcArgs()
    expect(args.p_group_key).toBeNull()
    expect(args.p_actor_user_id).toBeNull()
    expect(args.p_payload).toEqual({})
  })

  it('닉네임을 payload에 넣지 않고 actor_user_id로만 사람을 가리킨다', async () => {
    await createNotification({ userId: 'u-1', type: 'followed', actorUserId: 'u-2' })
    const args = lastRpcArgs()
    expect(args.p_actor_user_id).toBe('u-2')
    expect(args.p_payload).toEqual({})
  })
})

describe('createNotification — 실패가 본 트랜잭션을 깨뜨리지 않는다', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    rpcMock.mockReset()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('RPC가 오류를 반환해도 예외를 던지지 않고 null을 반환한다 — 다만 로그는 남긴다', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await createNotification({ userId: 'u-1', type: 'badge_earned' })
    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('RPC가 예외를 던져도 삼키고 로그를 남긴다', async () => {
    rpcMock.mockRejectedValue(new Error('network down'))
    const result = await createNotification({ userId: 'u-1', type: 'badge_earned' })
    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('userId가 없으면 RPC를 호출하지 않고 로그만 남긴다', async () => {
    const result = await createNotification({ userId: '', type: 'badge_earned' })
    expect(result).toBeNull()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('recordPoiView — KST 날짜로 하루 1행', () => {
  beforeEach(() => {
    upsertMock.mockReset()
    upsertMock.mockResolvedValue({ error: null })
  })

  it('viewed_on을 KST 기준 날짜로 넣고 중복은 무시한다', async () => {
    const ok = await recordPoiView('poi-1', 'u-1', '2026-08-24T15:00:00Z')
    expect(ok).toBe(true)

    const [row, options] = upsertMock.mock.calls[0]
    // UTC로 계산하면 '2026-08-24'가 되어 하루 중복 억제가 어긋난다
    expect(row.viewed_on).toBe('2026-08-25')
    expect(row.poi_id).toBe('poi-1')
    expect(row.user_id).toBe('u-1')
    expect(options).toEqual({ onConflict: 'poi_id,user_id,viewed_on', ignoreDuplicates: true })
  })
})
