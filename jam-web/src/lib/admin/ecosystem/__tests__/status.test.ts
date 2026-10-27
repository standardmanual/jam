/**
 * status.ts — 주의·중단 경계와 섞임, 표시선 비율 (티켓 20261026_2027 2회차)
 */
import { describe, it, expect } from 'vitest'
import type { MetricPart, MetricPartSpec, MetricResult } from '@/lib/admin/balanceDashboard/types'
import { STOP_DEVIATION_RATIO } from '../nodes'
import {
  attentionCount,
  errorCount,
  markerOf,
  pickHeadlinePart,
  statusOfMetric,
  statusOfPart,
  worstStatus,
} from '../status'

function spec(over: Partial<MetricPartSpec> = {}): MetricPartSpec {
  return {
    id: 'p',
    label: '칸',
    unit: 'per_week',
    sampleUnit: 'user',
    minSample: 5,
    target: { low: 2, high: 4, text: '주 2~4번' },
    ...over,
  }
}

function ready(value: number): MetricPart {
  return { id: 'p', measurement: { status: 'ready', value, sample: 10, sampleUnit: 'user' } }
}

const insufficient: MetricPart = {
  id: 'p',
  measurement: { status: 'insufficient', reason: 'sample', sample: 1, minSample: 5, sampleUnit: 'user' },
}

describe('statusOfPart', () => {
  it('중단 기준은 가정 값 50%다', () => {
    expect(STOP_DEVIATION_RATIO).toBe(0.5)
  })

  it('목표 안(양 끝 포함)은 정상이다', () => {
    expect(statusOfPart(ready(2), spec())).toBe('ok')
    expect(statusOfPart(ready(3), spec())).toBe('ok')
    expect(statusOfPart(ready(4), spec())).toBe('ok')
  })

  it('아래로 벗어난 폭이 하한의 50% 미만이면 주의, 정확히 50%면 중단이다', () => {
    expect(statusOfPart(ready(1.01), spec())).toBe('warn')
    expect(statusOfPart(ready(1), spec())).toBe('stop')
    expect(statusOfPart(ready(0), spec())).toBe('stop')
  })

  it('위로 벗어난 폭이 상한의 50% 미만이면 주의, 정확히 50%면 중단이다', () => {
    expect(statusOfPart(ready(4.01), spec())).toBe('warn')
    expect(statusOfPart(ready(5.99), spec())).toBe('warn')
    expect(statusOfPart(ready(6), spec())).toBe('stop')
    expect(statusOfPart(ready(10), spec())).toBe('stop')
  })

  it('부동소수 오차로 경계가 반대편에 떨어지지 않는다 (0.3 − 0.2 < 0.1)', () => {
    const ratio = spec({ unit: 'ratio', target: { low: 0, high: 0.2, text: '20% 이하' } })
    expect(statusOfPart(ready(0.3), ratio)).toBe('stop')
    expect(statusOfPart(ready(0.29), ratio)).toBe('warn')
  })

  it('한계값이 0이면 벗어나는 순간 중단이다', () => {
    const zeroHigh = spec({ unit: 'ratio', target: { low: 0, high: 0, text: '0' } })
    expect(statusOfPart(ready(0), zeroHigh)).toBe('ok')
    expect(statusOfPart(ready(0.001), zeroHigh)).toBe('stop')
  })

  it('highExclusive: 상한 값 자체는 목표 밖이라 주의다 (한계값이 0이 아니고 폭이 0)', () => {
    const under20 = spec({ unit: 'ratio', target: { low: 0, high: 0.2, highExclusive: true, text: '20% 미만' } })
    expect(statusOfPart(ready(0.199), under20)).toBe('ok')
    expect(statusOfPart(ready(0.2), under20)).toBe('warn')
    expect(statusOfPart(ready(0.3), under20)).toBe('stop')
  })

  it('표본이 모자라면 목표가 있든 없든 부족이다', () => {
    expect(statusOfPart(insufficient, spec())).toBe('insufficient')
    expect(statusOfPart(insufficient, spec({ target: null }))).toBe('insufficient')
  })

  it('목표가 없는 칸은 값이 있어도 목표 없음이다', () => {
    expect(statusOfPart(ready(100), spec({ target: null }))).toBe('no_target')
  })
})

