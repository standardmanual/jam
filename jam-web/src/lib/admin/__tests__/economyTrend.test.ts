/**
 * economyTrend.ts — 날짜 배열·KST 날짜별 집계 순수 함수 유닛테스트(티켓 20260924_0911)
 *
 * 지키는 것:
 * 1. 날짜 배열 — 오늘 포함, 길이 = days, 오래된 날 → 오늘 순서, 월 경계 통과
 * 2. KST 자정 경계 — 23:59:59.999(KST)는 그날, 00:00:00.000(KST)은 다음 날로 센다
 * 3. 범위 밖 시각·잘못된 시각은 무시한다
 * 4. 빈 입력은 0으로 채운 배열이다
 * 5. 요약 — 합계·일 평균·최댓값(그래프마다 눈금을 따로 잡는 근거)
 */
import { describe, it, expect } from 'vitest'
import { trendDates, bucketDailyCounts, summarizeTrend } from '../economyTrend'

describe('trendDates', () => {
  it('오늘을 포함해 days개를 오래된 날 → 오늘 순서로 만든다', () => {
    const dates = trendDates(7, '2026-09-24')
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-09-18')
    expect(dates[6]).toBe('2026-09-24')
  })

  it('30일 범위가 월 경계를 넘어도 연속된다', () => {
    const dates = trendDates(30, '2026-09-24')
    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-08-26')
    expect(dates[5]).toBe('2026-08-31')
    expect(dates[6]).toBe('2026-09-01')
    expect(dates[29]).toBe('2026-09-24')
  })

  it('0일이면 빈 배열이다', () => {
    expect(trendDates(0, '2026-09-24')).toEqual([])
  })
})

describe('bucketDailyCounts', () => {
  const dates = trendDates(3, '2026-09-24') // 09-22, 09-23, 09-24

  it('KST 자정 경계: 23:59:59.999는 그날, 00:00:00.000은 다음 날로 센다', () => {
    const counts = bucketDailyCounts(
      [
        '2026-09-23T14:59:59.999Z', // KST 09-23 23:59:59.999
        '2026-09-23T15:00:00.000Z', // KST 09-24 00:00:00.000
      ],
      dates
    )
    expect(counts).toEqual([0, 1, 1])
  })

  it('범위 밖 시각은 무시한다', () => {
    const counts = bucketDailyCounts(
      [
        '2026-09-21T14:59:59.999Z', // KST 09-21 23:59:59.999 — 범위 이전
        '2026-09-24T15:00:00.000Z', // KST 09-25 00:00:00.000 — 범위 이후
        '2026-09-23T03:00:00.000Z', // KST 09-23 12:00 — 범위 안
      ],
      dates
    )
    expect(counts).toEqual([0, 1, 0])
  })

  it('같은 날 여러 건은 합산한다', () => {
    const counts = bucketDailyCounts(
      ['2026-09-22T00:00:00.000Z', '2026-09-22T05:00:00.000Z', '2026-09-22T10:00:00.000Z'],
      dates
    )
    expect(counts).toEqual([3, 0, 0])
  })

  it('잘못된 시각 문자열은 무시한다', () => {
    expect(bucketDailyCounts(['not-a-date'], dates)).toEqual([0, 0, 0])
  })

  it('빈 입력은 0으로 채운 배열이다', () => {
    expect(bucketDailyCounts([], dates)).toEqual([0, 0, 0])
    expect(bucketDailyCounts(['2026-09-23T03:00:00.000Z'], [])).toEqual([])
  })
})

describe('summarizeTrend', () => {
  it('합계·일 평균(소수 첫째 자리)·최댓값을 계산한다', () => {
    expect(summarizeTrend([0, 5, 14])).toEqual({ total: 19, average: 6.3, max: 14 })
  })

  it('모두 0이면 최댓값이 0이다', () => {
    expect(summarizeTrend([0, 0, 0])).toEqual({ total: 0, average: 0, max: 0 })
  })

  it('빈 배열이면 평균 0이다', () => {
    expect(summarizeTrend([])).toEqual({ total: 0, average: 0, max: 0 })
  })
})
