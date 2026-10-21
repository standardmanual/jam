/**
 * 포인트 화면 (티켓 20261019_1317 3회, 운영 로직 14.2절 «포인트 화면은 가진 포인트와 받은 내역을 보여 준다»)
 *
 * 고정하는 것
 *  - 잔액: 불러오기 전에는 «—», 불러온 뒤에는 라벨 «현재 잔액»과 스크린리더 문구(`aria-label`), 단위 «포인트». 팝인 훅에는 숫자만 넘긴다.
 *  - 내역 행: 제목, 부호가 붙은 금액(+/−), KST 날짜와 시각, 어드민 «기타» 메모(`note`, 있을 때만), 링크(있을 때만).
 *  - 빈 상태, 불러오기 실패(HTTP 오류와 네트워크 오류)와 «다시 시도», «더 보기»(다음 페이지를 이어 붙임, 받는 중 중복 클릭 차단).
 *  - 그려진 글 어디에도 어드민 용어 «회수»(와 «지급»·«차감»)가 없다. 모든 화면 상태에서 확인한다(14.2절, UX 가이드 1.3절).
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 이 화면이 부르는 훅(`useState`·`useEffect`·`useCallback`)을
 * **화면 함수가 실행되는 동안에만** 가짜로 바꾼다. 상태는 호출 순서대로 보관하고 효과는 모아 두었다가 손으로 돌린다.
 * 그 사이 자식 컴포넌트는 원래 훅을 그대로 쓴다. 그려진 글은 `renderToStaticMarkup`으로, 누르기는 요소 트리에서 찾은 `onClick`을 불러 확인한다.
 * `fetch`는 가짜로 대신한다. 실제 DB와 `/api/points`는 부르지 않는다(`api/points/__tests__/route.test.ts`가 서버 쪽을 고정한다).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/points/page.test.tsx"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Effect = () => void | (() => void)

const scope = vi.hoisted(() => ({
  /** 화면 함수가 실행되는 동안만 true — 이때만 훅을 가짜로 바꾼다 */
  active: false,
  cursor: 0,
  slots: [] as unknown[],
  effects: [] as Effect[],
  digits: [] as (string | null)[],
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!scope.active) return actual.useState(initial)
      const index = scope.cursor++
      if (!(index in scope.slots)) scope.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      const set = (next: unknown) => {
        scope.slots[index] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(scope.slots[index]) : next
      }
      return [scope.slots[index], set]
    },
    useEffect: (effect: Effect, deps?: unknown[]) => {
      if (!scope.active) return actual.useEffect(effect, deps)
      scope.effects.push(effect)
    },
    useCallback: (fn: unknown, deps?: unknown[]) => (scope.active ? fn : actual.useCallback(fn as () => void, deps ?? [])),
  }
})
vi.mock('@/components/transitions-pages', () => ({
  useDigitPopIn: (text: string | null) => {
    scope.digits.push(text)
    return { current: null }
  },
}))
vi.mock('@/components/ui/TopNav', () => ({
  default: ({ title }: { title?: string }) => <header data-testid="top-nav">{title}</header>,
}))

import PointsPage from './page'
import { formatKoreanDateTime } from '@/components/LocalDate'
import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'
import type { PointHistoryItem } from '@/app/api/points/route'

const FORBIDDEN_TERMS = ['회수', '지급', '차감']

function item(over: Partial<PointHistoryItem> = {}): PointHistoryItem {
  return {
    id: 'tx-1',
    amount: 30,
    created_at: '2026-10-20T01:30:00.000Z',
    reason: 'badge_point_reward',
    title: '한강 러너',
    note: null,
    href: null,
    ...over,
  }
}

const fetchMock = vi.fn()

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function page(items: PointHistoryItem[], nextCursor: string | null = null, balance = 1200) {
  return okResponse({ balance, items, nextCursor })
}

/** 화면 함수를 한 번 불러 요소 트리를 얻는다. 저장된 상태(`scope.slots`)를 이어 받는다 */
function renderTree(): ReactNode {
  scope.cursor = 0
  scope.effects = []
  scope.active = true
  try {
    return PointsPage()
  } finally {
    scope.active = false
  }
}

/** 같은 상태로 화면을 실제로 그려 마크업을 얻는다 */
function renderHtml(): string {
  function Harness() {
    scope.cursor = 0
    scope.effects = []
    scope.active = true
    try {
      return PointsPage()
    } finally {
      scope.active = false
    }
  }
  return renderToStaticMarkup(<Harness />)
}

