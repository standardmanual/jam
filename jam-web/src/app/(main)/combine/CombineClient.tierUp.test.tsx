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

const hooks = vi.hoisted(() => ({
  active: false,
  store: [] as unknown[],
  cursor: 0,
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
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: refreshMock }),
  usePathname: () => '/combine',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

import CombineClient, { toTierUpRevealBadges, type InventoryItemWithBadge } from './CombineClient'
import TierUpPanel from './TierUpPanel'
import ListRowCard from '@/components/ui/ListRowCard'
import TopNav from '@/components/ui/TopNav'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import type { TierUpCollectionOption, TierUpCollectionView } from './tierUpClient'
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

const RARE5 = many('r', 'rare', 5)
const DEFAULT_ITEMS = [...RARE5, ...many('c', 'common', 3), item('m1', 'mystic')]
/** 일부러 이름 순서를 섞었다 — 화면은 가나다순으로 보인다 */
const COLLECTIONS: TierUpCollectionOption[] = [
  { id: 'col-b', name: '나무 컬렉션', imageUrl: 'https://example.com/b.png', rarities: ['rare', 'epic'] },
  { id: 'col-c', name: '다람쥐 컬렉션', imageUrl: null, rarities: ['common', 'rare'] },
  { id: 'col-a', name: '가을 컬렉션', imageUrl: null, rarities: ['common', 'rare', 'epic', 'mystic'] },
]
const FULL = ['r1', 'r2', 'r3', 'r4', 'r5']

describe('등급 올리기 입구 (탐색 화면)', () => {
  it('검색창보다 위에 있고 아이콘 없이 제목과 부제가 보인다', () => {
    const html = renderToStaticMarkup(
      <CombineClient items={[]} publicRecipes={[DEMO_MIX_RECIPE]} ownedConditionBadgeIds={[]} questStep={null} />,
    )
    expect(html).toContain('등급 올리기')
    expect(html).toContain('같은 등급 5개를 넣고 새 아이템 배지 1개를 받아요')
    expect(html.indexOf('등급 올리기')).toBeLessThan(html.indexOf(d.combine.searchPlaceholder))
    // 오른쪽 화살표만 있고 장식 아이콘 칸(왼쪽)은 없다
    expect(html).not.toMatch(/<div class="shrink-0"><svg/)
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

  it('입구 부제는 말줄임 없이 줄바꿈하고 한국어 줄바꿈 클래스를 쓴다', () => {
    const html = renderToStaticMarkup(<CombineClient items={[]} publicRecipes={[]} ownedConditionBadgeIds={[]} />)
    const subtitle = html.match(/<p class="[^"]*">같은 등급 5개를 넣고 새 아이템 배지 1개를 받아요<\/p>/)
    expect(subtitle).not.toBeNull()
    expect(subtitle![0]).toContain('break-keep')
    expect(subtitle![0]).toContain('wrap-break-word')
    expect(subtitle![0]).toContain('text-pretty')
    expect(subtitle![0]).not.toContain('truncate')
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
      /** 생략하면 COLLECTIONS, null은 «읽지 못했다» */
      collections?: TierUpCollectionOption[] | null
    } = {},
  ) {
    const props = {
      items: options.items ?? DEFAULT_ITEMS,
      publicRecipes: [DEMO_MIX_RECIPE],
      ownedConditionBadgeIds: [],
      pendingCount: options.pendingCount ?? 0,
      questStep: options.questStep ?? null,
      tierUpCollections: options.collections === undefined ? COLLECTIONS : options.collections,
    }
    const render = () => {
      hooks.cursor = 0
      return CombineClient(props)
    }
    const panel = (tree: ReactNode) => findAll(tree, (el) => el.type === TierUpPanel)[0]
    const entry = (tree: ReactNode) => findAll(tree, (el) => el.type === ListRowCard)[0]
    const nav = (tree: ReactNode) => findAll(tree, (el) => el.type === TopNav)[0]
    const overlay = (tree: ReactNode) => findAll(tree, (el) => el.type === BadgeRevealOverlay)[0]
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
    const setCollections = (next: TierUpCollectionOption[] | null) => {
      props.tierUpCollections = next
    }
    /** 컬렉션 행을 눌러 시트를 연다 */
    const openCollectionSheet = () => {
      ;(panel(render()).props.onOpenCollectionSheet as () => void)()
      return render()
    }
    /** 시트의 줄을 눌러 컬렉션을 고른다(시트는 그 자리에서 닫힌다) */
    const pickCollection = (id: string) => {
      ;(panel(render()).props.onPickCollection as (id: string) => void)(id)
      return render()
    }
    /** 재료 5개를 담고 컬렉션을 시트에서 골라 제출 직전까지 만든다 */
    const fillAll = (ids: string[] = FULL, collectionId = 'col-a') => {
      fill(ids)
      openCollectionSheet()
      return pickCollection(collectionId)
    }
    return { render, panel, entry, nav, overlay, openTierUp, fill, setItems, setCollections, openCollectionSheet, pickCollection, fillAll }
  }

  const collectionView = (tree: ReactNode, screen: ReturnType<typeof createScreen>) => screen.panel(tree).props.collection as TierUpCollectionView

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
    const filled = screen.fill(['r1', 'r2', 'r3', 'r4', 'r5'])
    // 담기는 된다
    expect(slotIds(filled, screen)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(screen.panel(filled).props.pendingBlocked).toBe(true)
  })

  it('처음 열면 5칸이 비어 있고 제출할 수 없다', () => {
    const screen = createScreen()
    const opened = screen.openTierUp()
    expect(slotIds(opened, screen)).toEqual([null, null, null, null, null])
    expect(screen.panel(opened).props.canSubmit).toBe(false)
    expect(screen.panel(opened).props.rarityNote).toBeNull()
    expect(screen.panel(opened).props.sheetOpen).toBe(false)
  })

  it('칸을 누르면 시트가 열리고 담을 때마다 다음 빈 칸으로 이어지며, 5칸이 차면 시트가 닫히고 제출할 수 있다', () => {
    const screen = createScreen()
    screen.openTierUp()
    ;(screen.panel(screen.render()).props.onOpenSheet as (i: number) => void)(0)
    expect(screen.panel(screen.render()).props.sheetOpen).toBe(true)

    const picked: string[] = []
    for (const id of ['r1', 'r2', 'r3', 'r4']) {
      ;(screen.panel(screen.render()).props.onPick as (id: string) => void)(id)
      picked.push(id)
      const tree = screen.render()
      expect(slotIds(tree, screen).filter(Boolean)).toEqual(picked)
      expect(screen.panel(tree).props.sheetOpen).toBe(true)
      expect(screen.panel(tree).props.canSubmit).toBe(false)
    }
    ;(screen.panel(screen.render()).props.onPick as (id: string) => void)('r5')
    const full = screen.render()
    expect(slotIds(full, screen)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(screen.panel(full).props.sheetOpen).toBe(false)
    // 재료 5개만으로는 제출할 수 없다 — 컬렉션도 골라야 한다
    expect(screen.panel(full).props.canSubmit).toBe(false)
    screen.openCollectionSheet()
    expect(screen.panel(screen.pickCollection('col-a')).props.canSubmit).toBe(true)
  })

  it('누른 칸부터 채우고 빈 칸이 앞에 남아 있으면 한 바퀴 돌아 이어서 채운다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2', 'r3'], 3)
    expect(slotIds(tree, screen)).toEqual(['r3', null, null, 'r1', 'r2'])
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
    expect(sheet.cells.map((cell) => cell.item.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(sheet.cells[0].state).toBe('used')
  })

  it('다른 등급·5개 미만 묶음·Mystic·이미 담은 개체는 담기지 않는다', () => {
    const screen = createScreen()
    screen.openTierUp()
    ;(screen.panel(screen.render()).props.onOpenSheet as (i: number) => void)(0)
    const pick = (id: string) => (screen.panel(screen.render()).props.onPick as (id: string) => void)(id)

    pick('c1') // Common은 3개뿐이라 묶음 전체가 비활성
    pick('m1') // Mystic은 시트에 없다
    expect(slotIds(screen.render(), screen)).toEqual([null, null, null, null, null])

    pick('r1')
    pick('r1') // 이미 담은 개체
    pick('c2') // 첫 재료를 담은 뒤에는 다른 등급이 막힌다
    expect(slotIds(screen.render(), screen)).toEqual(['r1', null, null, null, null])
  })

  it('담은 칸의 ✕로 비우면 그 칸이 다시 빈 칸이 되고, 모두 비우면 등급 고정이 풀린다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2'])
    ;(screen.panel(tree).props.onRemove as (i: number) => void)(0)
    expect(slotIds(screen.render(), screen)).toEqual([null, 'r2', null, null, null])
    ;(screen.panel(screen.render()).props.onRemove as (i: number) => void)(1)
    const cleared = screen.render()
    expect(screen.panel(cleared).props.rarityNote).toBeNull()
    expect((screen.panel(cleared).props.sheet as { kind: string }).kind).toBe('groups')
  })

  it('목록에서 사라진 개체는 칸에서 걸러 낸다 — 유령 칸이 생기지 않는다', () => {
    const screen = createScreen()
    screen.openTierUp()
    const tree = screen.fill(['r1', 'r2', 'r3'])
    expect(slotIds(tree, screen)).toEqual(['r1', 'r2', 'r3', null, null])
    screen.setItems(DEFAULT_ITEMS.filter((it) => it.id !== 'r2'))
    const after = screen.render()
    expect(slotIds(after, screen)).toEqual(['r1', null, 'r3', null, null])
    expect(screen.panel(after).props.canSubmit).toBe(false)
  })

  it('담을 수 있는 배지가 하나도 없으면 빈 칸이 잠기고 시트는 비어 있으며 안내 블록이 이유를 말한다', () => {
    const screen = createScreen({ items: [item('m1', 'mystic'), item('n1', null)] })
    const opened = screen.openTierUp()
    expect(screen.panel(opened).props.noMaterials).toBe(true)
    expect((screen.panel(opened).props.sheet as { kind: string }).kind).toBe('empty')
    expect(screen.panel(opened).props.showNoEnoughNotice).toBe(true)
    expect(screen.panel(opened).props.canSubmit).toBe(false)
  })

  it('있기는 한데 5개 이상 가진 등급이 없으면 안내 블록이 나오고 칸은 비어 있는(empty) 채다', () => {
    const screen = createScreen({ items: [...many('r', 'rare', 4), ...many('c', 'common', 2)] })
    const opened = screen.openTierUp()
    expect(screen.panel(opened).props.noMaterials).toBe(false)
    expect(screen.panel(opened).props.showNoEnoughNotice).toBe(true)
    expect((screen.panel(opened).props.sheet as { kind: string }).kind).toBe('groups')
  })

  it('5개 이상 가진 등급이 있으면 안내 블록이 없다', () => {
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
    expect(slotIds(closed, screen)).toEqual(['r1', 'r2', null, null, null])
  })

  it('나갔다 다시 들어오면 칸이 비어 있다', () => {
    const screen = createScreen()
    const opened = screen.openTierUp()
    screen.fill(['r1', 'r2'])
    ;(screen.nav(screen.render()).props.onBack as () => void)()
    screen.render()
    expect(slotIds(screen.openTierUp(), screen)).toEqual([null, null, null, null, null])
    void opened
  })

  describe('받을 컬렉션 고르기', () => {
    const names = (view: TierUpCollectionView) => (view.kind === 'ready' ? view.choices.map((choice) => choice.name) : [])

    it('처음 열면 재료가 없어 needMaterial이고 컬렉션 시트는 열 수 없다', () => {
      const screen = createScreen()
      const opened = screen.openTierUp()
      expect(collectionView(opened, screen)).toEqual({ kind: 'needMaterial' })
      expect(screen.panel(opened).props.collectionSheetOpen).toBe(false)
      screen.openCollectionSheet()
      expect(screen.panel(screen.render()).props.collectionSheetOpen).toBe(false)
    })

    it('첫 재료를 담으면 ready(미선택)가 되고, 목록은 재료 등급의 바로 위 등급과 같은 등급이 모두 있는 컬렉션만 가나다순이다', () => {
      const screen = createScreen()
      screen.openTierUp()
      // Rare 재료: Rare와 Epic이 모두 있는 컬렉션 - 가을, 나무. 다람쥐(Common·Rare)는 윗등급이 없어 빠진다
      const tree = screen.fill(['r1'])
      const view = collectionView(tree, screen)
      expect(view).toMatchObject({ kind: 'ready', selectedId: null })
      expect(names(view)).toEqual(['가을 컬렉션', '나무 컬렉션'])
      expect(screen.panel(tree).props.canSubmit).toBe(false)
    })

    it('행을 누르면 시트가 열리고, 줄을 누르면 컬렉션이 선택되며 시트가 바로 닫힌다', () => {
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['r1'])
      // 첫 재료 뒤 재료 시트는 계속 열려 있다 - 컬렉션 시트를 열면 재료 시트가 닫힌다(동시에 열리지 않는다)
      expect(screen.panel(screen.render()).props.sheetOpen).toBe(true)
      const sheetOpened = screen.openCollectionSheet()
      expect(screen.panel(sheetOpened).props.collectionSheetOpen).toBe(true)
      expect(screen.panel(sheetOpened).props.sheetOpen).toBe(false)

      const picked = screen.pickCollection('col-b')
      expect(screen.panel(picked).props.collectionSheetOpen).toBe(false)
      expect(collectionView(picked, screen)).toMatchObject({ kind: 'ready', selectedId: 'col-b' })
    })

    it('시트를 다시 열면 고른 줄이 selectedId로 내려가고, 직접 닫아도 선택은 유지된다', () => {
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['r1'])
      screen.openCollectionSheet()
      screen.pickCollection('col-a')
      const reopened = screen.openCollectionSheet()
      expect(collectionView(reopened, screen)).toMatchObject({ selectedId: 'col-a' })
      ;(screen.panel(reopened).props.onCloseCollectionSheet as () => void)()
      const closed = screen.render()
      expect(screen.panel(closed).props.collectionSheetOpen).toBe(false)
      expect(collectionView(closed, screen)).toMatchObject({ selectedId: 'col-a' })
    })

    it('재료 시트를 열면 컬렉션 시트가 닫힌다 - 두 시트는 동시에 열리지 않는다', () => {
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['r1'])
      screen.openCollectionSheet()
      expect(screen.panel(screen.render()).props.collectionSheetOpen).toBe(true)
      ;(screen.panel(screen.render()).props.onOpenSheet as (i: number) => void)(1)
      const tree = screen.render()
      expect(screen.panel(tree).props.sheetOpen).toBe(true)
      expect(screen.panel(tree).props.collectionSheetOpen).toBe(false)
    })

    it('지금 목록에 없는 id는 선택되지 않는다', () => {
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['r1'])
      screen.openCollectionSheet()
      // 다람쥐(col-c)는 Rare 재료의 목록에 없다
      const tree = screen.pickCollection('col-c')
      expect(collectionView(tree, screen)).toMatchObject({ selectedId: null })
      expect(screen.panel(tree).props.collectionSheetOpen).toBe(true)
    })

    it('재료 등급이 바뀌어 고른 컬렉션이 새 등급의 목록에 없으면 조용히 미선택으로 돌아가고 제출할 수 없다', async () => {
      const fetchMock = stubFetch({})
      const items = [...RARE5, ...many('c', 'common', 5)]
      const screen = createScreen({ items })
      screen.openTierUp()
      screen.fill(['r1'])
      screen.openCollectionSheet()
      screen.pickCollection('col-b') // 나무: Rare·Epic - Rare 재료에서만 유효
      // 재료를 모두 빼 등급이 풀린 뒤 Common 5개를 채운다
      ;(screen.panel(screen.render()).props.onRemove as (i: number) => void)(0)
      const filled = screen.fill(['c1', 'c2', 'c3', 'c4', 'c5'])
      expect(names(collectionView(filled, screen))).toEqual(['가을 컬렉션', '다람쥐 컬렉션'])
      expect(collectionView(filled, screen)).toMatchObject({ selectedId: null })
      expect(screen.panel(filled).props.canSubmit).toBe(false)
      await (screen.panel(filled).props.onSubmit as () => Promise<void>)()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('새 등급의 목록에도 있는 컬렉션이면 선택이 유지된다', () => {
      const items = [...RARE5, ...many('c', 'common', 5)]
      const screen = createScreen({ items })
      screen.openTierUp()
      screen.fill(['r1'])
      screen.openCollectionSheet()
      screen.pickCollection('col-a') // 가을: 모든 등급
      ;(screen.panel(screen.render()).props.onRemove as (i: number) => void)(0)
      const filled = screen.fill(['c1', 'c2', 'c3', 'c4', 'c5'])
      expect(collectionView(filled, screen)).toMatchObject({ kind: 'ready', selectedId: 'col-a' })
      expect(screen.panel(filled).props.canSubmit).toBe(true)
    })

    it('이 등급으로 고를 컬렉션이 없으면 none(등급)이고 시트는 열 수 없으며 제출할 수 없다', () => {
      // Epic 5개 - 목록의 컬렉션(나무)에는 Mystic이 없어 고를 수 있는 컬렉션이 없다
      const items = [...many('e', 'epic', 5), ...RARE5]
      const screen = createScreen({ items, collections: [COLLECTIONS[0]] })
      screen.openTierUp()
      const tree = screen.fill(['e1'])
      expect(collectionView(tree, screen)).toEqual({ kind: 'none', rarity: 'epic' })
      screen.openCollectionSheet()
      expect(screen.panel(screen.render()).props.collectionSheetOpen).toBe(false)
      expect(screen.panel(screen.fill(['e2', 'e3', 'e4', 'e5'])).props.canSubmit).toBe(false)
    })

    it('트라이브가 없거나 열린 컬렉션이 0개여도(빈 배열) none이다 - 읽지 못한 것과 다르다', () => {
      const screen = createScreen({ collections: [] })
      screen.openTierUp()
      expect(collectionView(screen.fill(['r1']), screen)).toEqual({ kind: 'none', rarity: 'rare' })
    })

    it('목록을 읽지 못했으면(null) error이고 재료를 채워도 제출할 수 없으며, 다시 불러오기는 목록을 새로 받되 담은 칸을 지우지 않는다', async () => {
      const fetchMock = stubFetch({})
      const screen = createScreen({ collections: null })
      const opened = screen.openTierUp()
      expect(collectionView(opened, screen)).toEqual({ kind: 'error' })
      const filled = screen.fill(FULL)
      expect(collectionView(filled, screen)).toEqual({ kind: 'error' })
      expect(screen.panel(filled).props.canSubmit).toBe(false)
      await (screen.panel(filled).props.onSubmit as () => Promise<void>)()
      expect(fetchMock).not.toHaveBeenCalled()

      refreshMock.mockClear()
      ;(screen.panel(filled).props.onRetryCollections as () => void)()
      expect(refreshMock).toHaveBeenCalledTimes(1)
      expect(slotIds(screen.render(), screen)).toEqual(FULL)
      // 서버가 새로 내려준 목록이 오면 곧바로 고를 수 있다
      screen.setCollections(COLLECTIONS)
      expect(collectionView(screen.render(), screen)).toMatchObject({ kind: 'ready', selectedId: null })
    })

    it('제출 중에는 컬렉션 시트를 열 수 없다', async () => {
      let release: (value: unknown) => void = () => {}
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise((resolve) => {
              release = resolve
            }),
        ),
      )
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const first = (screen.panel(screen.render()).props.onSubmit as () => Promise<void>)()
      const during = screen.render()
      expect(screen.panel(during).props.submitting).toBe(true)
      ;(screen.panel(during).props.onOpenCollectionSheet as () => void)()
      expect(screen.panel(screen.render()).props.collectionSheetOpen).toBe(false)
      release({ ok: true, status: 200, json: async () => ({ success: false, reason: 'invalid_materials' }) })
      await first
    })

    it('받지 않은 결과가 있어도 행은 고를 수 있다 - 막는 것은 제출 버튼뿐이다', () => {
      const screen = createScreen({ pendingCount: 1 })
      screen.openTierUp()
      screen.fill(['r1'])
      screen.openCollectionSheet()
      const tree = screen.pickCollection('col-a')
      expect(collectionView(tree, screen)).toMatchObject({ kind: 'ready', selectedId: 'col-a' })
      expect(screen.panel(tree).props.pendingBlocked).toBe(true)
    })

    it('탐색 화면에는 컬렉션 행이 없다 - 등급 올리기 화면에서만 나온다', () => {
      const html = renderToStaticMarkup(
        <CombineClient items={DEFAULT_ITEMS} publicRecipes={[]} ownedConditionBadgeIds={[]} tierUpCollections={COLLECTIONS} />,
      )
      expect(html).not.toContain('받을 컬렉션')
    })
  })

  describe('제출', () => {
    async function submit(screen: ReturnType<typeof createScreen>) {
      await (screen.panel(screen.render()).props.onSubmit as () => Promise<void>)()
      return screen.render()
    }

    it('요청 본문은 {itemIds, collectionId}이고 /api/combine/tier-up을 부른다', async () => {
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
      expect(JSON.parse(init.body as string)).toEqual({ itemIds: FULL, collectionId: 'col-a' })
      // 확률 숫자는 본문에도 없다
      expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual(['collectionId', 'itemIds'])
    })

    it('재료 5개가 차도 컬렉션을 고르지 않았으면 요청을 보내지 않는다', async () => {
      const fetchMock = stubFetch({})
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(FULL)
      await submit(screen)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('결과를 받은 뒤 같은 화면에 머무는 동안은 고른 컬렉션이 유지된다 — 칸만 비워진다', async () => {
      stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'epic' }],
      })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll(FULL, 'col-b')
      const after = await submit(screen)
      ;(screen.overlay(after).props.onClose as () => void)()
      const closed = screen.render()
      expect(slotIds(closed, screen)).toEqual([null, null, null, null, null])
      // 재료가 비면 행은 needMaterial로 보이고 이전 선택을 그리지 않는다
      expect(collectionView(closed, screen)).toEqual({ kind: 'needMaterial' })
      // 첫 재료를 넣는 순간 유효한 선택이 다시 나타난다
      const refilled = screen.fill(['r1'])
      expect(collectionView(refilled, screen)).toMatchObject({ kind: 'ready', selectedId: 'col-b' })
    })

    it('화면을 나갔다 다시 들어오면 고른 컬렉션이 비워져 있다', () => {
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll(FULL, 'col-b')
      ;(screen.nav(screen.render()).props.onBack as () => void)()
      screen.render()
      screen.openTierUp()
      const refilled = screen.fill(['r1'])
      expect(collectionView(refilled, screen)).toMatchObject({ kind: 'ready', selectedId: null })
    })

    it('5개가 차기 전에는 요청을 보내지 않는다', async () => {
      const fetchMock = stubFetch({})
      const screen = createScreen()
      screen.openTierUp()
      screen.fill(['r1', 'r2'])
      await submit(screen)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('받지 않은 결과가 있으면 5개를 채워도 요청을 보내지 않는다', async () => {
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

    it('바로 지급되면 카드 1장과 윗등급/같은 등급 문구로 결과 오버레이가 열리고, 닫으면 칸만 비워진 채 같은 화면에 남는다', async () => {
      stubFetch({
        success: true,
        path: 'tier_up',
        materialRarity: 'rare',
        resultStatus: 'granted',
        resultBadges: [{ id: 'b1', name: '새 배지', rarity: 'epic', imageUrl: 'https://example.com/b1.png' }],
      })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)

      const overlay = screen.overlay(after)
      expect(overlay.props.open).toBe(true)
      const cards = overlay.props.items as { id: string; name: string; imageUrl?: string | null; rarity?: string | null }[]
      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({ id: 'b1', name: '새 배지', imageUrl: 'https://example.com/b1.png', rarity: 'epic' })
      expect(overlay.props.resultMessage).toBe('윗등급이 나왔어요! Epic 아이템 배지를 받았어요')
      expect(refreshMock).toHaveBeenCalledTimes(1)
      // 확률 링크는 결과 화면에 두지 않는다
      expect(JSON.stringify(overlay.props)).not.toContain('/probability')

      refreshMock.mockClear()
      ;(overlay.props.onClose as () => void)()
      const closed = screen.render()
      expect(screen.overlay(closed).props.open).toBe(false)
      expect(screen.panel(closed)).toBeDefined()
      expect(slotIds(closed, screen)).toEqual([null, null, null, null, null])
      expect(screen.nav(closed).props.title).toBe('등급 올리기')
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
      expect(slotIds(closed, screen)).toEqual([null, null, null, null, null])
      // 막힌 이유가 제출 버튼 곁에 보인다
      expect(screen.panel(closed).props.pendingBlocked).toBe(true)
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
      ['invalid_collection', { success: false, reason: 'invalid_collection' }, '지금은 고를 수 없는 컬렉션이에요. 넣은 재료는 그대로 있어요. 다른 컬렉션을 골라 주세요.'],
      ['no_candidate', { success: false, reason: 'no_candidate' }, d.combine.tierUp.noCandidate],
      ['invalid_collection(서버 문구)', { success: false, reason: 'invalid_collection', message: '서버 문구' }, '서버 문구'],
    ])('%s 거절은 info 토스트로 알리고 담은 칸은 그대로, 고른 컬렉션만 풀며 목록을 다시 읽는다', async (_name, body, message) => {
      stubFetch(body)
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledTimes(1)
      expect(toastMock).toHaveBeenCalledWith(message, 'info')
      expect(screen.overlay(after).props.open).toBe(false)
      expect(slotIds(after, screen)).toEqual(FULL)
      expect(collectionView(after, screen)).toMatchObject({ kind: 'ready', selectedId: null })
      expect(screen.panel(after).props.canSubmit).toBe(false)
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })

    it('items_not_found는 칸을 비우고 목록을 새로 받는다', async () => {
      stubFetch({ success: false, reason: 'items_not_found', message: d.combine.itemsNotFound })
      const screen = createScreen()
      screen.openTierUp()
      screen.fillAll()
      const after = await submit(screen)
      expect(toastMock).toHaveBeenCalledWith(d.combine.itemsNotFound, 'info')
      expect(slotIds(after, screen)).toEqual([null, null, null, null, null])
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
