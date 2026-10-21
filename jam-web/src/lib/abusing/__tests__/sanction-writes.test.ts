/**
 * abusing — POI 차단 일괄 쓰기(해제·만료 연장) 회귀 테스트 (티켓 20260924_0952)
 *
 * 기록형 스텁이 `from(table)` 호출마다 어떤 문장(update/delete/insert + 조건)이 나갔는지 남긴다.
 * 고정하는 계약:
 * 1. 해제는 삭제 1문장(200건 묶음) 뒤 지운 행을 `abusing_logs`에 실행 어드민과 함께 남긴다.
 * 2. 만료 연장은 `.lt(만료 컬럼, until)` 조건을 붙여 이미 더 긴 차단을 자연히 건너뛴다.
 *
 * 옛 섀도우밴(`user_shadow_bans`)의 해제·연장·등급 전환 시험은 함수와 함께 티켓 20261021_1250(6-4 2회)에서 지웠다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/sanction-writes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

interface Call {
  table: string
  ops: [string, ...unknown[]][]
}

const stub = vi.hoisted(() => ({
  calls: [] as { table: string; ops: [string, ...unknown[]][] }[],
  /** 다음 select 종결에서 돌려줄 행(호출 순서대로 하나씩 꺼낸다) */
  selectQueue: [] as { data: Record<string, unknown>[] | null; error: { code: string; message: string } | null }[],
  insertError: null as { code: string; message: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    return {
      from: (table: string) => {
        const call: Call = { table, ops: [] }
        stub.calls.push(call)
        const builder = {
          update: (patch: unknown) => (call.ops.push(['update', patch]), builder),
          delete: () => (call.ops.push(['delete']), builder),
          in: (column: string, values: unknown) => (call.ops.push(['in', column, values]), builder),
          lt: (column: string, value: unknown) => (call.ops.push(['lt', column, value]), builder),
          eq: (column: string, value: unknown) => (call.ops.push(['eq', column, value]), builder),
          select: async (columns: string) => {
            call.ops.push(['select', columns])
            return stub.selectQueue.shift() ?? { data: [], error: null }
          },
          insert: async (payload: unknown) => {
            call.ops.push(['insert', payload])
            return { error: stub.insertError }
          },
        }
        return builder
      },
    } as unknown as SupabaseClient
  },
}))

import { extendPoiBlocks, releasePoiBlocks } from '../poi-block'

const opNames = (call: Call) => call.ops.map((op) => op[0])

beforeEach(() => {
  stub.calls = []
  stub.selectQueue = []
  stub.insertError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POI 차단 해제·연장', () => {
  it('releasePoiBlocks: 삭제 1문장 뒤 poi_block_released로 기록한다', async () => {
    stub.selectQueue = [
      {
        data: [
          {
            id: 'p1',
            user_id: 'u1',
            poi_id: 'poi-1',
            blocked_until: '2026-09-27T00:00:00.000Z',
            reason: 'gps_spoof_detected',
            created_at: '2026-09-24T00:00:00.000Z',
          },
        ],
        error: null,
      },
    ]

    const result = await releasePoiBlocks(['p1'], 'admin@jam.test')

    expect(result.released).toHaveLength(1)
    const [deleteCall, logCall] = stub.calls
    expect(deleteCall.table).toBe('poi_blocks')
    expect(opNames(deleteCall)).toEqual(['delete', 'in', 'select'])
    const inserted = logCall.ops[0][1] as { event_type: string; detail: Record<string, unknown> }[]
    expect(inserted[0].event_type).toBe('poi_block_released')
    expect(inserted[0].detail).toMatchObject({ poi_id: 'poi-1', released_by: 'admin@jam.test' })
  })

  it('releasePoiBlocks: 200건을 넘으면 200건씩 나눠 삭제 문장을 낸다', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `p${i}`)
    await releasePoiBlocks(ids, 'admin@jam.test')

    const deletes = stub.calls.filter((c) => c.table === 'poi_blocks')
    expect(deletes).toHaveLength(2)
    expect((deletes[0].ops[1][2] as string[]).length).toBe(200)
    expect((deletes[1].ops[1][2] as string[]).length).toBe(50)
  })

  it('releasePoiBlocks: 이미 없는 id뿐이면 지운 행이 없어 로그도 남기지 않는다', async () => {
    stub.selectQueue = [{ data: [], error: null }]
    const result = await releasePoiBlocks(['gone'], 'admin@jam.test')
    expect(result.released).toEqual([])
    expect(stub.calls.some((c) => c.table === 'abusing_logs')).toBe(false)
  })

  it('releasePoiBlocks: 삭제가 실패하면 로그를 남기지 않고 오류를 돌려준다', async () => {
    stub.selectQueue = [{ data: null, error: { code: '42501', message: 'denied' } }]
    const result = await releasePoiBlocks(['p1'], 'admin@jam.test')
    expect(result.error).toContain('42501')
    expect(result.released).toEqual([])
    expect(stub.calls.some((c) => c.table === 'abusing_logs')).toBe(false)
  })

  it('releasePoiBlocks: 로그 기록이 실패해도 해제 결과는 돌려주되 logged=false로 알린다', async () => {
    stub.selectQueue = [
      {
        data: [
          {
            id: 'p1',
            user_id: 'u1',
            poi_id: 'poi-1',
            blocked_until: '2026-09-27T00:00:00.000Z',
            reason: 'gps_spoof_detected',
            created_at: '2026-09-24T00:00:00.000Z',
          },
        ],
        error: null,
      },
    ]
    stub.insertError = { code: 'XX000', message: 'log down' }
    const result = await releasePoiBlocks(['p1'], 'admin@jam.test')
    expect(result.released).toHaveLength(1)
    expect(result.logged).toBe(false)
  })

  it('extendPoiBlocks: 갱신이 실패하면 오류를 돌려준다', async () => {
    stub.selectQueue = [{ data: null, error: { code: '42501', message: 'denied' } }]
    const result = await extendPoiBlocks(['p1'], new Date('2026-10-10T00:00:00.000Z'))
    expect(result.error).toContain('42501')
    expect(result.updatedIds).toEqual([])
  })

  it('extendPoiBlocks: .lt(blocked_until, until) 조건을 붙인다', async () => {
    const until = new Date('2026-10-10T00:00:00.000Z')
    stub.selectQueue = [{ data: [{ id: 'p1' }], error: null }]

    const result = await extendPoiBlocks(['p1'], until)

    expect(result.updatedIds).toEqual(['p1'])
    const [call] = stub.calls
    expect(call.table).toBe('poi_blocks')
    expect(call.ops[0]).toEqual(['update', { blocked_until: until.toISOString() }])
    expect(call.ops).toContainEqual(['lt', 'blocked_until', until.toISOString()])
  })
})
