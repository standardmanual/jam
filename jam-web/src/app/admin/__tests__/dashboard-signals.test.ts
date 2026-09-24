/**
 * 어드민 메인 이상 신호·주간 핵심 지표 — 증감·강조 판정 함수 (티켓 20260924_0909)
 *
 * `buildWeeklyComparison`은 이번 주 값과 지난주 값을 받아 diff(증감)와 elevated(강조 여부)를
 * 계산한다. 완료 조건의 판정식 "0보다 크거나 지난주보다 늘었을 때 강조"를 그대로 검증한다.
 */
import { buildWeeklyComparison, ANOMALY_BASELINE } from '../DashboardSignals'

describe('buildWeeklyComparison', () => {
  it('강조 기준선은 0이다', () => {
    expect(ANOMALY_BASELINE).toBe(0)
  })

  it('지난주 값이 없으면(비교 대상 없음) diff는 null이고, 0보다 큰지로만 강조를 판정한다', () => {
    expect(buildWeeklyComparison(0, null)).toEqual({ value: 0, previousValue: null, diff: null, elevated: false })
    expect(buildWeeklyComparison(3, null)).toEqual({ value: 3, previousValue: null, diff: null, elevated: true })
  })

  it('값이 0보다 크면 지난주 대비 변화가 없거나 줄었어도 강조한다(완료 조건의 "0보다 크거나")', () => {
    expect(buildWeeklyComparison(2, 2).elevated).toBe(true) // 변화 없음
    expect(buildWeeklyComparison(2, 5).elevated).toBe(true) // 오히려 감소
  })

  it('값이 0이어도 지난주보다 늘었으면 강조한다(완료 조건의 "지난주보다 늘었을 때")', () => {
    // 실제 지표(Strava 동기화 실패·제재 수·차단 POI 수)는 항상 0 이상인 개수라 이 분기는
    // 음수 구간에서만 단독으로 관찰되지만, 판정식 자체(OR의 두 번째 절)가 옳게 동작하는지는
    // 이렇게 격리해서 확인한다.
    expect(buildWeeklyComparison(-1, -3)).toEqual({ value: -1, previousValue: -3, diff: 2, elevated: true })
  })

  it('0이고 지난주보다 늘지도 않았으면 강조하지 않는다', () => {
    expect(buildWeeklyComparison(0, 0).elevated).toBe(false)
    expect(buildWeeklyComparison(0, 3).elevated).toBe(false) // 오히려 줄었다
  })

  it('diff는 이번 주 값에서 지난주 값을 뺀 값이다', () => {
    expect(buildWeeklyComparison(10, 6).diff).toBe(4)
    expect(buildWeeklyComparison(6, 10).diff).toBe(-4)
  })
})
