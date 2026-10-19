import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RankingModeRow } from '@/types/database'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))

import { checkRankingModeIntegrity } from '../rankingDataSource'

let errorSpy: MockInstance

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

function missionMode(): RankingModeRow {
  return {
    id: 'mode-1',
    title: '테스트 랭킹',
    target_type: 'mission_participants',
    target_mission_id: 'mission-1',
    target_user_ids: [],
    metric_type: 'badge_count',
    metric_field_key: null,
    metric_badge_type: null,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-09-30T00:00:00Z',
    visible_rank_count: null,
    created_at: '2026-09-01T00:00:00Z',
    created_by: null,
  }
}

function clientReturning(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
  }
  return { from: () => chain } as unknown as SupabaseClient
}

describe('checkRankingModeIntegrity — 미션 조회 오류 로그(티켓 20260925_2004)', () => {
  it('조회가 실패하면 서버 로그에 오류를 남긴다', async () => {
    const client = clientReturning({ data: null, error: { message: 'connection reset' } })
    await checkRankingModeIntegrity(missionMode(), client)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('ranking-modes/integrity')
  })

  it('조회가 성공하면 로그를 남기지 않고 기존 판정을 유지한다', async () => {
    const ok = clientReturning({ data: { status_display_type: 'ranking' }, error: null })
    expect(await checkRankingModeIntegrity(missionMode(), ok)).toBeNull()

    const missing = clientReturning({ data: null, error: null })
    expect(await checkRankingModeIntegrity(missionMode(), missing)).toEqual({ code: 'mission_deleted' })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('checkRankingModeIntegrity — 기간 동안 모은 잼 미션 (티켓 20261019_1445 3-B)', () => {
  it('연결된 미션 조건에 jam_period_earned가 있으면 홈 순위가 비는 이유를 알린다', async () => {
    const hidden = clientReturning({
      data: { status_display_type: 'ranking', condition_json: { jam_period_earned: 500 } },
      error: null,
    })
    expect(await checkRankingModeIntegrity(missionMode(), hidden)).toEqual({ code: 'mission_period_earned_hidden' })
  })

  it('다른 조건 키만 있으면 문제 없음으로 본다', async () => {
    const ok = clientReturning({
      data: { status_display_type: 'ranking', condition_json: { distance_km: 5 } },
      error: null,
    })
    expect(await checkRankingModeIntegrity(missionMode(), ok)).toBeNull()
  })

  it('랭킹형이 아닌 미션은 기존 경고가 먼저다', async () => {
    const individual = clientReturning({
      data: { status_display_type: 'individual', condition_json: { jam_period_earned: 500 } },
      error: null,
    })
    expect(await checkRankingModeIntegrity(missionMode(), individual)).toEqual({
      code: 'mission_not_ranking_type',
      missionStatusDisplayType: 'individual',
    })
  })
})
