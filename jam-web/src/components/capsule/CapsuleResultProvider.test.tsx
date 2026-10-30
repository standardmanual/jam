/**
 * 합친 연출 프로바이더 (티켓 20261028_1740 3회, 채원 사전 판정)
 *
 * 저장소에 jsdom이 없어 훅을 작은 실행기(`__tests__/hookRunner.ts`)로 바꿔 프로바이더 함수를 직접 부르고, 자식 컴포넌트는 가짜로 대신한다.
 * 가짜 자식의 props(`onDismiss`·`onClosed`·`open`·`items`)를 읽고 불러서 사용자가 버튼을 누르는 흐름을 재현한다.
 *
 * 고정하는 것
 *  - 결과 없음 → 아무것도 띄우지 않고 게이지를 붙들지 않는다.
 *  - 결과 있음 → 게이지가 붙들리고(`gaugeHeld`) 챕터 오름 카드는 기다리며(`resultPending`), 오버레이는 한 번 뜬다. 연속 오름·여러 동기화가 쌓인 결과도 한 번이다.
 *  - 오버레이 자리: 게이지 채움이 화면에 보이면 그 자리, 없거나 화면 밖이면 화면 가운데 원.
 *  - 다른 오버레이가 열려 있으면 기다린다 — 기다리는 동안 기기 저장도 «봤어요» 호출도 하지 않고, 닫히면 띄운다.
 *  - 띄우기 직전에 보여 줄 챕터를 기기에 저장한다(카드 중복 막기). 저장값을 낮추지 않고, 저장이 막혀 있어도 띄운다.
 *  - «닫기»: 붙들기 해제와 «봤어요» 한 번 → 닫힘이 끝나면 연출 종료. «봤어요»가 실패해도(거절·예외) 진행하고 로그만 남긴다.
 *  - «획득한 배지 보기»: 닫힌 뒤 `BadgeRevealOverlay`가 열리고 보상은 이벤트 순서(챕터 배지는 맨 끝)다.
 *  - 같은 `ids` 재전달은 다시 띄우지 않고, 새 `ids`는 새 결과로 한 번 띄운다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleResultProvider.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('react', async (importOriginal) => (await import('./__tests__/hookRunner')).mockReact(await importOriginal<typeof import('react')>()))

const ui = { hidden: false }
vi.mock('@/lib/uiOverlay', () => ({ useTabBarHidden: () => ui.hidden }))

const markSeen = vi.fn()
vi.mock('@/lib/capsule/capsule-client', () => ({ markUnseenSeen: (ids: readonly string[]) => markSeen(ids) }))

const store = { map: new Map<string, string>(), blocked: false }
const fakeStorage = {
  getItem: (key: string) => {
    if (store.blocked) throw new Error('blocked')
    return store.map.get(key) ?? null
  },
  setItem: (key: string, value: string) => {
    if (store.blocked) throw new Error('blocked')
    store.map.set(key, value)
  },
}
vi.mock('@/components/chapter/ChapterRiseWatcher', () => ({ getBrowserStorage: () => fakeStorage }))

const FakeOverlay = vi.fn<(props: unknown) => null>(() => null)
vi.mock('@/components/capsule/CapsuleResultOverlay', () => ({ default: (props: unknown) => FakeOverlay(props) }))
const FakeReveal = vi.fn<(props: unknown) => null>(() => null)
vi.mock('@/components/BadgeRevealOverlay', () => ({ default: (props: unknown) => FakeReveal(props) }))

import CapsuleResultProvider from './CapsuleResultProvider'
import CapsuleOverlayModule from '@/components/capsule/CapsuleResultOverlay'
import BadgeRevealModule from '@/components/BadgeRevealOverlay'
import { CAPSULE_GAUGE_HEIGHT_PX, gaugeCircleDiameter } from './CapsuleGauge'
import { findAll, flushMicrotasks, mount, rerender, rt, unmount } from './__tests__/hookRunner'
import { chapterCelebratedKey } from '@/lib/chapter/celebrate'
import type { CapsuleChapterBadge, CapsuleOpenedItem, CapsuleUnseenResult } from '@/lib/capsule/capsule-contract'
import type { CapsuleResultContextValue } from './capsuleResultContext'

const USER = 'u1'
const CIRCLE = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)

const item = (n: number): CapsuleOpenedItem => ({
  locked: false,
  inventoryItemId: `inv-${n}`,
  badgeId: `b-${n}`,
  name: `이름${n}`,
  imageUrl: null,
  rarity: 'rare',
  serialNumber: n,
})
const badge: CapsuleChapterBadge = { id: 'chapter-badge-3', name: '챕터 셋', description: '설명', imageUrl: null, rarity: null, level: 2 }
const event = (n: number, reachedChapters: number[] = []) => ({ openId: `open-${n}`, items: [item(n)], reachedChapters })

function result(ids: string[], events = [event(1)], chapterBadges: CapsuleChapterBadge[] = []): CapsuleUnseenResult {
  return { ids, events, chapterBadges }
}

/** 프로바이더를 올린다. 본문(children)은 가짜 문자열이다 */
const mountProvider = (initialResult: CapsuleUnseenResult | null) =>
  mount(CapsuleResultProvider, { initialResult, userId: USER, children: '본문' as ReactNode })
