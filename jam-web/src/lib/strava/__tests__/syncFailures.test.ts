/**
 * Strava 동기화 실패 기록 — 단위 테스트 (티켓 20260918_1307)
 *
 * 지키는 것:
 * 1. classifyStravaSyncFailure가 429(레이트리밋)만 따로 구분하고 나머지는
 *    strava_api_error로 뭉뚱그린다
 * 2. recordStravaSyncFailure가 strava_sync_failures에 유형·시각을 기록한다
 * 3. 기록 자체가 실패(DB 오류·예외)해도 예외를 던지지 않는다(동기화를 막지 않는다)
 */
import { describe, it, expect, vi } from 'vitest'
import { classifyStravaSyncFailure, recordStravaSyncFailure } from '../syncFailures'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('classifyStravaSyncFailure', () => {
  it('429 레이트리밋 오류를 rate_limited로 분류한다', () => {
    const err = new Error('Strava API 오류 429: rate limit exceeded')
    expect(classifyStravaSyncFailure(err)).toBe('rate_limited')
  })

  it('그 외 Strava API 오류·일반 예외는 strava_api_error로 분류한다', () => {
    expect(classifyStravaSyncFailure(new Error('Strava API 오류 500: server error'))).toBe(
      'strava_api_error'
    )
    expect(classifyStravaSyncFailure(new Error('네트워크 오류'))).toBe('strava_api_error')
    expect(classifyStravaSyncFailure('문자열 예외')).toBe('strava_api_error')
  })
})

describe('recordStravaSyncFailure', () => {
  function fakeSupabase(insertImpl: (payload: unknown) => Promise<{ error: unknown }>) {
    const insert = vi.fn(insertImpl)
    return {
      from: vi.fn((table: string) => {
        expect(table).toBe('strava_sync_failures')
        return { insert }
      }),
      __insert: insert,
    } as unknown as SupabaseClient & { __insert: typeof insert }
  }

  it('실패 유형·에러 메시지를 strava_sync_failures에 기록한다', async () => {
    const supabase = fakeSupabase(async () => ({ error: null }))

    await recordStravaSyncFailure(supabase, 'user-1', 'token_refresh_failed', 'refresh 실패')

    expect(supabase.__insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      failure_type: 'token_refresh_failed',
      error_message: 'refresh 실패',
    })
  })

  it('DB insert 오류가 나도 예외를 던지지 않는다', async () => {
    const supabase = fakeSupabase(async () => ({ error: { message: 'db down' } }))

    await expect(
      recordStravaSyncFailure(supabase, 'user-1', 'strava_api_error', 'Strava API 오류 500')
    ).resolves.toBeUndefined()
  })

  it('insert 호출 자체가 던지는 예외도 삼킨다', async () => {
    const supabase = {
      from: () => {
        throw new Error('클라이언트 오류')
      },
    } as unknown as SupabaseClient

    await expect(
      recordStravaSyncFailure(supabase, 'user-1', 'rate_limited', 'Strava API 오류 429')
    ).resolves.toBeUndefined()
  })
})
