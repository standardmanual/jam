/**
 * 날 기준 KST 통일 — 연속·휴식·활동일·주·월 (티켓 20261019_1312 2회, 티켓 20261018_2303)
 *
 * 4-4 1회가 시간대·요일·월·계절·횟수 5종을 KST 날로 바꿨고, 이 시험은 남아 있던 연속(`streak_days`·
 * `weekly_streak`)·휴식(공백)·활동일(`active_days_count`)·전월 대비 배수의 «날»이 활동 시작 시각(UTC `startDate`)을
 * 한국 시각으로 바꾼 날짜를 쓴다는 것을 고정한다. 해외 활동의 현지 날짜(`startDateLocal`)는 보지 않는다.
 *
 * 해외 활동 시뮬레이션: 미국 서부(UTC-7)에서 한 활동은 현지 벽시계가 한국 시각보다 16시간 앞선 날짜를 가리켜
 * 한국 시각 00:00~15:59에 시작한 활동의 현지 날짜가 하루 전이다. 한국 활동은 현지 벽시계 = 한국 시각이다.
 */
import { describe, it, expect } from 'vitest'
import {
  calcMaxStreak,
  calcMaxWeeklyStreak,
  countActiveDays,
  buildRestIntervals,
  restPool,
  bestMonthOverMonthRatio,
  kstDateKeyOf,
  kstWeekKeyOf,
  kstMonthKeyOf,
} from '../activityFilters'
import { evaluateConditionDetailed } from '../index'
import { computeUserPeriodMetrics } from '../badgeProgress'
import { collectRepeatOccurrences } from '../repeatOccurrences'
import { kstIso } from './kstFixture'
import type { NormalizedActivity } from '@/types/strava'

let seq = 0
/** 한국 시각 `kst`에 시작한 활동. `abroad`면 현지 벽시계(미국 서부, 한국보다 16시간 늦음)를 `startDateLocal`에 넣는다 */
function run(kst: string, opts: { abroad?: boolean; distanceKm?: number } = {}): NormalizedActivity {
  seq += 1
  const startDate = kstIso(kst)
  const local = new Date(Date.parse(startDate) - 7 * 60 * 60 * 1000).toISOString().slice(0, 19)
  const kstWall = kst.length === 16 ? `${kst}:00` : kst
  return {
    stravaId: seq,
    name: `run-${seq}`,
    distanceKm: opts.distanceKm ?? 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate,
    startDateLocal: opts.abroad ? local : kstWall,
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
  }
}

describe('해외 활동 시뮬레이션 보조가 현지와 KST 날을 가른다 (시험 전제)', () => {
  it('한국 시각 7/6 10:00 활동의 현지 날짜는 7/5, 한국 시각 7/6 20:00 활동의 현지 날짜는 7/6이다', () => {
    expect(run('2026-07-06T10:00', { abroad: true }).startDateLocal?.slice(0, 10)).toBe('2026-07-05')
    expect(run('2026-07-06T20:00', { abroad: true }).startDateLocal?.slice(0, 10)).toBe('2026-07-06')
  })
})