const rerenderProvider = (initialResult: CapsuleUnseenResult | null) =>
  rerender({ initialResult, userId: USER, children: '본문' as ReactNode })

const contextValue = () => (rt.tree as { props: { value: CapsuleResultContextValue } }).props.value
const overlayProps = () => findAll((e) => e.type === CapsuleOverlayModule)[0]?.props as
  | { view: { titleKind: string; chapterNo?: number; rewardCount: number }; origin: Record<string, number>; onViewRewards: () => void; onDismiss: () => void; onClosed: () => void }
  | undefined
const revealProps = () => findAll((e) => e.type === BadgeRevealModule)[0]?.props as
  | { open: boolean; items: { id: string }[]; onClose: () => void; profileHref: string }
  | undefined

/** 사용자가 «닫기»를 눌러 디졸브가 끝날 때까지 */
function closeOverlay(viaRewards = false) {
  const props = overlayProps()!
  if (viaRewards) props.onViewRewards()
  props.onDismiss()
  overlayProps()!.onClosed()
}

beforeEach(() => {
  ui.hidden = false
  store.map = new Map()
  store.blocked = false
  markSeen.mockReset()
  markSeen.mockResolvedValue({ kind: 'ok', data: { marked: 1 } })
  FakeOverlay.mockClear()
  FakeReveal.mockClear()
  vi.stubGlobal('window', { innerWidth: 430, innerHeight: 800 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('결과 없음', () => {
  it('아무것도 띄우지 않고 게이지를 붙들지 않으며 챕터 카드를 기다리게 하지 않는다', async () => {
    mountProvider(null)
    await flushMicrotasks()
    expect(overlayProps()).toBeUndefined()
    expect(revealProps()).toBeUndefined()
    expect(contextValue().gaugeHeld).toBe(false)
    expect(contextValue().resultPending).toBe(false)
    expect(markSeen).not.toHaveBeenCalled()
  })

  it('이벤트가 없는 결과도 띄우지 않는다', async () => {
    mountProvider(result(['r1'], []))
    await flushMicrotasks()
    expect(overlayProps()).toBeUndefined()
    expect(contextValue().resultPending).toBe(false)
  })
})

describe('결과 있음', () => {
  it('처음 그릴 때부터 게이지를 붙들고 챕터 카드를 기다리게 하며, 오버레이는 한 번 뜬다', async () => {
    mountProvider(result(['r1']))
    // 첫 그리기: 아직 오버레이 전이지만 이미 붙들려 있다(게이지가 진입 모션을 돌지 않는다)
    expect(contextValue().gaugeHeld).toBe(true)
    expect(contextValue().resultPending).toBe(true)
    await flushMicrotasks()
    expect(findAll((e) => e.type === CapsuleOverlayModule)).toHaveLength(1)
    expect(overlayProps()!.view.titleKind).toBe('full')
    expect(contextValue().gaugeHeld).toBe(true)
  })

  it('연속 오름과 여러 동기화가 쌓인 결과도 연출은 한 번이고 가장 높은 챕터 하나를 쓴다', async () => {
    mountProvider(result(['r1', 'r2', 'r3'], [event(1, [2]), event(2, [3, 4]), event(3, [])]))
    await flushMicrotasks()
    expect(findAll((e) => e.type === CapsuleOverlayModule)).toHaveLength(1)
    expect(overlayProps()!.view).toMatchObject({ titleKind: 'chapter', chapterNo: 4 })
  })

  it('게이지가 없는 화면이면 화면 가운데의 같은 크기 원에서 번진다', async () => {
    mountProvider(result(['r1']))
    await flushMicrotasks()
    expect(overlayProps()!.origin).toEqual({ top: (800 - CIRCLE) / 2, left: (430 - CIRCLE) / 2, width: CIRCLE, height: CIRCLE, circle: CIRCLE })
  })

  it('게이지 채움이 화면에 보이면 그 자리에서 번진다', async () => {
    mountProvider(result(['r1']))
    // 첫 그리기 직후 게이지가 자기 채움을 알린다(효과가 돌기 전에는 마이크로태스크 안이라 아직 재지 않는다)
    contextValue().registerGaugeFill({ getBoundingClientRect: () => ({ top: 200, left: 40, width: CIRCLE, height: CIRCLE }) } as unknown as HTMLElement)
    await flushMicrotasks()
    expect(overlayProps()!.origin).toEqual({ top: 200, left: 40, width: CIRCLE, height: CIRCLE, circle: CIRCLE })
  })

  it('게이지 채움이 화면 밖이면 화면 가운데 원을 쓴다', async () => {
    mountProvider(result(['r1']))
    contextValue().registerGaugeFill({ getBoundingClientRect: () => ({ top: 1500, left: 40, width: CIRCLE, height: CIRCLE }) } as unknown as HTMLElement)
    await flushMicrotasks()
    expect(overlayProps()!.origin.top).toBe((800 - CIRCLE) / 2)
  })

  it('띄우는 동안 «봤어요»를 보내지 않는다', async () => {
    mountProvider(result(['r1']))
    await flushMicrotasks()
    expect(markSeen).not.toHaveBeenCalled()
  })
})

describe('다른 오버레이가 열려 있을 때', () => {
  it('기다린다 — 오버레이도 저장도 «봤어요»도 없다. 닫히면 띄운다', async () => {
    ui.hidden = true
    mountProvider(result(['r1'], [event(1, [3])]))
    await flushMicrotasks()
    expect(overlayProps()).toBeUndefined()
    expect(store.map.size).toBe(0)
    expect(markSeen).not.toHaveBeenCalled()
    expect(contextValue().gaugeHeld).toBe(true)
    expect(contextValue().resultPending).toBe(true)

    ui.hidden = false
    rerenderProvider(result(['r1'], [event(1, [3])]))
    await flushMicrotasks()
    expect(findAll((e) => e.type === CapsuleOverlayModule)).toHaveLength(1)
    expect(store.map.get(chapterCelebratedKey(USER))).toBe('3')
  })
})

describe('챕터 오름 카드와 중복 막기', () => {
  it('제목이 챕터면 띄우기 직전에 그 챕터를 기기에 저장한다', async () => {
    store.map.set(chapterCelebratedKey(USER), '2')
    mountProvider(result(['r1'], [event(1, [3])]))
    expect(store.map.get(chapterCelebratedKey(USER))).toBe('2') // 아직 띄우기 전
    await flushMicrotasks()
    expect(store.map.get(chapterCelebratedKey(USER))).toBe('3')
  })

  it('저장값이 이미 같거나 더 높으면 낮추지 않는다', async () => {
    store.map.set(chapterCelebratedKey(USER), '5')
    mountProvider(result(['r1'], [event(1, [3])]))
    await flushMicrotasks()
    expect(store.map.get(chapterCelebratedKey(USER))).toBe('5')
    expect(overlayProps()).toBeDefined()
  })

  it('제목이 «가득 참»이면 저장하지 않는다', async () => {
    mountProvider(result(['r1']))
    await flushMicrotasks()
    expect(store.map.size).toBe(0)
  })

  it('저장소가 막혀 있어도 연출은 띄운다', async () => {
    store.blocked = true
    mountProvider(result(['r1'], [event(1, [3])]))
    await flushMicrotasks()
    expect(overlayProps()).toBeDefined()
  })
})

describe('닫기', () => {
  it('붙들기를 풀고 «봤어요»를 한 번 보내며, 닫힘이 끝나면 연출이 끝난다', async () => {
    mountProvider(result(['r1', 'r2']))
    await flushMicrotasks()

    overlayProps()!.onDismiss()
    expect(contextValue().gaugeHeld).toBe(false)
    expect(contextValue().resultPending).toBe(true) // 닫히는 동안 챕터 카드는 계속 기다린다
    expect(markSeen).toHaveBeenCalledTimes(1)
    expect(markSeen).toHaveBeenCalledWith(['r1', 'r2'])
    expect(overlayProps()).toBeDefined() // 디졸브가 도는 동안은 남아 있다

    overlayProps()!.onClosed()
    expect(overlayProps()).toBeUndefined()
    expect(revealProps()).toBeUndefined()
    expect(contextValue().resultPending).toBe(false)
    expect(markSeen).toHaveBeenCalledTimes(1)
  })

  it('«봤어요»가 거절돼도 화면은 진행하고 로그만 남긴다', async () => {
    markSeen.mockResolvedValue({ kind: 'failed' })
    mountProvider(result(['r1']))
    await flushMicrotasks()
    closeOverlay()
    await flushMicrotasks()
    expect(contextValue().resultPending).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('«봤어요»가 예외를 던져도 화면은 진행하고 로그만 남긴다', async () => {
    markSeen.mockRejectedValue(new Error('network'))
    mountProvider(result(['r1']))
    await flushMicrotasks()
    closeOverlay()
    await flushMicrotasks()
    expect(contextValue().resultPending).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('획득한 배지 보기', () => {
  it('닫힌 뒤에 BadgeRevealOverlay가 열리고 보상은 이벤트 순서, 챕터 배지는 맨 끝이다', async () => {
    mountProvider(result(['r1'], [event(1, [3]), event(2)], [badge]))
    await flushMicrotasks()

    const props = overlayProps()!
    props.onViewRewards()
    props.onDismiss()
    expect(revealProps()!.open).toBe(false) // 오버레이와 겹치지 않는다
    overlayProps()!.onClosed()

    expect(overlayProps()).toBeUndefined()
    expect(revealProps()!.open).toBe(true)
    expect(revealProps()!.items.map((i) => i.id)).toEqual(['inv-1', 'inv-2', 'chapter-badge-3'])
    expect(contextValue().resultPending).toBe(true) // 보상 화면이 닫힐 때까지 챕터 카드는 기다린다
    expect(markSeen).toHaveBeenCalledTimes(1)

    revealProps()!.onClose()
    expect(contextValue().resultPending).toBe(false)
    expect(revealProps()).toBeUndefined()
  })
})

describe('같은 결과와 새 결과', () => {
  it('끝난 뒤 같은 ids가 다시 내려와도(ids 순서가 달라도) 다시 띄우지 않는다', async () => {
    mountProvider(result(['r1', 'r2']))
    await flushMicrotasks()
    closeOverlay()
    rerenderProvider(result(['r2', 'r1']))
    await flushMicrotasks()
    expect(overlayProps()).toBeUndefined()
    expect(contextValue().resultPending).toBe(false)
  })

  it('«봤어요»에 실패해 같은 결과가 다시 내려와도 이번 접속에서는 다시 띄우지 않는다', async () => {
    markSeen.mockResolvedValue({ kind: 'failed' })
    mountProvider(result(['r1']))
    await flushMicrotasks()
    closeOverlay()
    await flushMicrotasks()
    rerenderProvider(result(['r1']))
    await flushMicrotasks()
    expect(overlayProps()).toBeUndefined()
  })

  it('새 ids가 오면 새 결과로 한 번 띄운다', async () => {
    mountProvider(result(['r1']))
    await flushMicrotasks()
    closeOverlay()

    rerenderProvider(result(['r3'], [event(3, [2])]))
    await flushMicrotasks()
    expect(findAll((e) => e.type === CapsuleOverlayModule)).toHaveLength(1)
    expect(overlayProps()!.view).toMatchObject({ titleKind: 'chapter', chapterNo: 2 })
  })

  it('연출 도중 새 결과가 와도 끊지 않고, 끝난 뒤에 한 번 띄운다', async () => {
    mountProvider(result(['r1']))
    await flushMicrotasks()
    rerenderProvider(result(['r1', 'r2'], [event(1), event(2, [4])]))
    expect(overlayProps()!.view.titleKind).toBe('full') // 지금 연출은 그대로

    closeOverlay()
    await flushMicrotasks()
    expect(overlayProps()!.view).toMatchObject({ titleKind: 'chapter', chapterNo: 4 })
  })
})

describe('문맥 밖 안전', () => {
  it('프로바이더가 없을 때의 기본 문맥은 아무 일도 하지 않는다', async () => {
    const { DEFAULT_CAPSULE_RESULT_CONTEXT } = await import('./capsuleResultContext')
    expect(DEFAULT_CAPSULE_RESULT_CONTEXT.gaugeHeld).toBe(false)
    expect(DEFAULT_CAPSULE_RESULT_CONTEXT.resultPending).toBe(false)
    expect(() => DEFAULT_CAPSULE_RESULT_CONTEXT.registerGaugeFill(null)).not.toThrow()
  })
})
