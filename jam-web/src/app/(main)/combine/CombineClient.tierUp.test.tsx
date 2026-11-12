/**
 * 믹스 화면의 «등급 올리기» 입구와 화면 (티켓 20261022_2119 3회, 채원 사전 판정 2026-10-23).
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
import TierUpRevealOverlay from '@/components/TierUpRevealOverlay'
import { d } from '@/lib/i18n'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'
import { DEMO_MIX_RECIPE, DEMO_MIX_ITEMS } from '@/lib/onboarding-quest/demo-data'

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

describe('등급 올리기 입구 (탐색 화면)', () => {
  it('검색창보다 위에 있고 아이콘 없이 제목과 부제가 보인다', () => {
    const html = renderToStaticMarkup(
      <CombineClient items={[]} publicRecipes={[DEMO_MIX_RECIPE]} ownedConditionBadgeIds={[]} questStep={null} />,
    )
    expect(html).toContain('등급 올리기')
    expect(html).toContain('같은 등급 6개를 넣고 새 아이템 배지 1개를 받아요')
    expect(html.indexOf('등급 올리기')).toBeLessThan(html.indexOf(d.combine.searchPlaceholder))
    // 오른쪽 화살표(chevron)만 있고 lead(왼쪽 아이콘 칸)와 슬롯 개수 칩은 없다 — 검색창 위 입구 구간만 본다
    const entryHtml = html.slice(0, html.indexOf(d.combine.searchPlaceholder))
    expect(entryHtml).not.toContain('class="ds-list-row-lead"')
    expect(entryHtml).toContain('data-interactive="true"')
    expect(entryHtml).toMatch(/aria-hidden="true" style="[^"]*color:var\(--muted\)"><svg/)
    // 제목은 굵게(700)다
    expect(entryHtml).toMatch(/font-weight:700[^"]*">등급 올리기</)
  })

  it('온보딩 연출 모드에서는 그리지 않는다', () => {
    for (const questStep of ['mix_fail', 'mix_success'] as const) {
      const html = renderToStaticMarkup(
        <CombineClient items={DEMO_MIX_ITEMS} publicRecipes={[DEMO_MIX_RECIPE]} ownedConditionBadgeIds={[]} questStep={questStep} />,
      )
      expect(html).not.toContain('등급 올리기')
    }
  })

  it('레시피가 하나도 없어도 입구는 남는다', () => {
    const html = renderToStaticMarkup(<CombineClient items={[]} publicRecipes={[]} ownedConditionBadgeIds={[]} />)
    expect(html).toContain('등급 올리기')
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

describe('CombineClient 등급 올리기 흐름', () => {
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

  function createScreen(
    options: {
      items?: InventoryItemWithBadge[]
      pendingCount?: number
      questStep?: 'mix_fail' | 'mix_success' | null
    } = {},
  ) {
    const props = {
      items: options.items ?? DEFAULT_ITEMS,
      publicRecipes: [DEMO_MIX_RECIPE],
      ownedConditionBadgeIds: [],
      pendingCount: options.pendingCount ?? 0,
      questStep: options.questStep ?? null,
    }
    const render = () => {
      hooks.cursor = 0
      return CombineClient(props)
    }
    const panel = (tree: ReactNode) => findAll(tree, (el) => el.type === TierUpPanel)[0]
    const entry = (tree: ReactNode) => findAll(tree, (el) => el.type === ListRow)[0]
    const nav = (tree: ReactNode) => findAll(tree, (el) => el.type === TopNav)[0]
    const overlay = (tree: ReactNode) => findAll(tree, (el) => el.type === BadgeRevealOverlay)[0]
    const reveal = (tree: ReactNode) => findAll(tree, (el) => el.type === TierUpRevealOverlay)[0]
    const openTierUp = () => {
      ;(entry(render()).props.onClick as () => void)()
      return render()
    }
    /** 칸을 눌러 시트를 열고 개체를 차례로 담는다 */
    const fill = (ids: string[], firstSlot = 0) => {
      ;(panel(render()).props.onOpenSheet as (i: number) => void)(firstSlot)
      for (const id of ids) {
        ;(panel(render()).props.onPick as (id: string) => void)(id)
      }
      return render()
    }
    const setItems = (next: InventoryItemWithBadge[]) => {
      props.items = next
    }
    /** 재료 6개를 담아 제출 직전까지 만든다 */
    const fillAll = (ids: string[] = FULL) => fill(ids)
    return { render, panel, entry, nav, overlay, reveal, openTierUp, fill, setItems, fillAll }
  }

  const slotIds = (tree: ReactNode, screen: ReturnType<typeof createScreen>) =>
    (screen.panel(tree).props.slots as (InventoryItemWithBadge | null)[]).map((slot) => slot?.id ?? null)

  function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    const fetchMock = vi.fn(async () => ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('입구를 누르면 TopNav가 «등급 올리기»가 되고 등급 올리기 화면이 열리며, 뒤로가기는 탐색 화면으로 돌아온다', () => {
    const screen = createScreen()
    const explore = screen.render()
    expect(screen.nav(explore).props.title).toBe(d.combine.title)
    expect(screen.nav(explore).props.onBack).toBeUndefined()
    expect(screen.panel(explore)).toBeUndefined()

    const opened = screen.openTierUp()
    expect(screen.nav(opened).props.title).toBe('등급 올리기')
    expect(screen.panel(opened)).toBeDefined()
    expect(screen.entry(opened)).toBeUndefined()

    ;(screen.nav(opened).props.onBack as () => void)()
    const back = screen.render()
    expect(screen.nav(back).props.title).toBe(d.combine.title)
    expect(screen.panel(back)).toBeUndefined()
    expect(screen.entry(back)).toBeDefined()
  })

  it('받지 않은 결과가 있어도 입구는 눌리고, 막는 것은 제출 버튼뿐이다', () => {
    const screen = createScreen({ pendingCount: 2 })
    expect(typeof screen.entry(screen.render()).props.onClick).toBe('function')
    const opened = screen.openTierUp()
    expect(screen.panel(opened).props.pendingBlocked).toBe(true)
    const filled = screen.fill(FULL)
    // 담기는 된다
    expect(slotIds(filled, screen)).toEqual(FULL)
    expect(screen.panel(filled).props.pendingBlocked).toBe(true)
  })

  it('처음 열면 6칸이 비어 있고 제출할 수 없다', () => {
    const screen = createScreen()
    const opened = screen.openTierUp()
    expect(slotIds(opened, screen)).toEqual([null, null, null, null, null, null])
    expect(screen.panel(opened).props.canSubmit).toBe(false)
    expect(screen.panel(opened).props.rarityNote).toBeNull()
    expect(screen.panel(opened).props.sheetOpen).toBe(false)
  })

  it('칸을 누르면 시트가 열리고 담을 때마다 다음 빈 칸으로 이어지며, 6칸이 차면 시트가 닫히고 제출할 수 있다', () => {
    const screen = createScreen()
    screen.openTierUp()
    ;(screen.panel(screen.render()).props.onOpenSheet as (i: number) => void)(0)
    expect(screen.panel(screen.render()).props.sheetOpen).toBe(true)

    const picked: string[] = []
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      ;(screen.panel(screen.render()).props.onPick as (id: string) => void)(id)
      picked.push(id)
      const tree = screen.render()
      expect(slotIds(tree, screen).filter(Boolean)).toEqual(picked)
      expect(screen.panel(tree).props.sheetOpen).toBe(true)
      expect(screen.panel(tree).props.canSubmit).toBe(false)
    }
    ;(screen.panel(screen.render()).props.onPick as (id: string) => void)('r6')
    const full = screen.render()
    expect(slotIds(full, screen)).toEqual(FULL)
    expect(screen.panel(full).props.sheetOpen).toBe(false)
    // 재료 6개만으로 제출할 수 있다 — 컬렉션은 고르지 않는다
    expect(screen.panel(full).props.canSubmit).toBe(true)
  })

  it('누른 칸부터 채우고 빈 칸이 앞에 남아 있으면 한 바퀴 돌아 이어서 채운다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2', 'r3', 'r4'], 3)
    expect(slotIds(tree, screen)).toEqual(['r4', null, null, 'r1', 'r2', 'r3'])
    expect(screen.panel(tree).props.sheetOpen).toBe(true)
  })

  it('첫 재료를 담으면 같은 등급만 남고 슬롯 아래 줄에 «지금은 Rare 아이템 배지만 넣을 수 있어요»가 나온다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1'])
    expect(screen.panel(tree).props.rarityNote).toBe('지금은 Rare 아이템 배지만 넣을 수 있어요')
    const sheet = screen.panel(tree).props.sheet as { kind: string; rarity: string; cells: { item: { id: string }; state: string }[] }
    expect(sheet.kind).toBe('locked')
    expect(sheet.rarity).toBe('rare')
    expect(sheet.cells.map((cell) => cell.item.id)).toEqual(FULL)
    expect(sheet.cells[0].state).toBe('used')
  })

  it('다른 등급·6개 미만 묶음·이미 담은 개체는 담기지 않는다', () => {
    const screen = createScreen()
    screen.openTierUp()
    ;(screen.panel(screen.render()).props.onOpenSheet as (i: number) => void)(0)
    const pick = (id: string) => (screen.panel(screen.render()).props.onPick as (id: string) => void)(id)

    pick('c1') // Common은 3개뿐이라 묶음 전체가 비활성
    expect(slotIds(screen.render(), screen)).toEqual([null, null, null, null, null, null])

    pick('r1')
    pick('r1') // 이미 담은 개체
    pick('c2') // 첫 재료를 담은 뒤에는 다른 등급이 막힌다
    pick('m1') // Mystic도 다른 등급이라 막힌다
    expect(slotIds(screen.render(), screen)).toEqual(['r1', null, null, null, null, null])
  })

  it('담은 칸의 ✕로 비우면 그 칸이 다시 빈 칸이 되고, 모두 비우면 등급 고정이 풀린다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2'])
    ;(screen.panel(tree).props.onRemove as (i: number) => void)(0)
    expect(slotIds(screen.render(), screen)).toEqual([null, 'r2', null, null, null, null])
    ;(screen.panel(screen.render()).props.onRemove as (i: number) => void)(1)
    const cleared = screen.render()
    expect(screen.panel(cleared).props.rarityNote).toBeNull()
    expect((screen.panel(cleared).props.sheet as { kind: string }).kind).toBe('groups')
  })

  it('목록에서 사라진 개체는 칸에서 걸러 낸다 — 유령 칸이 생기지 않는다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2', 'r3'])
    expect(slotIds(tree, screen)).toEqual(['r1', 'r2', 'r3', null, null, null])
    screen.setItems(DEFAULT_ITEMS.filter((it) => it.id !== 'r2'))
    const after = screen.render()
    expect(slotIds(after, screen)).toEqual(['r1', null, 'r3', null, null, null])
    expect(screen.panel(after).props.canSubmit).toBe(false)
  })

  it('담을 수 있는 배지가 하나도 없으면 빈 칸이 잠기고 시트는 비어 있으며 안내 블록이 이유를 말한다', () => {
    const screen = createScreen({ items: [item('n1', null)] })
    const opened = screen.openTierUp()
    expect(screen.panel(opened).props.noMaterials).toBe(true)
    expect((screen.panel(opened).props.sheet as { kind: string }).kind).toBe('empty')
    expect(screen.panel(opened).props.showNoEnoughNotice).toBe(true)
    expect(screen.panel(opened).props.canSubmit).toBe(false)
  })

  it('있기는 한데 6개 이상 가진 등급이 없으면 안내 블록이 나오고 칸은 비어 있는(empty) 채다', () => {
    const screen = createScreen({ items: [...many('r', 'rare', 5), ...many('c', 'common', 2)] })
    const opened = screen.openTierUp()
    expect(screen.panel(opened).props.noMaterials).toBe(false)
    expect(screen.panel(opened).props.showNoEnoughNotice).toBe(true)
    expect((screen.panel(opened).props.sheet as { kind: string }).kind).toBe('groups')
  })

  it('6개 이상 가진 등급이 있으면 안내 블록이 없다', () => {
    const screen = createScreen()
    expect(screen.panel(screen.openTierUp()).props.showNoEnoughNotice).toBe(false)
  })

  it('시트를 직접 닫아도 담은 것은 유지된다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2'])
    ;(screen.panel(tree).props.onCloseSheet as () => void)()
    const closed = screen.render()
    expect(screen.panel(closed).props.sheetOpen).toBe(false)
    expect(slotIds(closed, screen)).toEqual(['r1', 'r2', null, null, null, null])
  })

  it('나갔다 다시 들어오면 칸이 비어 있다', () => {
    const screen = createScreen()
    const opened = screen.openTierUp()
    screen.fill(['r1', 'r2'])
    ;(screen.nav(screen.render()).props.onBack as () => void)()
    screen.render()
    expect(slotIds(screen.openTierUp(), screen)).toEqual([null, null, null, null, null, null])
    void opened
  })

  describe('Mystic 재료와 컬렉션 선택 없음', () => {
    it('Mystic을 첫 재료로 담으면 Mystic만 활성이고 안내 줄이 Mystic을 말한다', () => {
      const screen = createScreen()
      screen.openTierUp()
      const tree = screen.fill(['m1'])
      expect(screen.panel(tree).props.rarityNote).toBe('지금은 Mystic 아이템 배지만 넣을 수 있어요')
      const sheet = screen.panel(tree).props.sheet as { kind: string; rarity: string; cells: { item: { id: string }; state: string }[] }
      expect(sheet.kind).toBe('locked')
      expect(sheet.rarity).toBe('mystic')
      expect(sheet.cells.map((cell) => cell.item.id)).toEqual(MYSTIC_FULL)
      expect(sheet.cells.filter((cell) => cell.state === 'active')).toHaveLength(5)
    })

    it('Mystic 6개를 담으면 제출할 수 있다', () => {
      const screen = createScreen()
      screen.openTierUp()
      const full = screen.fill(MYSTIC_FULL)
      expect(slotIds(full, screen)).toEqual(MYSTIC_FULL)
      expect(screen.panel(full).props.sheetOpen).toBe(false)
      expect(screen.panel(full).props.canSubmit).toBe(true)
    })

    it('Mystic을 담은 뒤 다른 등급은 담기지 않는다', () => {
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['m1', 'r1', 'c1'])
      expect(slotIds(screen.render(), screen)).toEqual(['m1', null, null, null, null, null])
    })

    it('Mystic만 6개 이상 가진 경우에도 «6개 이상 가진 등급이 없어요» 안내가 나오지 않는다', () => {
      const screen = createScreen({ items: MYSTIC6 })
      const opened = screen.openTierUp()
      expect(screen.panel(opened).props.noMaterials).toBe(false)
      expect(screen.panel(opened).props.showNoEnoughNotice).toBe(false)
    })

    it('등급 올리기 화면에는 컬렉션을 고르는 props가 없다', () => {
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
    async function submit(screen: ReturnType<typeof createScreen>) {
      await (screen.panel(screen.render()).props.onSubmit as () => Promise<void>)()
      return screen.render()
    }

    it('요청 본문은 {itemIds} 6개뿐이고 collectionId가 없으며 /api/combine/tier-up을 부른다', async () => {
      const fetchMock = stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'rare', imageUrl: 'https://example.com/b1.png' }],
      })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      await submit(screen)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('/api/combine/tier-up')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ itemIds: FULL })
      // 컬렉션 id와 확률 숫자는 본문에 없다
      expect(Object.keys(JSON.parse(init.body as string))).toEqual(['itemIds'])
    })

    it('Mystic 6개도 같은 본문으로 제출하고, 결과가 Mystic이면 «윗등급» 문구 없이 같은 등급 문구를 받는다', async () => {
      const fetchMock = stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'mystic',
        resultStatus: 'granted',
        resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'mystic' }],
      })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll(MYSTIC_FULL)
      const after = await submit(screen)
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(JSON.parse(init.body as string)).toEqual({ itemIds: MYSTIC_FULL })
      const message = screen.overlay(after).props.resultMessage as string
      expect(message).toBe('Mystic 아이템 배지를 받았어요')
      expect(message).not.toContain('윗등급')
    })

    it('6개가 차기 전에는 요청을 보내지 않는다', async () => {
      const fetchMock = stubFetch({})
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['r1', 'r2', 'r3', 'r4', 'r5'])
      await submit(screen)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('받지 않은 결과가 있으면 6개를 채워도 요청을 보내지 않는다', async () => {
      const fetchMock = stubFetch({})
      const screen = createScreen({ pendingCount: 1 })
      screen.openTierUp()
      screen.fillAll()
      await submit(screen)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('제출 중에는 submitting이 켜져 같은 요청을 두 번 보내지 않는다', async () => {
      let release: (value: unknown) => void = () => {}
      const fetchMock = vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const first = (screen.panel(screen.render()).props.onSubmit as () => Promise<void>)()
      const during = screen.render()
      expect(screen.panel(during).props.submitting).toBe(true)
      void (screen.panel(during).props.onSubmit as () => Promise<void>)()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      release({ ok: true, status: 200, json: async () => ({ success: false, reason: 'no_candidate' }) })
      await first
      expect(screen.panel(screen.render()).props.submitting).toBe(false)
    })

    it('바로 지급되면 새 연출 오버레이가 열리고 기존 오버레이는 닫혀 있으며, 확인하면 칸만 비워진 채 같은 화면에 남는다', async () => {
      stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [
          { id: 'b1', name: '새 배지', rarity: 'epic', imageUrl: 'https://example.com/b1.png', description: '첫 문장입니다. 둘째 문장입니다.' },
        ],
      })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      expect(screen.reveal(screen.render()).props.open).toBe(false)
      const after = await submit(screen)

      // 두 오버레이가 동시에 열리지 않는다
      expect(screen.overlay(after).props.open).toBe(false)
      const reveal = screen.reveal(after)
      expect(reveal.props.open).toBe(true)
      expect(reveal.props.result).toEqual({
        name: '새 배지',
        rarity: 'epic',
        imageUrl: 'https://example.com/b1.png',
        description: '첫 문장입니다. 둘째 문장입니다.',
      })
      expect(refreshMock).toHaveBeenCalledTimes(1)
      // 확률 링크는 결과 화면에 두지 않는다
      expect(JSON.stringify(reveal.props)).not.toContain('/probability')

      refreshMock.mockClear()
      ;(reveal.props.onConfirm as () => void)()
      const closed = screen.render()
      expect(screen.reveal(closed).props.open).toBe(false)
      expect(screen.overlay(closed).props.open).toBe(false)
      expect(screen.panel(closed)).toBeDefined()
      expect(slotIds(closed, screen)).toEqual([null, null, null, null, null, null])
      expect(screen.nav(closed).props.title).toBe('등급 올리기')
    })

    it('옛 응답처럼 description이 없으면 설명 없음으로 연출을 연다', async () => {
      stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'rare' }],
      })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const reveal = screen.reveal(await submit(screen))
      expect(reveal.props.open).toBe(true)
      expect(reveal.props.result).toMatchObject({ name: '새 배지', description: null })
    })

    it('잠긴 결과는 새 연출 대신 기존 오버레이(가린 카드)가 열린다', async () => {
      stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: '', name: '', rarity: 'epic', imageUrl: null, locked: true }],
      })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(screen.reveal(after).props.open).toBe(false)
      const overlay = screen.overlay(after)
      expect(overlay.props.open).toBe(true)
      expect((overlay.props.items as { locked?: boolean }[])[0]).toMatchObject({ locked: true })

      ;(overlay.props.onClose as () => void)()
      expect(slotIds(screen.render(), screen)).toEqual([null, null, null, null, null, null])
    })

    it('받지 않은 결과(pending)는 새 연출을 열지 않는다', async () => {
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
      screen.fillAll()
      const after = await submit(screen)
      expect(screen.reveal(after).props.open).toBe(false)
      expect(screen.overlay(after).props.open).toBe(true)
    })

    it('같은 등급이 나오면 받은 등급만 말하고, 등급이 없으면 등급을 지어내지 않는다', async () => {
      const same = {
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'rare' }],
      }
      stubFetch(same)
      let screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      expect(screen.overlay(await submit(screen)).props.resultMessage).toBe('Rare 아이템 배지를 받았어요')

      hooks.store = []
      navMock.reset()
      markOpenedByPush(false)
      stubFetch({ ...same, resultBadges: [{ id: 'b1', name: '새 배지' }] })
      screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      expect(screen.overlay(await submit(screen)).props.resultMessage).toBe('아이템 배지를 받았어요')
    })

    it('빈칸이 모자라면 카드 없이 기존 «받지 않은 믹스 결과» 문구가 나오고, 닫으면 배너 개수가 서버 값으로 바뀐다', async () => {
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
      screen.fillAll()
      const after = await submit(screen)
      const overlay = screen.overlay(after)
      expect(overlay.props.open).toBe(true)
      expect(overlay.props.items).toEqual([])
      expect(overlay.props.emptyMessage).toBe(d.combine.resultPendingCounts.replace('{count}', '1').replace('{count}', '1').replace('{free}', '0'))
      expect(overlay.props.resultMessage).toBeUndefined()

      ;(overlay.props.onClose as () => void)()
      const closed = screen.render()
      expect(textOf(closed)).toContain('받지 않은 믹스 결과가 1개 있어요')
      expect(slotIds(closed, screen)).toEqual([null, null, null, null, null, null])
      // 막힌 이유가 제출 버튼 곁에 보인다
      expect(screen.panel(closed).props.pendingBlocked).toBe(true)
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
    ])('소각 전 거절 %s은 info 토스트로 알리고 칸을 그대로 두며 오버레이를 열지 않는다', async (_name, status, body) => {
      stubFetch(body, { ok: status === 200, status })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledTimes(1)
      const [message, tone] = toastMock.mock.calls[0]
      expect(tone).toBe('info')
      expect(message).toContain('넣은 재료는 그대로 있어요')
      expect(screen.overlay(after).props.open).toBe(false)
      expect(slotIds(after, screen)).toEqual(FULL)
      expect(refreshMock).not.toHaveBeenCalled()
    })

    it.each([
      ['no_candidate', { success: false, reason: 'no_candidate' }, d.combine.tierUp.noCandidate],
      ['no_candidate(서버 문구)', { success: false, reason: 'no_candidate', message: '서버 문구' }, '서버 문구'],
    ])('%s 거절은 info 토스트로 알리고 담은 칸을 그대로 두며 제출을 다시 할 수 있다', async (_name, body, message) => {
      stubFetch(body)
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledTimes(1)
      expect(toastMock).toHaveBeenCalledWith(message, 'info')
      expect(screen.overlay(after).props.open).toBe(false)
      expect(slotIds(after, screen)).toEqual(FULL)
      expect(screen.panel(after).props.canSubmit).toBe(true)
      expect(refreshMock).not.toHaveBeenCalled()
    })

    it('items_not_found는 칸을 비우고 목록을 새로 받는다', async () => {
      stubFetch({ success: false, reason: 'items_not_found', message: d.combine.itemsNotFound })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledWith(d.combine.itemsNotFound, 'info')
      expect(slotIds(after, screen)).toEqual([null, null, null, null, null, null])
      expect(refreshMock).toHaveBeenCalledTimes(1)
      expect(screen.overlay(after).props.open).toBe(false)
    })

    it('locked_item_not_allowed(409)는 잠긴 개체 안내를 info 토스트로 알리고 칸을 그대로 둔다', async () => {
      stubFetch(
        { success: false, reason: 'locked_item_not_allowed', code: 'locked_item_not_allowed', message: d.lockedItem.combine },
        { ok: false, status: 409 },
      )
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledWith(d.lockedItem.combine, 'info')
      expect(slotIds(after, screen)).toEqual(FULL)
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
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledWith(d.combine.pendingResultsExist, 'info')
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/combine/tier-up', '/api/combine/pending'])
      expect(slotIds(after, screen)).toEqual(FULL)
      expect(screen.panel(after).props.pendingBlocked).toBe(true)
    })

    it('이용 정지(403)는 info 토스트다', async () => {
      stubFetch({ error: d.suspension.combineBlocked, code: USER_SUSPENDED_CODE }, { ok: false, status: 403 })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledWith(d.suspension.combineBlocked, 'info')
      expect(slotIds(after, screen)).toEqual(FULL)
      expect(screen.overlay(after).props.open).toBe(false)
    })

    it('네트워크 오류는 error 토스트 d.combine.genericError이고 칸은 그대로다', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledWith(d.combine.genericError, 'error')
      expect(slotIds(after, screen)).toEqual(FULL)
      expect(screen.panel(after).props.submitting).toBe(false)
    })
  })
})