describe('한국 활동의 기존 결과가 달라지지 않는다 (회귀)', () => {
  // 옛 방식: 현지 벽시계 문자열(`startDateLocal`)에서 날·달을 읽었다. 한국에서 한 활동은 현지 벽시계 = 한국 시각이라
  // 새 방식(KST 헬퍼)과 같은 키가 나와야 한다 — 일·주·월 키가 같으면 연속·휴식·활동일·주·월 개수가 모두 그대로다.
  const legacyDateKey = (a: NormalizedActivity) => (a.startDateLocal ?? a.startDate).slice(0, 10)
  const legacyMonthKey = (a: NormalizedActivity) => {
    const [y, m] = legacyDateKey(a).split('-').map(Number)
    return `${y}-${m}`
  }
  const legacyWeekKey = (a: NormalizedActivity) => {
    const day = new Date(`${legacyDateKey(a)}T00:00:00Z`)
    const dow = day.getUTCDay()
    day.setUTCDate(day.getUTCDate() - (dow === 0 ? 6 : dow - 1))
    return day.toISOString().slice(0, 10)
  }

  // 연말·연초와 2월 말·3월 초, 일요일→월요일 경계를 모두 지나도록 한 시간 간격으로 훑는다
  const spans: Array<[string, number]> = [
    ['2026-12-27T00:00', 24 * 9],
    ['2027-02-26T00:00', 24 * 5],
    ['2026-07-04T00:00', 24 * 4],
  ]

  it.each(spans)('%s부터 한 시간 간격 — 날·주·달 키가 현지 벽시계 기반 옛 키와 같다', (from, hours) => {
    const base = Date.parse(`${from}:00Z`)
    for (let h = 0; h < hours; h++) {
      const kst = new Date(base + h * 3_600_000).toISOString().slice(0, 16)
      const a = run(kst)
      expect(kstDateKeyOf(a), kst).toBe(legacyDateKey(a))
      expect(kstWeekKeyOf(a), kst).toBe(legacyWeekKey(a))
      expect(kstMonthKeyOf(a), kst).toBe(legacyMonthKey(a))
    }
  })

  it('옛 키 기준으로 센 연속·연속 주·활동일이 새 결과와 같다', () => {
    const korean = [
      '2026-12-30T23:50', '2026-12-31T00:10', '2027-01-01T08:00', '2027-01-03T23:59', '2027-01-04T00:00',
      '2027-01-11T12:00', '2027-01-18T07:30', '2027-02-02T10:00',
    ].map((kst) => run(kst))
    const legacyDates = [...new Set(korean.map(legacyDateKey))].sort()
    expect(countActiveDays(korean)).toBe(legacyDates.length)
    expect(calcMaxStreak(korean)).toBe(3) // 12/30·12/31·1/1
    const legacyWeeks = [...new Set(korean.map(legacyWeekKey))].sort()
    expect(legacyWeeks).toEqual(['2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18', '2027-02-01'])
    expect(calcMaxWeeklyStreak(korean)).toBe(4) // 12/28·1/4·1/11·1/18 주
  })
})

describe('연속 일수(calcMaxStreak) — KST 날짜', () => {
  it('한국 시각으로 같은 날 두 번이면 현지 날짜가 갈려도 연속 1일이다', () => {
    // 현지 7/5·7/6(연속처럼 보임) → KST는 둘 다 7/6
    const acts = [run('2026-07-06T10:00', { abroad: true }), run('2026-07-06T20:00', { abroad: true })]
    expect(calcMaxStreak(acts)).toBe(1)
  })

  it('한국 시각으로 이틀 연속이면 현지 날짜가 같아도 연속 2일이다', () => {
    // 현지 7/6·7/6(같은 날처럼 보임) → KST는 7/6·7/7
    const acts = [run('2026-07-06T20:00', { abroad: true }), run('2026-07-07T10:00', { abroad: true })]
    expect(calcMaxStreak(acts)).toBe(2)
  })

  it('경계 시각: 한국 시각 23:59와 다음 날 00:00은 다른 날이다', () => {
    expect(calcMaxStreak([run('2026-07-06T23:59'), run('2026-07-07T00:00')])).toBe(2)
    expect(calcMaxStreak([run('2026-07-06T00:00'), run('2026-07-06T23:59')])).toBe(1)
  })

  it('한국 활동은 startDateLocal이 있든 없든 결과가 같다 (회귀)', () => {
    const korean = [run('2026-07-01T06:00'), run('2026-07-02T21:30'), run('2026-07-03T00:10'), run('2026-07-10T12:00')]
    const withoutLocal = korean.map((a) => ({ ...a, startDateLocal: undefined }))
    expect(calcMaxStreak(korean)).toBe(3)
    expect(calcMaxStreak(withoutLocal)).toBe(3)
  })
})

describe('연속 주(calcMaxWeeklyStreak) — KST 월~일', () => {
  it('한국 시각으로 같은 주인 두 활동은 현지 주가 갈려도 연속 주 1이다', () => {
    // 한국 월요일 7/6 10:00(현지 일요일 7/5 → 현지 주는 6/29 주) + 한국 일요일 7/12 20:00(현지 7/12 → 7/6 주)
    const acts = [run('2026-07-06T10:00', { abroad: true }), run('2026-07-12T20:00', { abroad: true })]
    expect(calcMaxWeeklyStreak(acts)).toBe(1)
  })

  it('한국 시각으로 다음 주면 연속 주 2다', () => {
    const acts = [run('2026-07-05T20:00', { abroad: true }), run('2026-07-06T10:00', { abroad: true })]
    // 한국 일요일 7/5(6/29 주) → 한국 월요일 7/6(7/6 주). 현지는 둘 다 7/5(일)·7/5(일)이라 같은 주였다
    expect(calcMaxWeeklyStreak(acts)).toBe(2)
  })

  it('한국 활동은 startDateLocal이 있든 없든 결과가 같다 (회귀)', () => {
    const korean = [run('2026-07-06T06:00'), run('2026-07-14T21:30'), run('2026-07-22T00:10'), run('2026-08-12T12:00')]
    const withoutLocal = korean.map((a) => ({ ...a, startDateLocal: undefined }))
    expect(calcMaxWeeklyStreak(korean)).toBe(3)
    expect(calcMaxWeeklyStreak(withoutLocal)).toBe(3)
  })
})

