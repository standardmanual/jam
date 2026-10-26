/**
 * 「N건 승인하고 예약」 버튼과 요약창의 초기 렌더 (티켓 20261002_1648, 20261026_2031, 운영툴 PRD §7.3·§8)
 *
 * 저장소에 jsdom·testing-library가 없어(`render.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다:
 * - 버튼 문구: 승인 대상 수 N이 있으면 「N건 승인하고 예약」, 0이면 「승인하고 예약」이고 꺼진다(승인됨 항목이 있으면 끄지 않는다)
 * - 요약창: 구역 순서와 문구, 연결 묶음은 한 덩어리, 경고, 시험 묶음 문장, 비어 있는 구역은 그리지 않는다
 * - 주 버튼: 「N건 승인하고 예약」 · 「실패로 닫기」 · 꺼짐(「지금 예약할 수 있는 항목이 없어요」), 진행형 문구
 * - 불러오는 중·실패는 창 안 문장이고 주 버튼은 꺼진다
 * - JAM! 배지 구역(티켓 20261005_1607 ⑨-b): 「공개되면 바로 획득하는 유저」가 예약할 항목 구역 바로 뒤에 놓이고, 세는 중 · 줄 목록과 안내 · 실패가 구역 안 문장이다.
 *   구역이 어떤 상태여도 주 버튼은 미리 세기와 무관하다. 구역이 없으면(예약할 JAM! 배지가 없다) 그리지 않는다
 * - 소스 계약: 「공개는 아직 연결 전이에요」가 화면 소스에서 사라졌고, 화면은 레지스트리·사전 점검 모듈을 값으로 가져오지 않는다
 * 열기 → 사전 점검 요청 → 실행 → 토스트 흐름은 브라우저 동작이라 여기서 다루지 않는다(순수 함수는 `executeView.test.ts`, 호출은 `executeClient.test.ts`).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'
import { badgePreviewLines, buildExecuteSummary, narrowToChecked, pickExecuteIds, type BadgePreviewSection, type BadgePreviewView, type PrecheckView, type SummarySource } from '@/lib/admin/opsInbox/executeView'
import { OpsExecuteBundle, OpsExecutePanel } from '../OpsExecuteBundle'

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')
/** 확인창 껍데기 안쪽 부품은 Radix 창 문맥이 필요해 열린 창으로 감싸서 그린다(포털은 쓰지 않는다). */
const inDialog = (node: ReactElement) => flat(<AlertDialog open>{node}</AlertDialog>)
/** 글자로 그 버튼을 찾아 여는 태그부터 닫는 태그까지 돌려준다. */
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
/** 여는 태그에 `disabled` 속성이 있는지(클래스 이름의 `disabled:`는 세지 않는다). */
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)

function source(id: string, overrides: Partial<SummarySource> = {}): SummarySource {
  return {
    id,
    position: Number(id.replace(/\D/g, '')) || 0,
    kind: 'home_feed_card',
    startsAt: '2026-10-05T00:00:00Z',
    original: { user_experience: `${id} 경험` },
    edited: null,
    ...overrides,
  }
}

const ITEMS: SummarySource[] = [
  source('a1', { startsAt: '2026-10-07T00:00:00Z' }),
  source('a2', { startsAt: '2026-10-05T00:00:00Z' }),
  source('a3', { startsAt: '2026-10-06T00:00:00Z' }),
  source('a4'),
  source('a5'),
  source('a6'),
]

function precheck(overrides: Partial<PrecheckView> = {}): PrecheckView {
  return { ready: [], waiting: [], blocked: [], failClose: [], groups: [], warnings: [], approving: [], ...overrides }
}

const noop = () => {}
const panel = (summary: ReturnType<typeof buildExecuteSummary> | null, extra: Partial<Parameters<typeof OpsExecutePanel>[0]> = {}) =>
  inDialog(<OpsExecutePanel summary={summary} onConfirm={noop} onCancel={noop} {...extra} />)

