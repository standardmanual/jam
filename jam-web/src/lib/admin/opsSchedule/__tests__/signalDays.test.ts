/**
 * 날짜별 신호 (티켓 20261006_1536 ③-a, 카리나 가정 5)
 *
 * 지키는 것: 뜬 신호의 날짜 있는 결과만 센다, 그날 가장 높은 수준과 건수, 줄 순서(중단 → 주의 → 참고, 같은 수준은 신호 순서),
 * 검사 범위 표시(범위 밖에는 「이상 없음」을 말하지 않는다), 범위 밖이어도 날짜 있는 결과는 지우지 않는다, 일반 객체로 넘길 수 있다.
 */
import { describe, expect, it } from 'vitest'
import { signalsByDate } from '@/lib/admin/opsSchedule/signalDays'
import { makeSignalResult, type OpsSignalKey, type OpsSignalLevel, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'

function outcome(
  key: OpsSignalKey,
  level: OpsSignalLevel,
  state: OpsSignalOutcome['state'],
  results: Array<{ date: string | null; message?: string }> = []
): OpsSignalOutcome {
  return {
    key,
    name: `${key} 이름`,
    level,
    state,
    uncheckedReason: state === 'unchecked' ? 'load_failed' : null,
    results: results.map((result) => makeSignalResult(result.message ?? `${key} 문장`, { date: result.date })),
  }
}

const DATES = ['2026-10-05', '2026-10-06', '2026-10-07']

describe('signalsByDate', () => {
  it('요청한 날짜는 모두 키로 들어 있고 신호가 없는 날은 건수 0·수준 null이다', () => {
    const byDate = signalsByDate([], ['2026-10-06'], DATES)
    expect(Object.keys(byDate)).toEqual(DATES)
    expect(byDate['2026-10-06']).toEqual({ checked: true, topLevel: null, count: 0, lines: [] })
    expect(byDate['2026-10-05']).toEqual({ checked: false, topLevel: null, count: 0, lines: [] })
  })

  it('그날 가장 높은 수준 하나와 건수를 준다(중단 > 주의 > 참고)', () => {
    const signals = [
      outcome('overlap', 'info', 'raised', [{ date: '2026-10-06' }]),
      outcome('format_error', 'warn', 'raised', [{ date: '2026-10-06' }, { date: '2026-10-07' }]),
    ]
    const byDate = signalsByDate(signals, DATES, DATES)
    expect(byDate['2026-10-06']).toMatchObject({ topLevel: 'warn', count: 2 })
    expect(byDate['2026-10-07']).toMatchObject({ topLevel: 'warn', count: 1 })
    const withStop = signalsByDate([...signals, outcome('missed_schedule', 'stop', 'raised', [{ date: '2026-10-06' }])], DATES, DATES)
    expect(withStop['2026-10-06']).toMatchObject({ topLevel: 'stop', count: 3 })
  })

  it('줄은 중단 → 주의 → 참고 순이고 같은 수준은 신호 순서·들어온 순서를 지킨다', () => {
    const signals = [
      outcome('format_error', 'warn', 'raised', [{ date: '2026-10-06', message: '주의 A' }, { date: '2026-10-06', message: '주의 B' }]),
      outcome('overlap', 'info', 'raised', [{ date: '2026-10-06', message: '참고' }]),
      outcome('execution_failed', 'stop', 'raised', [{ date: '2026-10-06', message: '중단' }]),
      outcome('empty_content', 'warn', 'raised', [{ date: '2026-10-06', message: '주의 C' }]),
    ]
    const lines = signalsByDate(signals, DATES, DATES)['2026-10-06'].lines
    expect(lines.map((line) => line.result.message)).toEqual(['중단', '주의 A', '주의 B', '주의 C', '참고'])
    expect(lines[0]).toMatchObject({ signalKey: 'execution_failed', name: 'execution_failed 이름', level: 'stop' })
  })

  it('뜨지 않은 신호·확인 안 함·날짜 없는 결과는 날짜에 들어가지 않는다', () => {
    const signals = [
      outcome('overlap', 'info', 'clear'),
      outcome('balance_warning', 'warn', 'unchecked'),
      outcome('format_error', 'warn', 'raised', [{ date: null }]),
    ]
    const byDate = signalsByDate(signals, DATES, DATES)
    expect(Object.values(byDate).every((day) => day.count === 0)).toBe(true)
  })

  it('검사 범위 밖 날짜는 checked가 거짓이지만 날짜가 있는 결과는 지우지 않는다', () => {
    const signals = [outcome('execution_failed', 'stop', 'raised', [{ date: '2026-10-05' }])]
    const byDate = signalsByDate(signals, ['2026-10-06', '2026-10-07'], DATES)
    expect(byDate['2026-10-05']).toMatchObject({ checked: false, topLevel: 'stop', count: 1 })
    expect(byDate['2026-10-06']).toMatchObject({ checked: true, count: 0 })
  })

  it('주간에 없는 날짜의 결과는 들어가지 않는다', () => {
    const signals = [outcome('overlap', 'info', 'raised', [{ date: '2026-12-25' }])]
    expect(Object.keys(signalsByDate(signals, DATES, DATES))).toEqual(DATES)
  })

  it('시험 묶음에서 온 결과의 표식을 그대로 담는다', () => {
    const signal = outcome('overlap', 'info', 'raised', [{ date: '2026-10-06' }])
    signal.results[0] = { ...signal.results[0], isSample: true }
    expect(signalsByDate([signal], DATES, DATES)['2026-10-06'].lines[0].result.isSample).toBe(true)
  })

  it('JSON으로 왕복해도 같다(서버에서 클라이언트로 넘길 수 있다)', () => {
    const byDate = signalsByDate([outcome('overlap', 'info', 'raised', [{ date: '2026-10-06' }])], DATES, DATES)
    expect(JSON.parse(JSON.stringify(byDate))).toEqual(byDate)
  })
})
