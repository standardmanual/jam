/**
 * computeUserBulkImpact — (1) 포인트 지급·회수 미리보기의 «회수하지 못하고 건너뛰는 유저 수» (티켓 20261019_1318 2회)
 * (2) 삭제 미리보기의 «없어질 아이템 수»와 «보관 표로 복사될 기록 수» (티켓 20261021_1249 1회)
 *
 * 잔액보다 큰 회수는 마이너스가 되지 않고 그 유저만 거절된다(티켓 20261019_1314, `admin_deduct_points`). 미리보기는 그 유저 수를 `revokeSkippedCount`로 알린다.
 * 고정하는 것: 잔액이 요청 금액보다 적은 유저(지갑이 없는 유저 포함)만 센다 · 잔액이 정확히 같으면 센 뒤 0이 되므로 세지 않는다 · 지급은 0이고 잔액을 읽지 않는다.
 * 지갑 조회는 가짜 클라이언트다 — 공용 DB를 부르지 않는다.
 * 삭제 미리보기에서 고정하는 것: 없어질 아이템은 아직 없어지지 않은 것(`destroyed_at IS NULL`)만 센다 · 보관 건수는 종류별 기간
 * (확인자료 6개월, 부정 이용 탐지 3개월) 안의 기록만 센다 · 같은 `poi_drops` 행도 놓은 유저·주운 유저로 따로 센다 · 유저가 200명이 넘으면 나눠 읽는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-bulk-impact.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeUserBulkImpact } from '../user-bulk-impact'
import { retentionSince } from '@/lib/account/retention'
import type { UserTargetPartition } from '../user-bulk'
import type { ValidAdminGrant } from '@/lib/points/admin-grant'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const C = '00000000-0000-4000-8000-000000000003'

function walletStub(wallets: Array<{ user_id: string; balance: number }>) {
  const reads: string[] = []
  const supabase = {
    from(table: string) {
      reads.push(table)
      return {
        select: () => ({
          in: async (_column: string, ids: string[]) => ({ data: wallets.filter((w) => ids.includes(w.user_id)), error: null }),
        }),
      }
    },
  } as unknown as Parameters<typeof computeUserBulkImpact>[0]
  return { supabase, reads }
}

const partition = (eligible: string[]): UserTargetPartition => ({ eligible, skipped: [], excludedAdminCount: 0, excludedSelfCount: 0 })

const grantOf = (amount: number): ValidAdminGrant => ({ amount, reasonLabel: 'error_correction', note: null })
const revoke = grantOf

describe('computeUserBulkImpact — 포인트', () => {
  it('회수: 잔액이 요청 금액보다 적은 유저만 건너뛰는 수에 센다(지갑이 없는 유저 포함)', async () => {
    const { supabase } = walletStub([
      { user_id: A, balance: 500 },
      { user_id: B, balance: 99 },
    ])
    // A 500 ≥ 100 → 회수, B 99 < 100 → 건너뜀, C는 지갑 없음(잔액 0) → 건너뜀
    const impact = await computeUserBulkImpact(supabase, 'grant_points', partition([A, B, C]), revoke(-100))
    expect(impact.revokeSkippedCount).toBe(2)
    expect(impact.targetCount).toBe(3)
  })

  it('잔액이 요청 금액과 정확히 같으면 회수된다(건너뛰지 않는다)', async () => {
    const { supabase } = walletStub([{ user_id: A, balance: 100 }])
    const impact = await computeUserBulkImpact(supabase, 'grant_points', partition([A]), revoke(-100))
    expect(impact.revokeSkippedCount).toBe(0)
  })

  it('지급은 건너뛰는 유저가 없고 잔액을 읽지도 않는다', async () => {
    const { supabase, reads } = walletStub([])
    const impact = await computeUserBulkImpact(supabase, 'grant_points', partition([A, B]), grantOf(100))
    expect(impact.revokeSkippedCount).toBe(0)
    expect(reads).toEqual([])
  })
})

interface FakeQuery {
  table: string
  columns: string
  options: unknown
  filters: Array<[op: string, column: string, value: unknown]>
}

/** 질의를 기록하고 `resolve`가 정한 행·건수를 돌려주는 가짜 클라이언트 */
function fakeClient(resolve: (query: FakeQuery) => { data?: unknown[]; count?: number }) {
  const queries: FakeQuery[] = []
  const supabase = {
    from(table: string) {
      return {
        select(columns: string, options?: unknown) {
          const query: FakeQuery = { table, columns, options, filters: [] }
          queries.push(query)
          const builder: Record<string, unknown> = {}
          for (const op of ['in', 'eq', 'is', 'gte']) {
            builder[op] = (column: string, value: unknown) => {
              query.filters.push([op, column, value])
              return builder
            }
          }
          builder.order = () => builder
          builder.range = () => builder
          builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
            const out = resolve(query)
            return Promise.resolve({ data: out.data ?? [], count: out.count ?? null, error: null }).then(onFulfilled, onRejected)
          }
          return builder
        },
      }
    },
  } as unknown as Parameters<typeof computeUserBulkImpact>[0]
  return { supabase, queries }
}