describe('OpsExecuteBundle — 버튼', () => {
  const props = { bundleId: 'bundle-1', items: [], checkedReviewingIds: new Set<string>(), approvedCount: 0, isSample: false, onExecuted: noop, onConflict: noop }

  it('승인 대상이 N건이면 「N건 승인하고 예약」이고 켜져 있다', () => {
    const out = flat(<OpsExecuteBundle {...props} approvableCount={3} />)
    expect(out).toContain('>3건 승인하고 예약<')
    expect(isDisabled(buttonOf(out, '3건 승인하고 예약'))).toBe(false)
    expect(out).not.toContain('승인할 항목을 골라 주세요')
  })

  it('승인 대상이 0건이고 승인됨 항목도 없으면 「승인하고 예약」이 꺼지고 안내가 붙는다', () => {
    const out = flat(<OpsExecuteBundle {...props} approvableCount={0} />)
    expect(isDisabled(buttonOf(out, '승인하고 예약'))).toBe(true)
    expect(out).toContain('승인할 항목을 골라 주세요')
  })

  it('승인 대상이 0건이어도 승인됨 항목이 있으면 켜져 있다(예약할 수 없는 이유를 요약창에서 보고 실패로 닫을 수 있다)', () => {
    const out = flat(<OpsExecuteBundle {...props} approvableCount={0} approvedCount={2} />)
    expect(isDisabled(buttonOf(out, '승인하고 예약'))).toBe(false)
  })

  it('요약창은 처음에 닫혀 있다(열 때 사전 점검 요청을 보낸다)', () => {
    const out = flat(<OpsExecuteBundle {...props} approvableCount={3} />)
    expect(out).not.toContain('승인하고 예약하기 전에 확인해 주세요')
    expect(out).not.toContain('role="alertdialog"')
  })
})

describe('OpsExecutePanel — 구역', () => {
  const full = buildExecuteSummary(
    precheck({
      ready: ['a1', 'a2'],
      groups: [{ executeIds: ['a2'] }, { executeIds: ['a1'] }],
      waiting: ['a3'],
      blocked: [{ id: 'a4', reasons: ['공개 시각이 이미 지났어요', '아직 연결하지 않은 종류예요'] }],
      failClose: [{ id: 'a5', reason: '연결된 미션이 반려됐어요' }],
      warnings: [{ itemIds: ['a1', 'a2'], message: '연결된 항목의 공개 시각이 서로 달라요' }],
    }),
    ITEMS,
    false
  )

  it('제목은 「승인하고 예약하기 전에 확인해 주세요」이고 보조 버튼은 「닫기」다', () => {
    const out = panel(full)
    expect(out).toContain('승인하고 예약하기 전에 확인해 주세요')
    expect(out).toContain('>닫기<')
    expect(out).not.toContain('>취소<')
  })

  it('네 구역이 예약할 항목 → 기다리는 항목 → 예약할 수 없는 항목 → 실패로 닫을 항목 → 경고 순으로 나온다', () => {
    const out = panel(full)
    const order = [
      '예약할 항목 2개',
      '기다리는 항목 1개',
      '예약할 수 없는 항목 1개',
      '실패로 닫을 항목 1개',
      '연결된 항목의 공개 시각이 서로 달라요',
    ].map((text) => out.indexOf(text))
    expect(order.every((at) => at > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('예약할 항목은 공개 시각 순이고 이름은 목록 행과 같은 표시(종류 · 공개 시각 시작 · 유저가 겪는 것)다', () => {
    const out = panel(full)
    expect(out).toContain('홈피드 카드 · 10/5(월) 09:00 시작 · a2 경험')
    expect(out.indexOf('a2 경험')).toBeLessThan(out.indexOf('a1 경험'))
  })

  it('기다리는 항목에는 사전 점검 문장, 예약할 수 없는 항목에는 이유, 실패로 닫을 항목에는 이유와 「실패로 닫혀요」가 붙는다', () => {
    const out = panel(full)
    expect(out).toContain('연결된 항목이 아직 결정 전이에요')
    expect(out).toContain('공개 시각이 이미 지났어요 · 아직 연결하지 않은 종류예요')
    expect(out).toContain('연결된 미션이 반려됐어요. 실패로 닫혀요')
  })

  it('경고는 warning 상자로 그리고 가리키는 항목 이름을 함께 보인다', () => {
    const out = panel(full)
    expect(out).toContain('border-amber-300')
    const warning = out.slice(out.indexOf('연결된 항목의 공개 시각이 서로 달라요'))
    expect(warning).toContain('a1 경험')
    expect(warning).toContain('a2 경험')
  })

  it('연결 묶음은 한 덩어리(중첩 목록)로 묶어 보이고 안은 생성 순서다', () => {
    const summary = buildExecuteSummary(
      precheck({ ready: ['a1', 'a2', 'a3'], groups: [{ executeIds: ['a3', 'a1'] }, { executeIds: ['a2'] }] }),
      ITEMS,
      false
    )
    const out = panel(summary)
    // 묶음은 목록 안의 목록이다
    expect(out).toMatch(/<li><ul[^>]*border-l-2[^>]*><li[^>]*>.*a3 경험.*<\/li><li[^>]*>.*a1 경험.*<\/li><\/ul><\/li>/)
    // 묶음 밖의 단독 항목(a2)은 중첩 목록이 아니다
    expect(out.match(/border-l-2/g)).toHaveLength(1)
    // 덩어리는 가장 이른 공개 시각 자리에 놓인다: a2(10/5) → 묶음(a3 10/6, a1 10/7)
    expect(out.indexOf('a2 경험')).toBeLessThan(out.indexOf('a3 경험'))
    expect(out.indexOf('a3 경험')).toBeLessThan(out.indexOf('a1 경험'))
  })

  it('비어 있는 구역은 그리지 않는다', () => {
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false))
    expect(out).toContain('예약할 항목 1개')
    for (const text of ['기다리는 항목', '예약할 수 없는 항목', '실패로 닫을 항목', 'border-amber-300']) expect(out).not.toContain(text)
  })

  it('시험 묶음이면 「시험 묶음이라 자원은 만들지 않아요」가 붙고, 아니면 없다', () => {
    expect(panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, true))).toContain('시험 묶음이라 자원은 만들지 않아요')
    expect(panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false))).not.toContain('시험 묶음이라')
  })

  it('긴 목록은 창 안에서 스크롤한다', () => {
    expect(panel(full)).toMatch(/class="[^"]*max-h-\[50vh\][^"]*overflow-y-auto/)
  })

  it('제출 문자열은 HTML로 해석되지 않는다', () => {
    // 이름은 24자까지만 보이므로 그 안에 드는 문자열로 확인한다.
    const evil = source('a1', { original: { user_experience: '<img src=x onerror=1>' } })
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1'] }), [evil], false))
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
  })
})

