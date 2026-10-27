/**
 * 운영 홈 부품의 렌더 (티켓 20261006_1340 ②-b, 채원 판정 「S1 운영 홈」)
 *
 * 저장소에 jsdom·testing-library가 없어(`parts.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다.
 * 버튼은 가짜로 바꿔 눌림 동작(`router.refresh`)을 붙잡아 직접 부른다.
 * 시험 묶음 1개 fixture로 켬·끔 두 벌을 같은 파이프라인(`computeOpsSignals`·최근 이력)으로 만들어 그린다.
 *
 * 지키는 것:
 * - 시험 켬: 숫자·신호·이력에 시험이 더해지고 「시험 N개 포함」과 줄마다 「시험」 칩이 붙는다. 끔: 모두 빠진다.
 * - 신호 13종은 한 구역에만, 중단 → 주의 → 참고, 뜬 신호 0 + 확인 안 함이면 「이상 없어요」 없음, 확인 안 함 3종과 `load_failed`
 * - 최근 이력은 최신 10건, 받은 기획함 상세와 같은 문장, 0건이면 「아직 기록이 없어요」
 * - 신호·결정 문장·에이전트 이름은 HTML로 해석되지 않는다, 칩은 아이콘 + 글자
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'

const hoisted = vi.hoisted(() => ({
  refresh: vi.fn(),
  buttons: [] as Array<Record<string, unknown>>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: hoisted.refresh }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('@/components/admin/ui/button', async () => {
  const React = await import('react')
  return {
    buttonVariants: () => '',
    Button: (props: Record<string, unknown>) => {
      hoisted.buttons.push(props)
      return React.createElement('button', { type: 'button', className: props.className as string }, props.children as ReactNode)
    },
  }
})

import { OpsRecentDecisions } from '../OpsRecentDecisions'
import { OpsSectionNotice } from '../OpsSectionNotice'
import { OpsSignalPanel } from '../OpsSignalPanel'
import { decisionLineText } from '@/lib/admin/opsDecisions/line'
import type { OpsRecentDecisionRecord } from '@/lib/admin/opsDecisions/read'
import { zoneSignals } from '@/lib/admin/opsHome/homeView'
import { OPS_SIGNAL_CATALOG, OPS_SIGNAL_KEYS, makeSignalResult, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import { ACTION_METRIC_KEYS, type ActionCounts } from '@/lib/admin/opsSignals/actionSpike'
import type { SignalBundleInput } from '@/lib/admin/opsSignals/composition'
import { computeOpsSignals } from '@/lib/admin/opsSignals/compute'
import {
  HEALTHY_FROM,
  HEALTHY_TO,
  NOW,
  dayEnd,
  dayStart,
  healthyCards,
  kst,
  makeBundle,
  makeItem,
} from '@/lib/admin/opsSignals/__tests__/fixtures'

const html = (node: ReactElement) => renderToStaticMarkup(node)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')

beforeEach(() => {
  hoisted.refresh.mockReset()
  hoisted.buttons.length = 0
})

// ── 시험 묶음 1개 fixture ────────────────────────────────────────────────────────────────────────

function quietActions(): ActionCounts {
  const counts = {} as ActionCounts
  for (const metric of ACTION_METRIC_KEYS) counts[metric] = { recent: 0, baselineWeeklyAverage: 0 }
  return counts
}

/** 날짜 카드가 아닌 항목(드랍 일정)이라 날짜 구성 신호에 끼어들지 않는다. 기본은 2026-10-01 하루짜리다. */
const dropItem = (over: Parameters<typeof makeItem>[0] = {}) => makeItem({ kind: 'drop_schedule', original: {}, ...over })

/** 운영 묶음 1개: 승인 대기 1(공개 시각이 지나 「승인 마감 임박」), 예약됨 1, 게재중 1. */
function realBundle(): SignalBundleInput {
  return makeBundle(
    [
      dropItem({ status: 'arrived' }),
      dropItem({ status: 'scheduled', startsAt: dayStart('2026-10-03'), endsAt: dayEnd('2026-10-03') }),
      dropItem({ status: 'live' }),
    ],
    { week: '2026-W40' }
  )
}

