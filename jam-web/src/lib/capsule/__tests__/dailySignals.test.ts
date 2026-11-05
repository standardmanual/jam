/**
 * 캡슐 운영 신호 일일 요약 (티켓 20261031_1525, 잼 소멸 신호는 20261105_0105 T5에서 걷음)
 *
 * - 읽기: 어제(KST) 구간, 열린 캡슐 총수·유저별 최댓값, 보류 유저 수·2개 유저 수·전체 유저 수, 항목별 독립 실패. 소멸(`capsule_forfeit`·`jam_forfeit_weekly`)은 읽지 않는다
 * - 글: 못 읽은 항목은 «읽지 못했어요», 유저 0명, 소멸 줄 없음, 임계 숫자·개인 값 없음
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
  it('어제(KST) 구간으로 열린 캡슐을 묻고 총수·유저별 최댓값과 보류 유저를 센다', async () => {
    const { service, calls } = fakeService({
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
    expect(signals.opens).toEqual({ total: 4, maxPerUser: 3 })
    expect(signals.pending).toEqual({ pendingUsers: 2, blockedUsers: 1, totalUsers: 40 })

    // 어제 KST 하루 = 10-29 15:00Z ~ 10-30 15:00Z
    const gte = calls.find((c) => c.table === 'capsule_opens' && c.method === 'gte')
    const lt = calls.find((c) => c.table === 'capsule_opens' && c.method === 'lt')
    expect(gte?.args).toEqual(['opened_at', '2026-10-29T15:00:00.000Z'])
    expect(lt?.args).toEqual(['opened_at', '2026-10-30T15:00:00.000Z'])
  })

  it('잼 소멸 표(jam_transactions·jam_forfeit_weekly)는 읽지 않고 결과에도 소멸 값이 없다 (티켓 20261105_0105 T5)', async () => {
    const { service, calls } = fakeService({ capsule_opens: { rows: [] }, capsule_pending_rewards: { rows: [] }, users: { count: 1 } })
    const signals = await readCapsuleDailySignals(service, NOW)
    expect(calls.some((c) => c.table === 'jam_transactions' || c.table === 'jam_forfeit_weekly')).toBe(false)
    expect(signals).not.toHaveProperty('forfeit')
  })

  it('한 항목이 실패해도 나머지는 읽는다', async () => {
    const { service } = fakeService({
      capsule_opens: { error: 'boom' },
      capsule_pending_rewards: { rows: [] },
      users: { count: 10 },
    })
    const signals = await readCapsuleDailySignals(service, NOW)
    expect(signals.opens).toBeNull()
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
    opens: { total: 12, maxPerUser: 3 },
    pending: { pendingUsers: 5, blockedUsers: 1, totalUsers: 200 },
    ...overrides,
  }
}

describe('formatCapsuleDailySignals', () => {
  it('열린 캡슐과 보류 유저 두 줄만 있고 소멸 줄이 없다', () => {
    const text = formatCapsuleDailySignals(signals())
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('캡슐 운영 신호 · 어제 요약 (2026-10-30)')
    expect(text).not.toContain('소멸')
    expect(lines[1]).toContain('(하루 기준)')
    expect(lines[1]).toContain('어제 열린 캡슐 12개')
    expect(lines[1]).toContain('최댓값 3개')
    expect(lines[2]).toContain('5명 / 전체 200명 (2.5%)')
    expect(lines[2]).toContain('잼을 받을 수 없는 유저 1명')
  })

  it('못 읽은 항목은 «읽지 못했어요»로 적고 나머지는 적는다', () => {
    const text = formatCapsuleDailySignals(signals({ opens: null }))
    const lines = text.split('\n')
    expect(lines[1]).toContain('읽지 못했어요')
    expect(lines[2]).toContain('5명 / 전체 200명')
  })

  it('전체 유저가 0명이면 보류 유저 비율을 읽지 못했어요로 적는다', () => {
    const text = formatCapsuleDailySignals(signals({ pending: { pendingUsers: 0, blockedUsers: 0, totalUsers: 0 } }))
    expect(text.split('\n')[2]).toBe('보류 유저 비율: 읽지 못했어요')
  })

  it('두 항목을 모두 못 읽었을 때만 isAllUnread다', () => {
    expect(isAllUnread(signals({ opens: null, pending: null }))).toBe(true)
    expect(isAllUnread(signals({ opens: null }))).toBe(false)
    expect(isAllUnread(signals({ pending: null }))).toBe(false)
  })

  it('임계 말과 개인 값이 글에 없다', () => {
    const text = formatCapsuleDailySignals(signals())
    expect(text).not.toMatch(/임계|주의|중단|이상이면/)
    expect(text).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/)
  })
})
