import {
  applyMissionShow,
  classifyMissionDeletion,
  classifyMissionEndPeriod,
  classifyMissionHide,
  planMissionShow,
  sumInProgressUsers,
  type MissionBulkRow,
} from '../mission-bulk'
import type { UpdateAllOrNothingResult } from '../bulk/server'

const NOW = new Date('2026-09-24T03:00:00.000Z')

function row(overrides: Partial<MissionBulkRow> & { id: string }): MissionBulkRow {
  return {
    title: `미션 ${overrides.id}`,
    exposure_mode: 'start_date',
    exposure_at: null,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: null,
    ...overrides,
  }
}

describe('planMissionShow — 노출 모드 복원 규칙', () => {
  it('숨김 미션은 노출일이 있으면 scheduled, 없으면 start_date로 되돌린다', () => {
    const rows = [
      row({ id: 'a', exposure_mode: 'hidden', exposure_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'b', exposure_mode: 'hidden', exposure_at: null }),
    ]
    expect(planMissionShow(['a', 'b'], rows)).toEqual({ toScheduled: ['a'], toStartDate: ['b'], skipped: [] })
  })

  it('이미 노출 중이거나 없는 id는 사유와 함께 건너뛴다', () => {
    const plan = planMissionShow(['a', 'x'], [row({ id: 'a', exposure_mode: 'scheduled' })])
    expect(plan.toScheduled).toEqual([])
    expect(plan.toStartDate).toEqual([])
    expect(plan.skipped).toEqual([
      { id: 'a', label: '미션 a', reason: '이미 노출 중이에요.' },
      { id: 'x', reason: '미션을 찾을 수 없어요.' },
    ])
  })
})

describe('applyMissionShow — 두 문장 중 뒤가 실패하면 앞을 되돌린다', () => {
  const ok = (ids: string[]): UpdateAllOrNothingResult => ({ ok: true, updatedIds: ids, partiallyApplied: false, error: null })
  const fail = (error: string): UpdateAllOrNothingResult => ({ ok: false, updatedIds: [], partiallyApplied: false, error })

  it('둘 다 성공하면 두 모드로 각각 갱신하고 전체를 처리한 것으로 돌려준다', async () => {
    const calls: [string[], Record<string, unknown>][] = []
    const result = await applyMissionShow({ toScheduled: ['a'], toStartDate: ['b', 'c'] }, async (ids, patch) => {
      calls.push([ids, patch])
      return ok(ids)
    })
    expect(result).toEqual({ ok: true, processed: ['a', 'b', 'c'] })
    expect(calls).toEqual([
      [['a'], { exposure_mode: 'scheduled' }],
      [['b', 'c'], { exposure_mode: 'start_date' }],
    ])
  })

  it('뒤 문장이 실패하면 앞 문장에서 바꾼 id를 숨김으로 되돌린다', async () => {
    const calls: [string[], Record<string, unknown>][] = []
    const result = await applyMissionShow({ toScheduled: ['a'], toStartDate: ['b'] }, async (ids, patch) => {
      calls.push([ids, patch])
      return patch.exposure_mode === 'start_date' ? fail('뒤 문장 실패') : ok(ids)
    })
    expect(result).toEqual({ ok: false, error: '뒤 문장 실패' })
    expect(calls[2]).toEqual([['a'], { exposure_mode: 'hidden' }])
  })

  it('되돌리기까지 실패하면 일부만 반영됐음을 알린다', async () => {
    const result = await applyMissionShow({ toScheduled: ['a'], toStartDate: ['b'] }, async (ids, patch) => {
      if (patch.exposure_mode === 'start_date') return fail('뒤 문장 실패')
      if (patch.exposure_mode === 'hidden') return fail('되돌리기 실패')
      return ok(ids)
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('일부만 반영됐습니다')
  })

  it('앞 문장이 실패하면 뒤 문장은 실행하지 않는다', async () => {
    let calls = 0
    const result = await applyMissionShow({ toScheduled: ['a'], toStartDate: ['b'] }, async () => {
      calls += 1
      return fail('앞 문장 실패')
    })
    expect(result).toEqual({ ok: false, error: '앞 문장 실패' })
    expect(calls).toBe(1)
  })
})

describe('classifyMissionHide', () => {
  it('이미 숨김인 미션과 없는 id는 건너뛴다', () => {
    const result = classifyMissionHide(
      ['a', 'b', 'x'],
      [row({ id: 'a' }), row({ id: 'b', exposure_mode: 'hidden' })]
    )
    expect(result.targets).toEqual(['a'])
    expect(result.skipped.map((s) => s.id)).toEqual(['b', 'x'])
  })
})

describe('classifyMissionEndPeriod', () => {
  it('시작 전·이미 종료된 미션은 사유와 함께 건너뛰고, 진행 중·상시 미션만 처리한다', () => {
    const rows = [
      row({ id: 'upcoming', starts_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'ended', ends_at: '2026-09-20T00:00:00Z' }),
      row({ id: 'active', ends_at: '2026-10-30T00:00:00Z' }),
      row({ id: 'always', ends_at: null }),
    ]
    const result = classifyMissionEndPeriod(['upcoming', 'ended', 'active', 'always'], rows, NOW)
    expect(result.targets).toEqual(['active', 'always'])
    expect(result.skipped).toEqual([
      { id: 'upcoming', label: '미션 upcoming', reason: '아직 시작 전인 미션이에요.' },
      { id: 'ended', label: '미션 ended', reason: '이미 끝난 미션이에요.' },
    ])
  })
})

describe('classifyMissionDeletion', () => {
  it('참여·완료 이력이 있는 미션은 건너뛰고, 투데이 카드 연결처럼 막지 않는 참조는 통과시킨다', () => {
    const counts = new Map<string, Record<string, number>>([
      ['blocked', { user_mission_completions: 2, user_mission_participations: 3 }],
      ['linked', { today_cards: 1 }],
      ['free', {}],
    ])
    const result = classifyMissionDeletion(
      ['blocked', 'linked', 'free'],
      [row({ id: 'blocked' }), row({ id: 'linked' }), row({ id: 'free' })],
      counts
    )
    expect(result.targets).toEqual(['linked', 'free'])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]).toMatchObject({ id: 'blocked', label: '미션 blocked' })
    expect(result.skipped[0].reason).toContain('5건')
  })
})

describe('sumInProgressUsers — 참여 건수 − 완료 건수의 합', () => {
  it('미션별 차이를 합한다', () => {
    expect(
      sumInProgressUsers(['a', 'b'], { a: 10, b: 4 }, { a: 3, b: 1 })
    ).toBe(10)
  })

  it('집계에 없는 미션은 0으로 보고, 완료가 더 많은 미션은 음수가 아니라 0으로 본다', () => {
    expect(sumInProgressUsers(['a', 'b', 'c'], { a: 2 }, { a: 5, b: 1 })).toBe(0)
    expect(sumInProgressUsers([], {}, {})).toBe(0)
  })
})