/** 처음 그리고 모인 효과(최초 불러오기)를 돌린다 */
async function mountAndLoad(): Promise<void> {
  renderTree()
  const effects = scope.effects
  for (const effect of effects) effect()
  await flush()
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function walk(node: unknown, visit: (element: ReactElement<Record<string, unknown>>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!isValidElement(node)) return
  const element = node as ReactElement<Record<string, unknown>>
  visit(element)
  for (const value of Object.values(element.props)) walk(value, visit)
}

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: unknown }>).props.children)
  return ''
}

function findAll(tree: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean) {
  const found: ReactElement<Record<string, unknown>>[] = []
  walk(tree, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

/** 글자로 찾은 누를 수 있는 요소(Button 컴포넌트 또는 button 태그) */
function buttonByLabel(tree: ReactNode, label: string) {
  return findAll(tree, (el) => (el.type === Button || el.type === 'button') && textOf(el.props.children) === label)[0]
}

function click(button: ReactElement<Record<string, unknown>> | undefined): Promise<void> {
  expect(button, '누를 버튼이 화면에 없다').toBeDefined()
  return (button!.props.onClick as () => Promise<void>)()
}

/** 태그를 걷어낸 화면 글자 */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

function expectNoAdminTerms(html: string) {
  for (const term of FORBIDDEN_TERMS) expect(html, `«${term}»가 화면에 있다`).not.toContain(term)
}

beforeEach(() => {
  scope.slots = []
  scope.cursor = 0
  scope.effects = []
  scope.digits = []
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('포인트 화면 — 불러오기 전', () => {
  it('내역 자리에 «불러오는 중»이 보이고 잔액은 «—»다', () => {
    const html = renderHtml()

    expect(visibleText(html)).toContain(d.points.loading)
    expect(visibleText(html)).toContain('—')
    expect(html).toContain(d.points.balanceLabel)
    expect(html).toContain(d.points.historyTitle)
    // 잔액을 모를 때는 스크린리더 문구도 두지 않는다
    expect(html).not.toContain(d.points.unitSuffix)
    expect(html).not.toContain(d.points.emptyTitle)
    expectNoAdminTerms(html)
  })
})

describe('포인트 화면 — 잔액', () => {
  it('최초 불러오기는 /api/points를 한 번 부른다', async () => {
    fetchMock.mockResolvedValue(page([item()]))

    await mountAndLoad()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/points')
  })

  it('불러온 뒤 라벨 «현재 잔액»과 단위 «포인트», 스크린리더 문구가 보인다', async () => {
    fetchMock.mockResolvedValue(page([item()], null, 1200))
    await mountAndLoad()

    const html = renderHtml()

    expect(html).toContain(d.points.balanceLabel)
    expect(html).toContain('aria-label="1,200 포인트"')
    expect(visibleText(html)).toContain(d.points.unitSuffix)
    expect(visibleText(html)).not.toContain('—')
  })

  it('팝인 훅에는 단위 없이 숫자만 넘긴다(자릿수만 움직이게)', async () => {
    fetchMock.mockResolvedValue(page([item()], null, 1200))
    await mountAndLoad()
    scope.digits = []

    renderHtml()

    expect(scope.digits).toEqual(['1,200'])
  })

  it('잔액 0도 «0 포인트»로 읽힌다 — 잔액을 모를 때(—)와 다르다', async () => {
    fetchMock.mockResolvedValue(page([], null, 0))
    await mountAndLoad()

    const html = renderHtml()

    expect(html).toContain('aria-label="0 포인트"')
  })
})

describe('포인트 화면 — 내역 행', () => {
  it('제목과 부호가 붙은 금액이 보인다 — 적립은 +, 차감은 −', async () => {
    fetchMock.mockResolvedValue(
      page([
        item({ id: 'plus', title: '한강 러너', amount: 30 }),
        item({ id: 'minus', title: d.points.reasonKindAdminAdjustment, amount: -1500, reason: 'admin_deduct' }),
      ])
    )
    await mountAndLoad()

    const text = visibleText(renderHtml())

    expect(text).toContain('한강 러너')
    expect(text).toContain('+30 포인트')
    expect(text).toContain(d.points.reasonKindAdminAdjustment)
    // 마이너스는 하이픈이 아니라 U+2212이고, 천 단위 구분이 붙는다
    expect(text).toContain('−1,500 포인트')
    expect(text).not.toContain('--1,500')
  })

  it('날짜와 시각이 KST로 보인다', async () => {
    fetchMock.mockResolvedValue(page([item({ created_at: '2026-10-20T01:30:00.000Z' })]))
    await mountAndLoad()

    const text = visibleText(renderHtml())

    const expected = formatKoreanDateTime('2026-10-20T01:30:00.000Z', { year: true, time: true })
    expect(expected).toContain('2026년 10월 20일')
    expect(text).toContain(expected)
  })

  it('어드민 «기타» 메모(note)는 있을 때만 보인다', async () => {
    fetchMock.mockResolvedValue(
      page([
        item({ id: 'a', title: d.points.reasonKindAdminAdjustment, reason: 'admin_grant', note: '운영 사정으로 조정했어요' }),
        item({ id: 'b', title: '한강 러너', note: null }),
      ])
    )
    await mountAndLoad()

    const text = visibleText(renderHtml())

    expect(text).toContain('운영 사정으로 조정했어요')
    expect(text.match(/운영 사정으로 조정했어요/g)).toHaveLength(1)
  })

  it('링크가 있는 행만 이동한다 — 배지·미션 포인트는 상세로, 조정은 링크가 없다', async () => {
    fetchMock.mockResolvedValue(
      page([
        item({ id: 'badge', title: '한강 러너', href: '/badges/b1' }),
        item({ id: 'mission', title: '주말 러닝', reason: 'mission_point_reward', href: '/missions/m1' }),
        item({ id: 'admin', title: d.points.reasonKindAdminAdjustment, reason: 'admin_grant', href: null }),
      ])
    )
    await mountAndLoad()

    const html = renderHtml()

    expect(html).toContain('href="/badges/b1"')
    expect(html).toContain('href="/missions/m1"')
    expect((html.match(/<a /g) ?? []).length).toBe(2)
  })

  it('행 순서는 서버가 준 순서 그대로다', async () => {
    fetchMock.mockResolvedValue(page([item({ id: 'a', title: '첫째' }), item({ id: 'b', title: '둘째' }), item({ id: 'c', title: '셋째' })]))
    await mountAndLoad()

    const text = visibleText(renderHtml())

    expect(text.indexOf('첫째')).toBeLessThan(text.indexOf('둘째'))
    expect(text.indexOf('둘째')).toBeLessThan(text.indexOf('셋째'))
  })
})

describe('포인트 화면 — 빈 상태', () => {
  it('내역이 없으면 안내만 보이고 «더 보기»는 없다', async () => {
    fetchMock.mockResolvedValue(page([], null, 0))
    await mountAndLoad()

    const html = renderHtml()

    expect(visibleText(html)).toContain(d.points.emptyTitle)
    expect(visibleText(html)).toContain(d.points.emptyBody)
    expect(visibleText(html)).not.toContain(d.points.loadMore)
    expect(visibleText(html)).not.toContain(d.points.loadError)
    expectNoAdminTerms(html)
  })
})

describe('포인트 화면 — 불러오기 실패', () => {
  it('HTTP 오류면 «내역을 불러오지 못했어요.»와 «다시 시도»가 보이고 내역·빈 상태는 없다', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await mountAndLoad()

    const html = renderHtml()

    expect(visibleText(html)).toContain(d.points.loadError)
    expect(visibleText(html)).toContain(d.points.retry)
    expect(visibleText(html)).not.toContain(d.points.emptyTitle)
    expect(visibleText(html)).not.toContain(d.points.loading)
    // 읽지 못했을 때 잔액을 0으로 속이지 않는다
    expect(visibleText(html)).toContain('—')
    expectNoAdminTerms(html)
  })

  it('네트워크 오류도 같은 안내가 보인다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await mountAndLoad()

    const html = renderHtml()

    expect(visibleText(html)).toContain(d.points.loadError)
    expect(visibleText(html)).toContain(d.points.retry)
  })

  it('«다시 시도»를 누르면 처음부터 다시 부르고, 성공하면 내역과 잔액이 보인다', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await mountAndLoad()
    expect(visibleText(renderHtml())).toContain(d.points.loadError)

    fetchMock.mockResolvedValueOnce(page([item({ title: '한강 러너' })], null, 700))
    await click(buttonByLabel(renderTree(), d.points.retry))
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/points')
    const html = renderHtml()
    expect(visibleText(html)).toContain('한강 러너')
    expect(visibleText(html)).not.toContain(d.points.loadError)
    expect(html).toContain('aria-label="700 포인트"')
  })

  it('«다시 시도»가 또 실패하면 같은 안내로 남는다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await mountAndLoad()

    await click(buttonByLabel(renderTree(), d.points.retry))
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(visibleText(renderHtml())).toContain(d.points.loadError)
  })
})