/** 시험 묶음 1개: 승인 대기 1(승인 마감 임박)과 실패 1(실행 실패). 끄면 어디에도 나오지 않는다. */
function sampleBundle(): SignalBundleInput {
  return makeBundle(
    [dropItem({ status: 'arrived' }), dropItem({ status: 'failed', updatedAt: kst('2026-10-01', '09:00') })],
    { week: '2026-W40', isSample: true }
  )
}

let recordSeq = 0
function record(over: Partial<OpsRecentDecisionRecord> = {}): OpsRecentDecisionRecord {
  recordSeq += 1
  return {
    id: `decision-${recordSeq}`,
    createdAt: kst('2026-10-01', '09:12'),
    action: 'approve',
    actorType: 'admin',
    agentName: null,
    bundleId: `bundle-${recordSeq}`,
    itemId: `item-${recordSeq}`,
    kind: 'home_feed_card',
    patternNo: 'P03',
    isSample: false,
    ...over,
  }
}

/** 읽기 함수가 하는 일: 시험을 끄면 시험 묶음의 기록을 빼고 최신 10건만 돌려준다. */
function visibleRecords(all: OpsRecentDecisionRecord[], includeSample: boolean): OpsRecentDecisionRecord[] {
  return all.filter((entry) => includeSample || !entry.isSample).slice(0, 10)
}

/** 운영 홈 한 번의 계산: 호출부(②-c)가 `loadOpsSignals`·`listRecentOpsDecisions`로 하는 일을 순수 함수로 재현한다. */
function buildHome(includeSample: boolean) {
  const all = [realBundle(), sampleBundle()]
  const computed = computeOpsSignals(
    { cards: healthyCards(HEALTHY_FROM, HEALTHY_TO), missions: [], bundles: all, actions: quietActions(), collectionItemCounts: new Map() },
    { now: NOW, includeSample }
  )
  const records = visibleRecords(
    [
      record({ id: 'sample-newest', isSample: true, createdAt: kst('2026-10-01', '11:00'), action: 'reject' }),
      ...Array.from({ length: 11 }, (_, i) => record({ createdAt: kst('2026-10-01', `10:${String(59 - i).padStart(2, '0')}`) })),
    ],
    includeSample
  )
  return { signals: computed.signals, records }
}

// ── 신호 패널 ────────────────────────────────────────────────────────────────────────────────────

function raisedKeys(signals: OpsSignalOutcome[]): string[] {
  return zoneSignals(signals).raised.map((signal) => signal.key)
}

