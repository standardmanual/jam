/**
 * fieldMetrics.ts — 필드 마디 값 계산 (티켓 20261026_2027 2회차)
 *
 * 지키는 것: 기간 경계(시작 포함·끝 미포함), `manual_backfill` 제외, 운영자 지급 제외, 쓴 잼 합,
 * 어드민·테스트 계정 제외, 시스템 드랍은 유저 조건 없음.
 */
import { describe, it, expect } from 'vitest'
import { TEST_ACCOUNT_USER_IDS } from '@/lib/env/test-accounts'
import {
  countDrops,
  countedUserIdsOf,
  countPickups,
  countSyncedActivities,
  countSyncFailures,
  rollingWindow,
  sumJam,
  type DropRow,
} from '../fieldMetrics'

const NOW = new Date('2026-10-28T03:00:00.000Z')
const DAY = 86_400_000
const WINDOW = rollingWindow(NOW, 7)
const iso = (ms: number) => new Date(ms).toISOString()
const START = WINDOW.start

describe('rollingWindow', () => {
  it('지금부터 7×24시간 전까지다 (kpiWeekly와 같은 롤링 구간)', () => {
    expect(WINDOW.end).toBe(NOW.getTime())
    expect(WINDOW.start).toBe(NOW.getTime() - 7 * DAY)
  })
})

describe('countedUserIdsOf', () => {
  it('어드민과 테스트 계정을 뺀다', () => {
    const ids = countedUserIdsOf([
      { id: 'u1', is_admin: false },
      { id: 'admin', is_admin: true },
      { id: TEST_ACCOUNT_USER_IDS[0], is_admin: false },
    ])
    expect([...ids]).toEqual(['u1'])
  })
})

describe('countSyncedActivities', () => {
  const counted = new Set(['u1', 'u2'])

  it('기간 시작은 포함하고 끝(지금)은 포함하지 않는다', () => {
    const rows = [
      { user_id: 'u1', created_at: iso(START - 1), processed_via: 'webhook' },
      { user_id: 'u1', created_at: iso(START), processed_via: 'webhook' },
      { user_id: 'u1', created_at: iso(NOW.getTime() - 1), processed_via: 'webhook' },
      { user_id: 'u1', created_at: iso(NOW.getTime()), processed_via: 'webhook' },
    ]
    expect(countSyncedActivities(rows, counted, WINDOW)).toBe(2)
  })

  it('manual_backfill은 세지 않는다', () => {
    const rows = [
      { user_id: 'u1', created_at: iso(START + DAY), processed_via: 'manual_backfill' },
      { user_id: 'u1', created_at: iso(START + DAY), processed_via: 'cron' },
    ]
    expect(countSyncedActivities(rows, counted, WINDOW)).toBe(1)
  })

  it('대상 유저가 아닌 행(어드민·테스트 계정)은 세지 않는다', () => {
    const rows = [
      { user_id: 'admin', created_at: iso(START + DAY), processed_via: 'webhook' },
      { user_id: TEST_ACCOUNT_USER_IDS[0], created_at: iso(START + DAY), processed_via: 'webhook' },
      { user_id: 'u2', created_at: iso(START + DAY), processed_via: 'webhook' },
    ]
    expect(countSyncedActivities(rows, counted, WINDOW)).toBe(1)
  })
})

describe('countSyncFailures', () => {
  it('드랍 시도 실패는 동기화 실패에서 빼고 기간 밖은 세지 않는다', () => {
    const rows = [
      { occurred_at: iso(START + DAY), failure_type: 'token_refresh' },
      { occurred_at: iso(START + DAY), failure_type: 'drop_attempt_failed' },
      { occurred_at: iso(START - DAY), failure_type: 'token_refresh' },
    ]
    expect(countSyncFailures(rows, WINDOW)).toBe(1)
  })
})

describe('sumJam', () => {
  it('지급은 amount > 0이고 운영자 지급이 아닌 행의 합, 쓴 잼은 amount < 0 행의 합(양수)이다', () => {
    const rows = [
      { amount: 100, admin_user_id: null, created_at: iso(START + DAY) },
      { amount: 50, admin_user_id: null, created_at: iso(START + DAY) },
      { amount: 999, admin_user_id: 'admin-1', created_at: iso(START + DAY) },
      { amount: -30, admin_user_id: null, created_at: iso(START + DAY) },
      { amount: -20, admin_user_id: null, created_at: iso(START + DAY) },
      { amount: 0, admin_user_id: null, created_at: iso(START + DAY) },
    ]
    expect(sumJam(rows, WINDOW)).toEqual({ granted: 150, spent: 50 })
  })

  it('기간 밖 행은 합하지 않는다', () => {
    const rows = [
      { amount: 100, admin_user_id: null, created_at: iso(START - 1) },
      { amount: -10, admin_user_id: null, created_at: iso(NOW.getTime()) },
      { amount: 7, admin_user_id: null, created_at: iso(START) },
    ]
    expect(sumJam(rows, WINDOW)).toEqual({ granted: 7, spent: 0 })
  })
})

describe('드랍·픽업', () => {
  const counted = new Set(['u1'])
  const drop = (over: Partial<DropRow>): DropRow => ({
    source: 'user',
    dropper_user_id: 'u1',
    picked_up_by: null,
    dropped_at: iso(START + DAY),
    picked_up_at: null,
    ...over,
  })

  it('시스템 드랍은 유저 조건 없이 센다 (놓은 유저가 없다)', () => {
    const rows = [
      drop({ source: 'system', dropper_user_id: null }),
      drop({ source: 'system', dropper_user_id: null, dropped_at: iso(START - 1) }),
      drop({ source: 'user' }),
    ]
    expect(countDrops(rows, 'system', WINDOW, counted)).toBe(1)
  })

  it('유저 드랍은 대상 유저가 놓은 것만 센다', () => {
    const rows = [
      drop({ dropper_user_id: 'u1' }),
      drop({ dropper_user_id: 'admin' }),
      drop({ dropper_user_id: TEST_ACCOUNT_USER_IDS[0] }),
      drop({ dropper_user_id: null }),
      drop({ source: 'system', dropper_user_id: 'u1' }),
    ]
    expect(countDrops(rows, 'user', WINDOW, counted)).toBe(1)
  })

  it('픽업은 picked_up_at이 기간 안이고 주운 유저가 대상 유저인 행이다', () => {
    const rows = [
      drop({ picked_up_by: 'u1', picked_up_at: iso(START) }),
      drop({ picked_up_by: 'u1', picked_up_at: iso(START - 1) }),
      drop({ picked_up_by: 'u1', picked_up_at: iso(NOW.getTime()) }),
      drop({ picked_up_by: 'admin', picked_up_at: iso(START + DAY) }),
      drop({ picked_up_by: null, picked_up_at: null }),
    ]
    expect(countPickups(rows, WINDOW, counted)).toBe(1)
  })

  it('놓은 시각과 주운 시각은 따로 센다 (옛날에 놓고 이번 주에 주운 드랍은 픽업에만 든다)', () => {
    const rows = [drop({ dropped_at: iso(START - 5 * DAY), picked_up_by: 'u1', picked_up_at: iso(START + DAY) })]
    expect(countDrops(rows, 'user', WINDOW, counted)).toBe(0)
    expect(countPickups(rows, WINDOW, counted)).toBe(1)
  })
})
