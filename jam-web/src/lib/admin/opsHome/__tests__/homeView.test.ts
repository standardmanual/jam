/**
 * 운영 홈 계산 (티켓 20261006_1340 ②-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」)
 *
 * 지키는 것:
 * - 이번 주 상태: 기간이 월~일에 걸치는 항목만 센다. 다섯 칸과 종료·반려·취소의 합이 이번 주에 겹치는 항목 수와 같고,
 *   단계 매핑은 `stageOfItemStatus`·`stageCounts` 한 곳이다. 합친 항목은 실제 카드의 기간으로, 멈춘 항목은 자기 기간으로 겹침을 본다.
 * - 시험 묶음은 켤 때만 더해지고 칸마다 시험 수가 따로 남는다. 공개 시각이 없는 항목·패턴 제안은 다섯 칸에 세지 않고 따로 센다.
 * - 다음 주 줄: 금요일부터(S7 기준 요일) 또는 다음 주 기획이 도착했을 때, 신호 검사 범위와 같은 판정이다.
 * - 신호 구역: 13종이 정확히 한 구역에만 들어가고 뜬 신호는 중단 → 주의 → 참고 순서이며 머리 숫자는 「종」 단위다.
 */
import { describe, expect, it } from 'vitest'
import { OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { OPS_STAGES, stageCounts, stageOfItemStatus } from '@/lib/admin/opsInbox/bundleStatus'
import {
  OPS_SIGNAL_CATALOG,
  OPS_SIGNAL_KEYS,
  makeSignalResult,
  type OpsSignalOutcome,
  type OpsSignalState,
  type OpsSignalUncheckedReason,
} from '@/lib/admin/opsSignals/catalog'
import { buildDayCompositions, type SignalBundleInput, type SignalCardInput } from '@/lib/admin/opsSignals/composition'
import {
  WEEK_CELL_KEYS,
  computeWeekStatus,
  noRaisedSignalsText,
  showsNextWeekRow,
  signalLevelCounts,
  weekStartOf,
  zoneSignals,
} from '@/lib/admin/opsHome/homeView'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { dayEnd, dayStart, makeBundle, makeCard, makeItem } from '@/lib/admin/opsSignals/__tests__/fixtures'

/** 기준 주: 2026-09-28(월) ~ 2026-10-04(일), ISO 주 `2026-W40`. */
const WEEK_START = '2026-09-28'
const WEEK = '2026-W40'

function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftDateStr(start, i))
}

/** 호출부(`loadDayCompositions`)가 하는 일을 그대로 한다: 시험을 끄면 시험 묶음은 읽지 않고, 읽은 묶음과 카드로 구성을 만든다. */
function weekStatus(
  bundles: SignalBundleInput[],
  options: { cards?: SignalCardInput[]; includeSample?: boolean; weekStart?: string } = {}
) {
  const includeSample = options.includeSample === true
  const weekStart = options.weekStart ?? WEEK_START
  const loaded = bundles.filter((bundle) => includeSample || !bundle.isSample)
  const compositions = buildDayCompositions({ cards: options.cards ?? [], missions: [], bundles: loaded }, datesFrom(weekStart, 14))
  return computeWeekStatus({ bundles: loaded, compositions, weekStart, includeSample })
}

/** 이번 주 안(10/1 하루)에 걸치는 항목. */
const inWeek = (status: string, over: Parameters<typeof makeItem>[0] = {}) => makeItem({ status, ...over })