describe('OpsSignalPanel — 시험 묶음 켬·끔', () => {
  it('끔: 시험 묶음에서만 뜨는 신호(실행 실패)와 시험 칩이 빠진다', () => {
    const { signals } = buildHome(false)
    expect(raisedKeys(signals)).toEqual(['approval_deadline'])
    const out = flat(<OpsSignalPanel signals={signals} />)
    expect(out).toContain('중단 0 · 주의 1 · 참고 0')
    // 실행 실패는 뜨지 않고(중단 칩이 없다) 「이상 없는 신호」 이름 목록에만 있다
    expect(out).not.toContain('tabler-icon-alert-octagon')
    expect(out.match(/실행 실패/g)).toHaveLength(1)
    expect(out).not.toContain('시험')
  })

  it('켬: 시험이 더해지고 시험에서 온 줄마다 「시험」 칩이 붙는다', () => {
    const { signals } = buildHome(true)
    expect(raisedKeys(signals)).toEqual(['execution_failed', 'approval_deadline'])
    const out = flat(<OpsSignalPanel signals={signals} includeSample />)
    expect(out).toContain('중단 1 · 주의 1 · 참고 0')
    expect(out).toContain('실행 실패')
    // 시험 묶음에서 온 결과 두 줄(실행 실패 1 + 승인 마감 임박 1)에 각각 칩
    const sampleChips = out.match(/>시험</g) ?? []
    expect(sampleChips).toHaveLength(2)
    const approvalResults = signals.find((signal) => signal.key === 'approval_deadline')?.results ?? []
    expect(approvalResults).toHaveLength(2)
    expect(approvalResults.filter((result) => result.isSample)).toHaveLength(1)
  })

  it('중단 → 주의 → 참고 순서로 그린다', () => {
    const base = OPS_SIGNAL_CATALOG.map((definition): OpsSignalOutcome => ({
      key: definition.key,
      name: definition.name,
      level: definition.level,
      state: 'clear',
      uncheckedReason: null,
      results: [],
    }))
    const raise = (key: (typeof OPS_SIGNAL_KEYS)[number]) => {
      const index = base.findIndex((signal) => signal.key === key)
      base[index] = { ...base[index], state: 'raised', results: [makeSignalResult(`${base[index].name} 결과`)] }
    }
    // 카탈로그 반대 순서로 뜨게 해도 화면은 수준 순서다
    raise('action_spike')
    raise('balance_warning')
    raise('missed_schedule')
    const out = flat(<OpsSignalPanel signals={base} />)
    const stop = out.indexOf('예약 누락')
    const warn = out.indexOf('밸런스 경고')
    const info = out.indexOf('행동 횟수 급증')
    expect(stop).toBeGreaterThan(-1)
    expect(stop).toBeLessThan(warn)
    expect(warn).toBeLessThan(info)
  })

  it('중단·주의는 펼쳐 두고 참고는 접어 둔다(이름·건수는 접어도 보인다)', () => {
    const make = (key: (typeof OPS_SIGNAL_KEYS)[number]): OpsSignalOutcome => {
      const definition = OPS_SIGNAL_CATALOG.find((entry) => entry.key === key)!
      return { key, name: definition.name, level: definition.level, state: 'raised', uncheckedReason: null, results: [makeSignalResult('문장')] }
    }
    const out = html(<OpsSignalPanel signals={[make('missed_schedule'), make('empty_content'), make('overlap')]} />)
    const details = out.match(/<details\b[^>]*>/g) ?? []
    expect(details).toHaveLength(3)
    expect(details[0]).toContain('open')
    expect(details[1]).toContain('open')
    expect(details[2]).not.toContain('open')
    expect(flat(<OpsSignalPanel signals={[make('overlap')]} />)).toContain('겹침')
    expect(flat(<OpsSignalPanel signals={[make('overlap')]} />)).toContain('· 1건')
  })

  it('한 신호는 결과 3건까지 보이고 나머지는 「N건 더 보기」다', () => {
    const results = Array.from({ length: 5 }, (_, i) => makeSignalResult(`결과 ${i + 1}번`))
    const signal: OpsSignalOutcome = { ...OPS_SIGNAL_CATALOG.map((d) => ({ ...d, state: 'raised' as const, uncheckedReason: null, results }))[4] }
    const out = flat(<OpsSignalPanel signals={[signal]} />)
    expect(out).toContain('· 5건')
    for (const shown of ['결과 1번', '결과 2번', '결과 3번']) expect(out).toContain(shown)
    expect(out).not.toContain('결과 4번')
    expect(out).toContain('2건 더 보기')
  })

  it('3건 이하면 「더 보기」가 없다', () => {
    const results = Array.from({ length: 3 }, (_, i) => makeSignalResult(`결과 ${i + 1}번`))
    const signal: OpsSignalOutcome = { ...OPS_SIGNAL_CATALOG.map((d) => ({ ...d, state: 'raised' as const, uncheckedReason: null, results }))[4] }
    expect(flat(<OpsSignalPanel signals={[signal]} />)).not.toContain('더 보기')
  })

  it('칩은 아이콘 + 글자다(중단·주의·참고가 아이콘으로도 갈린다)', () => {
    const make = (key: (typeof OPS_SIGNAL_KEYS)[number]): OpsSignalOutcome => {
      const definition = OPS_SIGNAL_CATALOG.find((entry) => entry.key === key)!
      return { key, name: definition.name, level: definition.level, state: 'raised', uncheckedReason: null, results: [makeSignalResult('문장')] }
    }
    const out = flat(<OpsSignalPanel signals={[make('execution_failed'), make('format_error'), make('excluded_items')]} />)
    for (const icon of ['tabler-icon-alert-octagon', 'tabler-icon-alert-triangle', 'tabler-icon-info-circle']) expect(out).toContain(icon)
    for (const label of ['중단', '주의', '참고']) expect(out).toContain(label)
  })

  it('신호 문장은 HTML로 해석하지 않는다', () => {
    const definition = OPS_SIGNAL_CATALOG[0]
    const signal: OpsSignalOutcome = {
      key: definition.key,
      name: definition.name,
      level: definition.level,
      state: 'raised',
      uncheckedReason: null,
      results: [makeSignalResult('<img src=x onerror=alert(1)>')],
    }
    const out = html(<OpsSignalPanel signals={[signal]} />)
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(out).not.toContain('<img')
  })
})

