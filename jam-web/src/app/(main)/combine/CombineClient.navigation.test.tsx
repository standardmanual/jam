/**
 * 믹스 화면의 레시피 상세·등급 올리기 개별 URL (티켓 20261110_1215).
 *
 * 화면 상태의 원천이 주소(`?recipe=<ID>`, `?view=tier-up`)라서 `next/navigation`을 «주소·history를 흉내 내는 모의»로 바꾸고,
 * `CombineClient.tierUp.test.tsx`와 같은 방식(`useState`·`useMemo`·`useEffect`만 손으로 돌림)으로 컴포넌트 함수를 직접 불러 검증한다.
 * 열기=push, 닫기=back(목록에서 연 경우)·replace(주소로 바로 열린 경우), 잘못된 ID=목록+주소 정리, view=tier-up 우선.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const refreshMock = vi.hoisted(() => vi.fn())

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
  useToast: () => ({ toast: vi.fn() }),
}))

import TopNav from '@/components/ui/TopNav'
import { ListRow } from '@/components/ui/ListRow'
import { DEMO_MIX_RECIPE } from '@/lib/onboarding-quest/demo-data'
import { markOpenedByPush } from '@/lib/combine/navigation'
import CombineClient, { type RecipeWithSlots } from './CombineClient'
import RecipeRewardRow from './RecipeRewardRow'
import TierUpPanel from './TierUpPanel'

type AnyElement = ReactElement<Record<string, unknown>>

function findAll(node: ReactNode, predicate: (el: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, predicate, found))
  } else if (isValidElement(node)) {
    const el = node as AnyElement
    if (predicate(el)) found.push(el)
    findAll(el.props.children as ReactNode, predicate, found)
  }
  return found
}

const RECIPE_A: RecipeWithSlots = { ...DEMO_MIX_RECIPE, id: 'recipe-a' }
const RECIPE_B: RecipeWithSlots = { ...DEMO_MIX_RECIPE, id: 'recipe-b' }

function createScreen(options: { questStep?: 'mix_fail' | 'mix_success' | null; recipes?: RecipeWithSlots[] } = {}) {
  const props = {
    items: [],
    publicRecipes: options.recipes ?? [RECIPE_A, RECIPE_B],
    ownedConditionBadgeIds: [],
    questStep: options.questStep ?? null,
  }
  const render = () => {
    hooks.cursor = 0
    hooks.effects = []
    return CombineClient(props)
  }
  /** 렌더 뒤 등록된 효과를 실행한다(주소 정리 등). */
  const runEffects = () => {
    for (const effect of hooks.effects) effect()
  }
  const topNav = (tree: ReactNode) => findAll(tree, (el) => el.type === TopNav)[0]
  const onBack = (tree: ReactNode) => topNav(tree).props.onBack as (() => void) | undefined
  const listRows = (tree: ReactNode) => findAll(tree, (el) => el.type === RecipeRewardRow)
  const tierUpEntry = (tree: ReactNode) => findAll(tree, (el) => el.type === ListRow)[0]
  const tierUpPanel = (tree: ReactNode) => findAll(tree, (el) => el.type === TierUpPanel)[0]
  return { render, runEffects, onBack, listRows, tierUpEntry, tierUpPanel }
}