describe('computeWeekStatus — 다섯 칸', () => {
  it('상태 10개를 하나씩 이번 주에 두면 칸 합과 각주 합이 겹치는 항목 수(10)와 같다', () => {
    const items = OPS_ITEM_STATUSES.map((status) => inWeek(status))
    const status = weekStatus([makeBundle(items, { week: WEEK })])
    const cellSum = WEEK_CELL_KEYS.reduce((sum, key) => sum + status.cells[key].count, 0)
    expect(status.overlapping).toBe(10)
    expect(cellSum + status.ended + status.rejected + status.cancelled).toBe(10)
    expect(status.cells).toEqual({
      waiting: { count: 2, sample: 0 }, // 새로 도착 + 검토중
      prepare: { count: 2, sample: 0 }, // 승인됨 + 준비중
      scheduled: { count: 1, sample: 0 },
      live: { count: 1, sample: 0 },
      failed: { count: 1, sample: 0 },
    })
    expect([status.ended, status.rejected, status.cancelled]).toEqual([1, 1, 1])
  })

  it('다섯 칸의 단계 매핑은 stageOfItemStatus·stageCounts와 같다(여기서 다시 정하지 않는다)', () => {
    // 상태마다 1~4개씩 둬서 칸마다 다른 수가 나오게 한다
    const statuses = [...OPS_ITEM_STATUSES.flatMap((s, i) => Array.from({ length: (i % 4) + 1 }, () => s))]
    const status = weekStatus([makeBundle(statuses.map((s) => inWeek(s)), { week: WEEK })])
    const stages = stageCounts(statuses)
    expect(status.cells.waiting.count).toBe(stages.arrived + stages.review)
    expect(status.cells.prepare.count).toBe(stages.prepare)
    expect(status.cells.scheduled.count).toBe(stages.scheduled)
    expect(status.cells.live.count).toBe(stages.live)
    expect(status.ended).toBe(stages.ended)
    // 단계에 없는 세 상태는 stageOfItemStatus가 null이라 따로 센다
    for (const key of ['failed', 'rejected', 'cancelled']) expect(stageOfItemStatus(key)).toBeNull()
    expect(status.cells.failed.count).toBe(statuses.filter((s) => s === 'failed').length)
    expect(status.rejected).toBe(statuses.filter((s) => s === 'rejected').length)
    expect(status.cancelled).toBe(statuses.filter((s) => s === 'cancelled').length)
    // 6단계 가운데 이 화면이 쓰는 것은 도착·검토·준비·예약·게재·종료 전부이고, 빠지는 단계가 없다
    expect([...OPS_STAGES].sort()).toEqual(['arrived', 'ended', 'live', 'prepare', 'review', 'scheduled'])
  })

  it('승인 대기는 「새로 도착 N · 검토중 M」, 예약 등록 대기는 「승인됨 N · 준비중 M」으로 속내가 갈린다', () => {
    const status = weekStatus([
      makeBundle(
        [
          inWeek('arrived'),
          inWeek('arrived'),
          inWeek('reviewing'),
          inWeek('reviewing'),
          inWeek('reviewing'),
          inWeek('approved'),
          inWeek('approved'),
          inWeek('preparing'),
        ],
        { week: WEEK }
      ),
    ])
    expect(status.waitingDetail).toEqual({ arrived: 2, reviewing: 3 })
    expect(status.cells.waiting.count).toBe(5)
    expect(status.prepareDetail).toEqual({ approved: 2, preparing: 1 })
    expect(status.cells.prepare.count).toBe(3)
  })

  it('항목이 없으면 모두 0이고 겹치는 항목도 0이다', () => {
    const status = weekStatus([])
    expect(status.overlapping).toBe(0)
    expect(status.weekStart).toBe(WEEK_START)
    expect(status.weekEnd).toBe('2026-10-04')
  })

  it('10개 밖 상태 값은 어느 칸에도 세지 않는다', () => {
    const status = weekStatus([makeBundle([inWeek('live'), inWeek('mystery')], { week: WEEK })])
    expect(status.overlapping).toBe(1)
    expect(status.cells.live.count).toBe(1)
  })
})

