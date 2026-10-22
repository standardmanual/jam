/**
 * 백필 — 걸러진 활동 행은 다시 계산하지 않는다 (티켓 20261017_1459)
 *
 * 걸러진 활동(`filter_reason`이 있는 행)은 인정된 활동이 아니다. 소급 백필이 이 행의 `normalized`까지 다시
 * 계산하면 걸러진 활동의 값이 바뀌고(가상 종목 활동은 `jamActivityType`이 null이라 케이던스 보정도 달라진다),
 * 갱신 대상·대조 수에도 섞여 들어간다. 읽는 쪽(`fetchStoredActivities`)이 인정된 행만 가져와야 한다.
 *
 * 옛 행(`filter_reason`이 NULL인 행)은 그대로 인정으로 읽힌다 — 소급 재판정은 이 티켓의 범위가 아니다.
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/backfill-filtered-rows.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaConnectionRow } from '@/types/database'
import type { StravaSummaryActivity } from '@/types/strava'

const { getActivitiesMock } = vi.hoisted(() => ({
  getActivitiesMock: vi.fn(async (): Promise<unknown[]> => []),
}))

vi.mock('@/lib/utils', () => ({ decrypt: vi.fn(async (v: string) => v), encrypt: vi.fn(async (v: string) => v) }))
vi.mock('@/lib/strava/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/strava/api')>('@/lib/strava/api')
  return { ...actual, getActivities: getActivitiesMock, refreshStravaToken: vi.fn() }
})

import { backfillUserExtendedFields } from '../backfill'

const FUTURE = '2099-01-01T00:00:00.000Z'

const connection: StravaConnectionRow = {
  id: 'c',
  user_id: 'u1',
  strava_athlete_id: 1,
  access_token: 'access',
  refresh_token: 'refresh',
  token_expires_at: FUTURE,
  last_synced_at: null,
  backfill_completed: true,
  first_sync_pending: false,
  disconnected_at: null,
  disconnect_reason: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

interface StoredRow {
  id: string
  user_id: string
  strava_id: number
  start_date: string
  normalized: Record<string, unknown>
  filter_reason?: string | null
}

/** 목록에서 받은 Strava 활동 — 확장 필드(평균 심박)가 들어 있어 저장된 `normalized`와 달라진다 */
function summary(id: number, type: string): StravaSummaryActivity {
  return {
    id,
    type,
    sport_type: type,
    average_heartrate: 150,
    average_cadence: 80,
    elapsed_time: 3_000,
    start_date: '2026-10-01T00:00:00Z',
  } as unknown as StravaSummaryActivity
}

/**
 * `strava_activities`를 읽는 쿼리의 `eq`·`is`를 실제로 적용하고, `update(...).eq('id', …)`로 쓴 행 id를 기록한다.
 * `filter_reason` 열이 없는 행은 NULL(인정)로 읽힌다.
 */
function fakeSupabase(rows: StoredRow[]): { client: SupabaseClient; updatedIds: string[]; readFilters: string[] } {
  const updatedIds: string[] = []
  const readFilters: string[] = []
  const from = (table: string) => {
    const filters: ((row: StoredRow) => boolean)[] = []
    let range: [number, number] | null = null
    let updating = false
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.order = () => builder
    builder.update = () => {
      updating = true
      return builder
    }
    builder.eq = (col: string, value: unknown) => {
      if (updating && col === 'id') {
        updatedIds.push(String(value))
        return Promise.resolve({ error: null })
      }
      filters.push((row) => (row as unknown as Record<string, unknown>)[col] === value)
      return builder
    }
    builder.is = (col: string, value: unknown) => {
      readFilters.push(`${table}.${col} IS ${value === null ? 'NULL' : String(value)}`)
      filters.push((row) => {
        const cell = (row as unknown as Record<string, unknown>)[col]
        return value === null ? cell === null || cell === undefined : cell === value
      })
      return builder
    }
    builder.range = (fromIndex: number, toIndex: number) => {
      range = [fromIndex, toIndex]
      return builder
    }
    builder.then = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => {
      let picked = table === 'strava_activities' ? rows.filter((row) => filters.every((f) => f(row))) : []
      if (range) picked = picked.slice(range[0], range[1] + 1)
      return Promise.resolve({ data: picked, error: null }).then(resolve, reject)
    }
    return builder
  }
  return { client: { from } as unknown as SupabaseClient, updatedIds, readFilters }
}

const recognized: StoredRow = {
  id: 'row-run',
  user_id: 'u1',
  strava_id: 101,
  start_date: '2026-10-01T00:00:00Z',
  normalized: { stravaId: 101, name: '한강 러닝' },
  filter_reason: null,
}
const filtered: StoredRow = {
  id: 'row-virtual',
  user_id: 'u1',
  strava_id: 102,
  start_date: '2026-10-02T00:00:00Z',
  normalized: { stravaId: 102, name: '집에서 가상 라이딩' },
  filter_reason: 'virtual',
}
// 마이그레이션 223 이전에 쌓인 행 — 열이 비어 있다(= 인정). 소급 재판정은 하지 않으므로 그대로 읽는다
const legacy: StoredRow = {
  id: 'row-legacy',
  user_id: 'u1',
  strava_id: 103,
  start_date: '2026-09-01T00:00:00Z',
  normalized: { stravaId: 103, name: '옛 러닝' },
}

beforeEach(() => {
  vi.clearAllMocks()
  getActivitiesMock.mockResolvedValue([summary(101, 'Run'), summary(102, 'VirtualRide'), summary(103, 'Run')])
})

describe('백필 — 걸러진 행은 다시 계산하지 않는다', () => {
  it('실제 적용에서도 걸러진 행에는 쓰지 않는다 (인정된 행·옛 행만 갱신)', async () => {
    const db = fakeSupabase([recognized, filtered, legacy])

    const result = await backfillUserExtendedFields(db.client, connection, {
      apply: true,
      requestBudget: 10,
      requestDelayMs: 0,
      log: () => {},
    })

    expect(result.error).toBeUndefined()
    expect(db.updatedIds.sort()).toEqual(['row-legacy', 'row-run'])
    expect(db.updatedIds).not.toContain('row-virtual')
    expect(result.updated).toBe(2)
  })

  it('걸러진 행은 저장분·대조·갱신 대상에 세지 않는다', async () => {
    const db = fakeSupabase([recognized, filtered, legacy])

    const result = await backfillUserExtendedFields(db.client, connection, {
      apply: false,
      requestBudget: 10,
      requestDelayMs: 0,
      log: () => {},
    })

    // Strava 목록에는 3건이 모두 있지만, 인정된 2건만 대조한다
    expect(result.fetched).toBe(3)
    expect(result.matched).toBe(2)
    expect(result.changed).toBe(2)
    expect(result.updated).toBe(0)
  })

  it('저장된 활동을 읽을 때 filter_reason IS NULL 조건을 건다', async () => {
    const db = fakeSupabase([recognized, filtered])

    await backfillUserExtendedFields(db.client, connection, {
      apply: false,
      requestBudget: 10,
      requestDelayMs: 0,
      log: () => {},
    })

    expect(db.readFilters).toContain('strava_activities.filter_reason IS NULL')
  })
})
