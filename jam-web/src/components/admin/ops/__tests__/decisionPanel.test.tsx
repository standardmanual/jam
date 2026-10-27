/**
 * 기획 상세의 결정 패널 (티켓 20261026_2024 1회차, 어드민 상황판 PRD §6.3)
 *
 * 저장소에 jsdom·testing-library가 없어 두 방식을 쓴다: 처음 그린 모양은 서버 렌더(`renderToStaticMarkup`)로 고정하고,
 * 클릭·체크처럼 브라우저 동작은 훅이 없는 `OpsDecisionPanel`을 함수로 불러 얻은 요소 트리에서 `onClick`·`onCheckedChange`를 꺼내 부른다.
 * (접힌 아코디언 안쪽은 서버 렌더에 나오지 않지만 요소 트리에는 있다.)
 *
 * 지키는 것: 핵심 줄(종류·제목·새 미션·이유 칩 2개·확인 필요)과 핵심이 없을 때의 대체 제목, 항목이 없으면 구역이 없다,
 * 접힌 머리줄의 「승인 대상 N건」이 단계 표시줄 주 버튼 건수와 같다, 0건이면 안내, 종류 체크의 일부 체크(indeterminate)와 한꺼번에 바꾸기,
 * 핵심 줄을 누르면 항목이 선택된다, 새 필드가 없는 옛 묶음도 깨지지 않는다.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import { Checkbox } from '@/components/admin/ui/checkbox'
import type { OpsBundleExecution, OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { splitByChecked, withItemsChecked } from '@/lib/admin/opsInbox/selection'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-inbox/x',
  useSearchParams: () => new URLSearchParams(''),
}))

import { OpsDecisionPanel } from '../OpsDecisionPanel'
import { OpsDecisionWorkspace } from '../OpsDecisionWorkspace'

const flat = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>).replace(/<!-- -->/g, '')

function item(over: Partial<OpsItemRecord> & { id: string }): OpsItemRecord {
  return {
    position: 0,
    itemKey: over.id,
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: '2026-10-05T09:00:00+09:00',
    endsAt: null,
    status: 'reviewing',
    original: { copy: { title: `${over.id} 제목` } },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...over,
  }
}

const rationale = (kind: string, label: string) => ({ kind, label, note: `${label} 메모` })

/** 요소 트리를 깊이 우선으로 훑어 조건에 맞는 요소를 모은다(함수 컴포넌트는 펼치지 않는다). */
function findAll(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = []
  const visit = (current: ReactNode) => {
    if (Array.isArray(current)) return current.forEach(visit)
    if (!isValidElement<Record<string, unknown>>(current)) return
    if (match(current)) found.push(current)
    visit(current.props.children as ReactNode)
  }
  visit(node)
  return found
}

function panel(over: Partial<Parameters<typeof OpsDecisionPanel>[0]> = {}) {
  return OpsDecisionPanel({
    items: [],
    needsCheckIds: new Set(),
    checkedIds: new Set(),
    approvableCount: 0,
    onSetChecked: vi.fn(),
    onSelectItem: vi.fn(),
    ...over,
  })
}

const HIGHLIGHTED = [
  item({
    id: 'a',
    position: 0,
    kind: 'mission',
    original: {
      copy: { title: '비 오는 날 5km' },
      highlight: true,
      rationale: [rationale('weather', '비 예보'), rationale('trend', '러닝 붐'), rationale('season', '가을')],
    },
  }),
  item({ id: 'b', position: 1, kind: 'home_feed_card', original: { copy: { title: '카드 B' }, rationale: [rationale('trend', '러닝 붐')] } }),
]