describe('OpsExecutePanel — 주 버튼', () => {
  it('예약할 항목이 있으면 「N건 승인하고 예약」이고 켜져 있다(실패로 닫을 항목이 함께 있어도)', () => {
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1', 'a2'], failClose: [{ id: 'a5', reason: '이유' }] }), ITEMS, false))
    const button = buttonOf(out, '2건 승인하고 예약')
    expect(button).not.toBe('')
    expect(isDisabled(button)).toBe(false)
    expect(out).not.toContain('지금 예약할 수 있는 항목이 없어요')
  })

  it('예약할 항목은 0개여도 실패로 닫을 항목이 있으면 주 버튼은 「실패로 닫기」이고 켜져 있다', () => {
    const out = panel(buildExecuteSummary(precheck({ failClose: [{ id: 'a5', reason: '연결된 미션이 반려됐어요' }] }), ITEMS, false))
    const button = buttonOf(out, '실패로 닫기')
    expect(button).not.toBe('')
    expect(isDisabled(button)).toBe(false)
    expect(out).not.toContain('건 승인하고 예약')
    expect(out).not.toContain('지금 예약할 수 있는 항목이 없어요')
  })

  it('예약할 항목도 실패로 닫을 항목도 없으면 주 버튼이 꺼지고 「지금 예약할 수 있는 항목이 없어요」가 보인다(기다리는·못 하는 항목 이유는 그대로 보인다)', () => {
    const out = panel(buildExecuteSummary(precheck({ waiting: ['a3'], blocked: [{ id: 'a4', reasons: ['공개 시각이 없어요'] }] }), ITEMS, false))
    expect(isDisabled(buttonOf(out, '승인하고 예약'))).toBe(true)
    expect(out).toContain('지금 예약할 수 있는 항목이 없어요')
    expect(out).toContain('기다리는 항목 1개')
    expect(out).toContain('공개 시각이 없어요')
  })

  it('처리 중에는 진행형 문구이고 두 버튼이 모두 꺼진다', () => {
    const schedule = buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false)
    const running = panel(schedule, { pending: true })
    expect(isDisabled(buttonOf(running, '승인하고 예약하는 중'))).toBe(true)
    expect(isDisabled(buttonOf(running, '닫기'))).toBe(true)
    const closing = panel(buildExecuteSummary(precheck({ failClose: [{ id: 'a5', reason: '이유' }] }), ITEMS, false), { pending: true })
    expect(isDisabled(buttonOf(closing, '실패로 닫는 중'))).toBe(true)
  })

  it('실행 실패 문장은 요약을 그대로 둔 채 창 안에 붉은 글로 보인다', () => {
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false), {
      error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
    })
    expect(out).toContain('role="alert"')
    expect(out).toContain('예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).toContain('예약할 항목 1개')
    expect(isDisabled(buttonOf(out, '1건 승인하고 예약'))).toBe(false)
  })
})

