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

  it('연도 경계: 1~3월 기준은 전년도 10~12월로 넘어간다', () => {
    expect(abusingLogCutoff(new Date('2027-01-15T00:00:00Z')).toISOString()).toBe('2026-10-15T00:00:00.000Z')
    expect(abusingLogCutoff(new Date('2027-02-10T00:00:00Z')).toISOString()).toBe('2026-11-10T00:00:00.000Z')
    expect(abusingLogCutoff(new Date('2027-03-01T00:00:00Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })

  it('연도 경계에서도 말일 보정이 적용된다(12/31 → 9/30, 3/31 → 12/31)', () => {
    expect(abusingLogCutoff(new Date('2026-12-31T00:00:00Z')).toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(abusingLogCutoff(new Date('2027-03-31T00:00:00Z')).toISOString()).toBe('2026-12-31T00:00:00.000Z')
  })

  it('윤년: 2월 29일이 있는 해는 29일로, 평년은 28일로 보정한다', () => {
    expect(abusingLogCutoff(new Date('2028-05-31T00:00:00Z')).toISOString()).toBe('2028-02-29T00:00:00.000Z')
    expect(abusingLogCutoff(new Date('2027-05-31T00:00:00Z')).toISOString()).toBe('2027-02-28T00:00:00.000Z')
    // 100으로 나눠지고 400으로 나눠지지 않는 해는 평년이다
    expect(abusingLogCutoff(new Date('2100-05-31T00:00:00Z')).toISOString()).toBe('2100-02-28T00:00:00.000Z')
  })

  it('윤년: 기준일이 2월 29일이면 3개월 전 같은 일자(11/29)로, 5월 29일이면 2/29로 간다', () => {
    expect(abusingLogCutoff(new Date('2028-02-29T00:00:00Z')).toISOString()).toBe('2027-11-29T00:00:00.000Z')
    expect(abusingLogCutoff(new Date('2028-05-29T00:00:00Z')).toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it('시·분·초·밀리초는 그대로 유지한다', () => {
    expect(abusingLogCutoff(new Date('2026-12-31T23:59:59.999Z')).toISOString()).toBe('2026-09-30T23:59:59.999Z')
  })

  it('기준 시각 객체를 바꾸지 않는다', () => {
    const now = new Date('2026-05-31T12:00:00Z')
    abusingLogCutoff(now)
    expect(now.toISOString()).toBe('2026-05-31T12:00:00.000Z')
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

  it('정확히 경계 시각인 행은 대상이 아니다 — lt(미만)이지 lte(이하)가 아니다', async () => {
    await purgeExpiredAbusingLogs(now)
    const [op, column, cutoff] = stub.calls[0].ops[1] as [string, string, string]
    expect(op).toBe('lt')
    expect(column).toBe('created_at')
    // lt는 경계 시각 자체를 지우지 않고 1ms 이전부터 지운다
    expect(cutoff).toBe('2026-10-01T00:00:00.000Z')
    expect(new Date('2026-09-30T23:59:59.999Z').getTime() < new Date(cutoff).getTime()).toBe(true)
  })

  it('경계가 연도·윤년·말일을 넘어도 같은 lt 조건으로 나간다(윤년 2/29 경계)', async () => {
    await purgeExpiredAbusingLogs(new Date('2028-05-31T00:00:00Z'))
    expect(stub.calls[0].ops).toEqual([['delete'], ['lt', 'created_at', '2028-02-29T00:00:00.000Z'], ['select', 'id']])
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