describe('휴식(공백) — KST 날짜 키', () => {
  it('buildRestIntervals: 한국 시각으로 하루 건너뛰면 현지 날짜가 연속이어도 쉰 날 1일이다', () => {
    // 한국 7/6 20:00(현지 7/6) → 한국 7/8 10:00(현지 7/7): 현지 간격 1일, KST 간격 2일
    const intervals = buildRestIntervals([run('2026-07-06T20:00', { abroad: true }), run('2026-07-08T10:00', { abroad: true })])
    expect(intervals).toHaveLength(1)
    expect(intervals[0].intervalDays).toBe(2)
    expect(intervals[0].restDays).toBe(1)
  })

  it('buildRestIntervals: 한국 시각으로 같은 날이면 현지 날짜가 갈려도 공백이 없다', () => {
    const intervals = buildRestIntervals([run('2026-07-06T10:00', { abroad: true }), run('2026-07-06T20:00', { abroad: true })])
    expect(intervals).toEqual([])
  })

  it('휴식 조건(return_gap_days)도 KST 날짜로 판정한다', () => {
    const acts = [run('2026-07-06T20:00', { abroad: true }), run('2026-07-08T10:00', { abroad: true })]
    expect(evaluateConditionDetailed({ activity_type: 'running', return_gap_days: 1 }, acts).pass).toBe(true)
    expect(evaluateConditionDetailed({ activity_type: 'running', return_gap_days: 2 }, acts).pass).toBe(false)
  })

  it('앵커 컷은 활동 시작 시각(UTC) 기준이다 — 앵커와 같은 순간에 시작한 활동은 현지 날짜와 무관하게 남는다', () => {
    // 한국 7/6 09:00 = 7/6 00:00Z. 현지 벽시계로는 7/5 17:00이라 현지 날짜로 자르면 앵커 앞이 된다
    const onAnchor = run('2026-07-06T09:00', { abroad: true })
    const justBefore = run('2026-07-06T08:59', { abroad: true })
    const pool = restPool({ activity_type: 'running' }, [justBefore, onAnchor], '2026-07-06T00:00:00Z')
    expect(pool).toEqual([onAnchor])
  })

  it('한국 활동의 휴식 구간은 startDateLocal이 있든 없든 같다 (회귀)', () => {
    const korean = [run('2026-07-01T06:00'), run('2026-07-02T21:30'), run('2026-07-06T00:10')]
    const withoutLocal = korean.map((a) => ({ ...a, startDateLocal: undefined }))
    const pick = (acts: NormalizedActivity[]) => buildRestIntervals(acts).map((i) => [i.intervalDays, i.restDays, i.streakBefore])
    expect(pick(korean)).toEqual([[1, 0, 1], [4, 3, 2]])
    expect(pick(withoutLocal)).toEqual(pick(korean))
  })
})

describe('활동일(active_days_count) — KST 날짜', () => {
  it('발급 판정: 한국 시각으로 같은 날 두 번이면 현지 날짜가 갈려도 1일이다', () => {
    const acts = [run('2026-07-06T10:00', { abroad: true }), run('2026-07-06T20:00', { abroad: true })]
    const r = evaluateConditionDetailed({ activity_type: 'running', active_days_count: 2 }, acts)
    expect(r.pass).toBe(false)
    expect(r.actual).toContain('1일')
  })

  it('발급 판정: 한국 시각으로 이틀이면 현지 날짜가 같아도 2일이다', () => {
    const acts = [run('2026-07-06T20:00', { abroad: true }), run('2026-07-07T10:00', { abroad: true })]
    expect(evaluateConditionDetailed({ activity_type: 'running', active_days_count: 2 }, acts).pass).toBe(true)
  })

  it('진행 계산(computeUserPeriodMetrics)도 같은 값을 낸다 — 연속·연속 주·활동일', () => {
    const acts = [run('2026-07-06T10:00', { abroad: true }), run('2026-07-06T20:00', { abroad: true }), run('2026-07-07T10:00', { abroad: true })]
    const metrics = computeUserPeriodMetrics('running', acts, new Date('2026-07-20T00:00:00Z'))
    expect(metrics.activeDaysCount).toBe(2)
    expect(metrics.activeDaysCount).toBe(countActiveDays(acts))
    expect(metrics.streakDays).toBe(2)
    expect(metrics.weeklyStreakDays).toBe(1)
  })

  it('한국 활동은 startDateLocal이 있든 없든 결과가 같다 (회귀)', () => {
    const korean = [run('2026-07-01T06:00'), run('2026-07-01T21:30'), run('2026-07-03T00:10')]
    const withoutLocal = korean.map((a) => ({ ...a, startDateLocal: undefined }))
    expect(evaluateConditionDetailed({ activity_type: 'running', active_days_count: 2 }, korean).pass).toBe(true)
    expect(evaluateConditionDetailed({ activity_type: 'running', active_days_count: 3 }, korean).pass).toBe(false)
    expect(evaluateConditionDetailed({ activity_type: 'running', active_days_count: 2 }, withoutLocal).pass).toBe(true)
    expect(evaluateConditionDetailed({ activity_type: 'running', active_days_count: 3 }, withoutLocal).pass).toBe(false)
  })
})

