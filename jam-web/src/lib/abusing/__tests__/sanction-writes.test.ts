/**
 * abusing — 제재·POI 차단 일괄 쓰기(해제·만료 연장·등급 전환) 회귀 테스트 (티켓 20260924_0952)
 *
 * 기록형 스텁이 `from(table)` 호출마다 어떤 문장(update/delete/insert + 조건)이 나갔는지 남긴다.
 * 고정하는 계약:
 * 1. 해제는 삭제 1문장(200건 묶음) 뒤 지운 행을 `abusing_logs`에 실행 어드민과 함께 남긴다.
 * 2. 만료 연장은 `.lt(만료 컬럼, until)` 조건을 붙여 영구·더 긴 제재를 자연히 건너뛴다.
 * 3. 등급 전환은 `ban_level`만 바꾸고 `expires_at`을 건드리지 않는다(`applyBan` upsert와 다르다).
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

import { changeBanLevel, extendBans, releaseBans } from '../shadow-ban'
import { extendPoiBlocks, releasePoiBlocks } from '../poi-block'

const opNames = (call: Call) => call.ops.map((op) => op[0])

beforeEach(() => {
  stub.calls = []
  stub.selectQueue = []
  stub.insertError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const banRow = (id: string, userId: string) => ({
  id,
  user_id: userId,
  ban_level: 'hard',
  reason: 'gps 조작',
  expires_at: '2026-10-01T00:00:00.000Z',
  created_at: '2026-09-20T00:00:00.000Z',
  created_by: 'system',
})

describe('releaseBans', () => {
  it('삭제 1문장(.in + select *) 뒤 지운 행을 실행 어드민과 함께 abusing_logs에 남긴다', async () => {
    stub.selectQueue = [{ data: [banRow('b1', 'u1'), banRow('b2', 'u2')], error: null }]

    const result = await releaseBans(['b1', 'b2'], 'admin@jam.test')

    expect(result.error).toBeNull()
    expect(result.logged).toBe(true)
    expect(result.released.map((r) => r.id)).toEqual(['b1', 'b2'])

    const [deleteCall, logCall] = stub.calls
    expect(deleteCall.table).toBe('user_shadow_bans')
    expect(opNames(deleteCall)).toEqual(['delete', 'in', 'select'])
    expect(deleteCall.ops[1]).toEqual(['in', 'id', ['b1', 'b2']])
    expect(deleteCall.ops[2]).toEqual(['select', '*'])

    expect(logCall.table).toBe('abusing_logs')
    const inserted = logCall.ops[0][1] as { user_id: string; event_type: string; detail: Record<string, unknown> }[]
    expect(inserted).toHaveLength(2)
    expect(inserted[0]).toMatchObject({ user_id: 'u1', event_type: 'ban_released' })
    expect(inserted[0].detail).toMatchObject({ ban_level: 'hard', reason: 'gps 조작', released_by: 'admin@jam.test' })
  })

  it('200건을 넘으면 200건씩 나눠 삭제 문장을 낸다', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `b${i}`)
    await releaseBans(ids, 'admin@jam.test')

    const deletes = stub.calls.filter((c) => c.table === 'user_shadow_bans')
    expect(deletes).toHaveLength(2)
    expect((deletes[0].ops[1][2] as string[]).length).toBe(200)
    expect((deletes[1].ops[1][2] as string[]).length).toBe(50)
  })

  it('이미 없는 id뿐이면 지운 행이 없어 로그도 남기지 않는다', async () => {
    stub.selectQueue = [{ data: [], error: null }]
    const result = await releaseBans(['gone'], 'admin@jam.test')
    expect(result.released).toEqual([])
    expect(stub.calls.some((c) => c.table === 'abusing_logs')).toBe(false)
  })

  it('삭제가 실패하면 로그를 남기지 않고 오류를 돌려준다', async () => {
    stub.selectQueue = [{ data: null, error: { code: '42501', message: 'denied' } }]
    const result = await releaseBans(['b1'], 'admin@jam.test')
    expect(result.error).toContain('42501')
    expect(result.released).toEqual([])
    expect(stub.calls.some((c) => c.table === 'abusing_logs')).toBe(false)
  })

  it('로그 기록이 실패해도 해제 결과는 돌려주되 logged=false로 알린다', async () => {
    stub.selectQueue = [{ data: [banRow('b1', 'u1')], error: null }]
    stub.insertError = { code: 'XX000', message: 'log down' }
    const result = await releaseBans(['b1'], 'admin@jam.test')
    expect(result.released).toHaveLength(1)
    expect(result.logged).toBe(false)
  })
})

describe('extendBans', () => {
  it('만료를 until로 바꾸는 한 문장에 .lt(expires_at, until) 조건을 붙인다', async () => {
    const until = new Date('2026-10-10T00:00:00.000Z')
    stub.selectQueue = [{ data: [{ id: 'b1' }], error: null }]

    const result = await extendBans(['b1', 'b2'], until)

    expect(result).toEqual({ updatedIds: ['b1'], error: null })
    const [call] = stub.calls
    expect(call.table).toBe('user_shadow_bans')
    expect(call.ops[0]).toEqual(['update', { expires_at: until.toISOString() }])
    expect(call.ops).toContainEqual(['lt', 'expires_at', until.toISOString()])
    expect(call.ops).toContainEqual(['in', 'id', ['b1', 'b2']])
  })

  it('갱신이 실패하면 오류를 돌려준다', async () => {
    stub.selectQueue = [{ data: null, error: { code: '42501', message: 'denied' } }]
    const result = await extendBans(['b1'], new Date('2026-10-10T00:00:00.000Z'))
    expect(result.error).toContain('42501')
    expect(result.updatedIds).toEqual([])
  })
})

describe('changeBanLevel', () => {
  it('ban_level 한 칸만 갱신하고 expires_at을 건드리지 않는다', async () => {
    stub.selectQueue = [{ data: [{ id: 'b1' }], error: null }]

    const found = await changeBanLevel('b1', 'hard')

    expect(found).toBe(true)
    const [call] = stub.calls
    expect(call.ops[0]).toEqual(['update', { ban_level: 'hard' }])
    expect(Object.keys(call.ops[0][1] as object)).not.toContain('expires_at')
    expect(call.ops[1]).toEqual(['eq', 'id', 'b1'])
  })

  it('그 행이 없으면 false, 갱신이 실패하면 예외를 던진다', async () => {
    stub.selectQueue = [{ data: [], error: null }]
    expect(await changeBanLevel('gone', 'soft')).toBe(false)

    stub.selectQueue = [{ data: null, error: { code: '42501', message: 'denied' } }]
    await expect(changeBanLevel('b1', 'soft')).rejects.toThrow('42501')
  })
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
