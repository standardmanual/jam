/**
 * 시간대 조건 `{start,end}`의 시각 해석 — 엔진과 순위형 밤 조건 검사가 같은 함수를 쓴다 (티켓 20261019_1312 2회)
 *
 * 배지 엔진 `inTimeRange`와 미션 저장 검사(`missions/condition-keys.ts`의 밤 조건)가 시각을 따로 읽으면
 * «저장 검사는 통과시켰는데 엔진은 그 시각의 활동을 센다»가 생긴다(1회 게이트 우려 1·2). 해석은
 * `timeBands.ts`의 `clockToMinutes`·`isMinuteInTimeRange` 하나이고, 이 시험이 그 규칙을 고정한다.
 *
 *   - `HH:MM` 외에 `HH:MM:SS`(초는 버림)와 `24:00`(= 1440분)을 읽는다
 *   - 양 끝을 포함한다(22:00에 시작한 활동은 `18:00~22:00`에도 든다)
 *   - `start > end`면 자정을 넘기는 구간이다
 *   - 읽을 수 없는 값은 어떤 활동과도 맞지 않는다
 */
import { describe, it, expect } from 'vitest'
import { inTimeRange } from '../activityFilters'
import { clockToMinutes, isMinuteInTimeRange } from '../timeBands'
import { usesNightCondition } from '@/lib/missions/condition-keys'
import { kstIso } from './kstFixture'
import type { NormalizedActivity } from '@/types/strava'

function run(kst: string): NormalizedActivity {
  return {
    stravaId: 1,
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
  }
}

describe('clockToMinutes — 시각 문자열 해석', () => {
  it.each([
    ['00:00', 0],
    ['05:00', 300],
    ['22:00', 1320],
    ['23:59', 1439],
    ['24:00', 1440],
    ['22:00:00', 1320],
    ['21:59:59', 1319],
    ['7:05', 425],
  ])('%s → %i분', (text, minutes) => {
    expect(clockToMinutes(text)).toBe(minutes)
  })

  it.each(['abc', '', '22', '??:??'])('읽을 수 없는 %j는 NaN이다', (text) => {
    expect(Number.isNaN(clockToMinutes(text))).toBe(true)
  })
})

describe('isMinuteInTimeRange — 양 끝 포함·자정 걸침', () => {
  it('끝 시각의 분도 구간에 든다', () => {
    expect(isMinuteInTimeRange(18 * 60, { start: '18:00', end: '22:00' })).toBe(true)
    expect(isMinuteInTimeRange(22 * 60, { start: '18:00', end: '22:00' })).toBe(true)
    expect(isMinuteInTimeRange(22 * 60 + 1, { start: '18:00', end: '22:00' })).toBe(false)
    expect(isMinuteInTimeRange(18 * 60 - 1, { start: '18:00', end: '22:00' })).toBe(false)
  })

  it('start > end면 자정을 넘기는 구간이다', () => {
    const range = { start: '22:00', end: '05:00' }
    expect(isMinuteInTimeRange(23 * 60, range)).toBe(true)
    expect(isMinuteInTimeRange(0, range)).toBe(true)
    expect(isMinuteInTimeRange(5 * 60, range)).toBe(true)
    expect(isMinuteInTimeRange(5 * 60 + 1, range)).toBe(false)
    expect(isMinuteInTimeRange(21 * 60 + 59, range)).toBe(false)
  })

  it('start와 end가 같으면 그 한 분만 든다', () => {
    expect(isMinuteInTimeRange(22 * 60, { start: '22:00', end: '22:00' })).toBe(true)
    expect(isMinuteInTimeRange(22 * 60 + 1, { start: '22:00', end: '22:00' })).toBe(false)
  })

  it('24:00은 하루 중 어떤 분(0~1439)에도 맞지 않는 끝점이다', () => {
    expect(isMinuteInTimeRange(23 * 60 + 59, { start: '20:00', end: '24:00' })).toBe(true)
    expect(isMinuteInTimeRange(0, { start: '20:00', end: '24:00' })).toBe(false)
    expect(isMinuteInTimeRange(23 * 60 + 59, { start: '24:00', end: '24:00' })).toBe(false)
  })

  it('읽을 수 없는 값은 어떤 분과도 맞지 않는다', () => {
    expect(isMinuteInTimeRange(600, { start: 'abc', end: '??' })).toBe(false)
    expect(isMinuteInTimeRange(600, { start: '22', end: '23' })).toBe(false)
  })
})

describe('inTimeRange — 같은 해석을 활동 시작 시각(KST)에 적용한다', () => {
  it('24:00 끝: 23:00 활동을 센다', () => {
    expect(inTimeRange(run('2026-07-20T23:00'), { start: '20:00', end: '24:00' })).toBe(true)
    expect(inTimeRange(run('2026-07-20T19:59'), { start: '20:00', end: '24:00' })).toBe(false)
  })

  it('HH:MM:SS 형식: 22:00:00~05:00:00은 23:00 활동을 센다', () => {
    expect(inTimeRange(run('2026-07-20T23:00'), { start: '22:00:00', end: '05:00:00' })).toBe(true)
    expect(inTimeRange(run('2026-07-20T12:00'), { start: '22:00:00', end: '05:00:00' })).toBe(false)
  })

  it('22:00 끝 처리: 22:00 시작 활동은 18:00~22:00에도 든다(22:01은 아니다)', () => {
    expect(inTimeRange(run('2026-07-20T22:00'), { start: '18:00', end: '22:00' })).toBe(true)
    expect(inTimeRange(run('2026-07-20T22:01'), { start: '18:00', end: '22:00' })).toBe(false)
  })

  it('초는 분 단위로 잘라 읽는다 — 22:00:30에 시작한 활동은 22:00으로 본다', () => {
    expect(inTimeRange(run('2026-07-20T22:00:30'), { start: '18:00', end: '22:00' })).toBe(true)
  })

  it('활동 시각은 UTC startDate를 KST로 바꿔 읽는다(해외 활동의 현지 시각은 보지 않는다)', () => {
    const a = { ...run('2026-07-20T23:00'), startDateLocal: '2026-07-20T09:00:00' }
    expect(inTimeRange(a, { start: '22:00', end: '05:00' })).toBe(true)
  })
})

describe('순위형 밤 조건 검사와 엔진이 같은 시각 해석을 쓴다', () => {
  // 1회 게이트가 지적한 두 형식과 22:00 한 분의 끝 처리가 전부 밤 조건으로 판정된다
  it.each([
    ['20:00', '24:00'],
    ['22:00:00', '05:00:00'],
    ['18:00', '22:00'],
  ])('%s~%s는 밤 조건이다', (start, end) => {
    expect(usesNightCondition({ time_range: { start, end } })).toBe(true)
  })

  it.each([
    ['18:00', '21:59'],
    ['05:00', '08:00'],
    ['05:00:00', '08:00:00'],
  ])('%s~%s는 밤 조건이 아니다', (start, end) => {
    expect(usesNightCondition({ time_range: { start, end } })).toBe(false)
  })

  it('밤 조건으로 판정된 구간은 엔진에서 실제로 밤 시각의 활동을 센다', () => {
    const cases: Array<[string, string, string]> = [
      ['20:00', '24:00', '2026-07-20T23:00'],
      ['22:00:00', '05:00:00', '2026-07-20T23:00'],
      ['18:00', '22:00', '2026-07-20T22:00'],
    ]
    for (const [start, end, at] of cases) {
      expect(usesNightCondition({ time_range: { start, end } })).toBe(true)
      expect(inTimeRange(run(at), { start, end })).toBe(true)
    }
  })
})
