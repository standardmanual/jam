/**
 * 생태계 상황판의 글자 만들기 (티켓 20261026_2027 3-1). 지키는 것:
 * - 개수는 «N건»(세 자리 쉼표), 잼은 «N잼», 밸런스 단위는 밸런스 지표 카드와 같은 글자, 값이 없으면 «–»
 * - 표본 부족 사유: 표본은 «표본 N/M명»(유저-주·유저-월은 주·달), 기간은 «관찰 기간이 모자라요»
 * - 상태 6개는 글자와 기호가 모두 다르다(색만으로 나누지 않는다)
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { formatMeasuredValue } from '@/components/admin/balanceDashboard/MetricCard'
import type { NodeStatus } from '@/lib/admin/ecosystem/types'
import { formatHeadlineValue, formatShortfall, NO_VALUE_TEXT, STATUS_LABEL, STATUS_SYMBOL } from '../format'

describe('formatHeadlineValue', () => {
  it('개수는 건, 세 자리마다 쉼표', () => {
    expect(formatHeadlineValue('count', 39)).toBe('39건')
    expect(formatHeadlineValue('count', 2063)).toBe('2,063건')
    expect(formatHeadlineValue('count', 0)).toBe('0건')
  })

  it('잼은 «N잼»', () => {
    expect(formatHeadlineValue('jam', 1500)).toBe('1,500잼')
    expect(formatHeadlineValue('jam', 0)).toBe('0잼')
  })

  it('밸런스 단위는 밸런스 지표 카드와 같은 글자다', () => {
    expect(formatHeadlineValue('per_week', 1.5)).toBe(formatMeasuredValue('per_week', 1.5))
    expect(formatHeadlineValue('ratio', 0.1)).toBe('10%')
    expect(formatHeadlineValue('count_30d', 9)).toBe('9개')
  })

  it('값이 없으면 «–»', () => {
    expect(formatHeadlineValue('count', null)).toBe(NO_VALUE_TEXT)
    expect(formatHeadlineValue('ratio', null)).toBe(NO_VALUE_TEXT)
  })
})

describe('formatShortfall', () => {
  it('표본이 모자라면 «표본 N/M명»', () => {
    expect(formatShortfall({ reason: 'sample', sample: 3, minSample: 10, unit: 'user' })).toBe('표본 3/10명')
    expect(formatShortfall({ reason: 'sample', sample: 0, minSample: 10, unit: 'user' })).toBe('표본 0/10명')
  })

  it('유저-주·유저-월 표본은 주·달로 쓰고 소수는 한 자리까지만 쓴다', () => {
    expect(formatShortfall({ reason: 'sample', sample: 2.25, minSample: 8, unit: 'user_week' })).toBe('표본 2.3/8주')
    expect(formatShortfall({ reason: 'sample', sample: 1, minSample: 3, unit: 'user_month' })).toBe('표본 1/3달')
  })

  it('관찰 기간이 모자라면 표본 수 없이 «관찰 기간이 모자라요»', () => {
    expect(formatShortfall({ reason: 'period', sample: 12, minSample: 10, unit: 'user' })).toBe('관찰 기간이 모자라요')
  })
})

describe('상태 글자와 기호', () => {
  const STATUSES: NodeStatus[] = ['ok', 'warn', 'stop', 'insufficient', 'error', 'no_target']

  it('여섯 상태의 글자와 기호가 모두 정해져 있다', () => {
    expect(STATUSES.map((status) => STATUS_LABEL[status])).toEqual(['정상', '주의', '중단', '표본 부족', '읽지 못함', '목표 없음'])
    expect(STATUSES.map((status) => STATUS_SYMBOL[status])).toEqual(['●', '▲', '■', '◌', '!', '–'])
  })

  it('상태 글자는 서로 다르다 (색 없이도 구분된다)', () => {
    expect(new Set(STATUSES.map((status) => STATUS_LABEL[status])).size).toBe(STATUSES.length)
  })
})
