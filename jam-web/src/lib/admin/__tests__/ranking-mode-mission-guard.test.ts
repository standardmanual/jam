/**
 * 랭킹 모드에 연결할 수 없는 미션 — 기간 동안 모은 잼 미션 (티켓 20261019_1445 3-B, 4회)
 *
 * 4회: PATCH가 본문에 미션이 없어도 수정 뒤에도 남는 기존 연결을 검사한다(대상 방식을 바꾸는 수정은 통과),
 * 수정 화면의 선택 목록은 지금 연결된 그 미션을 «연결할 수 없는 미션» 표시와 함께 남긴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/ranking-mode-mission-guard.test.ts
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PERIOD_EARNED_EXISTING_LINK_ERROR,
  PERIOD_EARNED_OPTION_SUFFIX,
  PERIOD_EARNED_RANKING_ERROR,
  fetchRankingMissionOptions,
  isPeriodEarnedMission,
  rankingModeMissionRejection,
} from '../ranking-mode-mission-guard'

type Row = Record<string, unknown>

/**
 * `missions`·`ranking_modes` 표를 흉내 내는 가짜 클라이언트. 읽기 기록과 필터를 남긴다.
 * `rankingModes`는 PATCH가 읽는 기존 모드 행이다(주지 않으면 빈 표).
 */