describe('OpsSignalPanel — 구역과 확인 안 함', () => {
  it('끔 상태의 13종이 한 구역에만 나온다(뜸·이상 없음·확인 안 함 이름이 겹치지 않는다)', () => {
    const { signals } = buildHome(false)
    const zones = zoneSignals(signals)
    const all = [...zones.raised, ...zones.clear, ...zones.unchecked].map((signal) => signal.key)
    expect(new Set(all).size).toBe(13)
    expect(all).toHaveLength(13)
    const out = flat(<OpsSignalPanel signals={signals} />)
    expect(out).toContain(`이상 없는 신호 ${zones.clear.length}종`)
    expect(out).toContain(`확인하지 않은 신호 ${zones.unchecked.length}종`)
    // 이상 없는 신호 목록은 이름만이라 한 번씩만 나오고, 뜬 신호 이름은 이상 없음 목록에 없다
    const clearList = out.slice(out.indexOf(`이상 없는 신호 ${zones.clear.length}종`))
    for (const raised of zones.raised) expect(clearList.split('<ul')[1]).not.toContain(`>${raised.name}<`)
  })

  it('뜬 신호가 0이고 확인 안 함이 있으면 「이상 없어요」라고 쓰지 않고 종 수를 알린다', () => {
    const { signals } = buildHome(false)
    const quiet = signals.map((signal) => (signal.state === 'raised' ? { ...signal, state: 'clear' as const, results: [] } : signal))
    const unchecked = quiet.filter((signal) => signal.state === 'unchecked').length
    expect(unchecked).toBeGreaterThan(0)
    const out = flat(<OpsSignalPanel signals={quiet} />)
    expect(out).toContain(`뜬 신호가 없어요. 아직 확인하지 않은 신호가 ${unchecked}종 있어요`)
    expect(out).not.toContain('이상 없어요')
    expect(out).toContain('중단 0 · 주의 0 · 참고 0')
  })

  it('아직 확인하지 않아요: 밸런스 경고·루틴 실패 2종이 점선 칩으로 보인다', () => {
    const { signals } = buildHome(false)
    const out = flat(<OpsSignalPanel signals={signals} />)
    const unchecked = zoneSignals(signals).unchecked
    expect(unchecked.map((signal) => signal.key).sort()).toEqual(['balance_warning', 'routine_failed'])
    for (const name of ['밸런스 경고', '루틴 실패']) expect(out).toContain(name)
    expect(out.match(/아직 확인하지 않아요/g)).toHaveLength(2)
    expect(out.match(/border-dashed/g)?.length).toBeGreaterThanOrEqual(2)
    expect(out).toContain('tabler-icon-question-mark')
    // 읽지 못한 신호가 없으면 다시 시도 버튼이 없다
    expect(out).not.toContain('확인하지 못했어요')
    expect(out).not.toContain('다시 시도')
  })

  it('load_failed는 「확인하지 못했어요」 + [다시 시도]이고 누르면 화면을 새로 읽는다', () => {
    const computed = computeOpsSignals({ cards: null, missions: null, bundles: null, actions: null, blockedCollections: null }, { now: NOW })
    expect(zoneSignals(computed.signals).unchecked).toHaveLength(13)
    const out = flat(<OpsSignalPanel signals={computed.signals} />)
    expect(out).toContain('확인하지 못했어요')
    expect(out).toContain('다시 시도')
    expect(out).toContain('뜬 신호가 없어요. 아직 확인하지 않은 신호가 13종 있어요')
    expect(out).not.toContain('이상 없어요')
    expect(out).not.toContain('이상 없는 신호')
    const retry = hoisted.buttons.find((props) => props.children === '다시 시도')
    expect(retry).toBeTruthy()
    ;(retry!.onClick as () => void)()
    expect(hoisted.refresh).toHaveBeenCalledTimes(1)
  })

  it('일부만 읽지 못했으면 그 신호만 「확인하지 못했어요」다', () => {
    const quiet = computeOpsSignals(
      { cards: healthyCards(HEALTHY_FROM, HEALTHY_TO), missions: [], bundles: [], actions: null },
      { now: NOW }
    )
    const out = flat(<OpsSignalPanel signals={quiet.signals} />)
    expect(out.match(/확인하지 못했어요/g)).toHaveLength(1)
    expect(out).toContain('행동 횟수 급증')
    expect(out).toContain('다시 시도')
  })
})

