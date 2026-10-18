/**
 * 시간대 구간 단일 상수 + KST 판정 + 날 단위 세기 (티켓 20261018_1815 1회)
 *
 * - 시간대 6구간(새벽 5~7, 오전 7~11, 점심 11~14, 오후 14~18, 저녁 18~22, 밤 22~5시)의 경계값
 * - 활동 시작 시각(UTC startDate)을 한국 시각으로 바꿔 판정 — 해외 활동의 현지 시각은 보지 않는다
 * - 횟수 5종(total_count·weekly_count·monthly_count·season_count·season_count_all)이 «활동한 날의 수»를 센다
 * - 진행 계산(badgeProgress)과 회차 계산(repeatOccurrences)이 같은 단위를 쓴다
 */
import { describe, it, expect } from 'vitest'
import { evaluateConditionDetailed } from '../index'
import { computeUserPeriodMetrics } from '../badgeProgress'
import { collectRepeatOccurrences } from '../repeatOccurrences'
import { timeBandOf, countDistinctTimeBands, inTimeRange, matchesDayOfMonth, matchesDayOfWeek } from '../activityFilters'
import {
  TIME_BANDS,
  timeBandOfHour,
  kstDateKeyOfStart,
  kstDayOfWeekOfStart,
  kstMondayKeyOfStart,
  kstYearMonthKeyOfStart,
} from '../timeBands'
import { formatBadgeConditionText } from '@/lib/badgeConditionText'
import { kstIso } from './kstFixture'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

