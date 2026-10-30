/**
 * 합친 연출 오버레이 (티켓 20261028_1740 1회, 채원 사전 판정)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 훅을 작은 실행기로 바꿔 컴포넌트 함수를 직접 부르고,
 * 모은 효과를 손으로 돌린다(`ChapterRiseWatcher.test.tsx`와 같은 방식을 상태 갱신까지 이어 붙였다). DOM 요소는 가짜로 대신한다.
 * 첫 마크업은 `renderToStaticMarkup`으로 읽는다. 화면에서 퍼짐·디졸브가 실제로 부드러운지는 브라우저 실렌더로 따로 본다.
 *
 * 고정하는 것: 두 제목 종류 × 보상 유무 네 조합 / 버튼 구성 / 콜백 호출 순서와 횟수 / Escape / 포커스 이동과 Tab 순환 /
 * 모션 줄이기 경로 / z-index 60과 body 포털 / 스크롤 잠금·탭바 숨김이 열릴 때 걸리고 닫힐 때 풀림 / 한국어 리터럴·16진수 없음.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleResultOverlay.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { Button } from '@ds/components/buttons/Button'

// ─── 훅 실행기 ────────────────────────────────────────────────────────────────

interface Slot {
  value?: unknown
  ready?: boolean
  deps?: readonly unknown[]
  cleanup?: void | (() => void)
  setter?: (next: unknown) => void
}
interface Pending {
  slot: Slot
  fn: () => void | (() => void)
}

const rt = {
  slots: [] as Slot[],
  cursor: 0,
  layout: [] as Pending[],
  passive: [] as Pending[],
  rendering: false,
  dirty: false,
  dialog: null as null | ((props: unknown) => ReactElement),
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

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (init: unknown) => {
      const slot = slotAt()
      if (!slot.ready) {
        slot.ready = true
        slot.value = typeof init === 'function' ? (init as () => unknown)() : init
        slot.setter = (next) => {
          slot.value = typeof next === 'function' ? (next as (prev: unknown) => unknown)(slot.value) : next
          renderNow()
        }
      }
      return [slot.value, slot.setter]
    },
    useRef: (init: unknown) => {
      const slot = slotAt()
      slot.value ??= { current: init }
      return slot.value
    },
    useCallback: (fn: unknown, deps: readonly unknown[]) => {
      const slot = slotAt()
      if (depsChanged(slot.deps, deps)) {
        slot.deps = deps
        slot.value = fn
      }
      return slot.value
    },
    useEffect: effectHook(() => rt.passive),
    useLayoutEffect: effectHook(() => rt.layout),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
})
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, createPortal: (children: unknown, container: unknown) => ({ portal: true, children, container }) }
})

const motion = { reduced: false }
vi.mock('@/lib/motion', () => ({ prefersReducedMotion: () => motion.reduced }))
const releaseScroll = vi.fn()
const releaseTabBar = vi.fn()
const pushMainScrollLock = vi.fn(() => releaseScroll)
const pushTabBarHidden = vi.fn(() => releaseTabBar)
vi.mock('@/lib/uiOverlay', () => ({
  pushMainScrollLock: () => pushMainScrollLock(),
  pushTabBarHidden: () => pushTabBarHidden(),
}))

import CapsuleResultOverlay, { nextTrapIndex } from './CapsuleResultOverlay'
import { buildCapsuleResultView, type CapsuleResultView } from '@/lib/capsule/result-overlay-model'
import { d } from '@/lib/i18n'

// ─── 가짜 DOM ────────────────────────────────────────────────────────────────

class FakeElement {
  focus = vi.fn(() => {
    fakeDocument.activeElement = this
  })
}
interface Animation {
  keyframes: unknown
  options: { duration: number; easing?: string; fill?: string }
  cancel: ReturnType<typeof vi.fn>
  finish: () => void
}
function fakeAnimator() {
  const animations: Animation[] = []
  const animate = vi.fn((keyframes: unknown, options: Animation['options']) => {
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const animation = { keyframes, options, cancel: vi.fn(), finish, finished }
    animations.push(animation)
    return animation
  })
  return { animate, animations }
}

const ROOT_RECT = { left: 485, top: 0, width: 430, height: 800 }
const ORIGIN = { top: 300, left: 520, width: 200, height: 72, circle: 66 }

let keyListeners: ((event: Partial<KeyboardEvent>) => void)[]
let fakeDocument: { activeElement: unknown; body: object; addEventListener: unknown; removeEventListener: unknown }
let fakes: {
  root: { animate: ReturnType<typeof fakeAnimator>['animate']; getBoundingClientRect: () => typeof ROOT_RECT; anim: Animation[] }
  bg: { animate: ReturnType<typeof fakeAnimator>['animate']; anim: Animation[] }
  bolt: { animate: ReturnType<typeof fakeAnimator>['animate']; style: Record<string, string>; anim: Animation[] }
  actions: { querySelectorAll: () => FakeElement[]; querySelector: () => FakeElement | null; pointerButtons: FakeElement[] }
}
let previousFocus: FakeElement

function walk(node: unknown, visit: (element: ReactElement) => void) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  if (!node || typeof node !== 'object' || !('props' in node)) return
  const element = node as ReactElement<{ children?: unknown }>
  visit(element)
  walk(element.props.children, visit)
}
function findAll(predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = []
  walk(rt.tree, (element) => {
    if (predicate(element as ReactElement<Record<string, unknown>>)) found.push(element as ReactElement<Record<string, unknown>>)
  })
  return found
}
const buttonElements = () => findAll((element) => element.type === Button)
const click = (button: ReactElement<Record<string, unknown>>) => (button.props.onClick as () => void)()

function attachRefs() {
  const byAttribute: [string, unknown][] = [
    ['data-capsule-result', fakes.root],
    ['data-capsule-result-bg', fakes.bg],
    ['data-capsule-result-bolt', fakes.bolt],
    ['data-capsule-result-actions', fakes.actions],
  ]
  walk(rt.tree, (element) => {
    const props = element.props as Record<string, unknown>
    const ref = props.ref as { current: unknown } | undefined
    if (!ref || ref.current) return
    for (const [attribute, fake] of byAttribute) if (attribute in props) ref.current = fake
  })
  fakes.actions.pointerButtons.length = 0
  buttonElements().forEach(() => fakes.actions.pointerButtons.push(new FakeElement()))
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
      rt.tree = (rt.dialog as (props: unknown) => ReactElement)(rt.props)
      attachRefs()
      runPending(rt.layout)
      runPending(rt.passive)
    } while (rt.dirty)
  } finally {
    rt.rendering = false
  }
}
function unmount() {
  for (const slot of rt.slots) if (typeof slot.cleanup === 'function') slot.cleanup()
}

// ─── 준비 ────────────────────────────────────────────────────────────────────

const callbacks = { onViewRewards: vi.fn(), onDismiss: vi.fn(), onClosed: vi.fn() }
const order: string[] = []

type Item = { id: string }
function viewOf(chapter: number | null, rewards: boolean): CapsuleResultView {
  const view = buildCapsuleResultView<Item, string>(
    [{ openId: 'o1', items: rewards ? [{ id: 'a' }] : [], reachedChapters: chapter === null ? [] : [chapter] }],
    []
  )
  return view as CapsuleResultView
}

/** 오버레이를 열고 포털 안쪽 대화상자를 실행기에 올린다 */
function open(view: CapsuleResultView) {
  const portal = CapsuleResultOverlay({ view, origin: ORIGIN, ...callbacks }) as unknown as {
    portal: boolean
    children: ReactElement<unknown> & { type: (props: unknown) => ReactElement }
    container: unknown
  }
  rt.dialog = portal.children.type
  rt.props = portal.children.props
  renderNow()
  return portal
}