const NOW = new Date('2026-10-21T03:00:00.000Z')

const HEAD_COUNTS: Record<string, number> = {
  'user_checkin_badge_earns.user_id': 4,
  'poi_views.user_id': 2,
  'poi_drops.dropper_user_id': 1,
  'poi_drops.picked_up_by': 3,
  'abusing_logs.user_id': 5,
}

function deleteFixture(query: FakeQuery): { data?: unknown[]; count?: number } {
  const isHeadCount = (query.options as { head?: boolean } | undefined)?.head === true
  if (isHeadCount) {
    const column = query.filters.find(([op]) => op === 'in')?.[1]
    return { count: HEAD_COUNTS[`${query.table}.${column}`] ?? 0 }
  }
  if (query.table === 'inventory') {
    return query.columns === 'id, user_id'
      ? { data: [{ id: 'inv-A', user_id: A }, { id: 'inv-B', user_id: B }] }
      : { data: [{ id: 'inv-A' }, { id: 'inv-B' }] }
  }
  if (query.table === 'inventory_items') {
    const onlyAlive = query.filters.some(([op, column, value]) => op === 'is' && column === 'destroyed_at' && value === null)
    const alive = [{ inventory_id: 'inv-A', id: 'i1' }, { inventory_id: 'inv-B', id: 'i2' }]
    return { data: onlyAlive ? alive : [...alive, { inventory_id: 'inv-A', id: 'i3' }] }
  }
  if (query.table === 'point_wallets') return { data: [{ user_id: A, balance: 100 }, { user_id: B, balance: 50 }] }
  if (query.table === 'strava_connections') return { data: [{ user_id: A, id: 's1' }] }
  if (query.table === 'user_activity_badges') return { data: [{ user_id: A, id: 'b1' }, { user_id: A, id: 'b2' }] }
  return {}
}

describe('computeUserBulkImpact — 삭제 미리보기(티켓 20261021_1249)', () => {
  it('없어질 아이템은 아직 없어지지 않은 것만 세고, 보관 건수는 다섯 원본의 합이다', async () => {
    const { supabase } = fakeClient(deleteFixture)

    const impact = await computeUserBulkImpact(supabase, 'delete', partition([A, B]), undefined, NOW)

    // 소유 아이템은 3개지만 없어지지 않은 것은 2개다
    expect(impact.itemCount).toBe(3)
    expect(impact.vanishingItemCount).toBe(2)
    expect(impact.retainedRecordCount).toBe(4 + 2 + 1 + 3 + 5)
    expect(impact.pointBalanceTotal).toBe(150)
    expect(impact.stravaConnectionCount).toBe(1)
  })

  it('보관 건수는 종류별 기간(확인자료 6개월, 부정 이용 탐지 3개월) 이후의 기록만 센다', async () => {
    const { supabase, queries } = fakeClient(deleteFixture)

    await computeUserBulkImpact(supabase, 'delete', partition([A]), undefined, NOW)

    const since = (table: string, userColumn: string) =>
      queries
        .filter((q) => q.table === table && (q.options as { head?: boolean } | undefined)?.head === true)
        .find((q) => q.filters.some(([op, column]) => op === 'in' && column === userColumn))
        ?.filters.find(([op]) => op === 'gte')
    const sixMonths = retentionSince(NOW, 6)
    const threeMonths = retentionSince(NOW, 3)

    expect(since('user_checkin_badge_earns', 'user_id')).toEqual(['gte', 'earned_at', sixMonths])
    expect(since('poi_views', 'user_id')).toEqual(['gte', 'viewed_at', sixMonths])
    expect(since('poi_drops', 'dropper_user_id')).toEqual(['gte', 'dropped_at', sixMonths])
    expect(since('poi_drops', 'picked_up_by')).toEqual(['gte', 'picked_up_at', sixMonths])
    expect(since('abusing_logs', 'user_id')).toEqual(['gte', 'created_at', threeMonths])
  })

  it('유저가 200명을 넘으면 보관 대상 집계도 200명씩 나눠 읽는다', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const { supabase, queries } = fakeClient(deleteFixture)

    const impact = await computeUserBulkImpact(supabase, 'delete', partition(ids), undefined, NOW)

    const headQueries = queries.filter((q) => (q.options as { head?: boolean } | undefined)?.head === true)
    expect(headQueries).toHaveLength(5 * 2)
    expect(impact.retainedRecordCount).toBe((4 + 2 + 1 + 3 + 5) * 2)
  })

  it('초기화는 보관·없어짐 수를 계산하지 않는다(지우는 것이 아니라 비우는 작업이다)', async () => {
    const { supabase, queries } = fakeClient(deleteFixture)

    const impact = await computeUserBulkImpact(supabase, 'reset', partition([A]), undefined, NOW)

    expect(impact.vanishingItemCount).toBeUndefined()
    expect(impact.retainedRecordCount).toBeUndefined()
    expect(queries.some((q) => q.table === 'poi_views')).toBe(false)
  })
})
