/**
 * 시험용 작은 훅 실행기 — 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 훅을 바꿔 컴포넌트 함수를 직접 부른다 (티켓 20261028_1740 3회)
 *
 * `CapsuleResultOverlay.test.tsx`가 쓰는 방식을 여러 시험이 나눠 쓰도록 뽑았다. 상태 갱신은 즉시 다시 그리고(렌더 중 갱신은 그리기를 한 번 더 한다),
 * 효과는 의존 값이 바뀐 것만 정리 함수를 부른 뒤 다시 돌린다. 시험 파일에서는 이렇게 쓴다.
 *
 *   vi.mock('react', async (importOriginal) => (await import('./hookRunner')).mockReact(await importOriginal<typeof import('react')>()))
 *
 * 한 번에 컴포넌트 하나만 올린다(`mount`).
 */
import type { ReactElement } from 'react'

interface Slot {
  value?: unknown
  ready?: boolean
  deps?: readonly unknown[]
  cleanup?: void | (() => void)
}
interface Pending {
  slot: Slot
  fn: () => void | (() => void)
}

export const rt = {
  slots: [] as Slot[],
  cursor: 0,
  layout: [] as Pending[],
  passive: [] as Pending[],
  rendering: false,
  dirty: false,
  component: null as null | ((props: never) => ReactElement | null),
  props: null as unknown,
  tree: null as unknown,
}

function slotAt(): Slot {
  const slot = (rt.slots[rt.cursor] ??= {})
  rt.cursor += 1
  return slot
}
function depsChanged(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  return !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]))
}
function effectHook(list: () => Pending[]) {
  return (fn: () => void | (() => void), deps?: readonly unknown[]) => {
    const slot = slotAt()
    if (depsChanged(slot.deps, deps)) {
      slot.deps = deps
      list().push({ slot, fn })
    }
  }
}
function memoHook<T>(factory: () => T, deps: readonly unknown[]): T {
  const slot = slotAt()
  if (!slot.ready || depsChanged(slot.deps, deps)) {
    slot.ready = true
    slot.deps = deps
    slot.value = factory()
  }
  return slot.value as T
}

function runPending(list: Pending[]) {
  for (const { slot, fn } of list) {
    if (typeof slot.cleanup === 'function') slot.cleanup()
    slot.cleanup = fn()
  }
}

function renderNow() {
  if (rt.rendering) {
    rt.dirty = true
    return
  }
  rt.rendering = true
  try {
    do {
      rt.dirty = false
      rt.cursor = 0
      rt.layout = []
      rt.passive = []
      rt.tree = (rt.component as (props: unknown) => ReactElement | null)(rt.props)
      runPending(rt.layout)
      runPending(rt.passive)
    } while (rt.dirty)
  } finally {
    rt.rendering = false
  }
}

/** `vi.mock('react', …)`의 본문 — 원래 모듈에 훅만 바꿔 얹는다 */
export function mockReact<T extends object>(actual: T): T {
  return {
    ...actual,
    useState: (init: unknown) => {
      const slot = slotAt()
      let setter = (slot as Slot & { setter?: (next: unknown) => void }).setter
      if (!slot.ready) {
        slot.ready = true
        slot.value = typeof init === 'function' ? (init as () => unknown)() : init
        setter = (next: unknown) => {
          slot.value = typeof next === 'function' ? (next as (prev: unknown) => unknown)(slot.value) : next
          renderNow()
        }
        ;(slot as Slot & { setter?: (next: unknown) => void }).setter = setter
      }
      return [slot.value, setter]
    },
    useRef: (init: unknown) => {
      const slot = slotAt()
      slot.value ??= { current: init }
      return slot.value
    },
    useCallback: (fn: unknown, deps: readonly unknown[]) => memoHook(() => fn, deps),
    useMemo: memoHook,
    useEffect: effectHook(() => rt.passive),
    useLayoutEffect: effectHook(() => rt.layout),
  } as T
}

/** 컴포넌트를 올리고 첫 그리기와 효과까지 돌린다 */
export function mount<P>(component: (props: P) => ReactElement | null, props: P) {
  rt.slots = []
  rt.component = component as unknown as (props: never) => ReactElement | null
  rt.props = props
  rt.tree = null
  renderNow()
}

/** 새 props로 다시 그린다(레이아웃이 새 값을 내려주는 경우) */
export function rerender<P>(props: P) {
  rt.props = props
  renderNow()
}

export function unmount() {
  for (const slot of rt.slots) if (typeof slot.cleanup === 'function') slot.cleanup()
  rt.slots = []
  rt.component = null
  rt.tree = null
}

/** 마이크로태스크(효과 안에서 미룬 setState)를 모두 흘려보낸다 */
export async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function walk(node: unknown, visit: (element: ReactElement<Record<string, unknown>>) => void) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  if (!node || typeof node !== 'object' || !('props' in node)) return
  const element = node as ReactElement<Record<string, unknown>>
  visit(element)
  walk(element.props.children, visit)
}

/** 마지막으로 그린 트리에서 조건에 맞는 요소를 모두 찾는다 */
export function findAll(predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = []
  walk(rt.tree, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}