describe('computeWeekStatus — 이번 주 = 기간이 월~일에 걸침', () => {
  const at = (startDate: string, endDate: string | null) => ({
    startsAt: dayStart(startDate),
    endsAt: endDate === null ? null : dayEnd(endDate),
  })

  it('앞주에서 이번 주 월요일로 이어지는 항목, 일요일에서 다음 주로 이어지는 항목도 센다', () => {
    const status = weekStatus([
      makeBundle(
        [
          inWeek('live', at('2026-09-20', '2026-09-28')), // 월요일에 끝남
          inWeek('live', at('2026-10-04', '2026-10-10')), // 일요일에 시작
          inWeek('live', at('2026-09-20', '2026-10-20')), // 이번 주를 가로지름
        ],
        { week: WEEK }
      ),
    ])
    expect(status.cells.live.count).toBe(3)
  })

  it('이번 주 밖(앞주 일요일에 끝남, 다음 주 월요일에 시작)은 세지 않는다', () => {
    const status = weekStatus([
      makeBundle(
        [
          inWeek('live', at('2026-09-20', '2026-09-27')),
          inWeek('live', at('2026-10-05', '2026-10-11')),
        ],
        { week: WEEK }
      ),
    ])
    expect(status.overlapping).toBe(0)
  })

  it('종료 시각이 없으면 공개한 날 하루만 걸친다', () => {
    const status = weekStatus([makeBundle([inWeek('scheduled', at('2026-10-02', null)), inWeek('scheduled', at('2026-10-05', null))], { week: WEEK })])
    expect(status.cells.scheduled.count).toBe(1)
  })

  it('같은 항목이 이번 주 여러 날에 걸쳐도 한 번만 센다', () => {
    const status = weekStatus([makeBundle([inWeek('live', at('2026-09-28', '2026-10-04'))], { week: WEEK })])
    expect(status.cells.live.count).toBe(1)
  })

  it('멈춘 항목(실패·반려·취소)은 구성에 없어도 자기 기간으로 겹침을 본다', () => {
    const status = weekStatus([
      makeBundle(
        [
          inWeek('failed', at('2026-10-01', '2026-10-01')),
          inWeek('rejected', at('2026-10-02', '2026-10-02')),
          inWeek('cancelled', at('2026-10-03', '2026-10-03')),
          inWeek('failed', at('2026-10-12', '2026-10-12')), // 다음다음 주
        ],
        { week: WEEK }
      ),
    ])
    expect(status.cells.failed.count).toBe(1)
    expect(status.rejected).toBe(1)
    expect(status.cancelled).toBe(1)
    expect(status.overlapping).toBe(3)
  })

  it('실제 카드와 합친 항목은 실제 카드의 기간으로 겹침을 본다(상위 가정 1)', () => {
    const card = makeCard({ id: 'card-merge', startsAt: dayStart('2026-10-01'), endsAt: dayEnd('2026-10-01') })
    // 항목 자기 시각은 앞주지만 만든 카드는 이번 주에 걸친다
    const merged = makeItem({
      status: 'live',
      startsAt: dayStart('2026-09-14'),
      endsAt: dayEnd('2026-09-14'),
      createdResource: { today_card_id: 'card-merge' },
    })
    const status = weekStatus([makeBundle([merged], { week: WEEK })], { cards: [card] })
    expect(status.cells.live.count).toBe(1)

    // 같은 항목이 카드 없이는(합치지 않으면) 자기 시각(앞주)이라 이번 주에 없다
    expect(weekStatus([makeBundle([merged], { week: WEEK })]).cells.live.count).toBe(0)
  })

  it('이번 주 상태와 다음 주 상태는 같은 입력에서 주마다 따로 센다', () => {
    const bundles = [
      makeBundle(
        [inWeek('arrived'), inWeek('arrived', { startsAt: dayStart('2026-10-06'), endsAt: dayEnd('2026-10-06') })],
        { week: WEEK }
      ),
    ]
    expect(weekStatus(bundles).cells.waiting.count).toBe(1)
    expect(weekStatus(bundles, { weekStart: '2026-10-05' }).cells.waiting.count).toBe(1)
  })
})

describe('computeWeekStatus — 시험 묶음 켬·끔', () => {
  const real = () => makeBundle([inWeek('arrived'), inWeek('live')], { week: WEEK })
  const sample = () => makeBundle([inWeek('arrived'), inWeek('arrived'), inWeek('failed')], { week: WEEK, isSample: true })

  it('끄면 시험 묶음의 항목이 모든 숫자에서 빠진다', () => {
    const status = weekStatus([real(), sample()])
    expect(status.cells.waiting).toEqual({ count: 1, sample: 0 })
    expect(status.cells.failed).toEqual({ count: 0, sample: 0 })
    expect(status.overlapping).toBe(2)
    expect(status.sampleInCells).toBe(0)
  })

  it('켜면 시험이 더해지고 칸마다 그 가운데 시험 수가 남는다', () => {
    const status = weekStatus([real(), sample()], { includeSample: true })
    expect(status.cells.waiting).toEqual({ count: 3, sample: 2 })
    expect(status.cells.live).toEqual({ count: 1, sample: 0 })
    expect(status.cells.failed).toEqual({ count: 1, sample: 1 })
    expect(status.overlapping).toBe(5)
    expect(status.sampleInCells).toBe(3)
  })

  it('입력에 시험 묶음이 섞여 있어도 끄면 센 값이 달라지지 않는다(구성을 이미 만들어 둔 경우)', () => {
    const bundles = [real(), sample()]
    const compositions = buildDayCompositions({ cards: [], missions: [], bundles }, datesFrom(WEEK_START, 7))
    const off = computeWeekStatus({ bundles, compositions, weekStart: WEEK_START, includeSample: false })
    expect(off.cells.waiting.count).toBe(1)
    expect(off.cells.failed.count).toBe(0)
  })
})