describe('핵심 구역', () => {
  it('핵심 줄에 종류·제목·새 미션·이유 칩(2개까지, 나머지는 +N)·확인 필요가 나온다', () => {
    const out = flat(<OpsDecisionPanel {...basePanelProps()} items={HIGHLIGHTED} needsCheckIds={new Set(['a'])} />)
    expect(out).toContain('이번 기획의 핵심')
    expect(out).toContain('비 오는 날 5km')
    expect(out).toContain('새 미션')
    expect(out).toContain('비 예보')
    expect(out).toContain('러닝 붐')
    expect(out).not.toContain('>가을<')
    expect(out).toContain('+1')
    expect(out).toContain('확인 필요')
    // 핵심 표시가 없는 b는 줄에 나오지 않는다(묶음 이유 칩 줄에만 집계된다)
    expect(out).not.toContain('카드 B')
  })

  it('묶음 이유 칩 줄은 종류별 건수를 보인다', () => {
    const out = flat(<OpsDecisionPanel {...basePanelProps()} items={HIGHLIGHTED} />)
    expect(out).toContain('기획 이유')
    expect(out).toContain('data-rationale-kind="trend"')
    expect(out).toContain('트렌드</span><span class="tabular-nums">2</span>')
  })

  it('핵심이 하나도 없으면 제목이 「확인이 필요한 항목」이고 확인 필요 항목을 올린다', () => {
    const items = [item({ id: 'x', position: 0 }), item({ id: 'y', position: 1 })]
    const out = flat(<OpsDecisionPanel {...basePanelProps()} items={items} needsCheckIds={new Set(['y'])} />)
    expect(out).toContain('확인이 필요한 항목')
    expect(out).not.toContain('이번 기획의 핵심')
    expect(out).toContain('y 제목')
    expect(out).not.toContain('x 제목')
  })

  it('핵심도 확인 필요도 없으면 핵심 구역을 그리지 않는다', () => {
    const out = flat(<OpsDecisionPanel {...basePanelProps()} items={[item({ id: 'x' })]} />)
    expect(out).not.toContain('이번 기획의 핵심')
    expect(out).not.toContain('확인이 필요한 항목')
  })

  it('항목이 하나도 없으면 패널 전체를 그리지 않는다', () => {
    expect(panel({ items: [] })).toBeNull()
  })

  it('도착 항목뿐이고 칩·핵심·결정할 항목이 모두 비면 빈 카드를 그리지 않는다', () => {
    expect(panel({ items: [item({ id: 'x', status: 'arrived' })] })).toBeNull()
  })

  it('핵심 줄을 누르면 그 항목이 선택된다', () => {
    const onSelectItem = vi.fn()
    const buttons = findAll(panel({ items: HIGHLIGHTED, onSelectItem }), (element) => element.type === 'button')
    expect(buttons).toHaveLength(1)
    ;(buttons[0].props.onClick as () => void)()
    expect(onSelectItem).toHaveBeenCalledWith('a')
  })
})