// ── 최근 이력 ────────────────────────────────────────────────────────────────────────────────────

describe('OpsRecentDecisions', () => {
  it('최신 10건을 줄로 그리고 줄마다 받은 기획함의 그 항목으로 가는 링크가 있다', () => {
    const records = buildHome(false).records
    expect(records).toHaveLength(10)
    const out = flat(<OpsRecentDecisions records={records} />)
    expect(out.match(/<li\b/g)).toHaveLength(10)
    for (const entry of records) expect(out).toContain(`href="/admin/ops-inbox/${entry.bundleId}?item=${entry.itemId}"`)
    expect(out).toContain('받은 기획함')
    expect(out).toContain('href="/admin/ops-inbox"')
  })

  it('문장은 받은 기획함 상세와 같은 함수(decisionLineText)에서 나오고, 종류 이름·패턴·시각(KST)이 붙는다', () => {
    const entry = record({ action: 'execute', actorType: 'agent', agentName: '윤진', kind: 'mission', patternNo: 'P07', createdAt: kst('2026-10-01', '09:12') })
    const out = flat(<OpsRecentDecisions records={[entry]} />)
    expect(out).toContain(decisionLineText({ action: 'execute', actorType: 'agent', agentName: '윤진' }))
    expect(out).toContain('에이전트(윤진)가 예약 등록했어요')
    expect(out).toContain('미션 · P07 · 10/1(목) 09:12')
  })

  it('에이전트 이름이 빈 기록은 「에이전트가 …」다', () => {
    const out = flat(<OpsRecentDecisions records={[record({ actorType: 'agent', agentName: null, action: 'submit' })]} />)
    expect(out).toContain('에이전트가 제출했어요')
    expect(out).not.toContain('에이전트()')
  })

  it('시스템·관리자 기록도 같은 문장 규칙이다', () => {
    const out = flat(
      <OpsRecentDecisions records={[record({ actorType: 'system', action: 'fail', itemId: 'a' }), record({ actorType: 'admin', action: 'reject', itemId: 'b' })]} />
    )
    expect(out).toContain('시스템이 실패로 닫았어요')
    expect(out).toContain('관리자가 반려했어요')
  })

  it('항목이 없는 묶음 단위 결정은 기획 상세로 가고 종류·패턴 칸은 비운다', () => {
    const entry = record({ itemId: null, kind: null, patternNo: null, bundleId: 'bundle-x' })
    const out = flat(<OpsRecentDecisions records={[entry]} />)
    expect(out).toContain('href="/admin/ops-inbox/bundle-x"')
    expect(out).not.toContain('홈피드 카드')
    expect(out).not.toContain('종류 확인 필요')
  })

  it('에이전트 이름·문장은 HTML로 해석하지 않는다', () => {
    const out = html(<OpsRecentDecisions records={[record({ actorType: 'agent', agentName: '<b onmouseover=x>윤진</b>', action: 'approve' })]} />)
    expect(out).toContain('&lt;b onmouseover=x&gt;')
    expect(out).not.toContain('<b ')
  })

  it('0건이면 「아직 기록이 없어요」다', () => {
    const out = flat(<OpsRecentDecisions records={[]} />)
    expect(out).toContain('아직 기록이 없어요')
    expect(out).toContain('최근 이력')
    expect(out).not.toContain('<li')
  })

  it('끔: 시험 묶음의 기록이 없고 시험 칩도 없다. 켬: 시험 기록이 더해지고 줄마다 시험 칩이 붙는다', () => {
    const off = buildHome(false).records
    expect(off.some((entry) => entry.isSample)).toBe(false)
    expect(flat(<OpsRecentDecisions records={off} />)).not.toContain('시험')

    const on = buildHome(true).records
    expect(on).toHaveLength(10)
    expect(on[0].id).toBe('sample-newest')
    const out = flat(<OpsRecentDecisions records={on} includeSample />)
    expect(out.match(/>시험</g)).toHaveLength(on.filter((entry) => entry.isSample).length)
    expect(out).toContain('관리자가 반려했어요')
    // 시험을 켠 채로 이동하면 링크에도 sample=1이 이어진다
    expect(out).toContain(`href="/admin/ops-inbox/${on[0].bundleId}?item=${on[0].itemId}&amp;sample=1"`)
    expect(out).toContain('href="/admin/ops-inbox?sample=1"')
  })
})

