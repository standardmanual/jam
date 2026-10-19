/**
 * 랭킹 모드에 연결할 수 없는 미션 — 기간 동안 모은 잼 미션 (티켓 20261019_1445 3-B)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/ranking-mode-mission-guard.test.ts
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PERIOD_EARNED_RANKING_ERROR,
  fetchRankingMissionOptions,
  isPeriodEarnedMission,
  rankingModeMissionRejection,
} from '../ranking-mode-mission-guard'

type Row = Record<string, unknown>

/** `missions` 표 하나만 흉내 내는 가짜 클라이언트. 읽기 기록과 필터를 남긴다 */
function fakeMissions(rows: Row[], error: { message: string } | null = null) {
  const log = { reads: 0, eq: [] as [string, unknown][] }
  const client = {
    from: (table: string) => {
      if (table !== 'missions') throw new Error(`예상하지 못한 표: ${table}`)
      log.reads += 1
      const filters: ((row: Row) => boolean)[] = []
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.order = () => builder
      builder.eq = (column: string, value: unknown) => {
        log.eq.push([column, value])
        filters.push((row) => row[column] === value)
        return builder
      }
      const run = () => ({ data: error ? null : rows.filter((r) => filters.every((f) => f(r))), error })
      builder.maybeSingle = () => {
        const { data, error: e } = run()
        return Promise.resolve({ data: data?.[0] ?? null, error: e })
      }
      builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(run()).then(resolve, reject)
      return builder
    },
  } as unknown as SupabaseClient
  return { client, log }
}

const PERIOD = { id: 'm-period', title: '잼 모으기', status_display_type: 'ranking', condition_json: { jam_period_earned: 500 } }
const MIXED = {
  id: 'm-mixed',
  title: '잼과 믹스',
  status_display_type: 'ranking',
  condition_json: { jam_period_earned: 300, combine_success_count: 2 },
}
const PLAIN = { id: 'm-plain', title: '달리기', status_display_type: 'ranking', condition_json: { distance_km: 5 } }
const INDIVIDUAL = { id: 'm-indiv', title: '개인형', status_display_type: 'individual', condition_json: { distance_km: 1 } }

describe('isPeriodEarnedMission', () => {
  it('조건에 jam_period_earned가 있으면 true, 없으면 false', async () => {
    const { client } = fakeMissions([PERIOD, PLAIN])
    expect(await isPeriodEarnedMission(client, 'm-period')).toBe(true)
    expect(await isPeriodEarnedMission(client, 'm-plain')).toBe(false)
  })

  it('없는 미션은 false다(연결 자체는 DB가 거절한다)', async () => {
    const { client } = fakeMissions([PLAIN])
    expect(await isPeriodEarnedMission(client, 'nope')).toBe(false)
  })

  it('읽지 못하면 false로 폴백하지 않고 던진다', async () => {
    const { client } = fakeMissions([PERIOD], { message: 'connection reset' })
    await expect(isPeriodEarnedMission(client, 'm-period')).rejects.toThrow('connection reset')
  })
})

describe('rankingModeMissionRejection', () => {
  it('기간 동안 모은 잼 미션이면 [현상]→[원인]→[해결책] 문구를 돌려준다', async () => {
    const { client } = fakeMissions([PERIOD])
    const message = await rankingModeMissionRejection(client, { target_mission_id: 'm-period' })

    expect(message).toBe(PERIOD_EARNED_RANKING_ERROR)
    expect(message).toContain('연결할 수 없어요') // 현상
    expect(message).toContain('기간 동안 모은 잼') // 원인
    expect(message).toContain('다른 랭킹형 미션을 고르거나') // 해결책
  })

  it('복합 조건 안에 든 경우도 거절한다', async () => {
    const { client } = fakeMissions([MIXED])
    expect(await rankingModeMissionRejection(client, { target_mission_id: 'm-mixed' })).toBe(PERIOD_EARNED_RANKING_ERROR)
  })

  it('다른 조건 미션은 통과한다', async () => {
    const { client } = fakeMissions([PLAIN])
    expect(await rankingModeMissionRejection(client, { target_mission_id: 'm-plain' })).toBeNull()
  })

  it('연결할 미션이 본문에 없으면 아무것도 읽지 않는다', async () => {
    const { client, log } = fakeMissions([PERIOD])
    expect(await rankingModeMissionRejection(client, {})).toBeNull()
    expect(await rankingModeMissionRejection(client, { target_mission_id: null })).toBeNull()
    expect(await rankingModeMissionRejection(client, { target_mission_id: '' })).toBeNull()
    expect(log.reads).toBe(0)
  })
})

describe('fetchRankingMissionOptions', () => {
  it('랭킹형 미션 가운데 기간 동안 모은 잼 미션만 뺀 id·제목을 돌려준다', async () => {
    const { client, log } = fakeMissions([PERIOD, MIXED, PLAIN, INDIVIDUAL])
    const options = await fetchRankingMissionOptions(client)

    expect(options).toEqual([{ id: 'm-plain', title: '달리기' }])
    expect(log.eq).toEqual([['status_display_type', 'ranking']])
  })

  it('목록을 읽지 못하면 빈 목록이다(기존 화면과 같다)', async () => {
    const { client } = fakeMissions([PLAIN], { message: 'boom' })
    expect(await fetchRankingMissionOptions(client)).toEqual([])
  })
})
