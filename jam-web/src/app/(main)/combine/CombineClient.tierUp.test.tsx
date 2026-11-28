/**
 * 믹스 화면의 «등급 UP» 입구와 화면 (티켓 20261022_2119 3회, 가차머신 리뉴얼 티켓 20261127_2225).
 *
 * 저장소에 jsdom·testing-library가 없어 `CombineClient.test.tsx`와 같은 방식으로 돈다: `react`의 `useState`·`useMemo`만 «손으로 돌리는
 * 상태 저장소»로 바꿔 끼우고, 컴포넌트 함수를 직접 호출해 나온 엘리먼트 트리에서 핸들러를 꺼내 부른다. 하위 컴포넌트는 렌더하지 않고 props만 본다.
 * 기존 `CombineClient.test.tsx`는 건드리지 않았다(레시피 믹서가 그대로라는 증거다).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const toastMock = vi.hoisted(() => vi.fn())
const refreshMock = vi.hoisted(() => vi.fn())

/**
 * 주소(쿼리)와 history를 흉내 내는 `next/navigation` 모의 — 화면 상태의 원천이 주소라서(티켓 20261110_1215)
 * `push`·`replace`·`back`이 `useSearchParams`가 읽는 값을 실제로 바꾼다.
 */
const navMock = vi.hoisted(() => {
  const state = { entries: [''], index: 0 }
  const queryOf = (url: string) => (url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
  const push = vi.fn((url: string) => {
    state.entries = [...state.entries.slice(0, state.index + 1), queryOf(url)]
    state.index += 1
  })
  const replace = vi.fn((url: string) => {
    state.entries[state.index] = queryOf(url)
  })
  const back = vi.fn(() => {
    if (state.index > 0) state.index -= 1
  })
  return {
    state,
    push,
    replace,
    back,
    search: () => state.entries[state.index],
    /** 주소로 바로 열린 상태(링크·새로고침)로 시작한다 — 앞 항목이 없다 */
    openDirect: (query: string) => {
      state.entries = [query]
      state.index = 0
    },
    reset: () => {
      state.entries = ['']
      state.index = 0
      push.mockClear()
      replace.mockClear()
      back.mockClear()
    },
  }
})

const hooks = vi.hoisted(() => ({
  active: false,
  store: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial)
      const index = hooks.cursor++
      if (!(index in hooks.store)) {
        hooks.store[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const set = (next: unknown) => {
        hooks.store[index] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(hooks.store[index]) : next
      }
      return [hooks.store[index], set]
    },
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial)
      const index = hooks.cursor++
      if (!(index in hooks.store)) hooks.store[index] = { current: initial }
      return hooks.store[index]
    },
    useMemo: (factory: () => unknown, deps: unknown[]) => (hooks.active ? factory() : actual.useMemo(factory, deps)),
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      if (hooks.active) hooks.effects.push(effect)
      else actual.useEffect(effect, deps)
    },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navMock.push, replace: navMock.replace, back: navMock.back, prefetch: vi.fn(), refresh: refreshMock }),
  usePathname: () => '/combine',
  useSearchParams: () => new URLSearchParams(navMock.search()),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

import { markOpenedByPush } from '@/lib/combine/navigation'
import CombineClient, { toTierUpRevealBadges, type InventoryItemWithBadge } from './CombineClient'

// 테스트마다 주소와 «push로 열었다» 표시를 처음으로 돌린다.
beforeEach(() => {
  navMock.reset()
  markOpenedByPush(false)
})
import TierUpPanel from './TierUpPanel'
import { ListRow } from '@/components/ui/ListRow'
import TopNav from '@/components/ui/TopNav'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import { d } from '@/lib/i18n'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'
import { TEST_RECIPE } from './testRecipeFixture'

type AnyElement = ReactElement<Record<string, unknown>>

function findAll(node: ReactNode, predicate: (el: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, predicate, found))
    return found
  }
  if (!isValidElement(node)) return found
  const el = node as AnyElement
  if (predicate(el)) found.push(el)
  findAll(el.props.children as ReactNode, predicate, found)
  return found
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node as AnyElement).props.children as ReactNode)
  return ''
}

