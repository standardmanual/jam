/**
 * 알림(소식) 목록/dot 판정에서 스테이징 전용 테스트 계정을 제외하는지 검증
 * 티켓 20260825_030 (027 후속 — `lib/env/test-accounts.ts`의 `excludedTestUserIds()` 재사용)
 *
 * ## 왜 두 지점을 각각 본다
 *
 * `listNotificationViews()`는 목록에 표시되는 행을 걸러내고, `latestBumpingNotificationAt()`은
 * 종의 빨간 점(dot) 판정을 담당한다. 목록만 거르고 dot 판정을 그대로 두면 "종에 빨간 점이
 * 떴는데 들어가면 새 소식이 안 보이는" 혼란이 생긴다 — 두 함수가 같은 기준으로 걸러야 한다.
 *
 * ## 왜 커서를 별도로 검증하는가
 *
 * 필터는 조회 **후** JS에서 적용한다(027과 동일한 이유 — SQL not-in은 이스케이프 리스크가
 * 있다). 커서는 필터 전 마지막 행 기준으로 고정해야 한다 — 필터로 화면에 보이는 행 수가
 * 줄어도, 다음 페이지 조회 시작 위치가 어긋나면 안 보이게 된 행 근처를 반복 조회하거나
 * 건너뛰는 문제가 생긴다.
 */
import { vi, beforeEach } from 'vitest'

const TEST_ACTOR = '00000000-0000-0000-0000-000000000001'

let excludedIds: string[]

vi.mock('@/lib/env/test-accounts', () => ({
  excludedTestUserIds: () => excludedIds,
}))

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
    order: self,
    or: self,
    lt: self,
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

import { listNotificationViews, latestBumpingNotificationAt } from '../feed'

function row(id: string, updatedAt: string, actorUserId: string | null) {
  return {
    id,
    user_id: 'u-1',
    type: 'follow',
    payload: {},
    actor_user_id: actorUserId,
    actor_count: 1,
    bumps_badge: true,
    group_key: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}

beforeEach(() => {
  excludedIds = [TEST_ACTOR]
  notificationsResult = { data: [], error: null }
})

describe('listNotificationViews — 테스트 계정 행위자 소식 제외', () => {
  it('actor_user_id가 제외 대상이면 목록에서 빠진다', async () => {
    notificationsResult = {
      data: [
        row('n-1', '2026-08-25T09:00:00+00:00', 'real-user-1'),
        row('n-2', '2026-08-25T08:00:00+00:00', TEST_ACTOR),
        row('n-3', '2026-08-25T07:00:00+00:00', 'real-user-2'),
      ],
      error: null,
    }

    const page = await listNotificationViews('u-1')
    expect(page.items.map((i) => i.id)).toEqual(['n-1', 'n-3'])
  })

  it('actor_user_id가 null인 시스템 소식은 필터되지 않는다', async () => {
    notificationsResult = {
      data: [row('n-1', '2026-08-25T09:00:00+00:00', null)],
      error: null,
    }
    const page = await listNotificationViews('u-1')
    expect(page.items.map((i) => i.id)).toEqual(['n-1'])
  })

  it('스테이징/로컬(excludedTestUserIds가 빈 배열)에서는 필터하지 않는다', async () => {
    excludedIds = []
    notificationsResult = {
      data: [row('n-1', '2026-08-25T09:00:00+00:00', TEST_ACTOR)],
      error: null,
    }
    const page = await listNotificationViews('u-1')
    expect(page.items.map((i) => i.id)).toEqual(['n-1'])
  })

  it('커서는 필터 전 마지막 행 기준 — 필터로 페이지가 줄어도 다음 페이지 조회가 끊기지 않는다', async () => {
    // limit=2 요청 → limit+1=3건 조회. 이번 페이지는 n-1, n-2(테스트 계정 행위자)이고
    // 커서는 n-2 기준으로 고정돼야 한다. 화면엔 n-1만 남지만 nextCursor는 그대로 n-2를 가리킨다.
    const at1 = '2026-08-25T09:00:00+00:00'
    const at2 = '2026-08-25T08:00:00+00:00'
    const at3 = '2026-08-25T07:00:00+00:00'
    notificationsResult = {
      data: [
        row('n-1', at1, 'real-user-1'),
        row('n-2', at2, TEST_ACTOR),
        row('n-3', at3, 'real-user-2'),
      ],
      error: null,
    }

    const page = await listNotificationViews('u-1', null, 2)
    expect(page.items.map((i) => i.id)).toEqual(['n-1'])
    expect(page.nextCursor).toBe(`${at2}|n-2`)
  })
})

describe('latestBumpingNotificationAt — dot 판정도 테스트 계정 행위자를 건너뛴다', () => {
  it('최신 행이 테스트 계정 행위자면 건너뛰고 다음 유효 행의 updated_at을 반환한다', async () => {
    notificationsResult = {
      data: [
        row('n-1', '2026-08-25T09:00:00+00:00', TEST_ACTOR),
        row('n-2', '2026-08-25T08:00:00+00:00', 'real-user-1'),
      ],
      error: null,
    }
    const at = await latestBumpingNotificationAt('u-1')
    expect(at).toBe('2026-08-25T08:00:00+00:00')
  })

  it('제외 대상이 최근 여러 건 연속이어도 다음 유효 행을 찾는다', async () => {
    notificationsResult = {
      data: [
        row('n-1', '2026-08-25T09:00:00+00:00', TEST_ACTOR),
        row('n-2', '2026-08-25T08:30:00+00:00', TEST_ACTOR),
        row('n-3', '2026-08-25T08:00:00+00:00', TEST_ACTOR),
        row('n-4', '2026-08-25T07:00:00+00:00', 'real-user-1'),
      ],
      error: null,
    }
    const at = await latestBumpingNotificationAt('u-1')
    expect(at).toBe('2026-08-25T07:00:00+00:00')
  })

  it('조회 범위 안에 유효 행이 없으면 null을 반환한다', async () => {
    notificationsResult = {
      data: [row('n-1', '2026-08-25T09:00:00+00:00', TEST_ACTOR)],
      error: null,
    }
    const at = await latestBumpingNotificationAt('u-1')
    expect(at).toBeNull()
  })

  it('스테이징/로컬에서는 필터하지 않고 최신 행을 그대로 반환한다', async () => {
    excludedIds = []
    notificationsResult = {
      data: [row('n-1', '2026-08-25T09:00:00+00:00', TEST_ACTOR)],
      error: null,
    }
    const at = await latestBumpingNotificationAt('u-1')
    expect(at).toBe('2026-08-25T09:00:00+00:00')
  })
})