function fakeMissions(
  rows: Row[],
  error: { message: string } | null = null,
  rankingModes: Row[] = [],
  rankingModesError: { message: string } | null = null,
) {
  const log = { reads: 0, tables: [] as string[], eq: [] as [string, unknown][] }
  const client = {
    from: (table: string) => {
      if (table !== 'missions' && table !== 'ranking_modes') throw new Error(`예상하지 못한 표: ${table}`)
      log.reads += 1
      log.tables.push(table)
      const source = table === 'missions' ? rows : rankingModes
      const sourceError = table === 'missions' ? error : rankingModesError
      const filters: ((row: Row) => boolean)[] = []
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.order = () => builder
      builder.eq = (column: string, value: unknown) => {
        log.eq.push([column, value])
        filters.push((row) => row[column] === value)
        return builder
      }
      const run = () => ({ data: sourceError ? null : source.filter((r) => filters.every((f) => f(r))), error: sourceError })
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

describe('rankingModeMissionRejection — PATCH가 본문에 미션이 없어도 기존 연결을 본다 (4회)', () => {
  const MODE_PERIOD = { id: 'mode-1', target_type: 'mission_participants', target_mission_id: 'm-period' }
  const MODE_PLAIN = { id: 'mode-2', target_type: 'mission_participants', target_mission_id: 'm-plain' }
  const MODE_MANUAL = { id: 'mode-3', target_type: 'manual_users', target_mission_id: null }

  it('기존 연결이 기간 동안 모은 잼 미션이면 [현상]→[원인]→[해결책] 문구로 거절한다', async () => {
    const { client } = fakeMissions([PERIOD], null, [MODE_PERIOD])
    const message = await rankingModeMissionRejection(client, { title: '제목만 바꿈' } as never, 'mode-1')

    expect(message).toBe(PERIOD_EARNED_EXISTING_LINK_ERROR)
    expect(message).toContain('저장하지 못했어요') // 현상
    expect(message).toContain('기간 동안 모은 잼') // 원인
    expect(message).toContain('다른 랭킹형 미션으로 바꿔 저장하거나') // 해결책
  })

  it('기존 연결이 일반 미션이면 통과한다', async () => {
    const { client } = fakeMissions([PLAIN], null, [MODE_PLAIN])
    expect(await rankingModeMissionRejection(client, {}, 'mode-2')).toBeNull()
  })

  it('대상 방식을 유저 직접 지정으로 바꾸는 수정은 기존 연결이 더는 쓰이지 않으므로 통과한다 (미션도 읽지 않는다)', async () => {
    const { client, log } = fakeMissions([PERIOD], null, [MODE_PERIOD])
    expect(await rankingModeMissionRejection(client, { target_type: 'manual_users' }, 'mode-1')).toBeNull()
    expect(log.tables).toEqual(['ranking_modes'])
  })

  it('대상 방식을 바꾸지 않고 미션 참가자 순위로 두는 수정은 기존 연결을 본다', async () => {
    const { client } = fakeMissions([PERIOD], null, [MODE_PERIOD])
    expect(await rankingModeMissionRejection(client, { target_type: 'mission_participants' }, 'mode-1')).toBe(
      PERIOD_EARNED_EXISTING_LINK_ERROR
    )
  })

  it('수동 지정 유저 모드(미션 없음)의 수정은 미션을 읽지 않는다', async () => {
    const { client, log } = fakeMissions([PERIOD], null, [MODE_MANUAL])
    expect(await rankingModeMissionRejection(client, {}, 'mode-3')).toBeNull()
    expect(log.tables).toEqual(['ranking_modes'])
  })

  it('없는 모드의 수정은 이 검사가 막지 않는다 (저장 쪽이 처리한다)', async () => {
    const { client } = fakeMissions([PERIOD], null, [])
    expect(await rankingModeMissionRejection(client, {}, 'mode-9')).toBeNull()
  })

  it('본문이 새 미션을 정하면 그 미션만 본다 — 기존 연결이 나빠도 고치는 수정은 통과하고, 모드는 읽지 않는다', async () => {
    const { client, log } = fakeMissions([PERIOD, PLAIN], null, [MODE_PERIOD])
    expect(await rankingModeMissionRejection(client, { target_mission_id: 'm-plain' }, 'mode-1')).toBeNull()
    expect(await rankingModeMissionRejection(client, { target_mission_id: 'm-period' }, 'mode-1')).toBe(PERIOD_EARNED_RANKING_ERROR)
    expect(log.tables).toEqual(['missions', 'missions'])
  })

  it('본문이 미션을 명시적으로 비우면(null·빈 문자열) 아무것도 읽지 않는다', async () => {
    const { client, log } = fakeMissions([PERIOD], null, [MODE_PERIOD])
    expect(await rankingModeMissionRejection(client, { target_mission_id: null }, 'mode-1')).toBeNull()
    expect(await rankingModeMissionRejection(client, { target_mission_id: '' }, 'mode-1')).toBeNull()
    expect(log.reads).toBe(0)
  })

  it('POST처럼 기존 모드가 없으면(existingModeId 없음) 본문에 미션이 없을 때 읽지 않는다', async () => {
    const { client, log } = fakeMissions([PERIOD], null, [MODE_PERIOD])
    expect(await rankingModeMissionRejection(client, { title: '새 규칙' } as never)).toBeNull()
    expect(log.reads).toBe(0)
  })

  it('기존 모드나 미션을 읽지 못하면 통과시키지 않고 던진다 (fail-closed)', async () => {
    const modeFail = fakeMissions([PERIOD], null, [MODE_PERIOD], { message: '모드 장애' })
    await expect(rankingModeMissionRejection(modeFail.client, {}, 'mode-1')).rejects.toThrow('모드 장애')
    const missionFail = fakeMissions([PERIOD], { message: '미션 장애' }, [MODE_PERIOD])
    await expect(rankingModeMissionRejection(missionFail.client, {}, 'mode-1')).rejects.toThrow('미션 장애')
  })
})

describe('fetchRankingMissionOptions', () => {
  it('랭킹형 미션 가운데 기간 동안 모은 잼 미션만 뺀 id·제목을 돌려준다', async () => {
    const { client, log } = fakeMissions([PERIOD, MIXED, PLAIN, INDIVIDUAL])
    const options = await fetchRankingMissionOptions(client)

    expect(options).toEqual([{ id: 'm-plain', title: '달리기' }])
    expect(log.eq).toEqual([['status_display_type', 'ranking']])
  })

  it('수정 화면: 지금 연결된 기간 동안 모은 잼 미션은 «연결할 수 없는 미션» 표시와 함께 남기고, 다른 모은 잼 미션은 계속 뺀다 (4회)', async () => {
    const { client } = fakeMissions([PERIOD, MIXED, PLAIN, INDIVIDUAL])
    const options = await fetchRankingMissionOptions(client, 'm-period')

    expect(options).toEqual([
      { id: 'm-period', title: `잼 모으기${PERIOD_EARNED_OPTION_SUFFIX}` },
      { id: 'm-plain', title: '달리기' },
    ])
  })

  it('수정 화면: 지금 연결된 미션이 일반 미션이거나 없으면 목록은 생성 화면과 같다', async () => {
    const { client } = fakeMissions([PERIOD, MIXED, PLAIN, INDIVIDUAL])
    expect(await fetchRankingMissionOptions(client, 'm-plain')).toEqual([{ id: 'm-plain', title: '달리기' }])
    expect(await fetchRankingMissionOptions(client, null)).toEqual([{ id: 'm-plain', title: '달리기' }])
    expect(await fetchRankingMissionOptions(client, undefined)).toEqual([{ id: 'm-plain', title: '달리기' }])
  })

  it('목록을 읽지 못하면 빈 목록이다(기존 화면과 같다)', async () => {
    const { client } = fakeMissions([PLAIN], { message: 'boom' })
    expect(await fetchRankingMissionOptions(client)).toEqual([])
  })
})
