/**
 * 믹스 결과 아이템 배지의 배지 포인트 후속 처리 (티켓 20261019_1314 2회, 운영 로직 14.1절)
 *
 * 고정하는 것:
 *  - 열린 개체는 배지의 `point_reward`를 `badge_point_reward`로 한 번 주고(`sourceBadgeId`), 지급 뒤에 `point_awarded_at`을 적는다
 *  - 같은 배지의 개체가 둘이면 일련번호마다 한 번씩 준다
 *  - 이미 지급된 개체(`point_awarded_at`이 있음)·잠긴 개체·포인트 0인 배지는 지급 호출이 없다
 *  - 개체가 없으면 아무것도 읽지 않는다
 *  - 지급이 실패한 개체는 표시하지 않고 다음 개체를 이어 간다
 *  - 조회 실패·예외·표시 실패는 던지지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/result-point-follow-up.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'

const USER = 'user-1'

const state = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  badges: [] as Record<string, unknown>[],
  itemError: null as { message: string } | null,
  badgeError: null as { message: string } | null,
  markError: null as { message: string } | null,
  reads: [] as string[],
  marks: [] as { values: Record<string, unknown>; id: unknown }[],
}))

const awardPointsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/points', () => ({
  awardPoints: (...args: unknown[]) => awardPointsMock(...args),
}))

const supabase = {
  from: (table: string) => {
    let inIds: string[] = []
    let updateValues: Record<string, unknown> | null = null
    let eqValue: unknown
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.in = (_col: string, ids: string[]) => {
      inIds = ids
      return builder
    }
    builder.update = (values: Record<string, unknown>) => {
      updateValues = values
      return builder
    }
    builder.eq = (_col: string, value: unknown) => {
      eqValue = value
      return builder
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      if (updateValues) {
        state.marks.push({ values: updateValues, id: eqValue })
        return resolve({ error: state.markError })
      }
      state.reads.push(table)
      if (table === 'inventory_items') {
        return resolve({
          data: state.itemError ? null : state.items.filter((i) => inIds.includes(i.id as string)),
          error: state.itemError,
        })
      }
      return resolve({
        data: state.badgeError ? null : state.badges.filter((b) => inIds.includes(b.id as string)),
        error: state.badgeError,
      })
    }
    return builder
  },
} as unknown as ReturnType<typeof createServiceClient>

import { followUpCombineResultPoints } from '../resultPointFollowUp'

function item(id: string, badgeId: string, overrides: Record<string, unknown> = {}) {
  return { id, badge_id: badgeId, locked: false, point_awarded_at: null, ...overrides }
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.items = []
  state.badges = []
  state.itemError = null
  state.badgeError = null
  state.markError = null
  state.reads = []
  state.marks = []
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue({ id: 'tx' })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('followUpCombineResultPoints — 열린 개체의 배지 포인트', () => {
  it('열린 개체는 배지 포인트를 한 번 주고 지급 뒤에 point_awarded_at을 적는다', async () => {
    state.items = [item('ii-1', 'badge-1')]
    state.badges = [{ id: 'badge-1', point_reward: 10 }]

    await followUpCombineResultPoints(supabase, USER, ['ii-1'])

    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 10, 'badge_point_reward', { sourceBadgeId: 'badge-1' })
    expect(state.marks).toHaveLength(1)
    expect(state.marks[0].id).toBe('ii-1')
    expect(typeof state.marks[0].values.point_awarded_at).toBe('string')
  })

  it('같은 배지의 개체가 둘이면 일련번호마다 한 번씩 준다', async () => {
    state.items = [item('ii-1', 'badge-1'), item('ii-2', 'badge-1')]
    state.badges = [{ id: 'badge-1', point_reward: 10 }]

    await followUpCombineResultPoints(supabase, USER, ['ii-1', 'ii-2'])

    expect(awardPointsMock).toHaveBeenCalledTimes(2)
    expect(state.marks.map((m) => m.id)).toEqual(['ii-1', 'ii-2'])
  })

  it('배지마다 자기 포인트를 준다', async () => {
    state.items = [item('ii-1', 'badge-1'), item('ii-2', 'badge-2')]
    state.badges = [
      { id: 'badge-1', point_reward: 10 },
      { id: 'badge-2', point_reward: 20 },
    ]

    await followUpCombineResultPoints(supabase, USER, ['ii-1', 'ii-2'])

    expect(awardPointsMock.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      [10, { sourceBadgeId: 'badge-1' }],
      [20, { sourceBadgeId: 'badge-2' }],
    ])
  })

  it('이미 포인트를 준 개체(point_awarded_at이 있음)는 다시 주지 않는다', async () => {
    state.items = [item('ii-1', 'badge-1', { point_awarded_at: '2026-10-20T00:00:00.000Z' })]
    state.badges = [{ id: 'badge-1', point_reward: 10 }]

    await followUpCombineResultPoints(supabase, USER, ['ii-1'])

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(state.marks).toEqual([])
  })

  it('잠긴 개체는 주지 않는다(열 때 locked_item_open이 준다)', async () => {
    state.items = [item('ii-1', 'badge-1', { locked: true })]
    state.badges = [{ id: 'badge-1', point_reward: 10 }]

    await followUpCombineResultPoints(supabase, USER, ['ii-1'])

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(state.marks).toEqual([])
  })

  it('열린 개체와 잠긴 개체가 섞이면 열린 개체만 준다', async () => {
    state.items = [item('ii-1', 'badge-1', { locked: true }), item('ii-2', 'badge-1')]
    state.badges = [{ id: 'badge-1', point_reward: 10 }]

    await followUpCombineResultPoints(supabase, USER, ['ii-1', 'ii-2'])

    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(state.marks.map((m) => m.id)).toEqual(['ii-2'])
  })

  it('포인트가 0이거나 비어 있는 배지는 지급을 부르지 않고 표시도 하지 않는다', async () => {
    state.items = [item('ii-1', 'badge-zero'), item('ii-2', 'badge-null')]
    state.badges = [
      { id: 'badge-zero', point_reward: 0 },
      { id: 'badge-null', point_reward: null },
    ]

    await followUpCombineResultPoints(supabase, USER, ['ii-1', 'ii-2'])

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(state.marks).toEqual([])
  })

  it('받은 개체가 없으면 아무것도 읽지 않는다', async () => {
    await followUpCombineResultPoints(supabase, USER, [])

    expect(state.reads).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('열린 개체가 하나도 없으면 배지를 읽지 않는다', async () => {
    state.items = [item('ii-1', 'badge-1', { locked: true })]

    await followUpCombineResultPoints(supabase, USER, ['ii-1'])

    expect(state.reads).toEqual(['inventory_items'])
  })
})

describe('followUpCombineResultPoints — 실패는 던지지 않는다', () => {
  it('지급이 실패한 개체는 표시하지 않고 다음 개체를 이어 간다', async () => {
    state.items = [item('ii-1', 'badge-1'), item('ii-2', 'badge-2')]
    state.badges = [
      { id: 'badge-1', point_reward: 10 },
      { id: 'badge-2', point_reward: 20 },
    ]
    awardPointsMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'tx' })

    await followUpCombineResultPoints(supabase, USER, ['ii-1', 'ii-2'])

    expect(awardPointsMock).toHaveBeenCalledTimes(2)
    expect(state.marks.map((m) => m.id)).toEqual(['ii-2'])
  })

  it('지급이 던져도 삼키고 로그만 남긴다', async () => {
    state.items = [item('ii-1', 'badge-1')]
    state.badges = [{ id: 'badge-1', point_reward: 10 }]
    awardPointsMock.mockRejectedValue(new Error('포인트 장애'))

    await expect(followUpCombineResultPoints(supabase, USER, ['ii-1'])).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(state.marks).toEqual([])
  })

  it('개체 조회가 실패하면 지급하지 않고 던지지 않는다', async () => {
    state.itemError = { message: 'db down' }

    await expect(followUpCombineResultPoints(supabase, USER, ['ii-1'])).resolves.toBeUndefined()

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('배지 조회가 실패하면 지급하지 않고 던지지 않는다', async () => {
    state.items = [item('ii-1', 'badge-1')]
    state.badgeError = { message: 'db down' }

    await expect(followUpCombineResultPoints(supabase, USER, ['ii-1'])).resolves.toBeUndefined()

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('지급 표시가 실패해도 던지지 않고 다음 개체를 이어 간다', async () => {
    state.items = [item('ii-1', 'badge-1'), item('ii-2', 'badge-1')]
    state.badges = [{ id: 'badge-1', point_reward: 10 }]
    state.markError = { message: 'update failed' }

    await expect(followUpCombineResultPoints(supabase, USER, ['ii-1', 'ii-2'])).resolves.toBeUndefined()

    expect(awardPointsMock).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })
})