function item(id: string, rarity: InventoryItemWithBadge['badge']['rarity']): InventoryItemWithBadge {
  return {
    id,
    badge_id: `badge-${id}`,
    serial_prefix: null,
    serial_number: 1,
    badge: { id: `badge-${id}`, name: `배지 ${id}`, image_url: null, rarity },
  }
}

function many(prefix: string, rarity: InventoryItemWithBadge['badge']['rarity'], count: number) {
  return Array.from({ length: count }, (_, i) => item(`${prefix}${i + 1}`, rarity))
}

const RARE6 = many('r', 'rare', 6)
const MYSTIC6 = many('m', 'mystic', 6)
const DEFAULT_ITEMS = [...RARE6, ...many('c', 'common', 3), ...MYSTIC6]
const FULL = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']
const MYSTIC_FULL = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']

describe('등급 UP 입구 (탐색 화면)', () => {
  it('검색창보다 위에 있고 아이콘 없이 제목과 부제가 보인다', () => {
    const html = renderToStaticMarkup(
      <CombineClient items={[]} publicRecipes={[TEST_RECIPE]} ownedConditionBadgeIds={[]} />,
    )
    expect(html).toContain('등급 UP')
    expect(html).toContain('같은 등급 6개를 넣고 새 아이템 배지 1개를 받아요')
    expect(html.indexOf('등급 UP')).toBeLessThan(html.indexOf(d.combine.searchPlaceholder))
    // 오른쪽 화살표(chevron)만 있고 lead(왼쪽 아이콘 칸)와 슬롯 개수 칩은 없다 — 검색창 위 입구 구간만 본다
    const entryHtml = html.slice(0, html.indexOf(d.combine.searchPlaceholder))
    expect(entryHtml).not.toContain('class="ds-list-row-lead"')
    expect(entryHtml).toContain('data-interactive="true"')
    expect(entryHtml).toMatch(/aria-hidden="true" style="[^"]*color:var\(--muted\)"><svg/)
    // 제목은 굵게(700)다
    expect(entryHtml).toMatch(/font-weight:700[^"]*">등급 UP</)
  })

  it('레시피가 하나도 없어도 입구는 남는다', () => {
    const html = renderToStaticMarkup(<CombineClient items={[]} publicRecipes={[]} ownedConditionBadgeIds={[]} />)
    expect(html).toContain('등급 UP')
    expect(html).toContain(d.combine.noRecipes)
  })

  it('입구 부제는 최대 2줄이고, 한국어 줄바꿈은 ListRow의 keep-all이 맡는다', () => {
    const html = renderToStaticMarkup(<CombineClient items={[]} publicRecipes={[]} ownedConditionBadgeIds={[]} />)
    const subtitle = html.match(/<span style="[^"]*">같은 등급 6개를 넣고 새 아이템 배지 1개를 받아요<\/span>/)
    expect(subtitle).not.toBeNull()
    // 2줄 제한(-webkit-line-clamp:2)이고 한 줄 말줄임(nowrap·ellipsis)이 아니다
    expect(subtitle![0]).toContain('-webkit-line-clamp:2')
    expect(subtitle![0]).not.toContain('text-overflow:ellipsis')
    expect(subtitle![0]).toContain('text-wrap:balance')
    expect(html).toContain('word-break:keep-all;overflow-wrap:break-word')
  })
})


describe('CombineClient 등급 UP 흐름', () => {
  beforeEach(() => {
    toastMock.mockClear()
    refreshMock.mockClear()
    hooks.active = true
    hooks.store = []
  })

  afterEach(() => {
    hooks.active = false
    vi.unstubAllGlobals()
  })

  type StageOutcome = { kind: string; badge?: { name: string; rarity: string | null; imageUrl: string | null } }

  function createScreen(
    options: {
      items?: InventoryItemWithBadge[]
      pendingCount?: number
    } = {},
  ) {
    const props = {
      items: options.items ?? DEFAULT_ITEMS,
      publicRecipes: [TEST_RECIPE],
      ownedConditionBadgeIds: [],
      pendingCount: options.pendingCount ?? 0,
    }
    /** 가차머신 무대의 손잡이 대역 — 연출 시작과 결과 전달 호출만 기록한다 */
    const stage = { play: vi.fn(), settle: vi.fn() }
    const panel = (tree: ReactNode) => findAll(tree, (el) => el.type === TierUpPanel)[0]
    const render = () => {
      hooks.cursor = 0
      const tree = CombineClient(props)
      const found = panel(tree)
      if (found) (found.props.stageRef as { current: unknown }).current = stage
      return tree
    }
    const entry = (tree: ReactNode) => findAll(tree, (el) => el.type === ListRow)[0]
    const nav = (tree: ReactNode) => findAll(tree, (el) => el.type === TopNav)[0]
    const overlay = (tree: ReactNode) => findAll(tree, (el) => el.type === BadgeRevealOverlay)[0]
    const openTierUp = () => {
      ;(entry(render()).props.onClick as () => void)()
      return render()
    }
    const pick = (id: string) => (panel(render()).props.onPick as (id: string) => void)(id)
    const openSheet = () => (panel(render()).props.onOpenSheet as () => void)()
    /** «배지 넣기»로 시트를 열고 개체를 차례로 고른다 */
    const fill = (ids: string[]) => {
      openSheet()
      for (const id of ids) pick(id)
      return render()
    }
    /** 고르기 직후 비동기 제출(fetch → 무대에 결과 전달)이 끝나도록 기다린다 */
    const flush = async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    /** 6개를 모두 골라 자동 제출까지 보낸 뒤 결과 처리가 끝난 화면을 돌려준다 */
    const submitAll = async (ids: string[] = FULL) => {
      fill(ids)
      await flush()
      return render()
    }
    const setItems = (next: InventoryItemWithBadge[]) => {
      props.items = next
    }
    const outcomes = () => stage.settle.mock.calls.map((call) => call[0] as StageOutcome)
    return { render, panel, entry, nav, overlay, openTierUp, pick, openSheet, fill, flush, submitAll, setItems, stage, outcomes }
  }

  type SheetShape = { kind: string; locked: string | null; groups: { rarity: string; cells: { item: { id: string }; state: string }[] }[] }
  /** 고른 개체 id — 시트 묶음에서 selected인 셀이다 */
  const chosenIds = (tree: ReactNode, screen: ReturnType<typeof createScreen>) => {
    const sheet = screen.panel(tree).props.sheet as SheetShape
    return sheet.kind === 'groups' ? sheet.groups.flatMap((g) => g.cells).filter((cell) => cell.state === 'selected').map((cell) => cell.item.id) : []
  }
  const countOf = (tree: ReactNode, screen: ReturnType<typeof createScreen>) => screen.panel(tree).props.count as number

  function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    const fetchMock = vi.fn(async () => ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const GRANTED_RARE = {
    success: true,
    path: 'tier_up',
    materialRarity: 'rare',
    resultStatus: 'granted',
    resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'epic', imageUrl: 'https://example.com/b1.png' }],
  }

  it('입구를 누르면 TopNav가 투명 배경의 «등급 UP»이 되고 가차머신 화면이 열리며, 뒤로가기는 탐색 화면으로 돌아온다', () => {
    const screen = createScreen()
    const explore = screen.render()
    expect(screen.nav(explore).props.title).toBe(d.combine.title)
    expect(screen.nav(explore).props.onBack).toBeUndefined()
    expect(screen.nav(explore).props.headerStyle).toBeUndefined()
    expect(screen.panel(explore)).toBeUndefined()

    const opened = screen.openTierUp()
    expect(screen.nav(opened).props.title).toBe('등급 UP')
    expect(screen.nav(opened).props.headerStyle).toMatchObject({ background: 'transparent' })
    expect(screen.panel(opened)).toBeDefined()
    expect(screen.entry(opened)).toBeUndefined()

    ;(screen.nav(opened).props.onBack as () => void)()
    const back = screen.render()
    expect(screen.nav(back).props.title).toBe(d.combine.title)
    expect(screen.nav(back).props.headerStyle).toBeUndefined()
    expect(screen.panel(back)).toBeUndefined()
    expect(screen.entry(back)).toBeDefined()
  })

  it('받지 않은 결과가 있어도 입구는 눌리고, 막는 것은 «배지 넣기»뿐이며 6개를 골라도 제출하지 않는다', async () => {
    const fetchMock = stubFetch({})
    const screen = createScreen({ pendingCount: 2 })
    expect(typeof screen.entry(screen.render()).props.onClick).toBe('function')
    const opened = screen.openTierUp()
    expect(screen.panel(opened).props.pendingBlocked).toBe(true)
    const filled = await screen.submitAll()
    expect(countOf(filled, screen)).toBe(6)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.stage.play).not.toHaveBeenCalled()
  })

  it('처음 열면 고른 배지가 0개이고 시트는 닫혀 있다', () => {
    const screen = createScreen()
    const opened = screen.openTierUp()
    expect(countOf(opened, screen)).toBe(0)
    expect(screen.panel(opened).props.sheetOpen).toBe(false)
    expect(screen.panel(opened).props).not.toHaveProperty('slots')
    expect(screen.panel(opened).props).not.toHaveProperty('onSubmit')
  })

  it('«배지 넣기»로 시트가 열리고 담을 때마다 개수가 늘며, 5개까지는 시트가 열린 채 제출하지 않는다', async () => {
    const fetchMock = stubFetch(GRANTED_RARE)
    const screen = createScreen()
    screen.openTierUp()
    screen.openSheet()
    expect(screen.panel(screen.render()).props.sheetOpen).toBe(true)
    const picked: string[] = []
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      screen.pick(id)
      picked.push(id)
      const tree = screen.render()
      expect(chosenIds(tree, screen)).toEqual(picked)
      expect(countOf(tree, screen)).toBe(picked.length)
      expect(screen.panel(tree).props.sheetOpen).toBe(true)
    }
    await screen.flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('6번째를 고르면 시트가 닫히고 /api/combine/tier-up이 정확히 1회 불리며 무대 연출이 시작된다', async () => {
    const fetchMock = stubFetch(GRANTED_RARE)
    const screen = createScreen()
    screen.openTierUp()
    const full = await screen.submitAll()
    expect(screen.panel(full).props.sheetOpen).toBe(false)
    expect(countOf(full, screen)).toBe(6)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.stage.play).toHaveBeenCalledTimes(1)
    // 무대에는 고른 배지 6개의 그림 주소가 칸 순서대로 간다
    expect(screen.stage.play.mock.calls[0][0]).toHaveLength(6)
  })

  it('6번째 선택 직후의 연타는 제출을 두 번 보내지 않는다', async () => {
    const fetchMock = stubFetch(GRANTED_RARE)
    const screen = createScreen()
    screen.openTierUp()
    screen.fill(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])
    screen.pick('r6')
    screen.pick('r1')
    await screen.flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.stage.play).toHaveBeenCalledTimes(1)
  })

  it('고른 배지를 시트에서 다시 누르면 빠지고, 모두 빼면 등급 고정이 풀린다', () => {
    const screen = createScreen()
    screen.openTierUp()
    screen.fill(['r1', 'r2'])
    expect(countOf(screen.render(), screen)).toBe(2)
    screen.pick('r1')
    const afterOne = screen.render()
    expect(chosenIds(afterOne, screen)).toEqual(['r2'])
    expect(countOf(afterOne, screen)).toBe(1)
    screen.pick('r2')
    const cleared = screen.render()
    expect(countOf(cleared, screen)).toBe(0)
    expect((screen.panel(cleared).props.sheet as { kind: string }).kind).toBe('groups')
  })

  it('첫 재료를 고르면 모든 등급 묶음이 보이고 같은 등급만 활성이다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1'])
    const sheet = screen.panel(tree).props.sheet as SheetShape
    expect(sheet.kind).toBe('groups')
    expect(sheet.locked).toBe('rare')
    const rare = sheet.groups.find((g) => g.rarity === 'rare')!
    expect(rare.cells.map((cell) => cell.item.id)).toEqual(FULL)
    expect(rare.cells[0].state).toBe('selected')
    for (const g of sheet.groups.filter((g) => g.rarity !== 'rare')) expect(g.cells.every((c) => c.state === 'inactive')).toBe(true)
  })

  it('다른 등급·6개 미만 묶음의 개체는 담기지 않는다', () => {
    const screen = createScreen()
    screen.openTierUp()
    screen.openSheet()
    screen.pick('c1') // Common은 3개뿐이라 묶음 전체가 비활성
    expect(countOf(screen.render(), screen)).toBe(0)
    screen.pick('r1')
    screen.pick('c2') // 첫 재료를 고른 뒤에는 다른 등급이 막힌다
    screen.pick('m1') // Mystic도 다른 등급이라 막힌다
    expect(chosenIds(screen.render(), screen)).toEqual(['r1'])
  })

  it('목록에서 사라진 개체는 고른 것에서 걸러 낸다 — 유령 선택이 생기지 않는다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2', 'r3'])
    expect(countOf(tree, screen)).toBe(3)
    screen.setItems(DEFAULT_ITEMS.filter((it) => it.id !== 'r2'))
    const after = screen.render()
    expect(countOf(after, screen)).toBe(2)
    expect(chosenIds(after, screen)).toEqual(['r1', 'r3'])
  })

  it('담을 수 있는 배지가 하나도 없으면 시트는 비어 있고 안내 블록이 이유를 말한다', () => {
    const screen = createScreen({ items: [item('n1', null)] })
    const opened = screen.openTierUp()
    expect((screen.panel(opened).props.sheet as { kind: string }).kind).toBe('empty')
    expect(screen.panel(opened).props.showNoEnoughNotice).toBe(true)
  })

  it('있기는 한데 6개 이상 가진 등급이 없으면 안내 블록이 나온다', () => {
    const screen = createScreen({ items: [...many('r', 'rare', 5), ...many('c', 'common', 2)] })
    const opened = screen.openTierUp()
    expect(screen.panel(opened).props.showNoEnoughNotice).toBe(true)
    expect((screen.panel(opened).props.sheet as { kind: string }).kind).toBe('groups')
  })

  it('6개 이상 가진 등급이 있으면 안내 블록이 없다', () => {
    const screen = createScreen()
    expect(screen.panel(screen.openTierUp()).props.showNoEnoughNotice).toBe(false)
  })

  it('시트를 직접 닫아도 고른 것은 유지된다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2'])
    ;(screen.panel(tree).props.onCloseSheet as () => void)()
    const closed = screen.render()
    expect(screen.panel(closed).props.sheetOpen).toBe(false)
    expect(countOf(closed, screen)).toBe(2)
  })

  it('나갔다 다시 들어오면 고른 것이 비어 있다', () => {
    const screen = createScreen()
    screen.openTierUp()
    screen.fill(['r1', 'r2'])
    ;(screen.nav(screen.render()).props.onBack as () => void)()
    screen.render()
    expect(countOf(screen.openTierUp(), screen)).toBe(0)
  })

  describe('Mystic 재료와 컬렉션 선택 없음', () => {
    it('Mystic을 첫 재료로 고르면 Mystic만 남는다', () => {
      const screen = createScreen()
      screen.openTierUp()
      const tree = screen.fill(['m1'])
      const sheet = screen.panel(tree).props.sheet as SheetShape
      expect(sheet.kind).toBe('groups')
      expect(sheet.locked).toBe('mystic')
      const cells = sheet.groups.find((g) => g.rarity === 'mystic')!.cells
      expect(cells.map((cell) => cell.item.id)).toEqual(MYSTIC_FULL)
      expect(cells.filter((cell) => cell.state === 'active')).toHaveLength(5)
    })

    it('Mystic을 고른 뒤 다른 등급은 담기지 않는다', () => {
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['m1', 'r1', 'c1'])
      expect(chosenIds(screen.render(), screen)).toEqual(['m1'])
    })

    it('Mystic만 6개 이상 가진 경우에도 «6개 이상 가진 등급이 없어요» 안내가 나오지 않는다', () => {
      const screen = createScreen({ items: MYSTIC6 })
      expect(screen.panel(screen.openTierUp()).props.showNoEnoughNotice).toBe(false)
    })

    it('등급 UP 화면에는 컬렉션을 고르는 props가 없다', () => {
      const screen = createScreen()
      const props = screen.panel(screen.openTierUp()).props
      for (const key of ['collection', 'collectionSheetOpen', 'onOpenCollectionSheet', 'onCloseCollectionSheet', 'onPickCollection', 'onRetryCollections']) {
        expect(props, key).not.toHaveProperty(key)
      }
    })

    it('탐색 화면에는 컬렉션 행이 없다', () => {
      const html = renderToStaticMarkup(<CombineClient items={DEFAULT_ITEMS} publicRecipes={[]} ownedConditionBadgeIds={[]} />)
      expect(html).not.toContain('받을 컬렉션')
    })
  })

  describe('제출', () => {
    it('요청 본문은 {itemIds} 6개뿐이고 collectionId가 없으며 /api/combine/tier-up을 부른다', async () => {
      const fetchMock = stubFetch(GRANTED_RARE)
      const screen = createScreen()
      screen.openTierUp()
      await screen.submitAll()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('/api/combine/tier-up')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ itemIds: FULL })
      expect(Object.keys(JSON.parse(init.body as string))).toEqual(['itemIds'])
    })

    it('Mystic 6개도 같은 본문으로 제출한다', async () => {
      const fetchMock = stubFetch({ ...GRANTED_RARE, materialRarity: 'mystic', resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'mystic' }] })
      const screen = createScreen()
      screen.openTierUp()
      await screen.submitAll(MYSTIC_FULL)
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(JSON.parse(init.body as string)).toEqual({ itemIds: MYSTIC_FULL })
    })

    it('잠기지 않은 단일 성공은 무대에 reveal을 넘기고 기존 오버레이는 열지 않으며, «한 번 더»로 고른 배지가 비워진다', async () => {
      stubFetch({
        ...GRANTED_RARE,
        resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'epic', imageUrl: 'https://example.com/b1.png', description: '설명' }],
      })
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(screen.outcomes()).toEqual([
        { kind: 'reveal', badge: { name: '새 배지', rarity: 'epic', imageUrl: 'https://example.com/b1.png', description: '설명' } },
      ])
      // 연출 중에도 기존 결과 오버레이는 닫혀 있다
      expect(screen.overlay(after).props.open).toBe(false)
      expect(refreshMock).toHaveBeenCalledTimes(1)
      expect(countOf(after, screen)).toBe(6)

      refreshMock.mockClear()
      ;(screen.panel(after).props.onAgain as () => void)()
      const again = screen.render()
      expect(countOf(again, screen)).toBe(0)
      expect(screen.overlay(again).props.open).toBe(false)
      expect(screen.nav(again).props.title).toBe('등급 UP')
    })

    it('«한 번 더» 뒤에는 다시 제출할 수 있다', async () => {
      const fetchMock = stubFetch(GRANTED_RARE)
      const screen = createScreen()
      screen.openTierUp()
      await screen.submitAll()
      ;(screen.panel(screen.render()).props.onAgain as () => void)()
      await screen.submitAll()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('잠긴 결과는 진동 뒤(onHandoff) 기존 오버레이(가린 카드)가 열리고, 닫으면 고른 배지가 비워진다', async () => {
      stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: '', name: '', rarity: 'epic', imageUrl: null, locked: true }],
      })
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(screen.outcomes()).toEqual([{ kind: 'handoff' }])
      // 무대가 진동을 마치기 전에는 오버레이가 열리지 않는다
      expect(screen.overlay(after).props.open).toBe(false)

      ;(screen.panel(after).props.onHandoff as () => void)()
      const handed = screen.render()
      const overlay = screen.overlay(handed)
      expect(overlay.props.open).toBe(true)
      expect((overlay.props.items as { locked?: boolean }[])[0]).toMatchObject({ locked: true })

      ;(overlay.props.onClose as () => void)()
      expect(countOf(screen.render(), screen)).toBe(0)
    })

    it('빈칸이 모자라면 카드 없이 기존 «받지 않은 믹스 결과» 문구가 진동 뒤 나오고, 닫으면 배너 개수가 서버 값으로 바뀐다', async () => {
      stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'pending',
        resultBadges: [],
        pendingCount: 1,
        freeSlots: 0,
      })
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(screen.outcomes()).toEqual([{ kind: 'handoff' }])
      expect(screen.overlay(after).props.open).toBe(false)

      ;(screen.panel(after).props.onHandoff as () => void)()
      const overlay = screen.overlay(screen.render())
      expect(overlay.props.open).toBe(true)
      expect(overlay.props.items).toEqual([])
      expect(overlay.props.emptyMessage).toBe(d.combine.resultPendingCounts.replace('{count}', '1').replace('{count}', '1').replace('{free}', '0'))
      expect(overlay.props.resultMessage).toBeUndefined()

      ;(overlay.props.onClose as () => void)()
      const closed = screen.render()
      expect(textOf(closed)).toContain('받지 않은 믹스 결과가 1개 있어요')
      expect(countOf(closed, screen)).toBe(0)
      expect(screen.panel(closed).props.pendingBlocked).toBe(true)
    })

    it('잠긴 결과 오버레이의 한 줄은 받은 등급만 말하고, 등급이 없으면 등급을 지어내지 않는다', async () => {
      const locked = {
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: '', name: '', rarity: 'rare', locked: true }],
      }
      stubFetch(locked)
      let screen = createScreen()
      screen.openTierUp()
      let after = await screen.submitAll()
      ;(screen.panel(after).props.onHandoff as () => void)()
      expect(screen.overlay(screen.render()).props.resultMessage).toBe('Rare 아이템 배지를 받았어요')

      hooks.store = []
      navMock.reset()
      markOpenedByPush(false)
      stubFetch({ ...locked, resultBadges: [{ id: '', name: '', locked: true }] })
      screen = createScreen()
      screen.openTierUp()
      after = await screen.submitAll()
      ;(screen.panel(after).props.onHandoff as () => void)()
      expect(screen.overlay(screen.render()).props.resultMessage).toBe('아이템 배지를 받았어요')
    })

    it('결과 배지의 description이 카드 설명으로 들어가고 없으면 빈 문자열이다', () => {
      const cards = toTierUpRevealBadges([
        { id: 'a', name: 'A', rarity: 'rare', description: '설명입니다.' },
        { id: 'b', name: 'B', rarity: 'rare' },
      ])
      expect(cards.map((card) => card.description)).toEqual(['설명입니다.', ''])
    })

    it('잠긴 결과가 오면 이름과 그림 없이 가린 카드로 받는다', () => {
      const cards = toTierUpRevealBadges([{ id: '', name: '', rarity: 'epic', locked: true }])
      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({ name: '', locked: true, rarity: 'epic' })
    })

    it.each([
      ['invalid_materials', 200, { success: false, reason: 'invalid_materials' }],
      ['invalid_count', 400, { success: false, reason: 'invalid_count' }],
    ])('소각 전 거절 %s은 무대를 멈추고 info 토스트로 알리며 고른 배지를 그대로 두고 오버레이를 열지 않는다', async (_name, status, body) => {
      stubFetch(body, { ok: status === 200, status })
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(screen.outcomes()).toEqual([{ kind: 'abort' }])
      expect(toastMock).toHaveBeenCalledTimes(1)
      const [message, tone] = toastMock.mock.calls[0]
      expect(tone).toBe('info')
      expect(message).toContain('넣은 재료는 그대로 있어요')
      expect(screen.overlay(after).props.open).toBe(false)
      expect(countOf(after, screen)).toBe(6)
      expect(refreshMock).not.toHaveBeenCalled()
    })

    it.each([
      ['no_candidate', { success: false, reason: 'no_candidate' }, d.combine.tierUp.noCandidate],
      ['no_candidate(서버 문구)', { success: false, reason: 'no_candidate', message: '서버 문구' }, '서버 문구'],
    ])('%s 거절은 무대를 멈추고 info 토스트로 알리며, 고른 것 하나를 빼고 다시 고르면 다시 제출할 수 있다', async (_name, body, message) => {
      const fetchMock = stubFetch(body)
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(screen.outcomes()).toEqual([{ kind: 'abort' }])
      expect(toastMock).toHaveBeenCalledWith(message, 'info')
      expect(screen.overlay(after).props.open).toBe(false)
      expect(countOf(after, screen)).toBe(6)
      expect(refreshMock).not.toHaveBeenCalled()

      screen.openSheet()
      screen.pick('r6')
      expect(countOf(screen.render(), screen)).toBe(5)
      screen.pick('r6')
      await screen.flush()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('items_not_found는 무대를 멈추고 고른 배지를 비우며 목록을 새로 받는다', async () => {
      stubFetch({ success: false, reason: 'items_not_found', message: d.combine.itemsNotFound })
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(screen.outcomes()).toEqual([{ kind: 'abort' }])
      expect(toastMock).toHaveBeenCalledWith(d.combine.itemsNotFound, 'info')
      expect(countOf(after, screen)).toBe(0)
      expect(refreshMock).toHaveBeenCalledTimes(1)
      expect(screen.overlay(after).props.open).toBe(false)
    })

    it('locked_item_not_allowed(409)는 잠긴 개체 안내를 info 토스트로 알리고 고른 배지를 그대로 둔다', async () => {
      stubFetch(
        { success: false, reason: 'locked_item_not_allowed', code: 'locked_item_not_allowed', message: d.lockedItem.combine },
        { ok: false, status: 409 },
      )
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(toastMock).toHaveBeenCalledWith(d.lockedItem.combine, 'info')
      expect(screen.outcomes()).toEqual([{ kind: 'abort' }])
      expect(countOf(after, screen)).toBe(6)
    })

    it('pending_results_exist(409)는 info 토스트를 내고 배너 개수를 서버에서 다시 읽는다', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === '/api/combine/pending') return { ok: true, status: 200, json: async () => ({ pendingCount: 2, items: [], freeSlots: 0 }) }
        return {
          ok: false,
          status: 409,
          json: async () => ({ success: false, reason: 'pending_results_exist', code: 'pending_results_exist', message: d.combine.pendingResultsExist }),
        }
      })
      vi.stubGlobal('fetch', fetchMock)
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(toastMock).toHaveBeenCalledWith(d.combine.pendingResultsExist, 'info')
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/combine/tier-up', '/api/combine/pending'])
      expect(countOf(after, screen)).toBe(6)
      expect(screen.panel(after).props.pendingBlocked).toBe(true)
    })

    it('이용 정지(403)는 info 토스트다', async () => {
      stubFetch({ error: d.suspension.combineBlocked, code: USER_SUSPENDED_CODE }, { ok: false, status: 403 })
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(toastMock).toHaveBeenCalledWith(d.suspension.combineBlocked, 'info')
      expect(countOf(after, screen)).toBe(6)
      expect(screen.overlay(after).props.open).toBe(false)
    })

    it('네트워크 오류는 무대를 멈추고 error 토스트 d.combine.genericError를 띄우며 고른 배지는 그대로다', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
      const screen = createScreen()
      screen.openTierUp()
      const after = await screen.submitAll()
      expect(screen.outcomes()).toEqual([{ kind: 'abort' }])
      expect(toastMock).toHaveBeenCalledWith(d.combine.genericError, 'error')
      expect(countOf(after, screen)).toBe(6)
    })
  })
})