let seq = 0
function run(kst: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  seq += 1
  return {
    stravaId: seq,
    name: 'Test Activity',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate: kstIso(kst),
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

describe('시간대 6구간 경계값 (KST)', () => {
  const cases: Array<[number, string]> = [
    [0, '밤'], [4, '밤'], [5, '새벽'], [6, '새벽'], [7, '오전'], [10, '오전'],
    [11, '점심'], [13, '점심'], [14, '오후'], [17, '오후'], [18, '저녁'], [21, '저녁'],
    [22, '밤'], [23, '밤'],
  ]
  it.each(cases)('%i시는 %s', (hour, band) => {
    expect(timeBandOfHour(hour)).toBe(band)
  })

  it('이름은 새벽·오전·점심·오후·저녁·밤 6개이고 하루 24시간이 빠짐없이 한 구간에 든다', () => {
    expect(TIME_BANDS).toEqual(['새벽', '오전', '점심', '오후', '저녁', '밤'])
    const seen = new Set(Array.from({ length: 24 }, (_, h) => timeBandOfHour(h)))
    expect(seen.size).toBe(6)
  })

  it('활동의 구간은 UTC startDate를 한국 시각으로 바꿔 정한다(UTC 20:00 = KST 05:00 = 새벽)', () => {
    const a = run('2026-07-20T05:00')
    expect(a.startDate).toBe('2026-07-19T20:00:00.000Z')
    expect(timeBandOf(a)).toBe('새벽')
    expect(timeBandOf(run('2026-07-20T06:59'))).toBe('새벽')
    expect(timeBandOf(run('2026-07-20T07:00'))).toBe('오전')
    expect(timeBandOf(run('2026-07-20T21:59'))).toBe('저녁')
    expect(timeBandOf(run('2026-07-20T22:00'))).toBe('밤')
    expect(timeBandOf(run('2026-07-20T04:59'))).toBe('밤')
  })

  it('해외 활동도 한국 시각으로 판정한다 — 현지 시각(startDateLocal)은 보지 않는다', () => {
    // 한국 시각 05:30(새벽) 활동이 현지(UTC-5)로는 전날 15:30이다
    const a = run('2026-07-20T05:30', { startDateLocal: '2026-07-19T15:30:00' })
    expect(timeBandOf(a)).toBe('새벽')
    expect(inTimeRange(a, { start: '05:00', end: '07:00' })).toBe(true)
  })

  it('서로 다른 시간대 개수는 6구간 기준이다', () => {
    const acts = ['05:00', '07:00', '11:00', '14:00', '18:00', '22:00'].map((t) => run(`2026-07-20T${t}`))
    expect(countDistinctTimeBands(acts)).toBe(6)
    expect(countDistinctTimeBands(acts.slice(0, 3))).toBe(3)
  })

  it('조건 문구의 시간대 이름도 같은 상수를 쓴다', () => {
    expect(formatBadgeConditionText({ time_range: { start: '05:00', end: '07:00' } }, '배지')).toContain('새벽 시간대')
    expect(formatBadgeConditionText({ time_range: { start: '07:00', end: '11:00' } }, '배지')).toContain('오전 시간대')
    expect(formatBadgeConditionText({ time_range: { start: '22:00', end: '05:00' } }, '배지')).toContain('밤 시간대')
  })
})

describe('KST 날짜·요일·월 변환', () => {
  it('UTC 15:00은 한국 시각으로 다음 날 00:00이다', () => {
    expect(kstDateKeyOfStart('2026-07-20T14:59:00Z')).toBe('2026-07-20')
    expect(kstDateKeyOfStart('2026-07-20T15:00:00Z')).toBe('2026-07-21')
  })

  it('요일은 한국 날짜 기준이다(일요일 23:30 KST = UTC 14:30 일요일, 월요일 00:30 KST = UTC 15:30 일요일)', () => {
    expect(kstDayOfWeekOfStart(kstIso('2026-07-26T23:30'))).toBe(0)
    expect(kstDayOfWeekOfStart(kstIso('2026-07-27T00:30'))).toBe(1)
    expect(matchesDayOfWeek(run('2026-07-27T00:30'), 'monday')).toBe(true)
    expect(matchesDayOfWeek(run('2026-07-26T23:30'), 'monday')).toBe(false)
  })

  it('주 키와 월 키도 한국 날짜 기준이다', () => {
    expect(kstMondayKeyOfStart(kstIso('2026-07-26T23:30'))).toBe('2026-07-20')
    expect(kstMondayKeyOfStart(kstIso('2026-07-27T00:30'))).toBe('2026-07-27')
    expect(kstYearMonthKeyOfStart(kstIso('2026-07-31T23:30'))).toBe('2026-7')
    expect(kstYearMonthKeyOfStart(kstIso('2026-08-01T00:30'))).toBe('2026-8')
    expect(matchesDayOfMonth(run('2026-08-01T00:30'), 1)).toBe(true)
  })
})

describe('날 단위 세기 — total_count', () => {
  const cond: BadgeCondition = { activity_type: 'running', total_count: 3 }

  it('같은 날 여러 번은 한 번으로 센다', () => {
    const acts = [run('2026-07-20T06:00'), run('2026-07-20T12:00'), run('2026-07-20T19:00')]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.actual).toBe('1회')
  })

  it('서로 다른 날 3일이면 채운다', () => {
    const acts = [run('2026-07-20T06:00'), run('2026-07-21T06:00'), run('2026-07-22T06:00')]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('날의 경계는 한국 시각 자정이다 — UTC로는 같은 날이어도 KST로 다른 날이면 둘로 센다', () => {
    // UTC 07-20 10:00(KST 19:00)과 UTC 07-20 16:00(KST 07-21 01:00)
    const split = [run('2026-07-20T19:00'), run('2026-07-21T01:00')]
    expect(evaluateConditionDetailed({ activity_type: 'running', total_count: 2 }, split).pass).toBe(true)
    // UTC로는 다른 날(07-20 20:00, 07-20 23:00 → 같은 UTC 날)이지만 KST로는 07-21 05:00·08:00 같은 날
    const same = [run('2026-07-21T05:00'), run('2026-07-21T08:00')]
    expect(evaluateConditionDetailed({ activity_type: 'running', total_count: 2 }, same).pass).toBe(false)
  })

  it('요일별 독립 카운터도 날 수로 센다', () => {
    const c: BadgeCondition = { activity_type: 'running', day_of_week: ['monday', 'tuesday'], total_count: 2 }
    // 2026-07-20(월), 07-21(화), 07-27(월), 07-28(화)
    const sameDay = [run('2026-07-20T06:00'), run('2026-07-20T18:00'), run('2026-07-21T06:00'), run('2026-07-21T18:00')]
    const r1 = evaluateConditionDetailed(c, sameDay)
    expect(r1.pass).toBe(false)
    expect(r1.actual).toContain('월: 1회')
    const otherDays = [...sameDay, run('2026-07-27T06:00'), run('2026-07-28T06:00')]
    expect(evaluateConditionDetailed(c, otherDays).pass).toBe(true)
  })

  it('시간 창 안 횟수(activities_within_hours)는 날 단위가 아니라 활동 수로 센다', () => {
    const c: BadgeCondition = { activity_type: 'running', activities_within_hours: { hours: 24, count: 3 } }
    const acts = [run('2026-07-20T06:00'), run('2026-07-20T12:00'), run('2026-07-20T19:00')]
    expect(evaluateConditionDetailed(c, acts).pass).toBe(true)
  })
})

describe('날 단위 세기 — weekly_count / monthly_count', () => {
  it('weekly_count: 같은 날 두 번은 1회, 다른 날 두 번이면 채운다', () => {
    const c: BadgeCondition = { activity_type: 'running', weekly_count: 2 }
    expect(evaluateConditionDetailed(c, [run('2026-07-20T06:00'), run('2026-07-20T19:00')]).pass).toBe(false)
    expect(evaluateConditionDetailed(c, [run('2026-07-20T06:00'), run('2026-07-21T19:00')]).pass).toBe(true)
  })

  it('weekly_count: 주는 한국 시각 월~일이다(일요일 23:30 KST와 월요일 00:30 KST는 다른 주)', () => {
    const c: BadgeCondition = { activity_type: 'running', weekly_count: 2 }
    expect(evaluateConditionDetailed(c, [run('2026-07-26T23:30'), run('2026-07-27T00:30')]).pass).toBe(false)
    expect(evaluateConditionDetailed(c, [run('2026-07-25T23:30'), run('2026-07-26T23:30')]).pass).toBe(true)
  })

  it('weekly_count + time_range: 시간대 안 활동만, 날 수로 센다', () => {
    const c: BadgeCondition = { activity_type: 'running', time_range: { start: '05:00', end: '07:00' }, weekly_count: 2 }
    expect(evaluateConditionDetailed(c, [run('2026-07-20T05:30'), run('2026-07-20T06:30')]).pass).toBe(false)
    expect(evaluateConditionDetailed(c, [run('2026-07-20T05:30'), run('2026-07-21T06:30')]).pass).toBe(true)
  })

  it('monthly_count: 같은 날 두 번은 1회, 다른 날 두 번이면 채운다', () => {
    const c: BadgeCondition = { activity_type: 'running', monthly_count: 2 }
    expect(evaluateConditionDetailed(c, [run('2026-07-05T06:00'), run('2026-07-05T19:00')]).pass).toBe(false)
    expect(evaluateConditionDetailed(c, [run('2026-07-05T06:00'), run('2026-07-06T19:00')]).pass).toBe(true)
  })

  it('monthly_count: 달은 한국 시각 기준이다(7월 31일 23:30 KST와 8월 1일 00:30 KST는 다른 달)', () => {
    const c: BadgeCondition = { activity_type: 'running', monthly_count: 2 }
    expect(evaluateConditionDetailed(c, [run('2026-07-31T23:30'), run('2026-08-01T00:30')]).pass).toBe(false)
  })
})

describe('날 단위 세기 — season_count / season_count_all', () => {
  it('season_count: 계절 안에서 같은 날 두 번은 1회', () => {
    const c: BadgeCondition = { activity_type: 'running', season: 'summer', season_count: 2 }
    expect(evaluateConditionDetailed(c, [run('2026-07-05T06:00'), run('2026-07-05T19:00')]).pass).toBe(false)
    expect(evaluateConditionDetailed(c, [run('2026-07-05T06:00'), run('2026-07-06T19:00')]).pass).toBe(true)
  })

  it('season_count(all): 전체 활동일 수로 센다', () => {
    const c: BadgeCondition = { activity_type: 'running', season: 'all', season_count: 2 }
    expect(evaluateConditionDetailed(c, [run('2026-04-05T06:00'), run('2026-04-05T19:00')]).pass).toBe(false)
    expect(evaluateConditionDetailed(c, [run('2026-04-05T06:00'), run('2026-10-06T19:00')]).pass).toBe(true)
  })

  it('season_count: 계절은 한국 시각의 월로 가른다(5월 31일 23:30 KST는 봄, 6월 1일 00:30 KST는 여름)', () => {
    const c: BadgeCondition = { activity_type: 'running', season: 'summer', season_count: 1 }
    expect(evaluateConditionDetailed(c, [run('2026-05-31T23:30')]).pass).toBe(false)
    expect(evaluateConditionDetailed(c, [run('2026-06-01T00:30')]).pass).toBe(true)
  })

  it('season_count_all: 사계절 각각 날 수로 센다', () => {
    const c: BadgeCondition = { activity_type: 'running', season_count_all: 2 }
    const oncePerDay = [
      run('2026-04-01T06:00'), run('2026-04-01T18:00'),
      run('2026-07-01T06:00'), run('2026-07-01T18:00'),
      run('2026-10-01T06:00'), run('2026-10-01T18:00'),
      run('2026-01-01T06:00'), run('2026-01-01T18:00'),
    ]
    const r = evaluateConditionDetailed(c, oncePerDay)
    expect(r.pass).toBe(false)
    expect(r.actual).toContain('봄: 1회')
    const twoDays = [...oncePerDay, run('2026-04-02T06:00'), run('2026-07-02T06:00'), run('2026-10-02T06:00'), run('2026-01-02T06:00')]
    expect(evaluateConditionDetailed(c, twoDays).pass).toBe(true)
  })
})

describe('진행 계산과 회차 계산이 같은 단위를 쓴다', () => {
  it('computeUserPeriodMetrics: 총·요일·계절·이번 주 횟수가 날 수이고, 주·달 경계는 KST다', () => {
    const acts = [
      run('2026-07-20T06:00'), run('2026-07-20T19:00'), // 월요일 같은 날
      run('2026-07-21T06:00'),
    ]
    // 2026-07-22 09:00 KST (수요일)
    const now = new Date(kstIso('2026-07-22T09:00'))
    const m = computeUserPeriodMetrics('running', acts, now)
    expect(m.totalCount).toBe(2)
    expect(m.dayOfWeekCounts.monday).toBe(1)
    expect(m.seasonCounts.summer).toBe(2)
    expect(m.weeklyCountCurrent).toBe(2)
    expect(m.monthlyCountCurrent).toBe(2)
    expect(m.currentWeekMondayKey).toBe('2026-07-20')
    // 다음 월요일 00:00 KST = 일요일 15:00 UTC, 다음 달 1일 00:00 KST = 전달 말일 15:00 UTC
    expect(m.weekEndsAt).toBe('2026-07-26T15:00:00.000Z')
    expect(m.monthEndsAt).toBe('2026-07-31T15:00:00.000Z')
  })

  it('weekly_count + repeat_count 회차: 같은 날 두 번은 회차가 아니고, 다른 날 두 번이면 한 회차다', () => {
    const c: BadgeCondition = { activity_type: 'running', weekly_count: 2, repeat_count: 1 }
    expect(collectRepeatOccurrences(c, [run('2026-07-20T06:00'), run('2026-07-20T19:00')])).toHaveLength(0)
    expect(collectRepeatOccurrences(c, [run('2026-07-20T06:00'), run('2026-07-21T19:00')])).toHaveLength(1)
  })

  it('monthly_count + repeat_count 회차도 날 수로 센다', () => {
    const c: BadgeCondition = { activity_type: 'running', monthly_count: 2, repeat_count: 1 }
    expect(collectRepeatOccurrences(c, [run('2026-07-05T06:00'), run('2026-07-05T19:00')])).toHaveLength(0)
    expect(collectRepeatOccurrences(c, [run('2026-07-05T06:00'), run('2026-07-06T19:00')])).toHaveLength(1)
  })
})