describe('종류별로 고르기', () => {
  const items = [
    item({ id: 'h1', position: 0 }),
    item({ id: 'h2', position: 1 }),
    item({ id: 'm1', position: 2, kind: 'mission' }),
    item({ id: 'p1', position: 3, kind: 'pattern_proposal' }),
    item({ id: 'ap', position: 4, status: 'approved' }),
  ]

  it('접힌 머리줄에 「승인 대상 N건」이 나온다', () => {
    const out = flat(<OpsDecisionPanel {...basePanelProps()} items={items} checkedIds={new Set(['h1'])} approvableCount={4} />)
    expect(out).toContain('종류별로 고르기')
    expect(out).toContain('승인 대상 4건')
    expect(out).not.toContain('고른 항목이 없어요')
  })

  it('0건이면 줄 끝에 「고른 항목이 없어요」가 붙는다', () => {
    const out = flat(<OpsDecisionPanel {...basePanelProps()} items={items} approvableCount={0} />)
    expect(out).toContain('승인 대상 0건')
    expect(out).toContain('고른 항목이 없어요')
  })

  it('결정할 항목이 없으면 「종류별로 고르기」가 없다', () => {
    expect(flat(<OpsDecisionPanel {...basePanelProps()} items={[items[4]]} />)).not.toContain('종류별로 고르기')
  })

  it('종류마다 「체크 N/전체 M」이 나오고 일부만 체크면 indeterminate다(패턴 제안은 뺀다)', () => {
    const tree = panel({ items, checkedIds: new Set(['h1', 'm1']) })
    const boxes = findAll(tree, (element) => element.type === Checkbox)
    expect(boxes.map((box) => box.props['aria-label'])).toEqual(['홈피드 카드 전체 고르기', '미션 전체 고르기'])
    expect(boxes.map((box) => box.props.checked)).toEqual(['indeterminate', true])
    const out = flat(<OpsDecisionPanel {...basePanelProps()} items={items} checkedIds={new Set(['h1', 'm1'])} />)
    // 접힌 안쪽은 서버 렌더에 없으므로 요소 트리의 글자로 확인한다
    expect(JSON.stringify(tree?.props.children)).toContain('체크 1/전체 2')
    expect(JSON.stringify(tree?.props.children)).toContain('체크 1/전체 1')
    expect(out).toContain('종류별로 고르기')
  })

  it('종류 체크를 바꾸면 그 종류의 항목 ID를 한꺼번에 넘긴다: 일부만 체크면 전부 체크, 전부 체크면 전부 해제', () => {
    const onSetChecked = vi.fn()
    const boxes = findAll(panel({ items, checkedIds: new Set(['h1', 'm1']), onSetChecked }), (element) => element.type === Checkbox)
    ;(boxes[0].props.onCheckedChange as () => void)()
    expect(onSetChecked).toHaveBeenLastCalledWith(['h1', 'h2'], true)
    ;(boxes[1].props.onCheckedChange as () => void)()
    expect(onSetChecked).toHaveBeenLastCalledWith(['m1'], false)
  })

  it('종류 체크가 체크 건수를 바꾼다', () => {
    const reviewing = items.filter((entry) => entry.status === 'reviewing' && entry.kind !== 'pattern_proposal')
    const off = withItemsChecked({}, reviewing, ['h1', 'h2'], false)
    expect(splitByChecked(reviewing, off).checked.map((entry) => entry.id)).toEqual(['m1'])
    const on = withItemsChecked(off, reviewing, ['h1', 'h2'], true)
    expect(splitByChecked(reviewing, on).checked).toHaveLength(3)
  })
})

describe('OpsDecisionWorkspace에 끼운 결정 패널', () => {
  const EXECUTION: OpsBundleExecution = { approvedCount: 0, readyCount: 0 }
  const props = { bundleId: 'bundle-1', bundleFormatErrors: [] as string[], execution: EXECUTION, decisions: [] }

  it('「승인 대상 N건」이 주 버튼의 「N건 승인하고 예약」과 같은 건수다', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', position: 1 }), item({ id: 'c', position: 2, formatErrors: ['items[2].kind: 틀려요.'] })]
    const out = flat(<OpsDecisionWorkspace {...props} items={items} />)
    expect(out).toContain('승인 대상 2건')
    expect(out).toContain('>2건 승인하고 예약<')
    // 형식 오류가 있는 항목은 확인 필요로 올라온다
    expect(out).toContain('확인이 필요한 항목')
    expect(out).toContain('c 제목')
  })

  it('예약할 승인됨 항목도 같은 건수에 든다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} execution={{ approvedCount: 1, readyCount: 1 }} items={[item({ id: 'a' })]} />)
    expect(out).toContain('승인 대상 2건')
    expect(out).toContain('>2건 승인하고 예약<')
  })

  it('새 필드가 없는 옛 묶음도 깨지지 않는다: 이유 칩과 핵심 구역만 비고 나머지는 그대로다', () => {
    const legacy = [item({ id: 'a', original: { copy: { title: '옛 카드' } } }), item({ id: 'b', position: 1, original: null as never })]
    const out = flat(<OpsDecisionWorkspace {...props} items={legacy} />)
    expect(out).toContain('결정 패널')
    expect(out).toContain('종류별로 고르기')
    expect(out).not.toContain('기획 이유')
    expect(out).not.toContain('이번 기획의 핵심')
    expect(out).toContain('전체 선택')
  })

  it('항목이 없는 묶음에는 결정 패널이 없다', () => {
    expect(flat(<OpsDecisionWorkspace {...props} items={[]} />)).not.toContain('결정 패널')
  })
})

function basePanelProps() {
  return {
    needsCheckIds: new Set<string>(),
    checkedIds: new Set<string>(),
    approvableCount: 0,
    onSetChecked: vi.fn(),
    onSelectItem: vi.fn(),
  }
}