describe('전월 대비 배수(bestMonthOverMonthRatio) — KST 월', () => {
  it('한국 시각 8/1 활동은 현지 날짜가 7/31이어도 8월이다', () => {
    // 7월(KST) 10km, 8월(KST) 20km → 2배. 현지 월로 세면 7월 30km·8월 없음이라 쌍이 없다(0)
    const acts = [
      run('2026-07-20T10:00', { abroad: true, distanceKm: 10 }),
      run('2026-08-01T10:00', { abroad: true, distanceKm: 20 }),
    ]
    expect(bestMonthOverMonthRatio(acts)).toBe(2)
  })

  it('한국 활동은 startDateLocal이 있든 없든 결과가 같다 (회귀)', () => {
    const korean = [run('2026-07-20T10:00', { distanceKm: 10 }), run('2026-08-01T10:00', { distanceKm: 15 })]
    const withoutLocal = korean.map((a) => ({ ...a, startDateLocal: undefined }))
    expect(bestMonthOverMonthRatio(korean)).toBe(1.5)
    expect(bestMonthOverMonthRatio(withoutLocal)).toBe(1.5)
  })
})

describe('회차 계산(collectRepeatOccurrences) — KST 일·주', () => {
  it('streak_days + repeat_count: 한국 시각으로 이틀 연속이면 현지 날짜가 같아도 한 회차다', () => {
    const acts = [run('2026-07-06T20:00', { abroad: true }), run('2026-07-07T10:00', { abroad: true })]
    expect(collectRepeatOccurrences({ activity_type: 'running', streak_days: 2, repeat_count: 1 }, acts)).toHaveLength(1)
  })

  it('streak_days + repeat_count: 한국 시각으로 같은 날이면 현지 날짜가 갈려도 회차가 아니다', () => {
    const acts = [run('2026-07-06T10:00', { abroad: true }), run('2026-07-06T20:00', { abroad: true })]
    expect(collectRepeatOccurrences({ activity_type: 'running', streak_days: 2, repeat_count: 1 }, acts)).toHaveLength(0)
  })

  it('weekly_streak + repeat_count: 한국 시각으로 같은 주면 현지 주가 갈려도 회차가 아니다', () => {
    const acts = [run('2026-07-06T10:00', { abroad: true }), run('2026-07-12T20:00', { abroad: true })]
    expect(collectRepeatOccurrences({ activity_type: 'running', weekly_streak: 2, repeat_count: 1 }, acts)).toHaveLength(0)
  })

  it('weekly_streak + repeat_count: 한국 시각으로 다음 주면 현지 주가 같아도 한 회차다', () => {
    const acts = [run('2026-07-05T20:00', { abroad: true }), run('2026-07-06T10:00', { abroad: true })]
    expect(collectRepeatOccurrences({ activity_type: 'running', weekly_streak: 2, repeat_count: 1 }, acts)).toHaveLength(1)
  })

  it('한국 활동의 회차는 startDateLocal이 있든 없든 같다 (회귀)', () => {
    const korean = [run('2026-07-01T06:00'), run('2026-07-02T21:30'), run('2026-07-03T00:10')]
    const withoutLocal = korean.map((a) => ({ ...a, startDateLocal: undefined }))
    const cond = { activity_type: 'running' as const, streak_days: 3, repeat_count: 1 }
    expect(collectRepeatOccurrences(cond, korean)).toHaveLength(1)
    expect(collectRepeatOccurrences(cond, withoutLocal)).toHaveLength(1)
  })
})
