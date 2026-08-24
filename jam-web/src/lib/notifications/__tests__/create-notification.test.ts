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
    await createNotification({
      userId: 'u-1',
      type: 'followed',
      actorUserId: 'u-2',
      payload: { actor_ids: ['u-2'] },
      appendKeys: ['actor_ids'],
    })
    const args = lastRpcArgs()
    expect(args.p_actor_user_id).toBe('u-2')
    // 닉네임이 아니라 id만 담는다 (렌더 시점에 조인)
    expect(args.p_payload).toEqual({ actor_ids: ['u-2'] })
  })

  it('appendKeys를 p_append_keys로 넘긴다 — 생략하면 null', async () => {
    await createNotification({
      userId: 'u-1',
      type: 'drop_picked_up',
      actorUserId: 'u-2',
      groupKey: 'drop_picked_up:2026-08-25-H0',
      payload: { actor_ids: ['u-2'], badge_ids: ['b-1'], badge_name: '배지', poi_id: 'p-1' },
      appendKeys: ['actor_ids', 'badge_ids'],
    })
    expect(lastRpcArgs().p_append_keys).toEqual(['actor_ids', 'badge_ids'])

    await createNotification({ userId: 'u-1', type: 'mission_completed' })
    expect(lastRpcArgs().p_append_keys).toBeNull()
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


/**
 * 묶음 병합 시맨틱 — `create_notification()`(096)을 TS로 모사한 테스트.
 *
 * 실제 병합은 SQL에서 일어나므로 **이 모사가 SQL과 어긋날 수 있다.** SQL 자체의 검증은
 * `supabase/tests/096_notifications_merge.test.sql`이 담당한다(마이그레이션 적용 후 1회 실행).
 * 여기서 잡으려는 것은 **호출부가 규칙대로 인자를 넘기는지**다 — appendKeys를 빠뜨리거나
 * payload를 배열이 아닌 스칼라로 넘기면 아래 기대값이 무너진다.
 */
type FakeRow = {
  user_id: string
  type: string
  actor_user_id: string | null
  actor_count: number
  group_key: string | null
  payload: Record<string, unknown>
  bumps_badge: boolean
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** 096의 jsonb_merge_sum() 모사 — 얕은 덮어쓰기 + 숫자 합산 + 배열 누적(중복 제거) */
function mergePayload(
  oldPayload: Record<string, unknown>,
  newPayload: Record<string, unknown>,
  sumKeys: string[] | null,
  appendKeys: string[] | null
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...oldPayload, ...newPayload }

  for (const key of sumKeys ?? []) {
    if (key in oldPayload && key in newPayload) {
      merged[key] = Number(oldPayload[key]) + Number(newPayload[key])
    }
  }

  for (const key of appendKeys ?? []) {
    const before = asArray(oldPayload[key])
    const incoming = asArray(newPayload[key])
    if (before.length === 0 && incoming.length === 0) continue

    const seen = new Set<string>()
    const out: unknown[] = []
    for (const value of [...before, ...incoming]) {
      const id = JSON.stringify(value)
      if (seen.has(id)) continue
      seen.add(id)
      out.push(value)
    }
    merged[key] = out
  }

  return merged
}

/** 096의 create_notification() 모사 — group_key 단위 UPSERT + actor_count 재계산 */
function makeFakeDb() {
  const rows = new Map<string, FakeRow>()

  function actorCountOf(payload: Record<string, unknown>, fallback: number): number {
    const ids = payload.actor_ids
    if (Array.isArray(ids)) return Math.max(ids.length, 1)
    return fallback
  }

  function call(args: Record<string, unknown>): FakeRow {
    const userId = args.p_user_id as string
    const groupKey = args.p_group_key as string | null
    const incoming = (args.p_payload ?? {}) as Record<string, unknown>
    const sumKeys = (args.p_sum_keys ?? null) as string[] | null
    const appendKeys = (args.p_append_keys ?? null) as string[] | null
    const actorUserId = (args.p_actor_user_id ?? null) as string | null

    const normalized = mergePayload({}, incoming, null, appendKeys)
    const fresh: FakeRow = {
      user_id: userId,
      type: args.p_type as string,
      actor_user_id: actorUserId,
      actor_count: actorCountOf(normalized, 1),
      group_key: groupKey,
      payload: normalized,
      bumps_badge: args.p_bumps_badge as boolean,
    }

    if (groupKey === null) return fresh

    const mapKey = `${userId}|${groupKey}`
    const existing = rows.get(mapKey)
    if (!existing) {
      rows.set(mapKey, fresh)
      return fresh
    }

    if (args.p_mode === 'once') return existing

    const payload = mergePayload(existing.payload, incoming, sumKeys, appendKeys)
    const updated: FakeRow = {
      ...existing,
      payload,
      actor_user_id: actorUserId ?? existing.actor_user_id,
      actor_count: actorCountOf(
        payload,
        actorUserId !== null ? existing.actor_count + 1 : existing.actor_count
      ),
    }
    rows.set(mapKey, updated)
    return updated
  }

  return { call, rows }
}

describe('묶음 병합 — actor_count는 병합 횟수가 아니라 고유 인원이다', () => {
  let db: ReturnType<typeof makeFakeDb>
  let last: FakeRow

  beforeEach(() => {
    db = makeFakeDb()
    rpcMock.mockReset()
    rpcMock.mockImplementation((_fn: string, args: Record<string, unknown>) => {
      last = db.call(args)
      return Promise.resolve({ data: last, error: null })
    })
  })

  /** #13 픽업됨 — 실제 라우트가 넘기는 인자와 같은 모양 */
  async function pickup(dropperId: string, pickerId: string, badgeId: string, badgeName: string) {
    await createNotification({
      userId: dropperId,
      type: 'drop_picked_up',
      actorUserId: pickerId,
      groupKey: 'drop_picked_up:2026-08-25-H0',
      payload: { actor_ids: [pickerId], badge_ids: [badgeId], badge_name: badgeName, poi_id: 'poi-1' },
      appendKeys: ['actor_ids', 'badge_ids'],
    })
  }

  it('#13 — 한 사람이 6시간 창에서 3건을 픽업해도 인원은 1명이다', async () => {
    await pickup('owner', 'picker-a', 'badge-1', '배지1')
    await pickup('owner', 'picker-a', 'badge-2', '배지2')
    await pickup('owner', 'picker-a', 'badge-3', '배지3')

    // 병합 횟수를 세면 3 → "예린님 외 2명"이라는 거짓말이 된다
    expect(last.actor_count).toBe(1)
    expect(last.payload.actor_ids).toEqual(['picker-a'])
  })

  it('#13 — badge_ids가 6시간 창에서 누적된다 (얕은 병합이면 마지막 1개만 남는다)', async () => {
    await pickup('owner', 'picker-a', 'badge-1', '배지1')
    await pickup('owner', 'picker-a', 'badge-2', '배지2')
    await pickup('owner', 'picker-a', 'badge-3', '배지3')

    expect(last.payload.badge_ids).toEqual(['badge-1', 'badge-2', 'badge-3'])
    // 얕은 병합 대상은 최신 값 — badge_ids가 1개일 때만 렌더에 쓴다
    expect(last.payload.badge_name).toBe('배지3')
  })

  it('#13 — 서로 다른 사람이 픽업하면 인원이 늘고, 같은 배지 id는 중복 제거된다', async () => {
    await pickup('owner', 'picker-a', 'badge-1', '배지1')
    await pickup('owner', 'picker-b', 'badge-1', '배지1')

    expect(last.actor_count).toBe(2)
    expect(last.payload.actor_ids).toEqual(['picker-a', 'picker-b'])
    expect(last.payload.badge_ids).toEqual(['badge-1'])
    // 대표 아바타는 가장 최근 행위자
    expect(last.actor_user_id).toBe('picker-b')
  })

  it('#26 — 언팔 후 재팔로우가 인원을 부풀리지 않는다', async () => {
    const follow = (actorId: string) =>
      createNotification({
        userId: 'target',
        type: 'followed',
        actorUserId: actorId,
        groupKey: 'followed:2026-08-25',
        payload: { actor_ids: [actorId] },
        appendKeys: ['actor_ids'],
      })

    await follow('u-a')
    await follow('u-a')
    expect(last.actor_count).toBe(1)

    await follow('u-b')
    expect(last.actor_count).toBe(2)
    expect(last.payload.actor_ids).toEqual(['u-a', 'u-b'])
  })

  it('행위자가 없는 묶음(#1 활동배지)은 actor_ids를 쓰지 않고 actor_count도 늘지 않는다', async () => {
    const earn = (ids: string[]) =>
      createNotification({
        userId: 'u-1',
        type: 'badge_earned',
        groupKey: 'badge_earned:sync:42',
        payload: { badge_ids: ids, count: ids.length },
        appendKeys: ['badge_ids'],
      })

    await earn(['b-1', 'b-2'])
    await earn(['b-3'])

    expect(last.actor_count).toBe(1)
    expect(last.payload.actor_ids).toBeUndefined()
    // 개수는 payload.count가 아니라 배열 길이로 렌더한다 (count는 이번 이벤트분)
    expect(last.payload.badge_ids).toEqual(['b-1', 'b-2', 'b-3'])
  })

  it('appendKeys를 빠뜨리면 배열이 통째로 덮어써진다 — 왜 필요한지에 대한 대조군', async () => {
    await createNotification({
      userId: 'owner',
      type: 'drop_picked_up',
      actorUserId: 'picker-a',
      groupKey: 'drop_picked_up:2026-08-25-H0',
      payload: { actor_ids: ['picker-a'], badge_ids: ['badge-1'], badge_name: '배지1', poi_id: 'p' },
    })
    await createNotification({
      userId: 'owner',
      type: 'drop_picked_up',
      actorUserId: 'picker-b',
      groupKey: 'drop_picked_up:2026-08-25-H0',
      payload: { actor_ids: ['picker-b'], badge_ids: ['badge-2'], badge_name: '배지2', poi_id: 'p' },
    })

    expect(last.payload.badge_ids).toEqual(['badge-2'])
    expect(last.payload.actor_ids).toEqual(['picker-b'])
  })

  it('sumKeys는 그대로 동작한다 (#5 포인트 하루 합계)', async () => {
    const earn = (amount: number) =>
      createNotification({
        userId: 'u-1',
        type: 'points_earned',
        groupKey: 'points_earned:2026-08-25',
        payload: { amount, reason: 'badge_point_reward' },
        sumKeys: ['amount'],
      })

    await earn(250)
    await earn(300)
    expect(last.payload.amount).toBe(550)
  })
})