describe('포인트 화면 — 더 보기', () => {
  it('다음 페이지가 없으면 «더 보기»가 없다', async () => {
    fetchMock.mockResolvedValue(page([item()], null))
    await mountAndLoad()

    expect(visibleText(renderHtml())).not.toContain(d.points.loadMore)
  })

  it('다음 페이지가 있으면 «더 보기»가 보이고, 누르면 cursor를 실어 부르고 내역을 이어 붙인다', async () => {
    const cursor = '2026-10-19T00:00:00.000Z'
    fetchMock.mockResolvedValueOnce(page([item({ id: 'a', title: '첫 쪽 내역' })], cursor))
    await mountAndLoad()
    expect(visibleText(renderHtml())).toContain(d.points.loadMore)

    fetchMock.mockResolvedValueOnce(page([item({ id: 'b', title: '둘째 쪽 내역' })], null, 1500))
    await click(buttonByLabel(renderTree(), d.points.loadMore))
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/points?cursor=${encodeURIComponent(cursor)}`)
    const text = visibleText(renderHtml())
    // 첫 쪽을 지우지 않고 뒤에 붙는다
    expect(text).toContain('첫 쪽 내역')
    expect(text).toContain('둘째 쪽 내역')
    expect(text.indexOf('첫 쪽 내역')).toBeLessThan(text.indexOf('둘째 쪽 내역'))
    // 마지막 쪽이면 «더 보기»가 사라진다
    expect(text).not.toContain(d.points.loadMore)
  })

  it('받는 동안 버튼 글자가 «불러오는 중»으로 바뀌고 눌러지지 않는다', async () => {
    const cursor = '2026-10-19T00:00:00.000Z'
    fetchMock.mockResolvedValueOnce(page([item({ id: 'a' })], cursor))
    await mountAndLoad()

    let resolveNext: (value: unknown) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
    const pending = click(buttonByLabel(renderTree(), d.points.loadMore))

    const during = renderTree()
    const busy = buttonByLabel(during, d.points.loadingMore)
    expect(busy).toBeDefined()
    expect(busy!.props.disabled).toBe(true)
    expect(buttonByLabel(during, d.points.loadMore)).toBeUndefined()

    resolveNext(page([item({ id: 'b' })], null))
    await pending
    await flush()

    expect(buttonByLabel(renderTree(), d.points.loadingMore)).toBeUndefined()
  })

  it('더 보기가 실패해도 이미 받은 내역은 그대로 남고 오류 카드로 바뀌지 않는다', async () => {
    const cursor = '2026-10-19T00:00:00.000Z'
    fetchMock.mockResolvedValueOnce(page([item({ id: 'a', title: '첫 쪽 내역' })], cursor))
    await mountAndLoad()

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await click(buttonByLabel(renderTree(), d.points.loadMore))
    await flush()

    const text = visibleText(renderHtml())
    expect(text).toContain('첫 쪽 내역')
    expect(text).not.toContain(d.points.loadError)
    // 같은 쪽을 다시 받을 수 있게 «더 보기»가 남는다
    expect(text).toContain(d.points.loadMore)
  })
})

describe('포인트 화면 — 어드민 용어 «회수»가 없다 (운영 로직 14.2절)', () => {
  it('어떤 화면 상태에서도 «회수»·«지급»·«차감»이 그려지지 않는다', async () => {
    const seen: string[] = []

    // 불러오는 중
    seen.push(renderHtml())

    // 내역이 있는 상태 — 어드민 조정 제목은 서버가 유저용 라벨로 바꿔 내려준다
    fetchMock.mockResolvedValueOnce(
      page(
        [
          item({ id: 'a', title: '한강 러너', amount: 30 }),
          item({ id: 'b', title: d.points.reasonAbuseReclaim, amount: -200, reason: 'admin_deduct' }),
          item({ id: 'c', title: d.points.reasonKindAdminAdjustment, amount: -50, reason: 'admin_deduct' }),
          item({ id: 'd', title: d.points.reasonEventPromotion, amount: 500, reason: 'admin_grant' }),
          item({ id: 'e', title: d.points.reasonKindMissionReward, amount: 100, reason: 'mission_point_reward' }),
        ],
        '2026-10-19T00:00:00.000Z'
      )
    )
    await mountAndLoad()
    seen.push(renderHtml())

    // 받는 중
    let resolveNext: (value: unknown) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
    const pending = click(buttonByLabel(renderTree(), d.points.loadMore))
    seen.push(renderHtml())
    resolveNext(page([], null))
    await pending
    await flush()

    // 빈 상태
    scope.slots = []
    fetchMock.mockResolvedValueOnce(page([], null, 0))
    await mountAndLoad()
    seen.push(renderHtml())

    // 불러오기 실패
    scope.slots = []
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await mountAndLoad()
    seen.push(renderHtml())

    expect(seen).toHaveLength(5)
    for (const html of seen) expectNoAdminTerms(html)
  })
})
