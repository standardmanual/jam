/**
 * 캡슐 게이지 수치 변환 (티켓 20261028_1739 2회)
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule-gauge.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  GAUGE_ENTRY_DELAY_MS,
  GAUGE_ENTRY_MS,
  GAUGE_MOVE_MAX_MS,
  GAUGE_MOVE_MIN_MS,
  GRAPH_MIN_PERCENT,
  capsuleGraphPercent,
  gaugeMoveDurationMs,
  graphPercentToFillRatio,
  jamPercentToGraphPercent,
} from '../capsule-gauge'

describe('그래프 눈금 변환', () => {
  it('잼 0%는 그래프 2%에, 잼 100%는 그래프 100%에 대응한다', () => {
    expect(jamPercentToGraphPercent(0)).toBe(GRAPH_MIN_PERCENT)
    expect(jamPercentToGraphPercent(100)).toBe(100)
  })

  it('잼 비율이 같은 간격으로 늘면 그래프 눈금도 같은 간격으로 는다', () => {
    expect(jamPercentToGraphPercent(50)).toBeCloseTo(51, 10)
    expect(jamPercentToGraphPercent(25)).toBeCloseTo(26.5, 10)
  })

  it('범위를 벗어나거나 숫자가 아닌 값은 양 끝으로 맞춘다', () => {
    expect(jamPercentToGraphPercent(-30)).toBe(2)
    expect(jamPercentToGraphPercent(250)).toBe(100)
    expect(jamPercentToGraphPercent(Number.NaN)).toBe(2)
  })

  it('그래프 눈금을 채움 정도로 되돌리면 2%는 0, 100%는 1이다', () => {
    expect(graphPercentToFillRatio(2)).toBe(0)
    expect(graphPercentToFillRatio(100)).toBe(1)
    expect(graphPercentToFillRatio(0)).toBe(0)
    expect(graphPercentToFillRatio(51)).toBeCloseTo(0.5, 10)
  })
})

describe('채운 양과 필요량으로 구한 눈금', () => {
  it('절반을 채우면 눈금 51%다', () => {
    expect(capsuleGraphPercent(150, 300)).toBeCloseTo(51, 10)
  })

  it('비어 있거나 필요량이 0 이하이면 비어 있는 눈금이다', () => {
    expect(capsuleGraphPercent(0, 300)).toBe(GRAPH_MIN_PERCENT)
    expect(capsuleGraphPercent(10, 0)).toBe(GRAPH_MIN_PERCENT)
    expect(capsuleGraphPercent(10, Number.NaN)).toBe(GRAPH_MIN_PERCENT)
  })

  it('필요량을 넘는 값은 가득 찬 눈금으로 맞춘다', () => {
    expect(capsuleGraphPercent(999, 300)).toBe(100)
  })
})

describe('모션 시간', () => {
  it('진입 모션은 260ms 쉰 뒤 1,500ms다', () => {
    expect(GAUGE_ENTRY_DELAY_MS).toBe(260)
    expect(GAUGE_ENTRY_MS).toBe(1500)
  })

  it('값이 바뀔 때의 이동 시간은 거리에 비례하고 700~1500ms 안에 있다', () => {
    expect(gaugeMoveDurationMs(51, 51)).toBe(GAUGE_MOVE_MIN_MS)
    expect(gaugeMoveDurationMs(2, 100)).toBe(GAUGE_MOVE_MAX_MS)
    expect(gaugeMoveDurationMs(100, 2)).toBe(GAUGE_MOVE_MAX_MS)
    const short = gaugeMoveDurationMs(2, 26)
    const long = gaugeMoveDurationMs(2, 76)
    expect(short).toBeGreaterThan(GAUGE_MOVE_MIN_MS)
    expect(long).toBeGreaterThan(short)
    expect(long).toBeLessThanOrEqual(GAUGE_MOVE_MAX_MS)
  })
})
