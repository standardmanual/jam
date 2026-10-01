/**
 * 신호 기준값 덮어쓰기 읽기 (티켓 20260930_1459 조각 C)
 *
 * - 행 키는 기준값 키 그대로, 값 모양은 `{"value": <값>}`이다. 읽을 수 있는 행만 `Partial<기준값>`이 된다
 * - 모양이 틀렸거나 범위를 벗어난 행(0·문자 등)은 그 키만 버리고 다른 키는 읽는다. 모르는 키는 버린다
 * - `routineCheckStartsAt` 행은 1504가 채우는 값이라 그대로 읽는다
 * - 읽지 못하면 던지지 않고 빈 객체(= 모두 기본값)를 돌려주며 서버 로그만 남긴다. 읽기만 한다(`select`만)
 * - 덮어쓴 값이 신호 계산에 쓰이는 것은 `load.test.ts`가 지킨다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeOpsSignals } from '../compute'
import { loadSignalOverrides, parseSignalOverrideRows } from '../overrides'
import { NOW } from './fixtures'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseSignalOverrideRows', () => {
  it('행이 없으면 빈 객체다', () => {
    expect(parseSignalOverrideRows([])).toEqual({})
  })

  it('읽을 수 있는 행은 기준값 키 그대로 숫자가 된다', () => {
    expect(
      parseSignalOverrideRows([
        { rule_key: 'approvalDeadlineHours', value: { value: 72 } },
        { rule_key: 'actionSpikeMultiplier', value: { value: 1.5 } },
        { rule_key: 'weeklyRoutineWeekday', value: { value: 0 } },
      ])
    ).toEqual({ approvalDeadlineHours: 72, actionSpikeMultiplier: 1.5, weeklyRoutineWeekday: 0 })
  })

  it('모양이 틀리거나 범위를 벗어난 행은 그 키만 버린다', () => {
    expect(
      parseSignalOverrideRows([
        { rule_key: 'approvalDeadlineHours', value: { value: 0 } }, // 범위 밖
        { rule_key: 'missedScheduleMinutes', value: { value: 'abc' } }, // 숫자가 아님
        { rule_key: 'failureLookbackDays', value: 10 }, // `{value}` 모양이 아님
        { rule_key: 'minLiveCards', value: null },
        { rule_key: 'maxLiveCards', value: { value: 4.5 } }, // 정수가 아님
        { rule_key: 'nextWeekCheckFromWeekday', value: { value: 0 } }, // 일요일은 고를 수 없다
        { rule_key: 'monotonyWindowDays', value: { value: 10 } }, // 정상
      ])
    ).toEqual({ monotonyWindowDays: 10 })
  })

  it('모르는 키는 버린다', () => {
    expect(parseSignalOverrideRows([{ rule_key: 'notAThreshold', value: { value: 3 } }])).toEqual({})
  })

  it('routineCheckStartsAt 행은 시각으로 읽히는 글이면 그대로 읽는다', () => {
    expect(parseSignalOverrideRows([{ rule_key: 'routineCheckStartsAt', value: { value: '2026-10-06T00:00:00+09:00' } }])).toEqual({
      routineCheckStartsAt: '2026-10-06T00:00:00+09:00',
    })
    expect(parseSignalOverrideRows([{ rule_key: 'routineCheckStartsAt', value: { value: 'soon' } }])).toEqual({})
    expect(parseSignalOverrideRows([{ rule_key: 'routineCheckStartsAt', value: { value: null } }])).toEqual({})
  })

  it('읽은 값은 신호 계산(computeOpsSignals)의 thresholds로 그대로 넘길 수 있다', () => {
    const overrides = parseSignalOverrideRows([{ rule_key: 'approvalDeadlineHours', value: { value: 72 } }])
    const computation = computeOpsSignals({ cards: [], missions: [], bundles: [], actions: null }, { now: NOW, thresholds: overrides })
    expect(computation.signals).toHaveLength(13)
  })
})

describe('loadSignalOverrides', () => {
  function fakeClient(result: { data: unknown; error: { message: string } | null } | (() => never)) {
    const calls: string[] = []
    const query = {
      select: (columns: string) => {
        calls.push(`select:${columns}`)
        return query
      },
      eq: (column: string, value: unknown) => {
        calls.push(`eq:${column}:${value}`)
        return typeof result === 'function' ? result() : Promise.resolve(result)
      },
    }
    const from = (table: string) => {
      calls.push(`from:${table}`)
      return query
    }
    return { client: { from } as never, calls }
  }

  it('ops_rules의 신호 행만 읽고(select만) 덮어쓸 값을 돌려준다', async () => {
    const { client, calls } = fakeClient({ data: [{ rule_key: 'approvalDeadlineHours', value: { value: 36 } }], error: null })
    expect(await loadSignalOverrides(client)).toEqual({ approvalDeadlineHours: 36 })
    expect(calls).toEqual(['from:ops_rules', 'select:rule_key, value', 'eq:rule_group:signal'])
  })

  it('데이터가 null이어도 빈 객체다', async () => {
    const { client } = fakeClient({ data: null, error: null })
    expect(await loadSignalOverrides(client)).toEqual({})
  })

  it('읽기 오류는 던지지 않고 빈 객체(기본값)를 돌려주며 로그를 남긴다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'down' } })
    expect(await loadSignalOverrides(client)).toEqual({})
    expect(console.error).toHaveBeenCalled()
  })

  it('예외가 나도 던지지 않는다', async () => {
    const { client } = fakeClient(() => {
      throw new Error('boom')
    })
    expect(await loadSignalOverrides(client)).toEqual({})
    expect(console.error).toHaveBeenCalled()
  })
})
