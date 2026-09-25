import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

const fromMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: fromMock }) }))

import { getPointsSummary } from '../summary'

type Result = { data: unknown; error: { message: string } | null }

/** 테이블별로 정해진 결과를 돌려주는 체인. 어느 메서드로 끝나도 같은 결과로 풀린다. */
function chainOf(result: Result) {
  const chain: Record<string, unknown> = {
    then: (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) chain[m] = () => chain
  chain.maybeSingle = () => Promise.resolve(result)
  return chain
}

let errorSpy: MockInstance

beforeEach(() => {
  fromMock.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

function setup(results: Record<string, Result>) {
  fromMock.mockImplementation((table: string) => chainOf(results[table] ?? { data: [], error: null }))
}

describe('getPointsSummary — 조회 오류 로그(티켓 20260925_2004)', () => {
  it('집계 조회가 모두 성공하면 로그를 남기지 않는다', async () => {
    setup({
      point_treasury: { data: { id: 1, total_minted: 100, total_reclaimed: 0, updated_at: '' }, error: null },
      point_wallets: { data: [{ balance: 100 }], error: null },
      point_transactions: { data: [{ amount: 100, reason: 'admin_grant' }], error: null },
    })
    const s = await getPointsSummary()
    expect(s.integrityOk).toBe(true)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('원장 조회가 실패하면 던지지 않고 로그를 남긴 채 요약을 돌려준다', async () => {
    setup({
      point_treasury: { data: { id: 1, total_minted: 0, total_reclaimed: 0, updated_at: '' }, error: null },
      point_wallets: { data: [], error: null },
      point_transactions: { data: null, error: { message: 'statement timeout' } },
    })
    const s = await getPointsSummary()
    expect(s.txnSum).toBe(0)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('points/summary/transactions')
  })

  it('배지 이름 조회가 실패하면 로그를 남기고 이름은 대체 문구로 표시한다', async () => {
    setup({
      point_treasury: { data: { id: 1, total_minted: 50, total_reclaimed: 0, updated_at: '' }, error: null },
      point_wallets: { data: [{ balance: 50 }], error: null },
      point_transactions: {
        data: [{ amount: 50, reason: 'badge_point_reward', source_badge_id: 'b1', source_mission_id: null }],
        error: null,
      },
      badges: { data: null, error: { message: 'boom' } },
    })
    const s = await getPointsSummary()
    expect(s.badgeRanking).toEqual([{ id: 'b1', total: 50, name: '(삭제된 배지)' }])
    expect(String(errorSpy.mock.calls[0][0])).toContain('points/summary/badge-names')
  })
})
