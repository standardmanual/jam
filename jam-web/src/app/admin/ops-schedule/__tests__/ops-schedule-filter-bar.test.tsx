/**
 * 일정표 거르기 줄의 선택지 읽기 (티켓 20261006_1539 ③-d)
 *
 * `ScheduleFilterBar`(서버 컴포넌트)가 트라이브·패턴을 읽어 거르기 부품에 넘기는 값을 본다. 읽기는 가짜로 바꾼다(실 DB에 닿지 않는다).
 * 지키는 것: 트라이브는 소문자 ID·이름, 패턴은 「P01 이름」, 둘 중 하나라도 못 읽으면 선택지 없이 막힘 표시, 월간·타임라인에서만 범례를 붙임.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

const hoisted = vi.hoisted(() => ({
  tribes: { data: [] as Array<{ id: string; name: string }>, error: null as { message: string } | null },
  patterns: { value: [] as Array<{ patternNo: string; name: string }>, error: null as Error | null },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ order: async () => hoisted.tribes }) }),
  }),
}))

vi.mock('@/lib/admin/opsPatterns/read', () => ({
  listOpsPatterns: vi.fn(async () => {
    if (hoisted.patterns.error) throw hoisted.patterns.error
    return hoisted.patterns.value
  }),
}))

import { ScheduleFilterBar } from '../ScheduleFilterBar'

beforeEach(() => {
  hoisted.tribes = { data: [{ id: '3F2A9C1E-0000-4000-8000-00000000000A', name: '러너스' }], error: null }
  hoisted.patterns = { value: [{ patternNo: 'P01', name: '아침 러닝' }], error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function propsOf(view: 'week' | 'month' | 'timeline') {
  const element = (await ScheduleFilterBar({ view })) as ReactElement<Record<string, unknown>>
  return element.props
}

describe('ScheduleFilterBar', () => {
  it('트라이브는 소문자 ID와 이름, 패턴은 「P01 이름」으로 넘긴다', async () => {
    const props = await propsOf('week')
    expect(props.tribes).toEqual([{ value: '3f2a9c1e-0000-4000-8000-00000000000a', label: '러너스' }])
    expect(props.patterns).toEqual([{ value: 'P01', label: 'P01 아침 러닝' }])
    expect(props.optionsFailed).toBe(false)
  })

  it('범례는 월간·타임라인에서만 붙인다', async () => {
    expect((await propsOf('week')).showLegend).toBe(false)
    expect((await propsOf('month')).showLegend).toBe(true)
    expect((await propsOf('timeline')).showLegend).toBe(true)
  })

  it('트라이브를 못 읽으면 선택지 없이 막힘이다(오류는 기록한다)', async () => {
    hoisted.tribes = { data: [], error: { message: '시험 실패' } }
    const props = await propsOf('week')
    expect(props).toMatchObject({ tribes: [], patterns: [], optionsFailed: true })
    expect(console.error).toHaveBeenCalled()
  })

  it('패턴을 못 읽어도 막힘이다', async () => {
    hoisted.patterns.error = new Error('패턴 조회 실패(시험)')
    expect(await propsOf('week')).toMatchObject({ tribes: [], patterns: [], optionsFailed: true })
  })
})