describe('CombineClient — 레시피 상세·등급 올리기 개별 URL (티켓 20261110_1215)', () => {
  beforeEach(() => {
    hooks.active = true
    hooks.store = []
    navMock.reset()
    markOpenedByPush(false)
  })

  afterEach(() => {
    hooks.active = false
  })

  it('목록에서 레시피를 열면 /combine?recipe=<ID>로 push하고 상세 화면이 나온다', () => {
    const screen = createScreen()
    expect(screen.onBack(screen.render())).toBeUndefined() // 목록에서는 기본 뒤로가기(라우트 이탈)
    ;(screen.listRows(screen.render())[1].props.onClick as () => void)()

    expect(navMock.push).toHaveBeenCalledWith('/combine?recipe=recipe-b')
    expect(navMock.replace).not.toHaveBeenCalled()
    const detail = screen.render()
    expect(typeof screen.onBack(detail)).toBe('function')
    expect(screen.listRows(detail)).toHaveLength(1) // 요약 행 하나(목록 화면이 아니다)
  })

  it('push로 연 상세에서 TopNav 뒤로가기를 누르면 router.back()으로 목록에 돌아간다', () => {
    const screen = createScreen()
    ;(screen.listRows(screen.render())[0].props.onClick as () => void)()
    screen.onBack(screen.render())!()

    expect(navMock.back).toHaveBeenCalledTimes(1)
    expect(navMock.replace).not.toHaveBeenCalled()
    expect(screen.onBack(screen.render())).toBeUndefined()
    expect(screen.listRows(screen.render())).toHaveLength(2)
  })

  it('링크·새로고침으로 바로 연 상세는 같은 레시피가 열리고, 뒤로가기는 replace("/combine")이다', () => {
    navMock.openDirect('recipe=recipe-b')
    const screen = createScreen()
    const detail = screen.render()
    expect(typeof screen.onBack(detail)).toBe('function')
    expect(screen.listRows(detail)).toHaveLength(1)

    screen.onBack(detail)!()
    expect(navMock.replace).toHaveBeenCalledWith('/combine')
    expect(navMock.back).not.toHaveBeenCalled()
    expect(screen.onBack(screen.render())).toBeUndefined()
  })

  it('공개 목록에 없는 레시피 ID는 목록 화면을 보여 주고 주소를 /combine으로 정리한다', () => {
    navMock.openDirect('recipe=ended-recipe')
    const screen = createScreen()
    const tree = screen.render()
    expect(screen.onBack(tree)).toBeUndefined()
    expect(screen.listRows(tree)).toHaveLength(2)

    screen.runEffects()
    expect(navMock.replace).toHaveBeenCalledWith('/combine')
    expect(navMock.search()).toBe('')
  })

  it('정상 주소에서는 주소 정리 replace를 부르지 않는다', () => {
    navMock.openDirect('recipe=recipe-a')
    const screen = createScreen()
    screen.render()
    screen.runEffects()
    expect(navMock.replace).not.toHaveBeenCalled()
  })

  it('등급 올리기를 열면 /combine?view=tier-up으로 push하고, 뒤로가기는 back이다', () => {
    const screen = createScreen()
    ;(screen.tierUpEntry(screen.render()).props.onClick as () => void)()
    expect(navMock.push).toHaveBeenCalledWith('/combine?view=tier-up')

    const panel = screen.render()
    expect(screen.tierUpPanel(panel)).toBeDefined()
    screen.onBack(panel)!()
    expect(navMock.back).toHaveBeenCalledTimes(1)
    expect(screen.tierUpPanel(screen.render())).toBeUndefined()
  })

  it('?view=tier-up으로 바로 열면 등급 올리기가 열리고 뒤로가기는 replace("/combine")이다', () => {
    navMock.openDirect('view=tier-up')
    const screen = createScreen()
    const tree = screen.render()
    expect(screen.tierUpPanel(tree)).toBeDefined()
    screen.onBack(tree)!()
    expect(navMock.replace).toHaveBeenCalledWith('/combine')
    expect(navMock.back).not.toHaveBeenCalled()
  })

  it('recipe와 view=tier-up이 같이 있으면 등급 올리기가 이긴다', () => {
    navMock.openDirect('recipe=recipe-a&view=tier-up')
    const screen = createScreen()
    const tree = screen.render()
    expect(screen.tierUpPanel(tree)).toBeDefined()
    screen.runEffects()
    expect(navMock.replace).not.toHaveBeenCalled()
  })

  it('온보딩 퀘스트 연출 모드도 연출 레시피 ID를 주소에 싣고 같은 상세로 이어진다', () => {
    const screen = createScreen({ questStep: 'mix_fail', recipes: [DEMO_MIX_RECIPE] })
    const row = screen.listRows(screen.render())[0]
    expect(String(row.props.className)).toContain('jam-quest-pulse')
    ;(row.props.onClick as () => void)()

    expect(navMock.push).toHaveBeenCalledWith(`/combine?recipe=${encodeURIComponent(DEMO_MIX_RECIPE.id)}`)
    const detail = screen.render()
    expect(typeof screen.onBack(detail)).toBe('function')
    expect(screen.listRows(detail)).toHaveLength(1)
  })
})