// ── 구역 안내 ────────────────────────────────────────────────────────────────────────────────────

describe('OpsSectionNotice', () => {
  it('조회 실패: 제목 + 고정 설명 + [새로 고치기]이고 누르면 화면을 새로 읽는다', () => {
    const out = flat(<OpsSectionNotice icon="signal" title="신호를 불러오지 못했어요" />)
    expect(out).toContain('신호를 불러오지 못했어요')
    expect(out).toContain('서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요')
    expect(out).toContain('새로 고치기')
    expect(out).toContain('aria-hidden="true"')
    const retry = hoisted.buttons.find((props) => props.children === '새로 고치기')
    expect(retry).toBeTruthy()
    ;(retry!.onClick as () => void)()
    expect(hoisted.refresh).toHaveBeenCalledTimes(1)
  })

  it('아이콘은 구역마다 다른 키 문자열로 고른다', () => {
    const icons = (['week', 'signal', 'history'] as const).map(
      (icon) => /tabler-icon-[a-z-]+/.exec(flat(<OpsSectionNotice icon={icon} title="제목" />))?.[0]
    )
    expect(new Set(icons).size).toBe(3)
  })

  it('retry=false면 버튼을 그리지 않고, 설명을 줄 수 있다', () => {
    const out = flat(<OpsSectionNotice icon="history" title="아직 기록이 없어요" description="설명 문장" retry={false} />)
    expect(out).toContain('설명 문장')
    expect(out).not.toContain('서버에 문제가 있었을 수 있어요')
    expect(out).not.toContain('새로 고치기')
    expect(hoisted.buttons).toHaveLength(0)
  })
})
