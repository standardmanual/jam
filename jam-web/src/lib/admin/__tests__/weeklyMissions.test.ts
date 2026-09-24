/**
 * weeklyMissions.ts — 미션을 「기간 미션 막대 목록 · 상시 미션 개수 · 그 주 시작 상시 미션」으로
 * 배분하는 순수 함수 유닛테스트(티켓 20260924_0907)
 *
 * 지키는 것:
 * 1. 기간 미션이 주 밖으로 넘치면 0(월)·6(일)로 자르고, 잘린 쪽은 시작·종료 표식을 안 붙인다
 * 2. 주 안에서 시작·종료하는 기간 미션은 두 표식이 모두 붙고 열 위치가 정확하다
 * 3. KST 날짜 경계(하루의 끝 23:59:59.999 / 다음 날 시작 00:00:00.000)에서 열 위치가 정확하다
 * 4. 상시 미션 개수는 그 주 일요일 끝까지 시작한 미션만 센다(아직 시작 전인 미션은 제외)
 * 5. 그 주에 새로 시작하는 상시 미션만 openEndedStarting에 담긴다
 */
import { describe, it, expect } from 'vitest'
import { weeklyMissions, type WeeklyMissionInput } from '../weeklyMissions'
import { kstDayBoundsIso } from '../today-calendar'

const MONDAY = '2026-09-21' // 이 주의 KST 하루 경계: 09-21은 UTC 09-20T15:00:00.000Z ~ 09-21T14:59:59.999Z

function mission(overrides: Partial<WeeklyMissionInput> & Pick<WeeklyMissionInput, 'id' | 'starts_at'>): WeeklyMissionInput {
  return {
    title: '미션',
    ends_at: null,
    gate_axis: null,
    ...overrides,
  }
}

