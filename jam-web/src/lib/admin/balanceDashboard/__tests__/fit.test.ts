/**
 * fit.ts — MetricCard.tsx에서 옮긴 견줌이 그대로인지 (티켓 20261026_2027 2회차)
 *
 * 옮기기 전 동작: 보이는 자릿수로 맞춘 값으로 견주고, 목표 범위의 양 끝은 안이며, `highExclusive`면 위쪽 끝은 밖이다.
 * 기존 `BalanceDashboardView.test.tsx`가 `MetricCard`의 다시 내보낸 이름으로 같은 동작을 한 번 더 지킨다.
 */
import { describe, it, expect } from 'vitest'
import { compareToTarget, DISPLAY_DIGITS } from '../fit'
import * as metricCard from '@/components/admin/balanceDashboard/MetricCard'

describe('compareToTarget', () => {
  const range = { low: 2, high: 3, text: '주 2~3번' }

  it('범위의 양 끝은 안이고 밖은 아래·위다', () => {
    expect(compareToTarget('per_week', 1.99, range)).toBe('below')
    expect(compareToTarget('per_week', 2, range)).toBe('within')
    expect(compareToTarget('per_week', 3, range)).toBe('within')
    expect(compareToTarget('per_week', 3.01, range)).toBe('above')
  })

  it('보이는 자릿수로 맞춘 값으로 견준다', () => {
    expect(compareToTarget('per_week', 1.9996, range)).toBe('within')
    expect(compareToTarget('ratio', 0.4996, { low: 0.5, high: 1, text: '' })).toBe('within')
  })

  it('highExclusive면 위쪽 끝은 밖이다', () => {
    const under20 = { low: 0, high: 0.2, highExclusive: true, text: '20% 미만' }
    expect(compareToTarget('ratio', 0.199, under20)).toBe('within')
    expect(compareToTarget('ratio', 0.2, under20)).toBe('above')
  })

  it('보이는 자릿수 표는 단위별로 그대로다', () => {
    expect(DISPLAY_DIGITS).toEqual({ per_week: 2, per_month: 2, count_30d: 1, ratio: 3 })
  })

  it('MetricCard가 같은 함수를 다시 내보낸다', () => {
    expect(metricCard.compareToTarget).toBe(compareToTarget)
  })
})
