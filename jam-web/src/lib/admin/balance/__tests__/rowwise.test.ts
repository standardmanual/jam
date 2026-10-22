/**
 * 여러 표 저장 공용 모듈 (티켓 20261022_1133 1회) — 표를 모르는 순수 로직이라 가짜 행 갱신 함수로만 지킨다.
 * - `latestStamp`: 수정 시각을 밀리초로 견주어 가장 늦은 것을 고른다(글자 순서가 아니다). 읽을 수 없는 글자나 빈 목록은 던진다
 * - `runRowOps` 순서: 넘긴 순서대로 한 행씩 갱신하고(동시에 하지 않는다), 모두 성공하면 쓴 행의 새 수정 시각을 같은 순서로 돌려준다
 * - 충돌과 중간 실패: 막힌 행 앞에서 이미 쓴 행만 나중에 쓴 행부터 되돌리고, 막힌 행과 그 뒤 행은 되돌리지도 쓰지도 않는다. 되돌리기에는 방금 쓴 수정 시각을 넘긴다
 * - 던짐: 갱신이 던지면 error로 보고 이미 쓴 행을 되돌린다
 * - 되돌리기 실패: 되돌리기가 거짓을 돌려주거나 던지면 나머지 행은 계속 되돌리고, 로그를 남기고, 원래 사유에 «(되돌리기 실패)»를 붙여 error로 답한다
 * - `toRowOutcome`·`didUndo`: 조건부 갱신 응답을 행 결과로 바꾼다(오류는 error, 0행은 conflict)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { didUndo, latestStamp, runRowOps, toRowOutcome, type RowOp, type RowOutcome } from '../rowwise'

describe('latestStamp', () => {
  it('글자 순서가 아니라 시각이 가장 늦은 것을 고른다', () => {
    // 글자로 견주면 '+09:00' 쪽이 크지만 실제 시각은 '+00:00' 쪽이 9시간 늦다
    expect(latestStamp(['2026-10-22T09:00:00+09:00', '2026-10-22T05:00:00+00:00'])).toBe('2026-10-22T05:00:00+00:00')
    expect(latestStamp(['2026-10-22T01:00:00.5+00:00', '2026-10-22T01:00:00.123456+00:00'])).toBe('2026-10-22T01:00:00.5+00:00')
  })

  it('같은 시각이면 먼저 나온 글자를 돌려준다', () => {
    expect(latestStamp(['2026-10-22T01:00:00+00:00', '2026-10-22T01:00:00.000Z'])).toBe('2026-10-22T01:00:00+00:00')
  })

  it('하나뿐이면 그대로다', () => {
    expect(latestStamp(['2026-10-22T01:00:00+00:00'])).toBe('2026-10-22T01:00:00+00:00')
  })

  it('읽을 수 없는 글자나 빈 목록은 던진다', () => {
    expect(() => latestStamp(['2026-10-22T01:00:00+00:00', 'nope'])).toThrow('수정 시각을 읽을 수 없음: nope')
    expect(() => latestStamp([])).toThrow('수정 시각이 없음')
  })
})

describe('toRowOutcome·didUndo', () => {
  it('한 행이 바뀌면 그 행의 수정 시각이다', () => {
    expect(toRowOutcome({ data: [{ updated_at: '2026-10-22T02:00:00+00:00' }], error: null })).toEqual({ ok: true, stamp: '2026-10-22T02:00:00+00:00' })
    expect(didUndo({ data: [{ updated_at: 'x' }], error: null })).toBe(true)
  })

  it('0행이면 conflict이고 되돌리기는 실패다', () => {
    expect(toRowOutcome({ data: [], error: null })).toEqual({ ok: false, reason: 'conflict' })
    expect(toRowOutcome({ data: null, error: null })).toEqual({ ok: false, reason: 'conflict' })
    expect(didUndo({ data: [], error: null })).toBe(false)
    expect(didUndo({ data: null, error: null })).toBe(false)
  })

  it('DB 오류는 error이고 행이 있어도 오류가 먼저다', () => {
    expect(toRowOutcome({ data: null, error: { message: 'boom' } })).toEqual({ ok: false, reason: 'error', message: 'boom' })
    expect(toRowOutcome({ data: [{ updated_at: 'x' }], error: { message: 'boom' } })).toEqual({ ok: false, reason: 'error', message: 'boom' })
    expect(didUndo({ data: [{ updated_at: 'x' }], error: { message: 'boom' } })).toBe(false)
  })
})

describe('runRowOps', () => {
  /** 일어난 일을 순서대로 적는 가짜 행 갱신. `outcomes`에 행 이름의 결과를 주면 그 결과로 답한다. */
  let events: string[]
  let outcomes: Record<string, RowOutcome | 'throw'>
  let undoResults: Record<string, boolean | 'throw'>

  function op(label: string): RowOp {
    return {
      label,
      apply: async () => {
        events.push(`apply:${label}`)
        const outcome = outcomes[label]
        if (outcome === 'throw') throw new Error(`${label} 던짐`)
        return outcome ?? { ok: true, stamp: `stamp-${label}` }
      },
      undo: async (appliedStamp) => {
        events.push(`undo:${label}@${appliedStamp}`)
        const result = undoResults[label]
        if (result === 'throw') throw new Error(`${label} 되돌리기 던짐`)
        return result ?? true
      },
    }
  }

  beforeEach(() => {
    events = []
    outcomes = {}
    undoResults = {}
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('넘긴 순서대로 한 행씩 갱신하고 쓴 행의 새 수정 시각을 같은 순서로 돌려준다', async () => {
    const res = await runRowOps('demo', [op('a'), op('b'), op('c')])
    expect(res).toEqual({ ok: true, stamps: ['stamp-a', 'stamp-b', 'stamp-c'] })
    expect(events).toEqual(['apply:a', 'apply:b', 'apply:c'])
  })

  it('갱신할 행이 없으면 아무것도 하지 않고 빈 목록이다', async () => {
    expect(await runRowOps('demo', [])).toEqual({ ok: true, stamps: [] })
    expect(events).toEqual([])
  })

  it('한 행이 다른 곳에 먼저 바뀌어 막히면 앞서 쓴 행을 나중에 쓴 행부터 되돌리고, 막힌 행 뒤는 건드리지 않는다', async () => {
    outcomes.c = { ok: false, reason: 'conflict' }
    const res = await runRowOps('demo', [op('a'), op('b'), op('c'), op('d')])
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(events).toEqual(['apply:a', 'apply:b', 'apply:c', 'undo:b@stamp-b', 'undo:a@stamp-a'])
  })

  it('DB 오류로 막혀도 같은 방식으로 되돌리고 오류 문장을 그대로 돌려준다', async () => {
    outcomes.b = { ok: false, reason: 'error', message: 'boom' }
    const res = await runRowOps('demo', [op('a'), op('b'), op('c')])
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
    expect(events).toEqual(['apply:a', 'apply:b', 'undo:a@stamp-a'])
    expect(console.error).not.toHaveBeenCalled()
  })

  it('첫 행에서 막히면 되돌릴 것이 없다', async () => {
    outcomes.a = { ok: false, reason: 'conflict' }
    expect(await runRowOps('demo', [op('a'), op('b')])).toEqual({ ok: false, reason: 'conflict' })
    expect(events).toEqual(['apply:a'])
  })

  it('갱신이 던지면 error로 보고 이미 쓴 행을 되돌린다', async () => {
    outcomes.b = 'throw'
    const res = await runRowOps('demo', [op('a'), op('b')])
    expect(res).toEqual({ ok: false, reason: 'error', message: 'b 던짐' })
    expect(events).toEqual(['apply:a', 'apply:b', 'undo:a@stamp-a'])
  })

  it('되돌리기에는 방금 쓴 행의 수정 시각을 넘긴다', async () => {
    outcomes.a = { ok: true, stamp: '2026-10-22T02:00:00+00:00' }
    outcomes.b = { ok: false, reason: 'conflict' }
    await runRowOps('demo', [op('a'), op('b')])
    expect(events).toContain('undo:a@2026-10-22T02:00:00+00:00')
  })

  it('되돌리기가 실패하면 나머지 행은 계속 되돌리고, 로그를 남기고, 사유에 «(되돌리기 실패)»를 붙인다', async () => {
    outcomes.c = { ok: false, reason: 'error', message: 'boom' }
    undoResults.b = false
    const res = await runRowOps('demo', [op('a'), op('b'), op('c')])
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom (되돌리기 실패)' })
    expect(events).toEqual(['apply:a', 'apply:b', 'apply:c', 'undo:b@stamp-b', 'undo:a@stamp-a'])
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('demo 여러 행을 쓰다 멈췄고 이미 쓴 행을 되돌리지도 못했다'),
      JSON.stringify([
        { label: 'a', stamp: 'stamp-a' },
        { label: 'b', stamp: 'stamp-b' },
      ])
    )
  })

  it('충돌 뒤 되돌리기까지 실패하면 error로 알린다(충돌 문장은 «다른 곳이 먼저 바꿈»)', async () => {
    outcomes.b = { ok: false, reason: 'conflict' }
    undoResults.a = false
    expect(await runRowOps('demo', [op('a'), op('b')])).toEqual({ ok: false, reason: 'error', message: '다른 곳이 먼저 바꿈 (되돌리기 실패)' })
  })

  it('되돌리기가 던져도 실패로 보고 나머지는 계속 되돌린다', async () => {
    outcomes.c = { ok: false, reason: 'conflict' }
    undoResults.b = 'throw'
    const res = await runRowOps('demo', [op('a'), op('b'), op('c')])
    expect(res).toMatchObject({ ok: false, reason: 'error', message: '다른 곳이 먼저 바꿈 (되돌리기 실패)' })
    expect(events).toContain('undo:a@stamp-a')
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})