describe('weeklyMissions', () => {
  it('기간 미션이 주 앞뒤로 넘치면 0(월)·6(일)로 자르고 시작·종료 표식을 붙이지 않는다', () => {
    const spansWholeWeek = mission({
      id: 'spans',
      title: '연중 이벤트',
      starts_at: '2026-08-01T00:00:00.000Z',
      ends_at: '2026-12-01T00:00:00.000Z',
    })
    const { bars } = weeklyMissions([spansWholeWeek], MONDAY)
    expect(bars).toEqual([
      { id: 'spans', title: '연중 이벤트', startCol: 0, endCol: 6, startsThisWeek: false, endsThisWeek: false, isGate: false },
    ])
  })

  it('주 앞에서 시작해 주 안에서 끝나는 기간 미션은 시작 열만 0으로 자르고 종료 표식을 붙인다', () => {
    // 종료: 09-23(수) KST 하루 끝
    const endsWednesday = mission({
      id: 'ends-wed',
      starts_at: '2026-09-01T00:00:00.000Z',
      ends_at: kstDayBoundsIso('2026-09-23').endIso,
    })
    const { bars } = weeklyMissions([endsWednesday], MONDAY)
    expect(bars).toEqual([
      { id: 'ends-wed', title: '미션', startCol: 0, endCol: 2, startsThisWeek: false, endsThisWeek: true, isGate: false },
    ])
  })

  it('주 안에서 시작해 주 뒤에서 끝나는 게이트 미션은 종료 열만 6으로 자르고 시작 표식을 붙인다', () => {
    // 시작: 09-24(목) KST 하루 시작
    const startsThursday = mission({
      id: 'starts-thu',
      title: '게이트 이벤트',
      starts_at: kstDayBoundsIso('2026-09-24').startIso,
      ends_at: '2026-12-01T00:00:00.000Z',
      gate_axis: 'running:speed',
    })
    const { bars } = weeklyMissions([startsThursday], MONDAY)
    expect(bars).toEqual([
      { id: 'starts-thu', title: '게이트 이벤트', startCol: 3, endCol: 6, startsThisWeek: true, endsThisWeek: false, isGate: true },
    ])
  })

  it('주 안에서 시작하고 끝나는 기간 미션은 시작·종료 표식이 모두 붙고 열 위치가 정확하다', () => {
    // 화(1) 시작 ~ 금(4) 종료
    const withinWeek = mission({
      id: 'within',
      title: '주간 특가',
      starts_at: kstDayBoundsIso('2026-09-22').startIso,
      ends_at: kstDayBoundsIso('2026-09-25').endIso,
    })
    const { bars } = weeklyMissions([withinWeek], MONDAY)
    expect(bars).toEqual([
      { id: 'within', title: '주간 특가', startCol: 1, endCol: 4, startsThisWeek: true, endsThisWeek: true, isGate: false },
    ])
  })

  it('KST 하루 경계 — 월요일 마지막 순간(23:59:59.999)에 시작하면 0열, 화요일 첫 순간(00:00:00.000)에 시작하면 1열이다', () => {
    const startsAtMondayEnd = mission({
      id: 'monday-end',
      starts_at: '2026-09-21T14:59:59.999Z', // KST 09-21 23:59:59.999
      ends_at: '2026-09-21T14:59:59.999Z',
    })
    const startsAtTuesdayBegin = mission({
      id: 'tuesday-begin',
      starts_at: '2026-09-21T15:00:00.000Z', // KST 09-22 00:00:00.000
      ends_at: '2026-09-21T15:00:00.000Z',
    })
    const { bars } = weeklyMissions([startsAtMondayEnd, startsAtTuesdayBegin], MONDAY)
    const byId = new Map(bars.map((b) => [b.id, b]))
    expect(byId.get('monday-end')).toMatchObject({ startCol: 0, endCol: 0 })
    expect(byId.get('tuesday-begin')).toMatchObject({ startCol: 1, endCol: 1 })
  })

  it('이 주와 겹치지 않는 기간 미션은 막대에 포함하지 않는다', () => {
    const beforeWeek = mission({
      id: 'before',
      starts_at: '2026-09-01T00:00:00.000Z',
      ends_at: '2026-09-20T14:59:59.999Z', // KST 09-20 23:59:59.999 — 월요일 시작 전에 끝난다
    })
    const afterWeek = mission({
      id: 'after',
      starts_at: '2026-09-28T15:00:00.000Z', // KST 09-29 시작 — 다음 주
      ends_at: '2026-10-05T00:00:00.000Z',
    })
    const { bars } = weeklyMissions([beforeWeek, afterWeek], MONDAY)
    expect(bars).toEqual([])
  })

  it('상시 미션 개수는 그 주 일요일 끝까지 시작한 미션만 센다(아직 시작 전인 미션 제외)', () => {
    const alreadyStarted = mission({ id: 'started-1', starts_at: '2026-08-01T00:00:00.000Z' })
    const startsThisWeek = mission({ id: 'started-2', starts_at: kstDayBoundsIso('2026-09-23').startIso })
    const notYetStarted = mission({ id: 'future', starts_at: '2026-09-28T15:00:00.000Z' }) // KST 09-29 — 다음 주
    const { openEndedCount } = weeklyMissions([alreadyStarted, startsThisWeek, notYetStarted], MONDAY)
    expect(openEndedCount).toBe(2)
  })

  it('그 주에 새로 시작하는 상시 미션만 openEndedStarting에 담고, 이전에 시작한 미션은 담지 않는다', () => {
    const alreadyStarted = mission({ id: 'started-1', title: '예전 상시 미션', starts_at: '2026-08-01T00:00:00.000Z' })
    const startsThisWeek = mission({
      id: 'started-2',
      title: '새 상시 미션',
      starts_at: kstDayBoundsIso('2026-09-23').startIso, // 수요일 시작
    })
    const { openEndedStarting } = weeklyMissions([alreadyStarted, startsThisWeek], MONDAY)
    expect(openEndedStarting).toEqual([{ id: 'started-2', title: '새 상시 미션', date: '2026-09-23' }])
  })
})
