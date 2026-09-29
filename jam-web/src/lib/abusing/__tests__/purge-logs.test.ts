/**
 * abusing_logs 3개월 파기 테스트 (티켓 20260929_1327)
 *
 * 고정하는 계약:
 * 1. 삭제는 `abusing_logs`에 `created_at < (기준 시각 - 3개월)` 조건 하나로만 나가며 `event_type` 조건이 없다.
 * 2. 기준은 UTC 달력 3개월이고 말일이 없는 달은 말일로 보정한다.
 * 3. DB 오류·클라이언트 생성 예외는 던지지 않고 `error`로 돌려준다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/purge-logs.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const stub = vi.hoisted(() => ({
  calls: [] as { table: string; ops: [string, ...unknown[]][] }[],
  result: { data: [] as { id: string }[] | null, error: null as { message: string } | null },
  throwOnCreate: false,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    if (stub.throwOnCreate) throw new Error('환경 변수 없음')
    return {
      from: (table: string) => {
        const call = { table, ops: [] as [string, ...unknown[]][] }
        stub.calls.push(call)
        const builder = {
          delete: () => (call.ops.push(['delete']), builder),
          lt: (column: string, value: unknown) => (call.ops.push(['lt', column, value]), builder),
          select: async (columns: string) => (call.ops.push(['select', columns]), stub.result),
        }
        return builder
      },
    } as unknown as SupabaseClient
  },
}))

import { abusingLogCutoff, purgeExpiredAbusingLogs } from '../purge-logs'

beforeEach(() => {
  stub.calls = []
  stub.result = { data: [], error: null }
  stub.throwOnCreate = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('abusingLogCutoff', () => {
  it('UTC 달력 기준 3개월 전 시각을 돌려준다', () => {
    expect(abusingLogCutoff(new Date('2027-01-01T00:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('대상 월에 그 일자가 없으면 말일로 보정한다', () => {
    expect(abusingLogCutoff(new Date('2026-05-31T00:00:00Z')).toISOString()).toBe('2026-02-28T00:00:00.000Z')
  })
})

describe('purgeExpiredAbusingLogs', () => {
  const now = new Date('2027-01-01T00:00:00Z')

  it('created_at 조건 하나로만 삭제를 요청한다(event_type 조건 없음)', async () => {
    stub.result = { data: [{ id: 'a' }, { id: 'b' }], error: null }
    const result = await purgeExpiredAbusingLogs(now)
    expect(result).toEqual({ deleted: 2, error: null })
    expect(stub.calls).toEqual([
      {
        table: 'abusing_logs',
        ops: [['delete'], ['lt', 'created_at', '2026-10-01T00:00:00.000Z'], ['select', 'id']],
      },
    ])
  })

  it('3개월 1일 전 행은 기준보다 이전이라 대상이고 2개월 전 행은 비대상이다', async () => {
    await purgeExpiredAbusingLogs(now)
    const cutoff = stub.calls[0].ops[1][2] as string
    expect(new Date('2026-09-30T00:00:00Z').toISOString() < cutoff).toBe(true)
    expect(new Date('2026-11-01T00:00:00Z').toISOString() < cutoff).toBe(false)
  })

  it('DB 오류는 던지지 않고 error로 돌려준다', async () => {
    stub.result = { data: null, error: { message: 'boom' } }
    expect(await purgeExpiredAbusingLogs(now)).toEqual({ deleted: 0, error: 'boom' })
  })

  it('클라이언트 생성 예외도 던지지 않는다', async () => {
    stub.throwOnCreate = true
    expect(await purgeExpiredAbusingLogs(now)).toEqual({ deleted: 0, error: '환경 변수 없음' })
  })
})