describe('OpsExecutePanel — 불러오는 중·점검 실패', () => {
  it('불러오는 중에는 안내 글만 보이고 주 버튼은 꺼져 있다', () => {
    const out = panel(null, { loading: true })
    expect(out).toContain('사전 점검하는 중이에요')
    expect(out).toContain('승인하고 예약하기 전에 확인해 주세요')
    expect(isDisabled(buttonOf(out, '승인하고 예약'))).toBe(true)
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('사전 점검이 실패하면 서버 문장이 창 안에 보이고 주 버튼은 꺼져 있다', () => {
    const out = panel(null, { error: '사전 점검을 하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(out).toContain('사전 점검을 하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).not.toContain('사전 점검하는 중이에요')
    expect(isDisabled(buttonOf(out, '승인하고 예약'))).toBe(true)
  })
})

describe('OpsExecutePanel — 승인할 항목 (티켓 20261026_2031)', () => {
  const reviewing = buildExecuteSummary(
    precheck({
      ready: ['a1', 'a2'],
      failClose: [{ id: 'a5', reason: '연결된 미션이 반려됐어요' }, { id: 'a6', reason: '연결된 카드가 실패했어요' }],
      approving: ['a1', 'a5'],
    }),
    ITEMS,
    false
  )

  it('검토중 항목은 「승인할 항목」 구역에 따로 보이고 예약할 항목 구역 앞에 놓인다', () => {
    const out = panel(reviewing)
    expect(out).toContain('승인할 항목 2개')
    expect(out.indexOf('승인할 항목 2개')).toBeLessThan(out.indexOf('예약할 항목 2개'))
    expect(out).toContain('승인은 되돌릴 수 없어요')
  })

  it('실패로 닫을 검토중 항목은 승인한 뒤 닫힌다는 문장이 붙고, 이미 승인된 항목은 「실패로 닫혀요」만 붙는다', () => {
    const out = panel(reviewing)
    expect(out).toContain('연결된 미션이 반려됐어요. 검토중이라 승인한 뒤 실패로 닫혀요')
    expect(out).toContain('연결된 카드가 실패했어요. 실패로 닫혀요')
  })

  it('승인할 항목이 없으면 구역과 되돌릴 수 없다는 문장을 그리지 않는다', () => {
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false))
    expect(out).not.toContain('승인할 항목')
    expect(out).not.toContain('승인은 되돌릴 수 없어요')
  })
})

describe('narrowToChecked·pickExecuteIds — 체크한 항목만 대상', () => {
  // a1·a2 검토중(a2는 체크하지 않음), a3 이미 승인됨, a4·a5는 연결 묶음(a5가 검토중이고 체크하지 않음)
  const base = buildExecuteSummary(
    precheck({
      ready: ['a1', 'a2', 'a3', 'a4', 'a5'],
      groups: [{ executeIds: ['a4', 'a5'] }],
      approving: ['a1', 'a2', 'a5'],
    }),
    ITEMS,
    false
  )
  const checked = new Set(['a1'])

  it('이미 승인된 항목과 체크한 검토중 항목만 itemIds에 담고, 체크하지 않은 항목이 든 묶음은 묶음째 뺀다', () => {
    expect(pickExecuteIds(base, checked).sort()).toEqual(['a1', 'a3'])
  })

  it('요약에서도 체크하지 않은 항목이 빠지고, 빠진 묶음은 기다리는 항목으로 간다. 건수와 문구가 맞는다', () => {
    const narrowed = narrowToChecked(base, checked)
    expect(narrowed.requestIds.sort()).toEqual(['a1', 'a3'])
    expect(narrowed.readyCount).toBe(2)
    expect(narrowed.confirmLabel).toBe('2건 승인하고 예약')
    expect(narrowed.approving.map((item) => item.id)).toEqual(['a1'])
    expect(narrowed.waiting.map((item) => item.id).sort()).toEqual(['a4', 'a5'])
    const out = panel(narrowed)
    expect(out).toContain('예약할 항목 2개')
    expect(out).toContain('승인할 항목 1개')
    expect(out).not.toContain('a2 경험')
  })

  it('예약할 항목이 하나도 남지 않으면 실패로 닫을 항목이 요청이 되고, 그것도 없으면 꺼진다', () => {
    const closing = buildExecuteSummary(precheck({ ready: ['a2'], failClose: [{ id: 'a5', reason: '이유' }], approving: ['a2', 'a5'] }), ITEMS, false)
    expect(pickExecuteIds(closing, new Set())).toEqual(['a5'])
    expect(narrowToChecked(closing, new Set())).toMatchObject({ action: 'close', confirmLabel: '실패로 닫기', requestIds: ['a5'] })
    const nothing = buildExecuteSummary(precheck({ ready: ['a2'], approving: ['a2'] }), ITEMS, false)
    expect(pickExecuteIds(nothing, new Set())).toEqual([])
    expect(narrowToChecked(nothing, new Set())).toMatchObject({ action: 'none', requestIds: [] })
  })

  it('사전 점검 실패 항목은 확인 전에 이유와 함께 보이고 itemIds에는 들어가지 않는다', () => {
    const summary = buildExecuteSummary(
      precheck({ ready: ['a1'], blocked: [{ id: 'a4', reasons: ['공개 시각이 이미 지났어요'] }], approving: ['a1'] }),
      ITEMS,
      false
    )
    const narrowed = narrowToChecked(summary, new Set(['a1']))
    const out = panel(narrowed)
    expect(out).toContain('예약할 수 없는 항목 1개')
    expect(out).toContain('공개 시각이 이미 지났어요')
    expect(narrowed.requestIds).toEqual(['a1'])
  })
})

describe('OpsExecutePanel — JAM! 배지 구역 (티켓 20261005_1607)', () => {
  const items = [
    ...ITEMS,
    source('b1', { kind: 'jam_badge', startsAt: '2026-10-10T00:00:00Z', original: { user_experience: '첫 믹스 배지' } }),
    source('b2', { kind: 'jam_badge', startsAt: '2026-10-11T00:00:00Z', original: { user_experience: '믹스 마스터' } }),
  ]
  const ready = buildExecuteSummary(precheck({ ready: ['a1', 'b1', 'b2'], waiting: ['a3'] }), items, false)
  const done = (view: Partial<BadgePreviewView> = {}): BadgePreviewSection => ({
    status: 'done',
    ...badgePreviewLines(
      {
        totalUsers: 40,
        evaluatedUsers: 40,
        sampled: false,
        failedUsers: 0,
        lines: [
          { itemId: 'b1', status: 'counted', userCount: 12, points: 120 },
          { itemId: 'b2', status: 'collectionReward' },
        ],
        ...view,
      },
      items
    ),
  })

  it('세는 중에는 구역 제목과 「미리 세는 중이에요」가 보이고, 주 버튼은 그대로 켜져 있다', () => {
    const out = panel(ready, { badgePreview: { status: 'loading' } })
    expect(out).toContain('공개되면 바로 획득하는 유저')
    expect(out).toContain('미리 세는 중이에요')
    const button = buttonOf(out, '3건 승인하고 예약')
    expect(button).not.toBe('')
    expect(isDisabled(button)).toBe(false)
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('다 세면 배지마다 이름과 한 줄이 나오고, 세는 중 문장은 사라진다', () => {
    const out = panel(ready, { badgePreview: done() })
    expect(out).toContain('JAM! 배지 · 10/10(토) 09:00 시작 · 첫 믹스 배지')
    expect(out).toContain('공개되면 약 12명에게 120포인트')
    expect(out).toContain('JAM! 배지 · 10/11(일) 09:00 시작 · 믹스 마스터')
    expect(out).toContain('컬렉션을 완성하면 획득해요')
    expect(out).not.toContain('미리 세는 중이에요')
    expect(isDisabled(buttonOf(out, '3건 승인하고 예약'))).toBe(false)
  })

  it('표본으로 추정했거나 일부 유저를 세지 못했으면 안내가 구역 안에 붙는다', () => {
    const out = panel(ready, { badgePreview: done({ totalUsers: 1200, evaluatedUsers: 500, sampled: true, failedUsers: 3 }) })
    expect(out).toContain('유저 1,200명 중 500명을 세어 추정했어요')
    expect(out).toContain('3명은 세지 못해 빼고 셌어요')
    expect(out.indexOf('공개되면 약 12명에게')).toBeLessThan(out.indexOf('유저 1,200명 중'))
    expect(panel(ready, { badgePreview: done() })).not.toContain('추정했어요')
  })

  it('실패하면 구역 안에 「미리 세지 못했어요」만 보이고 요약창·주 버튼은 그대로다', () => {
    const out = panel(ready, { badgePreview: { status: 'failed' } })
    expect(out).toContain('공개되면 바로 획득하는 유저')
    expect(out).toContain('미리 세지 못했어요')
    expect(out).toContain('예약할 항목 3개')
    expect(out).toContain('기다리는 항목 1개')
    expect(out).not.toContain('role="alert"')
    expect(isDisabled(buttonOf(out, '3건 승인하고 예약'))).toBe(false)
  })

  it('구역은 예약할 항목 구역 바로 뒤, 기다리는 항목 구역 앞에 놓인다', () => {
    const out = panel(ready, { badgePreview: done() })
    const order = ['예약할 항목 3개', '공개되면 바로 획득하는 유저', '기다리는 항목 1개'].map((text) => out.indexOf(text))
    expect(order.every((at) => at > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('구역이 없으면(예약할 JAM! 배지가 없다) 그리지 않는다. 줄이 하나도 없는 완료도 그리지 않는다', () => {
    for (const badgePreview of [undefined, null, { status: 'done', lines: [], notes: [] } as BadgePreviewSection]) {
      const out = panel(ready, { badgePreview })
      expect(out).not.toContain('공개되면 바로 획득하는 유저')
      expect(out).toContain('예약할 항목 3개')
    }
  })

  it('예약할 항목이 없어 주 버튼이 꺼진 요약에서도 구역 상태와 무관하게 주 버튼 판정은 그대로다', () => {
    const none = buildExecuteSummary(precheck({ waiting: ['a3'] }), items, false)
    const out = panel(none, { badgePreview: { status: 'loading' } })
    expect(isDisabled(buttonOf(out, '승인하고 예약'))).toBe(true)
  })

  it('처리 중에는 구역이 어떤 상태여도 두 버튼이 꺼진다(미리 세기가 아니라 실행 때문이다)', () => {
    const out = panel(ready, { badgePreview: done(), pending: true })
    expect(isDisabled(buttonOf(out, '승인하고 예약하는 중'))).toBe(true)
  })

  it('항목 이름은 HTML로 해석되지 않는다', () => {
    const evil = source('b9', { kind: 'jam_badge', original: { user_experience: '<img src=x onerror=1>' } })
    const out = panel(buildExecuteSummary(precheck({ ready: ['b9'] }), [evil], false), {
      badgePreview: {
        status: 'done',
        ...badgePreviewLines({ totalUsers: 1, evaluatedUsers: 1, sampled: false, failedUsers: 0, lines: [{ itemId: 'b9', status: 'counted', userCount: 1, points: 0 }] }, [evil]),
      },
    })
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
    expect(out).toContain('공개되면 약 1명이 획득해요')
  })
})

// ── 소스 계약 ────────────────────────────────────────────────────────────────────────────────────

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

/** 주석을 벗긴다. 설명 글이 규칙 검사에 걸리지 않게 한다. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

/** 값으로 가져오는(`import type`이 아닌) 모듈 경로. 여러 줄 import도 한 문장으로 읽는다. */
function valueImportPaths(code: string): string[] {
  const statements = code.match(/^import\s[\s\S]*?\sfrom\s+'[^']+'/gm) ?? []
  return statements.filter((statement) => !/^import\s+type\b/.test(statement)).map((statement) => /'([^']+)'$/.exec(statement)?.[1] ?? '')
}

describe('소스 계약 — 예약 등록 화면 (티켓 20261002_1648)', () => {
  const screenFiles = [join(SRC, 'components/admin/ops'), join(SRC, 'app/admin/ops-inbox')]
    .flatMap((root) => walk(root))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(`${sep}__tests__${sep}`))

  it('화면 파일을 실제로 찾았다(빈 목록으로 통과하지 않는다)', () => {
    expect(screenFiles.length).toBeGreaterThan(12)
    expect(existsSync(join(SRC, 'components/admin/ops/OpsExecuteBundle.tsx'))).toBe(true)
  })

  it('「공개는 아직 연결 전이에요」가 화면 소스(주석 밖)에 없다', () => {
    const offenders = screenFiles.filter((file) => /공개는 아직 연결 전이에요/.test(stripComments(readFileSync(file, 'utf8')))).map((file) => file.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('화면 소스(주석 밖)에 「예약 등록하기」·「승인하기」·「N개 승인하기」 문구가 없다(티켓 20261026_2031)', () => {
    const offenders = screenFiles
      .filter((file) => /예약 등록하기|승인하기|개 승인/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('일괄 승인 컴포넌트는 화면에서 쓰이지 않고 파일도 없다', () => {
    expect(existsSync(join(SRC, 'components/admin/ops/OpsBulkApprove.tsx'))).toBe(false)
    const offenders = screenFiles.filter((file) => /OpsBulkApprove/.test(stripComments(readFileSync(file, 'utf8')))).map((file) => file.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('요약창은 `approve: true`로 사전 점검하고, 확인하면 요약이 고른 itemIds를 `approve: true`로 보낸다', () => {
    const code = stripComments(readFileSync(join(SRC, 'components/admin/ops/OpsExecuteBundle.tsx'), 'utf8'))
    expect(code).toContain('postExecute(bundleId, { dryRun: true, approve: true })')
    expect(code).toContain('postExecute(bundleId, { itemIds: summary.requestIds, approve: true })')
    const client = stripComments(readFileSync(join(SRC, 'components/admin/ops/executeClient.ts'), 'utf8'))
    expect(client).toContain('postExecute(bundleId, { badgePreview: true, approve: true })')
  })

  it('화면은 레지스트리·카드 핸들러·사전 점검·실행 모듈과 서버 조회 모듈을 값으로 가져오지 않는다(사전 점검은 서버 로더와 dryRun API로만)', () => {
    // `import type`은 번들에 들어가지 않으므로 허용한다. 값 import만 잡는다.
    const serverOnly = /^@\/lib\/admin\/opsInbox\/(execute\/|query$)/
    const offenders = screenFiles
      .filter((file) => file.includes(`${sep}components${sep}`) && valueImportPaths(readFileSync(file, 'utf8')).some((path) => serverOnly.test(path)))
      .map((file) => file.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('요약창은 예약할 JAM! 배지가 있을 때만 두 번째 요청을 보내고, 창을 닫았다 다시 열면 앞선 응답을 버린다(티켓 20261005_1607)', () => {
    // 브라우저 흐름은 단위 테스트로 열 수 없어(jsdom 없음) 소스의 연결 지점을 고정한다. 실제 흐름은 PC 세션에서 본다.
    const code = stripComments(readFileSync(join(SRC, 'components/admin/ops/OpsExecuteBundle.tsx'), 'utf8'))
    expect(code).toMatch(/if \(readyJamBadgeIds\(\{ \.\.\.precheck, ready: \[\.\.\.scheduleIds\] \}, items\)\.length > 0\) void loadBadgePreview\(run, scheduleIds\)/)
    expect(code).toMatch(/if \(run === precheckRun\.current\) setBadgePreview\(section\)/)
    expect(code).toMatch(/setBadgePreview\(null\)/)
    // 주 버튼 판정(`confirmDisabled`)은 배지 구역 상태를 읽지 않는다.
    expect(code).toMatch(/confirmDisabled=\{!summary \|\| summary\.action === 'none'\}/)
  })

  it('값 import를 찾는 도우미가 type import와 여러 줄 import를 구분한다(빈 검사로 통과하지 않는다)', () => {
    const code = [
      "import { a } from '@/lib/admin/opsInbox/execute/registry'",
      "import type { B } from '@/lib/admin/opsInbox/query'",
      'import {',
      '  c,',
      "} from '@/lib/admin/opsInbox/query'",
    ].join('\n')
    expect(valueImportPaths(code)).toEqual(['@/lib/admin/opsInbox/execute/registry', '@/lib/admin/opsInbox/query'])
  })
})