describe('computeWeekStatus — 각주 숫자(상위 가정 4)', () => {
  it('종료·반려·취소는 다섯 칸에 넣지 않고 각주 숫자로 센다', () => {
    const status = weekStatus([makeBundle([inWeek('ended'), inWeek('ended'), inWeek('rejected'), inWeek('cancelled')], { week: WEEK })])
    expect(status.ended).toBe(2)
    expect(status.rejected).toBe(1)
    expect(status.cancelled).toBe(1)
    expect(WEEK_CELL_KEYS.every((key) => status.cells[key].count === 0)).toBe(true)
    expect(status.overlapping).toBe(4)
  })

  it('공개 시각이 없는 항목은 칸에서 빠지고 이번 주 묶음의 것만 각주 숫자로 센다', () => {
    const status = weekStatus([
      makeBundle([inWeek('arrived'), inWeek('arrived', { startsAt: null, endsAt: null })], { week: WEEK }),
      makeBundle([inWeek('arrived', { startsAt: null, endsAt: null })], { week: '2026-W30' }), // 다른 주 묶음은 세지 않는다
    ])
    expect(status.noStart).toBe(1)
    expect(status.cells.waiting.count).toBe(1)
    expect(status.overlapping).toBe(1)
  })

  it('패턴 제안은 다섯 칸에 넣지 않고 이번 주 묶음의 것만 따로 센다', () => {
    const proposal = (over: Parameters<typeof makeItem>[0] = {}) => makeItem({ kind: 'pattern_proposal', status: 'reviewing', ...over })
    const status = weekStatus([
      makeBundle([proposal(), proposal({ startsAt: null, endsAt: null })], { week: WEEK }),
      makeBundle([proposal()], { week: '2026-W30' }),
    ])
    expect(status.patternProposals).toBe(2)
    expect(status.cells.waiting.count).toBe(0)
    expect(status.noStart).toBe(0)
    expect(status.overlapping).toBe(0)
  })

  it('시험 묶음의 각주 숫자는 끄면 빠진다', () => {
    const sample = makeBundle([inWeek('arrived', { startsAt: null, endsAt: null }), makeItem({ kind: 'pattern_proposal', status: 'arrived' })], {
      week: WEEK,
      isSample: true,
    })
    expect(weekStatus([sample]).noStart).toBe(0)
    expect(weekStatus([sample]).patternProposals).toBe(0)
    expect(weekStatus([sample], { includeSample: true })).toMatchObject({ noStart: 1, patternProposals: 1 })
  })
})

describe('weekStartOf', () => {
  it('KST 기준 그 주 월요일이다(UTC로는 아직 전날인 일요일 밤도 다음 주다)', () => {
    expect(weekStartOf(new Date('2026-10-01T12:00:00+09:00'))).toBe('2026-09-28')
    expect(weekStartOf(new Date('2026-10-04T15:30:00Z'))).toBe('2026-10-05')
  })
})

describe('showsNextWeekRow — 다음 주 줄(상위 가정 6)', () => {
  const at = (date: string) => new Date(`${date}T12:00:00+09:00`)
  const nextWeekBundle = (over: Partial<SignalBundleInput> = {}) => makeBundle([], { week: '2026-W41', ...over })

  it('금요일부터와 일요일에 보이고 그 전에는 숨는다', () => {
    const options = { bundles: [], nextWeekCheckFromWeekday: 5 }
    expect(showsNextWeekRow({ ...options, now: at('2026-10-01') })).toBe(false)
    expect(showsNextWeekRow({ ...options, now: at('2026-10-02') })).toBe(true)
    expect(showsNextWeekRow({ ...options, now: at('2026-10-04') })).toBe(true)
  })

  it('다음 주 기획이 도착했으면 목요일에도 보인다', () => {
    expect(showsNextWeekRow({ now: at('2026-10-01'), bundles: [nextWeekBundle()], nextWeekCheckFromWeekday: 5 })).toBe(true)
  })

  it('다음 주 기획이 도착했는지는 시험 묶음이면 켤 때만 본다', () => {
    const input = { now: at('2026-10-01'), bundles: [nextWeekBundle({ isSample: true })], nextWeekCheckFromWeekday: 5 }
    expect(showsNextWeekRow(input)).toBe(false)
    expect(showsNextWeekRow({ ...input, includeSample: true })).toBe(true)
  })

  it('이번 주 묶음은 다음 주 도착으로 보지 않는다', () => {
    expect(showsNextWeekRow({ now: at('2026-10-01'), bundles: [makeBundle([], { week: WEEK })], nextWeekCheckFromWeekday: 5 })).toBe(false)
  })

  it('S7에서 기준 요일을 바꾸면 그 요일부터다', () => {
    expect(showsNextWeekRow({ now: at('2026-10-01'), bundles: [], nextWeekCheckFromWeekday: 4 })).toBe(true)
    expect(showsNextWeekRow({ now: at('2026-10-02'), bundles: [], nextWeekCheckFromWeekday: 6 })).toBe(false)
  })

  it('묶음을 읽지 못했으면(null) 요일만 본다', () => {
    expect(showsNextWeekRow({ now: at('2026-10-01'), bundles: null, nextWeekCheckFromWeekday: 5 })).toBe(false)
    expect(showsNextWeekRow({ now: at('2026-10-02'), bundles: null, nextWeekCheckFromWeekday: 5 })).toBe(true)
  })
})

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