function key(name: string, extra: Partial<KeyboardEvent> = {}) {
  const event = { key: name, preventDefault: vi.fn(), shiftKey: false, ...extra }
  for (const listener of [...keyListeners]) listener(event)
  return event
}
const reveal = () => vi.advanceTimersByTime(504)
const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
const rootStyle = () => (findAll((element) => 'data-capsule-result' in element.props)[0].props.style as Record<string, unknown>)
const actionStyle = () => (findAll((element) => 'data-capsule-result-actions' in element.props)[0].props.style as Record<string, unknown>)
const html = () => renderToStaticMarkup(rt.tree as ReactElement)

beforeEach(() => {
  vi.useFakeTimers()
  rt.slots = []
  rt.tree = null
  motion.reduced = false
  keyListeners = []
  order.length = 0
  for (const fn of [callbacks.onViewRewards, callbacks.onDismiss, callbacks.onClosed, pushMainScrollLock, pushTabBarHidden, releaseScroll, releaseTabBar]) {
    fn.mockReset()
  }
  pushMainScrollLock.mockImplementation(() => releaseScroll)
  pushTabBarHidden.mockImplementation(() => releaseTabBar)
  callbacks.onViewRewards.mockImplementation(() => order.push('viewRewards'))
  callbacks.onDismiss.mockImplementation(() => order.push('dismiss'))
  callbacks.onClosed.mockImplementation(() => order.push('closed'))

  const root = fakeAnimator()
  const bg = fakeAnimator()
  const bolt = fakeAnimator()
  fakes = {
    root: { animate: root.animate, getBoundingClientRect: () => ROOT_RECT, anim: root.animations },
    bg: { animate: bg.animate, anim: bg.animations },
    bolt: { animate: bolt.animate, style: {}, anim: bolt.animations },
    actions: {
      pointerButtons: [],
      querySelectorAll: () => fakes.actions.pointerButtons,
      querySelector: () => fakes.actions.pointerButtons[0] ?? null,
    },
  }
  previousFocus = new FakeElement()
  fakeDocument = {
    activeElement: previousFocus,
    body: { name: 'body' },
    addEventListener: (type: string, listener: (event: Partial<KeyboardEvent>) => void) => {
      if (type === 'keydown') keyListeners.push(listener)
    },
    removeEventListener: (type: string, listener: (event: Partial<KeyboardEvent>) => void) => {
      if (type === 'keydown') keyListeners = keyListeners.filter((l) => l !== listener)
    },
  }
  vi.stubGlobal('document', fakeDocument)
  vi.stubGlobal('HTMLElement', FakeElement)
})

