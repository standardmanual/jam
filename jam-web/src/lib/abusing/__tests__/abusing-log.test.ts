/**
 * abusing/abusing-log — 어뷰징 이벤트 로그 기록 회귀 테스트
 *
 * `logAbusingEvent`의 시험은 티켓 20260901_1843에서 `shadow-ban-write.test.ts`에 있었고, 티켓
 * 20261021_1250(6-4 2회)에서 함수와 함께 이 파일로 옮겼다. 고정하는 계약:
 * 1. 로그 기록이 실패해도 호출부(GPS 감지 등)를 막지 않도록 예외를 던지지 않되, 서버 로그는 남긴다.
 * 2. 여러 건 기록(`logAbusingEvents`)은 한 문장으로 insert하고, 실패하면 `false`와 함께 기록하지
 *    못한 내용을 서버 로그에 통째로 남긴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/abusing-log.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const stub = vi.hoisted(() => ({
  tables: [] as string[],
  insertError: null as { code: string; message: string } | null,
  insertThrows: false,
  insertPayloads: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    return {
      from: (table: string) => {
        stub.tables.push(table)
        return {
          insert: async (payload: unknown) => {
            if (stub.insertThrows) throw new Error('network down')
            stub.insertPayloads.push(payload)
            return { error: stub.insertError }
          },
        }
      },
    } as unknown as SupabaseClient
  },
}))

import { logAbusingEvent, logAbusingEvents } from '../abusing-log'

beforeEach(() => {
  stub.tables = []
  stub.insertError = null
  stub.insertThrows = false
  stub.insertPayloads = []
})

describe('logAbusingEvent — insert 실패는 삼키되 반드시 로그를 남긴다', () => {
  it('insert error가 있어도 예외를 던지지 않지만 console.error를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.insertError = { code: '23503', message: 'foreign key violation' }
    await expect(logAbusingEvent('user-1', 'gps_spoof_detected')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][0])).toContain('gps_spoof_detected')
    spy.mockRestore()
  })

  it('insert가 예외를 던져도 삼키되 console.error를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.insertThrows = true
    await expect(logAbusingEvent('user-1', 'gps_spoof_detected')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 abusing_logs에 { user_id, event_type, detail } 한 줄을 넣고 로그를 남기지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await logAbusingEvent('user-1', 'gps_spoof_detected', { poi_id: 'poi-1' })
    expect(spy).not.toHaveBeenCalled()
    expect(stub.tables).toEqual(['abusing_logs'])
    expect(stub.insertPayloads).toEqual([
      { user_id: 'user-1', event_type: 'gps_spoof_detected', detail: { poi_id: 'poi-1' } },
    ])
    spy.mockRestore()
  })

  it('detail을 생략하면 null로 기록한다', async () => {
    await logAbusingEvent('user-1', 'gps_spoof_detected')
    expect(stub.insertPayloads).toEqual([{ user_id: 'user-1', event_type: 'gps_spoof_detected', detail: null }])
  })
})

describe('logAbusingEvents — 여러 건을 한 문장으로 기록한다', () => {
  const entries = [
    { user_id: 'u1', event_type: 'poi_block_released', detail: { poi_id: 'poi-1' } },
    { user_id: 'u2', event_type: 'poi_block_released', detail: { poi_id: 'poi-2' } },
  ]

  it('빈 배열이면 DB를 부르지 않고 true를 돌려준다', async () => {
    expect(await logAbusingEvents([])).toBe(true)
    expect(stub.tables).toEqual([])
  })

  it('정상이면 한 번의 insert로 모두 넣고 true를 돌려준다', async () => {
    expect(await logAbusingEvents(entries)).toBe(true)
    expect(stub.tables).toEqual(['abusing_logs'])
    expect(stub.insertPayloads).toEqual([entries])
  })

  it('insert error면 false를 돌려주고 기록하지 못한 내용을 서버 로그에 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.insertError = { code: 'XX000', message: 'log down' }
    expect(await logAbusingEvents(entries)).toBe(false)
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][1])).toContain('poi-1')
    spy.mockRestore()
  })

  it('insert가 예외를 던져도 false를 돌려주고 서버 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.insertThrows = true
    expect(await logAbusingEvents(entries)).toBe(false)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
