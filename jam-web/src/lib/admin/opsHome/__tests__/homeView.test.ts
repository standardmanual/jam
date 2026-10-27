/**
 * 운영 홈 신호 구역 계산 (티켓 20261006_1340 ②-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」)
 *
 * 지키는 것:
 * - 신호 구역: 13종이 정확히 한 구역에만 들어가고 뜬 신호는 중단 → 주의 → 참고 순서이며 머리 숫자는 「종」 단위다.
 *
 * 「이번 주 상태」·「다음 주 줄」 계산은 운영 상황판(티켓 20261026_2023 2회차)이 대신해 지웠다. 새 계산의 시험은 `opsBoard/__tests__/`에 있다.
 */
import { describe, expect, it } from 'vitest'
import {
  OPS_SIGNAL_CATALOG,
  OPS_SIGNAL_KEYS,
  makeSignalResult,
  type OpsSignalOutcome,
  type OpsSignalState,
  type OpsSignalUncheckedReason,
} from '@/lib/admin/opsSignals/catalog'
import { noRaisedSignalsText, signalLevelCounts, zoneSignals } from '@/lib/admin/opsHome/homeView'

// ── 신호 구역 ────────────────────────────────────────────────────────────────────────────────────

function outcome(
  key: (typeof OPS_SIGNAL_KEYS)[number],
  state: OpsSignalState,
  extra: { reason?: OpsSignalUncheckedReason; results?: number } = {}
): OpsSignalOutcome {
  const definition = OPS_SIGNAL_CATALOG.find((entry) => entry.key === key)!
  return {
    key,
    name: definition.name,
    level: definition.level,
    state,
    uncheckedReason: state === 'unchecked' ? (extra.reason ?? 'not_built') : null,
    results: state === 'raised' ? Array.from({ length: extra.results ?? 1 }, (_, i) => makeSignalResult(`${definition.name} ${i + 1}`)) : [],
  }
}

/** 13종 전부를 한 상태로 둔 목록에서 몇 개만 바꾼다. */
function thirteen(overrides: Partial<Record<(typeof OPS_SIGNAL_KEYS)[number], OpsSignalOutcome>>): OpsSignalOutcome[] {
  return OPS_SIGNAL_KEYS.map((key) => overrides[key] ?? outcome(key, 'clear'))
}

describe('zoneSignals — 13종은 정확히 한 구역에만', () => {
  const signals = thirteen({
    execution_failed: outcome('execution_failed', 'raised', { results: 2 }),
    empty_content: outcome('empty_content', 'raised', { results: 4 }),
    overlap: outcome('overlap', 'raised'),
    balance_warning: outcome('balance_warning', 'unchecked', { reason: 'not_built' }),
    routine_failed: outcome('routine_failed', 'unchecked', { reason: 'not_started' }),
    blocked_collection: outcome('blocked_collection', 'unchecked', { reason: 'not_built' }),
    action_spike: outcome('action_spike', 'unchecked', { reason: 'load_failed' }),
  })

  it('세 구역에 나눈 신호를 합치면 13종 전부이고 겹치지 않는다', () => {
    const zones = zoneSignals(signals)
    const keys = [...zones.raised, ...zones.clear, ...zones.unchecked].map((signal) => signal.key)
    expect(keys).toHaveLength(13)
    expect(new Set(keys).size).toBe(13)
    expect([...keys].sort()).toEqual([...OPS_SIGNAL_KEYS].sort())
    expect(zones.raised).toHaveLength(3)
    expect(zones.unchecked.map((signal) => signal.key)).toEqual(['routine_failed', 'balance_warning', 'blocked_collection', 'action_spike'])
    expect(zones.clear).toHaveLength(6)
  })

  it('뜬 신호는 중단 → 주의 → 참고 순서다(같은 수준은 카탈로그 순서)', () => {
    const shuffled = [...signals].reverse()
    const raised = zoneSignals(shuffled).raised
    expect(raised.map((signal) => signal.level)).toEqual(['stop', 'warn', 'info'])
    expect(raised.map((signal) => signal.key)).toEqual(['execution_failed', 'empty_content', 'overlap'])
  })

  it('같은 수준끼리는 카탈로그 순서를 지킨다', () => {
    const raised = zoneSignals(
      thirteen({
        monotony: outcome('monotony', 'raised'),
        excluded_items: outcome('excluded_items', 'raised'),
        missed_schedule: outcome('missed_schedule', 'raised'),
        format_error: outcome('format_error', 'raised'),
        execution_failed: outcome('execution_failed', 'raised'),
      })
    ).raised
    expect(raised.map((signal) => signal.key)).toEqual(['execution_failed', 'missed_schedule', 'format_error', 'excluded_items', 'monotony'])
  })

  it('머리 숫자는 「종」 단위다: 결과가 여러 건이어도 한 종이다', () => {
    expect(signalLevelCounts(signals)).toEqual({ stop: 1, warn: 1, info: 1 })
    const many = thirteen({ empty_content: outcome('empty_content', 'raised', { results: 9 }) })
    expect(signalLevelCounts(many)).toEqual({ stop: 0, warn: 1, info: 0 })
  })

  it('이상 없음·확인 안 함은 머리 숫자에 들어가지 않는다', () => {
    expect(signalLevelCounts(thirteen({ action_spike: outcome('action_spike', 'unchecked') }))).toEqual({ stop: 0, warn: 0, info: 0 })
  })
})

describe('noRaisedSignalsText — 확인 안 함이 있으면 「이상 없어요」를 쓰지 않는다', () => {
  it('뜬 신호가 0이고 확인 안 함이 있으면 그 종 수를 알린다', () => {
    expect(noRaisedSignalsText(3)).toBe('뜬 신호가 없어요. 아직 확인하지 않은 신호가 3종 있어요')
    expect(noRaisedSignalsText(3)).not.toContain('이상 없어요')
  })

  it('확인 안 함도 없으면 뜬 신호가 없다고만 하고 안전하다고 말하지 않는다', () => {
    expect(noRaisedSignalsText(0)).toBe('뜬 신호가 없어요')
    expect(noRaisedSignalsText(0)).not.toContain('이상 없어요')
  })
})
