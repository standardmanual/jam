/**
 * 미션 참가자 대상 랭킹 모드의 순위 계산 (`computeRankingModeResult` → `computeMissionParticipantsResult`)
 *
 * - 티켓 20261019_1445 3-B: «기간 동안 모은 잼»(`jam_period_earned`)이 든 미션은 순위를 빈 결과로 돌려준다
 *   (홈 투데이 랭킹 보드와 어드민 미리보기가 같은 함수를 쓴다).
 * - 티켓 20261019_1400: 이용 정지 유저를 순위에서 빼고 보는 사람 본인에게는 남긴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ranking/__tests__/missionParticipantsResult.test.ts
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RankingModeRow } from '@/types/database'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))

import { computeRankingModeResult } from '../rankingDataSource'

type Row = Record<string, unknown>

/** 테이블별 행을 돌려주는 가짜 클라이언트. `eq`·`in`·`is`만 해석한다 */
function fakeClient(tables: Record<string, Row[]>, errors: Record<string, { message: string }> = {}): SupabaseClient {
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = []
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return builder
    }
    builder.in = (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]))
      return builder
    }
    builder.is = (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value)
      return builder
    }
    const run = () => ({
      data: errors[table] ? null : (tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
      error: errors[table] ?? null,
    })
    builder.maybeSingle = () => {
      const { data, error } = run()
      return Promise.resolve({ data: data?.[0] ?? null, error })
    }
    builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(run()).then(resolve, reject)
    return builder
  }
  return { from } as unknown as SupabaseClient
}

function missionMode(overrides: Partial<RankingModeRow> = {}): RankingModeRow {
  return {
    id: 'mode-1',
    title: '테스트 랭킹',
    target_type: 'mission_participants',
    target_mission_id: 'mission-1',
    target_user_ids: [],
    metric_type: 'mission_progress',
    metric_field_key: null,
    metric_badge_type: null,
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    visible_rank_count: null,
    created_at: '2026-10-01T00:00:00Z',
    created_by: null,
    ...overrides,
  }
}

function user(id: string): Row {
  return { id, username: `name-${id}`, display_name: `이름-${id}`, avatar_url: null }
}

/** 세 사람이 참가한 미션. a는 완료자, b·c는 진행 중(b가 더 앞) */
function baseTables(missionOverrides: Row = {}): Record<string, Row[]> {
  return {
    missions: [{ id: 'mission-1', mission_type: 'engine_condition', condition_json: { distance_km: 5 }, ...missionOverrides }],
    user_mission_participations: [
      { mission_id: 'mission-1', user_id: 'a', progress_value: 1 },
      { mission_id: 'mission-1', user_id: 'b', progress_value: 0.8 },
      { mission_id: 'mission-1', user_id: 'c', progress_value: 0.2 },
    ],
    user_mission_completions: [{ mission_id: 'mission-1', user_id: 'a', completed_at: '2026-10-10T00:00:00Z' }],
    users: [user('a'), user('b'), user('c')],
  }
}

describe('computeRankingModeResult — 기간 동안 모은 잼 미션은 순위를 가린다 (티켓 20261019_1445 3-B)', () => {
  it('기준선: 키가 없는 미션은 완료자 → 진행도 순으로 순위를 돌려준다', async () => {
    const result = await computeRankingModeResult(missionMode(), fakeClient(baseTables()))

    expect(result.entries.map((e) => [e.userId, e.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    expect(result.totalParticipants).toBe(3)
  })

  it('jam_period_earned가 든 미션은 빈 결과를 돌려주고 모은 양이 값으로 실리지 않는다', async () => {
    const tables = baseTables({ condition_json: { jam_period_earned: 500 } })
    const result = await computeRankingModeResult(missionMode(), fakeClient(tables))

    expect(result.entries).toEqual([])
    expect(result.totalParticipants).toBe(0)
    expect(result.metricType).toBe('mission_progress')
    expect(result.missionType).toBe('engine_condition')
  })

  it('다른 조건과 함께 든 복합 조건 미션도 빈 결과다', async () => {
    const tables = baseTables({ condition_json: { jam_period_earned: 300, combine_success_count: 2 } })
    const result = await computeRankingModeResult(missionMode(), fakeClient(tables))

    expect(result.entries).toEqual([])
    expect(result.totalParticipants).toBe(0)
  })

  it('참가자 표를 읽기 전에 돌려준다 — 모은 양을 읽지도 않는다', async () => {
    const reads: string[] = []
    const base = fakeClient(baseTables({ condition_json: { jam_period_earned: 500 } }))
    const spying = { from: (table: string) => (reads.push(table), (base as unknown as { from: (t: string) => unknown }).from(table)) }

    await computeRankingModeResult(missionMode(), spying as unknown as SupabaseClient)

    expect(reads).toEqual(['missions'])
  })
})
