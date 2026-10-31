/**
 * 캡슐·소멸 운영 신호 일일 요약 (티켓 20261031_1525)
 *
 * - 읽기: 어제(KST) 구간, 소멸 유저 수·잼 합, 열린 캡슐 총수·유저별 최댓값, 보류 유저 수·2개 유저 수·전체 유저 수, 항목별 독립 실패
 * - 글: 소멸 0은 «없음», 1 이상은 «참고»로 시작, 못 읽은 항목은 «읽지 못했어요», 유저 0명, 임계 숫자·개인 값 없음
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/dailySignals.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.generated'
import { formatCapsuleDailySignals, isAllUnread, readCapsuleDailySignals, type CapsuleDailySignals } from '../dailySignals'

type Row = Record<string, unknown>
interface TableFake {
  rows?: Row[]
  /** `.range()`가 돌려줄 오류. */
  error?: string
  /** 단건(`maybeSingle`)과 건수(`head`) 조회 결과. */
  single?: Row | null
  count?: number
}

/** 쿼리 빌더 대역. 필터 호출은 기록만 하고 `rows`를 그대로 페이지로 돌려준다. */
function fakeService(tables: Record<string, TableFake>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const service = {
    from(table: string) {
      const fake = tables[table] ?? {}
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'gte', 'lt', 'order']) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          if (method === 'select' && (args[1] as { head?: boolean } | undefined)?.head) {
            return Promise.resolve({ count: fake.count ?? null, error: fake.error ? { message: fake.error } : null })
          }
          return builder
        }
      }
      builder.range = (from: number, to: number) => {
        const page = (fake.rows ?? []).slice(from, to + 1)
        return Promise.resolve({ data: fake.error ? null : page, error: fake.error ? { message: fake.error } : null })
      }
      builder.maybeSingle = () =>
        Promise.resolve({ data: fake.error ? null : (fake.single ?? null), error: fake.error ? { message: fake.error } : null })
      return builder
    },
  }
  return { service: service as unknown as SupabaseClient<Database>, calls }
}

// 2026-10-31 00:10 UTC = KST 09:10 → 어제(KST)는 10-30(금)이고 그 주 월요일은 10-26.
const NOW = new Date('2026-10-31T00:10:00Z')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('readCapsuleDailySignals', () => {
  it('어제(KST) 구간으로 소멸·열린 캡슐을 묻고 유저 수·합·최댓값을 센다', async () => {
    const { service, calls } = fakeService({
      jam_transactions: {
        rows: [
          { id: 'a', user_id: 'u1', amount: -30 },
          { id: 'b', user_id: 'u1', amount: -20 },
          { id: 'c', user_id: 'u2', amount: -50 },
        ],
      },
      jam_forfeit_weekly: { single: { user_count: 5, forfeited_amount: 700 } },
      capsule_opens: {
        rows: [
          { id: '1', user_id: 'u1' },
          { id: '2', user_id: 'u1' },
          { id: '3', user_id: 'u1' },
          { id: '4', user_id: 'u2' },
        ],
      },
      capsule_pending_rewards: {
        rows: [
          { id: 'p1', user_id: 'u1' },
          { id: 'p2', user_id: 'u1' },
          { id: 'p3', user_id: 'u3' },
        ],
      },
      users: { count: 40 },
    })
    const signals = await readCapsuleDailySignals(service, NOW)

    expect(signals.day).toBe('2026-10-30')
    expect(signals.forfeit).toEqual({ users: 2, amount: 100, weekUsers: 5, weekAmount: 700 })
    expect(signals.opens).toEqual({ total: 4, maxPerUser: 3 })
    expect(signals.pending).toEqual({ pendingUsers: 2, blockedUsers: 1, totalUsers: 40 })

    // 어제 KST 하루 = 10-29 15:00Z ~ 10-30 15:00Z, 주 시작은 그 주 월요일
    const gte = calls.find((c) => c.table === 'jam_transactions' && c.method === 'gte')
    const lt = calls.find((c) => c.table === 'jam_transactions' && c.method === 'lt')
    expect(gte?.args).toEqual(['created_at', '2026-10-29T15:00:00.000Z'])
    expect(lt?.args).toEqual(['created_at', '2026-10-30T15:00:00.000Z'])
    expect(calls.find((c) => c.table === 'jam_forfeit_weekly' && c.method === 'eq')?.args).toEqual(['week_start_kst', '2026-10-26'])
    expect(calls.find((c) => c.table === 'jam_transactions' && c.method === 'eq')?.args).toEqual(['reason', 'capsule_forfeit'])
  })

  it('월요일 아침이면 어제(일요일)가 속한 지난 주를 본다', async () => {
    const { service, calls } = fakeService({})
    // 2026-11-02(월) 09:10 KST → 어제는 11-01(일), 그 주 월요일은 10-26
    await readCapsuleDailySignals(service, new Date('2026-11-02T00:10:00Z'))
    expect(calls.find((c) => c.table === 'jam_forfeit_weekly' && c.method === 'eq')?.args).toEqual(['week_start_kst', '2026-10-26'])
  })

  it('그 주에 소멸이 없으면(뷰에 행 없음) 주 누적을 0으로 본다', async () => {
    const { service } = fakeService({ jam_transactions: { rows: [] }, jam_forfeit_weekly: { single: null } })
    const signals = await readCapsuleDailySignals(service, NOW)
    expect(signals.forfeit).toEqual({ users: 0, amount: 0, weekUsers: 0, weekAmount: 0 })
  })

  it('주 누적만 못 읽으면 어제 값은 남기고 주 누적만 null이다', async () => {
    const { service } = fakeService({
      jam_transactions: { rows: [{ id: 'a', user_id: 'u1', amount: -10 }] },
      jam_forfeit_weekly: { error: 'boom' },
    })
    const signals = await readCapsuleDailySignals(service, NOW)
    expect(signals.forfeit).toEqual({ users: 1, amount: 10, weekUsers: null, weekAmount: null })
  })

  it('한 항목이 실패해도 나머지는 읽는다', async () => {
    const { service } = fakeService({
      jam_transactions: { error: 'boom' },
      capsule_opens: { rows: [{ id: '1', user_id: 'u1' }] },
      capsule_pending_rewards: { rows: [] },
      users: { count: 10 },
    })
    const signals = await readCapsuleDailySignals(service, NOW)
    expect(signals.forfeit).toBeNull()
    expect(signals.opens).toEqual({ total: 1, maxPerUser: 1 })
    expect(signals.pending).toEqual({ pendingUsers: 0, blockedUsers: 0, totalUsers: 10 })
  })

  it('열린 캡슐이 없으면 총수와 최댓값이 0이다', async () => {
    const { service } = fakeService({ capsule_opens: { rows: [] } })
    expect((await readCapsuleDailySignals(service, NOW)).opens).toEqual({ total: 0, maxPerUser: 0 })
  })
})

