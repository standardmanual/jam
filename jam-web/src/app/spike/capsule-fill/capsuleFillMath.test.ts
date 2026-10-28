import { describe, expect, it } from 'vitest'
import {
  GRAPH_MIN_PERCENT,
  graphPercentToFillRatio,
  jamPercentToGraphPercent,
  jamToGraphPercent,
  planFill,
} from './capsuleFillMath'

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

  it('잼 양과 용량으로 눈금을 구하고, 용량이 0이면 비어 있는 눈금이다', () => {
    expect(jamToGraphPercent(150, 300)).toBeCloseTo(51, 10)
    expect(jamToGraphPercent(0, 300)).toBe(2)
    expect(jamToGraphPercent(10, 0)).toBe(2)
    expect(jamToGraphPercent(999, 300)).toBe(100)
  })
})

describe('채움 계획', () => {
  it('용량에 닿지 않으면 한 구간이고 챕터는 오르지 않는다', () => {
    const plan = planFill({ filled: 90, amount: 80, capacity: 300 })
    expect(plan.segments).toEqual([{ to: 170, levelUp: false }])
    expect(plan.filledAfter).toBe(170)
    expect(plan.levelUps).toBe(0)
  })

  it('용량을 넘기면 100%까지 채운 구간 뒤에 남은 양을 빈 캡슐에서 이어 채운다', () => {
    const plan = planFill({ filled: 240, amount: 120, capacity: 300 })
    expect(plan.segments).toEqual([
      { to: 300, levelUp: true },
      { to: 60, levelUp: false },
    ])
    expect(plan.filledAfter).toBe(60)
    expect(plan.levelUps).toBe(1)
  })

  it('용량에 딱 맞게 끝나면 챕터가 한 번 오르고 남는 양은 0이다', () => {
    const plan = planFill({ filled: 240, amount: 60, capacity: 300 })
    expect(plan.segments).toEqual([{ to: 300, levelUp: true }])
    expect(plan.filledAfter).toBe(0)
    expect(plan.levelUps).toBe(1)
  })

  it('한 번에 용량을 두 번 넘기면 챕터가 두 번 오른다', () => {
    const plan = planFill({ filled: 0, amount: 700, capacity: 300 })
    expect(plan.segments).toEqual([
      { to: 300, levelUp: true },
      { to: 300, levelUp: true },
      { to: 100, levelUp: false },
    ])
    expect(plan.levelUps).toBe(2)
    expect(plan.filledAfter).toBe(100)
  })

  it('채울 양이 0이면 지금 양 그대로 한 구간이다', () => {
    expect(planFill({ filled: 40, amount: 0, capacity: 300 }).segments).toEqual([{ to: 40, levelUp: false }])
  })

  it('용량이 0 이하이면 구간이 없다', () => {
    expect(planFill({ filled: 0, amount: 10, capacity: 0 })).toEqual({ segments: [], filledAfter: 0, levelUps: 0 })
  })
})
