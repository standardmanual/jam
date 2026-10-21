/**
 * computeUserBulkImpact — 포인트 지급·회수 미리보기의 «회수하지 못하고 건너뛰는 유저 수» (티켓 20261019_1318 2회)
 *
 * 잔액보다 큰 회수는 마이너스가 되지 않고 그 유저만 거절된다(티켓 20261019_1314, `admin_deduct_points`). 미리보기는 그 유저 수를 `revokeSkippedCount`로 알린다.
 * 고정하는 것: 잔액이 요청 금액보다 적은 유저(지갑이 없는 유저 포함)만 센다 · 잔액이 정확히 같으면 센 뒤 0이 되므로 세지 않는다 · 지급은 0이고 잔액을 읽지 않는다.
 * 지갑 조회는 가짜 클라이언트다 — 공용 DB를 부르지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-bulk-impact.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeUserBulkImpact } from '../user-bulk-impact'
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
