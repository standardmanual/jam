/**
 * JAM! 카테고리 — "현재(오늘 기준) 연속 동기화 일수" 계산 회귀 테스트 (티켓 20260911_2304)
 *
 * 검증 대상: `calcCurrentSyncStreakDays()` — 역대 최장(`calcMaxStreak`류)이 아니라
 * "오늘까지 하루라도 거르지 않은 연속"만 세는 판정 기준(사용자 확정)의 경계값들.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/daily-sync-streak.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calcCurrentSyncStreakDays, fetchCurrentSyncStreakDays } from '../dailySyncStreak'

describe('calcCurrentSyncStreakDays — 오늘 기준 현재 연속 동기화 일수', () => {
  it('오늘 동기화 안 함 — 어제까지 아무리 길게 연속이었어도 0이다', () => {
    const dates = ['2026-09-08', '2026-09-09', '2026-09-10']
    expect(calcCurrentSyncStreakDays(dates, '2026-09-11')).toBe(0)
  })

  it('오늘 동기화함, 처음(1일차)이면 1이다', () => {
    expect(calcCurrentSyncStreakDays(['2026-09-11'], '2026-09-11')).toBe(1)
  })

  it('어제까지만 연속이고 오늘도 동기화하면 그 길이만큼 이어진다', () => {
    const dates = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']
    expect(calcCurrentSyncStreakDays(dates, '2026-09-11')).toBe(4)
  })

  it('중간에 하루 빠지면 그 이전 연속은 끊겨 오늘부터만 센다', () => {
    // 09-08은 있지만 09-09가 빠져 09-08 이전은 이어지지 않는다.
    const dates = ['2026-09-05', '2026-09-06', '2026-09-08', '2026-09-10', '2026-09-11']
    expect(calcCurrentSyncStreakDays(dates, '2026-09-11')).toBe(2) // 09-10, 09-11만 연속
  })

  it('날짜 목록 순서는 결과에 영향을 주지 않는다', () => {
    const dates = ['2026-09-11', '2026-09-09', '2026-09-10']
    expect(calcCurrentSyncStreakDays(dates, '2026-09-11')).toBe(3)
  })

  it('빈 목록이면 0이다', () => {
    expect(calcCurrentSyncStreakDays([], '2026-09-11')).toBe(0)
  })

  it('월 경계를 넘는 연속도 정확히 센다', () => {
    const dates = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']
    expect(calcCurrentSyncStreakDays(dates, '2026-09-02')).toBe(4)
  })

  it('연 경계를 넘는 연속도 정확히 센다', () => {
    const dates = ['2025-12-30', '2025-12-31', '2026-01-01']
    expect(calcCurrentSyncStreakDays(dates, '2026-01-01')).toBe(3)
  })

  it('오늘 기준 파라미터를 생략하면 현재 KST 날짜를 쓴다 — 예외 없이 동작한다', () => {
    expect(() => calcCurrentSyncStreakDays([])).not.toThrow()
  })
})

/** `user_daily_sync_counts` 조회를 흉내 내는 최소 supabase-js 체인 */
function mockSupabase(rows: { sync_date: string }[] | null, error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = self
  builder.eq = self
  builder.order = self
  builder.limit = () => Promise.resolve({ data: rows, error })
  return { from: () => builder } as unknown as SupabaseClient
}

describe('fetchCurrentSyncStreakDays — DB 조회 + 계산', () => {
  it('조회한 날짜로 연속일수를 계산한다', async () => {
    const supabase = mockSupabase([
      { sync_date: '2026-09-11' },
      { sync_date: '2026-09-10' },
      { sync_date: '2026-09-09' },
    ])
    const streak = await fetchCurrentSyncStreakDays('user-1', supabase, '2026-09-11')
    expect(streak).toBe(3)
  })

  it('조회 실패는 예외를 던지지 않고 0으로 폴백한다', async () => {
    const supabase = mockSupabase(null, { message: 'DB 장애' })
    const streak = await fetchCurrentSyncStreakDays('user-1', supabase, '2026-09-11')
    expect(streak).toBe(0)
  })

  it('data가 null이어도(테이블에 기록 없음) 예외 없이 0을 돌려준다', async () => {
    const supabase = mockSupabase(null)
    const streak = await fetchCurrentSyncStreakDays('user-1', supabase, '2026-09-11')
    expect(streak).toBe(0)
  })
})