function signals(overrides: Partial<CapsuleDailySignals> = {}): CapsuleDailySignals {
  return {
    day: '2026-10-30',
    forfeit: { users: 0, amount: 0, weekUsers: 0, weekAmount: 0 },
    opens: { total: 12, maxPerUser: 3 },
    pending: { pendingUsers: 5, blockedUsers: 1, totalUsers: 200 },
    ...overrides,
  }
}

describe('formatCapsuleDailySignals', () => {
  it('소멸이 0이면 «없음»이고 «참고»가 붙지 않는다', () => {
    const text = formatCapsuleDailySignals(signals())
    const lines = text.split('\n')
    expect(lines[0]).toBe('캡슐 운영 신호 · 어제 요약 (2026-10-30)')
    expect(lines[1]).toBe('잼 소멸: 없음')
    expect(text).not.toContain('참고')
    expect(lines[2]).toContain('(하루 기준)')
    expect(lines[2]).toContain('어제 열린 캡슐 12개')
    expect(lines[2]).toContain('최댓값 3개')
    expect(lines[3]).toContain('5명 / 전체 200명 (2.5%)')
    expect(lines[3]).toContain('잼을 받을 수 없는 유저 1명')
  })

  it('소멸이 한 명이라도 있으면 그 줄이 «참고»로 시작한다', () => {
    const text = formatCapsuleDailySignals(signals({ forfeit: { users: 1, amount: 1234, weekUsers: 3, weekAmount: 4567 } }))
    const line = text.split('\n')[1]
    expect(line.startsWith('참고')).toBe(true)
    expect(line).toContain('1명, 1,234잼')
    expect(line).toContain('어제가 속한 주 누적 3명, 4,567잼')
  })

  it('못 읽은 항목은 «읽지 못했어요»로 적고 나머지는 적는다', () => {
    const text = formatCapsuleDailySignals(signals({ forfeit: null, opens: null }))
    const lines = text.split('\n')
    expect(lines[1]).toBe('잼 소멸: 읽지 못했어요')
    expect(lines[2]).toContain('읽지 못했어요')
    expect(lines[3]).toContain('5명 / 전체 200명')
  })

  it('주 누적만 못 읽었으면 그 말만 적는다', () => {
    const text = formatCapsuleDailySignals(signals({ forfeit: { users: 2, amount: 10, weekUsers: null, weekAmount: null } }))
    expect(text.split('\n')[1]).toContain('주 누적은 읽지 못했어요')
  })

  it('전체 유저가 0명이면 보류 유저 비율을 읽지 못했어요로 적는다', () => {
    const text = formatCapsuleDailySignals(signals({ pending: { pendingUsers: 0, blockedUsers: 0, totalUsers: 0 } }))
    expect(text.split('\n')[3]).toBe('보류 유저 비율: 읽지 못했어요')
  })

  it('임계 말과 개인 값이 글에 없다', () => {
    const text = formatCapsuleDailySignals(signals({ forfeit: { users: 4, amount: 100, weekUsers: 4, weekAmount: 100 } }))
    expect(text).not.toMatch(/임계|주의|중단|이상이면/)
    expect(text).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/)
  })
})

describe('isAllUnread', () => {
  it('세 항목을 모두 못 읽었을 때만 참이다', () => {
    expect(isAllUnread(signals({ forfeit: null, opens: null, pending: null }))).toBe(true)
    expect(isAllUnread(signals({ forfeit: null, opens: null, pending: { pendingUsers: 0, blockedUsers: 0, totalUsers: 0 } }))).toBe(true)
    expect(isAllUnread(signals({ forfeit: null, opens: null }))).toBe(false)
  })
})