afterEach(() => {
  unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ─── 시험 ────────────────────────────────────────────────────────────────────

describe('제목 종류와 보상 유무 네 조합', () => {
  const cases = [
    { name: '챕터 오름 + 보상 있음', chapter: 4, rewards: true },
    { name: '챕터 오름 + 보상 없음', chapter: 4, rewards: false },
    { name: '가득 참 + 보상 있음', chapter: null, rewards: true },
    { name: '가득 참 + 보상 없음', chapter: null, rewards: false },
  ]

  it.each(cases)('$name', ({ chapter, rewards }) => {
    open(viewOf(chapter, rewards))
    const markup = html()

    if (chapter === null) {
      expect(markup).toContain(`>${d.capsule.result.title}</h2>`)
      expect(markup).not.toContain(d.chapter.rise.cheer)
      expect(markup).toContain(`aria-label="${d.capsule.result.announceFull}"`)
    } else {
      expect(markup).toContain(`>${d.chapter.rise.cheer}</p>`)
      expect(markup).toContain('>챕터 4에 올랐어요</h2>')
      expect(markup).toContain('aria-label="축하해요! 챕터 4에 올랐어요"')
    }

    expect(markup.includes(d.capsule.result.viewRewards)).toBe(rewards)
    expect(markup).toContain(`>${d.common.close}</button>`)
    expect(buttonElements()).toHaveLength(rewards ? 2 : 1)
  })

  it('버튼 위계: 보상이 있으면 «획득한 배지 보기»가 secondary, «닫기»가 outline이고 둘 다 폭을 채운다', () => {
    open(viewOf(4, true))
    const [first, second] = buttonElements()
    expect(first.props).toMatchObject({ variant: 'secondary', fullWidth: true })
    expect(second.props).toMatchObject({ variant: 'outline', fullWidth: true })
  })

  it('보상이 없으면 «닫기»만 secondary로 낸다', () => {
    open(viewOf(null, false))
    expect(buttonElements().map((b) => b.props.variant)).toEqual(['secondary'])
  })

  it('숫자는 챕터 번호뿐이다(퍼센트·점수·보상 개수·등급이 없다)', () => {
    open(viewOf(12, true))
    const text = html().replace(/<[^>]*>/g, ' ').replace(/aria-label="[^"]*"/g, '')
    expect(text.match(/\d+/g)).toEqual(['12'])
    expect(text).not.toMatch(/%|\+\d|Epic|Rare|Mystic|Common/)
  })

  it('제목·응원 줄은 큰 굵은 글자이고 흰 글자 토큰을 쓴다. 한국어 줄바꿈 클래스가 붙는다', () => {
    open(viewOf(4, true))
    const markup = html()
    expect(markup).toContain('--capsule-fill-foreground')
    expect(markup.match(/break-keep wrap-break-word text-balance/g)?.length).toBe(2)
    expect(markup).toContain('text-xl font-bold')
    expect(markup).toContain('text-3xl font-bold')
    expect(markup).toContain('var(--capsule-fill)')
  })
})

describe('레이어와 접근성', () => {
  it('document.body 포털이다', () => {
    const portal = open(viewOf(4, true))
    expect(portal.container).toBe(fakeDocument.body)
  })

  it('z-index 60, 430px 컬럼 맞춤, 100dvh, role=dialog, aria-modal', () => {
    open(viewOf(4, true))
    expect(rootStyle()).toMatchObject({ zIndex: 60, maxWidth: 430, marginLeft: 'auto', marginRight: 'auto', height: '100dvh' })
    const markup = html()
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('overflow-y-auto')
    expect(markup).toContain('--spacing-safe-bottom')
    expect(markup).not.toMatch(/\d\s*vh/)
  })

  it('열릴 때 스크롤 잠금과 탭바 숨김이 한 번씩 걸리고 닫힐 때 풀린다', () => {
    open(viewOf(4, true))
    expect(pushMainScrollLock).toHaveBeenCalledTimes(1)
    expect(pushTabBarHidden).toHaveBeenCalledTimes(1)
    expect(releaseScroll).not.toHaveBeenCalled()
    expect(releaseTabBar).not.toHaveBeenCalled()

    reveal()
    unmount()

    expect(releaseScroll).toHaveBeenCalledTimes(1)
    expect(releaseTabBar).toHaveBeenCalledTimes(1)
  })

  it('닫히면 열기 전에 포커스가 있던 자리로 돌아간다', () => {
    open(viewOf(4, true))
    reveal()
    expect(previousFocus.focus).not.toHaveBeenCalled()
    unmount()
    expect(previousFocus.focus).toHaveBeenCalledTimes(1)
  })

  it('키 입력 리스너는 닫힐 때 걷히고, 단계가 바뀌어도 하나만 붙어 있다', () => {
    open(viewOf(4, true))
    expect(keyListeners).toHaveLength(1)
    reveal()
    expect(keyListeners).toHaveLength(1)
    unmount()
    expect(keyListeners).toHaveLength(0)
  })
})

describe('퍼짐 → 문구 → 디졸브', () => {
  it('퍼지는 동안은 버튼이 눌리지 않고, 퍼짐이 70% 진행되면 문구와 버튼이 나온다', () => {
    open(viewOf(4, true))
    expect(actionStyle()).toMatchObject({ pointerEvents: 'none', opacity: 0 })

    // 버튼을 눌러도 아무 일이 없다
    click(buttonElements()[0])
    expect(callbacks.onViewRewards).not.toHaveBeenCalled()
    expect(callbacks.onDismiss).not.toHaveBeenCalled()

    vi.advanceTimersByTime(503)
    expect(actionStyle()).toMatchObject({ pointerEvents: 'none' })
    vi.advanceTimersByTime(1)
    expect(actionStyle()).toMatchObject({ pointerEvents: 'auto', opacity: 1 })
  })

  it('오렌지는 루트 기준 자리에서 시작해 720ms 동안 퍼진다(뷰포트 좌표에서 루트의 왼쪽 위를 뺀다)', () => {
    open(viewOf(4, true))
    expect(fakes.bg.animate).toHaveBeenCalledTimes(1)
    const [{ keyframes, options }] = fakes.bg.anim
    expect(options).toMatchObject({ duration: 720, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' })
    // left 520 - 485 = 35, right 430 - 35 - 200 = 195, bottom 800 - 300 - 72 = 428, round 72 / 2
    expect((keyframes as { clipPath: string }[])[0].clipPath).toBe('inset(300px 195px 428px 35px round 36px)')
    expect((keyframes as { clipPath: string }[])[1].clipPath).toBe('inset(0px 0px 0px 0px round 0px)')
  })

  it('번개는 게이지 자리에 놓이고 퍼짐과 함께 420ms 동안 2.4배로 커지며 사라진다', () => {
    open(viewOf(4, true))
    expect(fakes.bolt.style).toMatchObject({ left: '169px', top: '303px', width: '66px', height: '66px' })
    const [{ keyframes, options }] = fakes.bolt.anim
    expect(options.duration).toBe(420)
    expect(keyframes).toEqual([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(2.4)' },
    ])
  })

  it('첫 버튼으로 포커스가 옮겨진다 — 보상이 있으면 «획득한 배지 보기», 없으면 «닫기»', () => {
    open(viewOf(4, true))
    expect(fakes.actions.pointerButtons[0].focus).not.toHaveBeenCalled()
    reveal()
    expect(fakes.actions.pointerButtons[0].focus).toHaveBeenCalledTimes(1)
    expect(fakes.actions.pointerButtons[1].focus).not.toHaveBeenCalled()
  })

  it('«닫기»: onDismiss가 한 번 불리고 650ms 디졸브 뒤에 onClosed가 한 번 불린다', async () => {
    open(viewOf(4, true))
    reveal()

    click(buttonElements()[1])
    expect(order).toEqual(['dismiss'])
    expect(callbacks.onViewRewards).not.toHaveBeenCalled()
    expect(fakes.root.anim).toHaveLength(1)
    expect(fakes.root.anim[0].options).toMatchObject({ duration: 650, easing: 'ease-in-out', fill: 'forwards' })
    expect(fakes.root.anim[0].keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(actionStyle()).toMatchObject({ pointerEvents: 'none' })

    await flushMicrotasks()
    expect(callbacks.onClosed).not.toHaveBeenCalled()
    fakes.root.anim[0].finish()
    await flushMicrotasks()
    expect(order).toEqual(['dismiss', 'closed'])
  })

  it('«획득한 배지 보기»: onViewRewards → onDismiss → (디졸브 뒤) onClosed 순서로 한 번씩 불린다', async () => {
    open(viewOf(4, true))
    reveal()

    click(buttonElements()[0])
    expect(order).toEqual(['viewRewards', 'dismiss'])
    fakes.root.anim[0].finish()
    await flushMicrotasks()
    expect(order).toEqual(['viewRewards', 'dismiss', 'closed'])
  })

  it('닫기 시작 뒤 다시 눌러도 콜백이 늘지 않는다', async () => {
    open(viewOf(4, true))
    reveal()

    const [view, close] = buttonElements()
    click(view)
    click(close)
    click(buttonElements()[0])
    key('Escape')
    fakes.root.anim[0].finish()
    await flushMicrotasks()

    expect(callbacks.onViewRewards).toHaveBeenCalledTimes(1)
    expect(callbacks.onDismiss).toHaveBeenCalledTimes(1)
    expect(callbacks.onClosed).toHaveBeenCalledTimes(1)
    expect(fakes.root.anim).toHaveLength(1)
  })

  it('디졸브 도중 내려가면 onClosed가 불리지 않는다', async () => {
    open(viewOf(4, false))
    reveal()
    click(buttonElements()[0])
    unmount()
    fakes.root.anim[0].finish()
    await flushMicrotasks()
    expect(fakes.root.anim[0].cancel).toHaveBeenCalled()
    expect(callbacks.onClosed).not.toHaveBeenCalled()
  })

  it('부모가 새 콜백을 넘겨도 최신 콜백이 불린다', () => {
    open(viewOf(4, false))
    reveal()
    const latest = vi.fn()
    rt.props = { ...(rt.props as object), onDismiss: latest }
    renderNow()
    click(buttonElements()[0])
    expect(latest).toHaveBeenCalledTimes(1)
    expect(callbacks.onDismiss).not.toHaveBeenCalled()
  })
})

describe('키보드', () => {
  it('Escape는 «닫기»와 같다 — onDismiss만 한 번 부르고 기본 동작을 막는다', () => {
    open(viewOf(4, true))
    reveal()
    const event = key('Escape')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(order).toEqual(['dismiss'])
    expect(callbacks.onViewRewards).not.toHaveBeenCalled()
  })

  it('퍼지는 동안 Escape는 아무것도 닫지 않는다', () => {
    open(viewOf(4, true))
    key('Escape')
    expect(callbacks.onDismiss).not.toHaveBeenCalled()
  })

  it('Tab은 두 버튼 사이를 순환하고 오버레이 밖으로 나가지 않는다', () => {
    open(viewOf(4, true))
    reveal()
    const [first, second] = fakes.actions.pointerButtons
    expect(fakeDocument.activeElement).toBe(first)

    expect(key('Tab').preventDefault).toHaveBeenCalled()
    expect(fakeDocument.activeElement).toBe(second)
    key('Tab')
    expect(fakeDocument.activeElement).toBe(first)
    key('Tab', { shiftKey: true })
    expect(fakeDocument.activeElement).toBe(second)
    key('Tab', { shiftKey: true })
    expect(fakeDocument.activeElement).toBe(first)
  })

  it('포커스가 버튼 밖에 있다가 Tab을 누르면 첫 버튼으로 들어온다', () => {
    open(viewOf(4, true))
    reveal()
    fakeDocument.activeElement = new FakeElement()
    key('Tab')
    expect(fakeDocument.activeElement).toBe(fakes.actions.pointerButtons[0])
  })

  it('버튼이 하나면 Tab이 그 버튼에 머문다', () => {
    open(viewOf(null, false))
    reveal()
    key('Tab')
    expect(fakeDocument.activeElement).toBe(fakes.actions.pointerButtons[0])
    key('Tab', { shiftKey: true })
    expect(fakeDocument.activeElement).toBe(fakes.actions.pointerButtons[0])
  })

  it('퍼지는 동안 Tab은 포커스를 옮기지 않고 기본 동작만 막는다', () => {
    open(viewOf(4, true))
    expect(key('Tab').preventDefault).toHaveBeenCalled()
    expect(fakeDocument.activeElement).toBe(previousFocus)
  })

  it('nextTrapIndex', () => {
    expect(nextTrapIndex(2, 0, false)).toBe(1)
    expect(nextTrapIndex(2, 1, false)).toBe(0)
    expect(nextTrapIndex(2, 0, true)).toBe(1)
    expect(nextTrapIndex(2, -1, false)).toBe(0)
    expect(nextTrapIndex(2, -1, true)).toBe(1)
    expect(nextTrapIndex(1, 0, false)).toBe(0)
    expect(nextTrapIndex(0, -1, false)).toBe(-1)
  })
})

describe('모션 줄이기', () => {
  beforeEach(() => {
    motion.reduced = true
  })

  it('퍼짐과 번개 확대 없이 160ms 페이드만 쓴다', () => {
    open(viewOf(4, true))
    expect(fakes.bg.animate).not.toHaveBeenCalled()
    expect(fakes.bolt.animate).not.toHaveBeenCalled()
    expect(html()).not.toContain('data-capsule-result-bolt')
    expect(fakes.root.anim).toHaveLength(1)
    expect(fakes.root.anim[0].keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(fakes.root.anim[0].options).toMatchObject({ duration: 160, fill: 'both' })
  })

  it('문구는 160ms 뒤에 상승 전환 없이 나타난다', () => {
    open(viewOf(4, true))
    expect(actionStyle()).toMatchObject({ opacity: 0, pointerEvents: 'none' })
    vi.advanceTimersByTime(159)
    expect(actionStyle()).toMatchObject({ pointerEvents: 'none' })
    vi.advanceTimersByTime(1)
    expect(actionStyle()).toMatchObject({ opacity: 1, pointerEvents: 'auto', transition: 'none' })
    const titleStyle = findAll((element) => element.type === 'h2')[0].props.style as Record<string, unknown>
    expect(titleStyle.transition).toBe('none')
  })

  it('디졸브도 160ms다', async () => {
    open(viewOf(4, true))
    vi.advanceTimersByTime(160)
    click(buttonElements()[1])
    expect(fakes.root.anim[1].options.duration).toBe(160)
    fakes.root.anim[1].finish()
    await flushMicrotasks()
    expect(order).toEqual(['dismiss', 'closed'])
  })
})

describe('문구와 색은 토큰·사전에서 읽는다', () => {
  const source = readFileSync(join(__dirname, 'CapsuleResultOverlay.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('컴포넌트 코드에 한국어 문자열 리터럴이 없다', () => {
    expect(source).not.toMatch(/[가-힣]/)
  })

  it('16진수 색이 없고 면은 --capsule-fill 토큰이다', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).toContain('var(--capsule-fill)')
    expect(source).toContain('var(--capsule-fill-foreground)')
  })

  it('프로토타입 폴더(app/spike)를 가져오지 않는다', () => {
    expect(source).not.toMatch(/spike|capsule-fill\/(LevelUpOverlay|JamGauge)/)
  })

  it('vh 단위와 document.body 직접 잠금을 쓰지 않는다', () => {
    expect(source).not.toMatch(/\d\s*vh\b/)
    expect(source).not.toMatch(/body\.style/)
  })
})
