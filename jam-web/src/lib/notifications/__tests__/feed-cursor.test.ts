/**
 * 알림함 커서 페이지네이션 — (updated_at, id) 복합 커서 + 조회 실패 구분
 * 티켓 20260824_021 (2차 보강)
 *
 * ## 왜 복합 커서인가
 *
 * 마이그레이션 096의 `updated_at`은 `NOW()`(트랜잭션 시작 시각)다. 025 배치가 한
 * 트랜잭션에서 한 유저에게 여러 소식을 만들면 **값이 완전히 같은 행**이 여러 개 생기고,
 * `updated_at` 단일 키로 페이지를 넘기면 그 값이 경계에 걸리는 순간 동률 행들이 다음
 * 페이지에서 통째로 사라진다. 배포 직후에야 드러나는 종류의 버그라 테스트로 못 박는다.
 */
import { vi, beforeEach } from 'vitest'

interface QueryCalls {
  order: Array<[string, unknown]>
  or: string[]
  lt: Array<[string, unknown]>
}

let calls: QueryCalls
let notificationsResult: { data: unknown[] | null; error: unknown }

function builder(result: unknown) {
  const b: Record<string, unknown> = {}
  const self = () => b
  Object.assign(b, {
    select: self,
    eq: self,
    in: self,
    limit: self,
    maybeSingle: () => Promise.resolve(result),
    order: (col: string, opts: unknown) => {
      calls.order.push([col, opts])
      return b
    },
    or: (filter: string) => {
      calls.or.push(filter)
      return b
    },
    lt: (col: string, value: unknown) => {
      calls.lt.push([col, value])
      return b
    },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  })
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) =>
      table === 'notifications' ? builder(notificationsResult) : builder({ data: [], error: null }),
  }),
}))

import { listNotificationViews } from '../feed'

function row(id: string, updatedAt: string) {
  return {
    id,
    user_id: 'u-1',
    type: 'badge_earned',
    payload: { badge_ids: ['b1'] },
    actor_user_id: null,
    actor_count: 1,
    bumps_badge: false,
    group_key: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}

beforeEach(() => {
  calls = { order: [], or: [], lt: [] }
  notificationsResult = { data: [], error: null }
})

describe('커서 페이지네이션 — (updated_at, id)', () => {
  it('정렬 키가 곧 커서 키다 — updated_at 뒤에 id 타이브레이크가 붙는다', async () => {
    await listNotificationViews('u-1')
    expect(calls.order).toEqual([
      ['updated_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('다음 커서는 `updated_at|id` — 마지막 행의 두 값을 모두 담는다', async () => {
    const at = '2026-08-24T09:00:00+00:00'
    notificationsResult = { data: [row('n-1', at), row('n-2', at), row('n-3', at)], error: null }

    const page = await listNotificationViews('u-1', null, 2)
    expect(page.items.map((i) => i.id)).toEqual(['n-1', 'n-2'])
    expect(page.nextCursor).toBe(`${at}|n-2`)
    expect(page.failed).toBe(false)
  })

  it('동률 구간을 id로 이어서 자른다 — 같은 updated_at 행이 통째로 빠지지 않는다', async () => {
    const cursor = '2026-08-24T09:00:00+00:00|11111111-2222-3333-4444-555555555555'
    await listNotificationViews('u-1', cursor)

    expect(calls.or).toEqual([
      'updated_at.lt."2026-08-24T09:00:00+00:00",' +
        'and(updated_at.eq."2026-08-24T09:00:00+00:00",id.lt.11111111-2222-3333-4444-555555555555)',
    ])
    expect(calls.lt).toEqual([])
  })

  it('id가 없는 커서는 updated_at 단독 비교로 떨어진다', async () => {
    await listNotificationViews('u-1', '2026-08-24T09:00:00+00:00')
    expect(calls.lt).toEqual([['updated_at', '2026-08-24T09:00:00+00:00']])
    expect(calls.or).toEqual([])
  })

  it('망가진 커서는 쿼리를 태우지 않는다 — .or()는 PostgREST 필터 문법으로 파싱된다', async () => {
    const page = await listNotificationViews('u-1', '2026-08-24T09:00:00+00:00,user_id.neq.u-1|x')
    expect(calls.or).toEqual([])
    expect(calls.lt).toEqual([])
    expect(page.failed).toBe(true)
    expect(page.items).toEqual([])
  })
})

describe('조회 실패와 소식 0건은 다른 상태다', () => {
  it('실패는 failed: true — 빈 목록으로 위장하지 않는다', async () => {
    notificationsResult = { data: null, error: { message: 'boom' } }
    const page = await listNotificationViews('u-1')
    expect(page).toEqual({ items: [], nextCursor: null, failed: true })
  })

  it('진짜 0건은 failed: false', async () => {
    notificationsResult = { data: [], error: null }
    const page = await listNotificationViews('u-1')
    expect(page).toEqual({ items: [], nextCursor: null, failed: false })
  })
})
