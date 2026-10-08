/**
 * 신호 계산 묶음 (티켓 20261001_1155)
 *
 * 지키는 것: 시험 묶음은 기본으로 빠지고 포함하면 「시험」 표식이 붙는다, 재료를 읽지 못하면 그 재료에 기대는 신호만
 * 「확인하지 못했어요」가 되고 나머지는 계산한다(A11), 검사 범위와 날짜별 구성, 신호 13종의 순서.
 */
import { describe, expect, it } from 'vitest'
import { OPS_SIGNAL_CATALOG, type OpsSignalKey, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import { ACTION_METRIC_KEYS, type ActionCounts } from '@/lib/admin/opsSignals/actionSpike'
import {
  computeOpsSignals,
  type ComputeOpsSignalsInput,
  type ComputeOpsSignalsOptions,
} from '@/lib/admin/opsSignals/compute'
import { evaluateBlockedCollections } from '@/lib/admin/opsSignals/statusRules'
import {
  HEALTHY_FROM,
  HEALTHY_TO,
  NOW,
  cardOriginal,
  dayEnd,
  dayStart,
  healthyCards,
  kst,
  makeBundle,
  makeItem,
} from './fixtures'

function quietActions(): ActionCounts {
  const counts = {} as ActionCounts
  for (const metric of ACTION_METRIC_KEYS) counts[metric] = { recent: 0, baselineWeeklyAverage: 0 }
  return counts
}

function run(input: Partial<ComputeOpsSignalsInput> = {}, options: Partial<ComputeOpsSignalsOptions> = {}) {
  return computeOpsSignals(
    { cards: healthyCards(HEALTHY_FROM, HEALTHY_TO), missions: [], bundles: [], actions: quietActions(), ...input },
    { now: NOW, ...options }
  )
}

function find(result: ReturnType<typeof run>, key: OpsSignalKey): OpsSignalOutcome {
  return result.signals.find((signal) => signal.key === key) as OpsSignalOutcome
}

function states(result: ReturnType<typeof run>): Record<string, string> {
  return Object.fromEntries(
    result.signals.map((signal) => [signal.key, signal.state === 'unchecked' ? `unchecked:${signal.uncheckedReason}` : signal.state])
  )
}

const statusItem = (over: Parameters<typeof makeItem>[0] = {}) =>
  makeItem({ kind: 'drop_schedule', startsAt: null, endsAt: null, original: {}, ...over })

const STATUS_SIGNALS: OpsSignalKey[] = [
  'execution_failed',
  'missed_schedule',
  'routine_failed',
  'format_error',
  'approval_deadline',
  'excluded_items',
]
const DAY_SIGNALS: OpsSignalKey[] = ['empty_content', 'no_new_content', 'overlap', 'monotony']

describe('시험 묶음 — 기본은 제외, 포함하면 「시험」 표식', () => {
  const failedItem = () => statusItem({ status: 'failed', updatedAt: kst('2026-09-30', '10:00') })

  it('기본은 시험 묶음의 항목을 어떤 신호에도 넣지 않는다', () => {
    const sample = makeBundle([failedItem()], { isSample: true, formatErrors: ['items[0].kind: 틀렸어요.'] })
    const result = run({ bundles: [sample] })
    expect(result.includeSample).toBe(false)
    expect(find(result, 'execution_failed').state).toBe('clear')
    expect(find(result, 'format_error').state).toBe('clear')
  })

  it('포함하면 신호에 들어가고 결과에 시험 표식이 붙는다', () => {
    const sample = makeBundle([failedItem()], { isSample: true })
    const real = makeBundle([failedItem()])
    const result = run({ bundles: [sample, real] }, { includeSample: true })
    expect(result.includeSample).toBe(true)
    const failed = find(result, 'execution_failed')
    expect(failed.state).toBe('raised')
    expect(failed.results.map((entry) => entry.isSample).sort()).toEqual([false, true])
    expect(failed.results.find((entry) => entry.isSample)?.bundleId).toBe(sample.id)
  })

  it('실제 묶음만 있으면 포함해도 표식이 붙지 않는다', () => {
    const result = run({ bundles: [makeBundle([failedItem()])] }, { includeSample: true })
    expect(find(result, 'execution_failed').results.every((entry) => !entry.isSample)).toBe(true)
  })

  it('시험 묶음의 카드는 기본으로 날짜 구성에서 빠지고 포함하면 isSample 표식과 함께 들어간다', () => {
    const sampleCard = makeItem({ startsAt: dayStart('2026-10-02'), endsAt: dayEnd('2026-10-02'), original: cardOriginal() })
    const sample = makeBundle([sampleCard], { isSample: true })
    const without = run({ bundles: [sample] })
    const withSample = run({ bundles: [sample] }, { includeSample: true })
    const dayOf = (result: ReturnType<typeof run>) => result.compositions.find((day) => day.date === '2026-10-02')
    expect(dayOf(without)?.cards).toHaveLength(3)
    expect(dayOf(withSample)?.cards).toHaveLength(4)
    expect(dayOf(withSample)?.cards.filter((card) => card.isSample)).toHaveLength(1)
  })

  it('시험 카드 때문에 뜬 날짜 신호에는 시험 표식이 붙고, 기본에서는 아예 뜨지 않는다', () => {
    // 10/2에 이미지가 있는 모양 카드가 기준 1장 + 시험 묶음 2장 = 3장
    const items = [3, 4].map(() =>
      makeItem({
        startsAt: dayStart('2026-10-02'),
        endsAt: dayEnd('2026-10-02'),
        original: cardOriginal({ shape: 'hero', exposure_tags: ['x'] }),
      })
    )
    const sample = makeBundle(items, { isSample: true })
    expect(find(run({ bundles: [sample] }), 'overlap').state).toBe('clear')
    const included = find(run({ bundles: [sample] }, { includeSample: true }), 'overlap')
    expect(included.state).toBe('raised')
    expect(included.results[0].isSample).toBe(true)
  })

  it('다음 주 기획이 도착했는지도 시험 묶음은 기본으로 세지 않는다', () => {
    const sampleNextWeek = makeBundle([statusItem({ status: 'arrived' })], { isSample: true, week: '2026-W41' })
    expect(run({ bundles: [sampleNextWeek] }).scanDates).toHaveLength(4)
    expect(run({ bundles: [sampleNextWeek] }, { includeSample: true }).scanDates).toHaveLength(11)
  })
})

describe('재료를 읽지 못하면 그 재료에 기대는 신호만 「확인하지 못했어요」다(A11)', () => {
  const failedItem = () => statusItem({ status: 'failed', updatedAt: kst('2026-09-30', '10:00') })

  it('묶음을 읽지 못하면 상태 신호 6종과 날짜 구성 신호 4종이 load_failed이고 행동 횟수 급증은 계산한다', () => {
    const actions = quietActions()
    actions.pickup = { recent: 60, baselineWeeklyAverage: 20 }
    const result = run({ bundles: null, actions })
    for (const key of [...STATUS_SIGNALS, ...DAY_SIGNALS]) {
      const signal = find(result, key)
      expect(signal.state, key).toBe('unchecked')
      expect(signal.uncheckedReason, key).toBe('load_failed')
      expect(signal.results, key).toEqual([])
    }
    expect(find(result, 'action_spike').state).toBe('raised')
  })

  it('카드를 읽지 못하면 날짜 구성 신호 4종만 load_failed이고 상태 신호는 계산한다', () => {
    const result = run({ cards: null, bundles: [makeBundle([failedItem()])] })
    for (const key of DAY_SIGNALS) {
      expect(find(result, key).state, key).toBe('unchecked')
      expect(find(result, key).uncheckedReason, key).toBe('load_failed')
    }
    expect(find(result, 'execution_failed').state).toBe('raised')
    expect(find(result, 'format_error').state).toBe('clear')
    expect(find(result, 'action_spike').state).toBe('clear')
  })

  it('행동 건수를 읽지 못하면 행동 횟수 급증만 load_failed이다', () => {
    const baseline = states(run())
    const result = run({ actions: null })
    expect(states(result)).toEqual({ ...baseline, action_spike: 'unchecked:load_failed' })
  })

  it('컬렉션 아이템 수를 읽지 못하면(null) 「비어 있는 컨텐츠」만 load_failed이고 나머지는 그대로다(티켓 20261004_2242)', () => {
    const baseline = states(run())
    const result = run({ collectionItemCounts: null })
    expect(states(result)).toEqual({ ...baseline, empty_content: 'unchecked:load_failed' })
    expect(find(result, 'empty_content').results).toEqual([])
    // 넘기지 않으면(undefined) 컬렉션 검사를 하지 않아 기존과 같다. 빈 지도면 대상이 없어 안 뜬다.
    expect(states(run({ collectionItemCounts: undefined }))).toEqual(baseline)
    expect(states(run({ collectionItemCounts: new Map() }))).toEqual(baseline)
  })

  it('묶음을 읽지 못하면 컬렉션 아이템 수와 관계없이 「비어 있는 컨텐츠」는 load_failed다', () => {
    expect(find(run({ bundles: null, collectionItemCounts: new Map() }), 'empty_content').uncheckedReason).toBe('load_failed')
  })

  it('미션을 읽지 못해도 어떤 신호도 바뀌지 않는다(미션에 기대는 신호가 없다)', () => {
    const baseline = states(run())
    expect(states(run({ missions: null }))).toEqual(baseline)
  })

  it('모든 재료를 읽지 못해도 계산 규칙이 없는 밸런스 경고는 그대로 「아직 확인하지 않아요」다', () => {
    const result = run({ cards: null, missions: null, bundles: null, actions: null })
    expect(states(result)).toEqual({
      execution_failed: 'unchecked:load_failed',
      missed_schedule: 'unchecked:load_failed',
      routine_failed: 'unchecked:load_failed',
      format_error: 'unchecked:load_failed',
      empty_content: 'unchecked:load_failed',
      no_new_content: 'unchecked:load_failed',
      approval_deadline: 'unchecked:load_failed',
      balance_warning: 'unchecked:not_built',
      excluded_items: 'unchecked:load_failed',
      overlap: 'unchecked:load_failed',
      monotony: 'unchecked:load_failed',
      blocked_collection: 'clear',
      action_spike: 'unchecked:load_failed',
    })
  })

  it('안 뜬 것과 확인하지 못한 것을 섞지 않는다: 확인 안 함 신호는 결과가 비어 있고 뜬 신호만 결과가 있다', () => {
    const result = run({ bundles: [makeBundle([failedItem()])], actions: null })
    for (const signal of result.signals) {
      if (signal.state === 'raised') expect(signal.results.length).toBeGreaterThan(0)
      else expect(signal.results).toEqual([])
      if (signal.state === 'unchecked') expect(signal.uncheckedReason).not.toBeNull()
      else expect(signal.uncheckedReason).toBeNull()
    }
  })
})

describe('검사 범위와 날짜별 구성', () => {
  it('목요일에는 이번 주 남은 날 4일을 검사하고 구성은 앞 6일을 더해 10일을 담는다', () => {
    const result = run()
    expect(result.scanDates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(result.compositions.map((day) => day.date)).toEqual([
      '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
      '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })

  it('다음 주 기획(week가 다음 주 ISO 주)이 도착했으면 금요일 전에도 다음 주 7일을 더한다', () => {
    const nextWeek = makeBundle([statusItem({ status: 'arrived' })], { week: '2026-W41' })
    const result = run({ bundles: [nextWeek] })
    expect(result.scanDates).toHaveLength(11)
    expect(result.scanDates[4]).toBe('2026-10-05')
    expect(result.scanDates[10]).toBe('2026-10-11')
  })

  it('이번 주 기획만 도착했으면 범위를 넓히지 않는다', () => {
    const thisWeek = makeBundle([statusItem({ status: 'arrived' })], { week: '2026-W40' })
    expect(run({ bundles: [thisWeek] }).scanDates).toHaveLength(4)
  })

  it('금요일부터는 다음 주를 본다', () => {
    const result = run({}, { now: new Date('2026-10-02T09:00:00+09:00') })
    expect(result.scanDates).toHaveLength(10)
  })

  it('검사 범위 밖 날짜의 문제는 신호로 뜨지 않는다(어제 카드가 비어도 오늘 신호가 아니다)', () => {
    const cards = healthyCards(HEALTHY_FROM, HEALTHY_TO).filter((card) => card.startsAt !== dayStart('2026-09-30'))
    const result = run({ cards })
    expect(find(result, 'empty_content').state).toBe('clear')
    expect(find(result, 'no_new_content').state).toBe('clear')
  })

  it('날짜별 구성에 실제 미션과 운영 묶음 항목이 함께 실린다', () => {
    const mission = { id: 'm1', title: '가을 미션', startsAt: kst('2026-09-20', '09:00'), endsAt: null }
    const dropItem = makeItem({ kind: 'drop_schedule', startsAt: kst('2026-10-02', '09:00'), endsAt: null, original: {} })
    const result = run({ missions: [mission], bundles: [makeBundle([dropItem])] })
    const day = result.compositions.find((entry) => entry.date === '2026-10-02')
    expect(day?.missions.map((entry) => entry.id)).toEqual(['m1'])
    expect(day?.bundleItems.map((entry) => entry.itemId)).toEqual([dropItem.id])
    expect(day?.representative).not.toBeNull()
  })
})

describe('기준값 덮어쓰기와 이름표', () => {
  it('기준값을 덮어쓰면 규칙이 그 값을 쓴다(승인 마감 임박 24시간)', () => {
    const item = statusItem({ status: 'arrived', startsAt: kst('2026-10-02', '18:00') })
    const bundles = [makeBundle([item])]
    expect(find(run({ bundles }), 'approval_deadline').state).toBe('raised')
    expect(find(run({ bundles }, { thresholds: { approvalDeadlineHours: 24 } }), 'approval_deadline').state).toBe('clear')
  })

  it('기준값을 덮어쓰면 승인됨(예약 등록 전) 항목에도 적용된다', () => {
    const item = statusItem({ status: 'approved', startsAt: kst('2026-10-02', '18:00') })
    const bundles = [makeBundle([item])]
    expect(find(run({ bundles }), 'approval_deadline').state).toBe('raised')
    expect(find(run({ bundles }, { thresholds: { approvalDeadlineHours: 24 } }), 'approval_deadline').state).toBe('clear')
  })

  it('수준과 이름은 이름표를 따른다', () => {
    const result = run()
    expect(result.signals.map((signal) => [signal.key, signal.name, signal.level])).toEqual(
      OPS_SIGNAL_CATALOG.map((definition) => [definition.key, definition.name, definition.level])
    )
  })
})

describe('획득 경로가 막힌 컬렉션 (티켓 20261008_1301)', () => {
  const blocked = [
    { collectionId: 'b-2', name: '여름 컬렉션', blocked: 3, total: 10 },
    { collectionId: 'a-1', name: '가을 컬렉션', blocked: 1, total: 4 },
  ]

  it('컬렉션 하나가 결과 한 건이고 문장에 이름과 막힘 수·전체 수가 들어간다', () => {
    const results = evaluateBlockedCollections(blocked)
    expect(results.map((result) => result.message)).toEqual([
      '컬렉션 「가을 컬렉션」의 아이템 1개는 지금 얻을 길이 없어요(전체 4개).',
      '컬렉션 「여름 컬렉션」의 아이템 3개는 지금 얻을 길이 없어요(전체 10개).',
    ])
    for (const result of results) {
      expect(result).toMatchObject({ date: null, bundleId: null, itemId: null, isSample: false, onsetAt: null })
    }
  })

  it('이름이 같으면 컬렉션 ID 순서다', () => {
    const results = evaluateBlockedCollections([
      { collectionId: 'z', name: '같은 이름', blocked: 2, total: 2 },
      { collectionId: 'a', name: '같은 이름', blocked: 1, total: 5 },
    ])
    expect(results.map((result) => result.message)).toEqual([
      '컬렉션 「같은 이름」의 아이템 1개는 지금 얻을 길이 없어요(전체 5개).',
      '컬렉션 「같은 이름」의 아이템 2개는 지금 얻을 길이 없어요(전체 2개).',
    ])
  })

  it('빈 목록이면 결과가 없다', () => {
    expect(evaluateBlockedCollections([])).toEqual([])
  })

  it('막힌 컬렉션이 있으면 신호가 뜨고 참고 수준이며 시험 묶음 스위치와 관계없다', () => {
    const outcome = find(run({ blockedCollections: blocked }, { includeSample: true }), 'blocked_collection')
    expect(outcome.state).toBe('raised')
    expect(outcome.results).toHaveLength(2)
    expect(outcome.results.every((result) => !result.isSample)).toBe(true)
  })

  it('빈 목록이거나 넘기지 않으면 안 뜬다(not_built가 아니다)', () => {
    expect(find(run({ blockedCollections: [] }), 'blocked_collection').state).toBe('clear')
    expect(find(run(), 'blocked_collection').state).toBe('clear')
  })

  it('읽지 못했으면(null) 이 신호만 「확인하지 못했어요」다', () => {
    const result = run({ blockedCollections: null })
    expect(states(result).blocked_collection).toBe('unchecked:load_failed')
    expect(find(result, 'action_spike').state).toBe('clear')
    expect(find(result, 'execution_failed').state).toBe('clear')
  })
})