describe('worstStatus — 섞임', () => {
  it('중단 > 주의 > 읽지 못함 > 부족 > 정상이다', () => {
    expect(worstStatus(['ok', 'insufficient', 'error', 'warn', 'stop'])).toBe('stop')
    expect(worstStatus(['ok', 'insufficient', 'error', 'warn'])).toBe('warn')
    expect(worstStatus(['ok', 'insufficient', 'error'])).toBe('error')
    expect(worstStatus(['ok', 'insufficient'])).toBe('insufficient')
    expect(worstStatus(['ok'])).toBe('ok')
  })

  it('목표 없음은 순서에 끼지 않는다: 정상과 섞이면 정상, 전부 목표 없음이거나 빈 목록이면 목표 없음', () => {
    expect(worstStatus(['no_target', 'ok'])).toBe('ok')
    expect(worstStatus(['no_target', 'no_target'])).toBe('no_target')
    expect(worstStatus([])).toBe('no_target')
  })
})

describe('statusOfMetric', () => {
  it('읽지 못한 지표는 읽지 못함이다', () => {
    const result: MetricResult = { key: 'inventory_full', status: 'error', message: '고정 문장' }
    expect(statusOfMetric(result)).toBe('error')
  })

  it('칸 상태 중 가장 나쁜 것이다 (재고 가득 찬 비율 20% 미만 목표)', () => {
    const okResult: MetricResult = {
      key: 'inventory_full',
      status: 'ok',
      parts: [{ id: 'full', measurement: { status: 'ready', value: 0.1, sample: 30, sampleUnit: 'user' } }],
    }
    const stopResult: MetricResult = {
      key: 'inventory_full',
      status: 'ok',
      parts: [{ id: 'full', measurement: { status: 'ready', value: 0.5, sample: 30, sampleUnit: 'user' } }],
    }
    expect(statusOfMetric(okResult)).toBe('ok')
    expect(statusOfMetric(stopResult)).toBe('stop')
  })
})

describe('pickHeadlinePart', () => {
  it('가장 나쁜 칸이 대표이고, 같으면 먼저 나온 칸이다', () => {
    const picked = pickHeadlinePart([
      { item: 'a', status: 'ok' },
      { item: 'b', status: 'warn' },
      { item: 'c', status: 'warn' },
      { item: 'd', status: 'insufficient' },
    ])
    expect(picked?.item).toBe('b')
  })

  it('빈 목록이면 null이다', () => {
    expect(pickHeadlinePart([])).toBeNull()
  })
})

describe('markerOf — 표시선 위치', () => {
  const target = { low: 2, high: 4, text: '' }

  it('눈금은 0부터 max(상한×2, 값×1.1)까지고 세 값은 0~1 비율이다', () => {
    expect(markerOf(3, target)).toEqual({ scaleMax: 8, low: 0.25, high: 0.5, value: 0.375 })
  })

  it('값이 목표 위로 멀리 가면 값×1.1이 눈금 끝이다', () => {
    const marker = markerOf(20, target)
    expect(marker.scaleMax).toBeCloseTo(22)
    expect(marker.value).toBeCloseTo(20 / 22)
    expect(marker.high).toBeCloseTo(4 / 22)
  })

  it('상한 0, 값 0이면 눈금 끝은 1이다', () => {
    expect(markerOf(0, { low: 0, high: 0, text: '' })).toEqual({ scaleMax: 1, low: 0, high: 0, value: 0 })
  })
})

describe('주의 이상 개수', () => {
  it('주의와 중단의 합이고 읽지 못함은 따로 센다', () => {
    const statuses = ['ok', 'warn', 'stop', 'error', 'insufficient', 'no_target', 'error'] as const
    expect(attentionCount(statuses)).toBe(2)
    expect(errorCount(statuses)).toBe(2)
  })
})
