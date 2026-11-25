/**
 * 앱 내부 히스토리 깊이 추적기 단위 시험 (티켓 20261125_1136).
 *
 * 실행: cd jam-web && npx vitest run "src/lib/__tests__/appHistory.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  JAM_NAV_IDX_KEY,
  readNavIdx,
  extractCustomHistoryState,
  attachNavIdx,
  computeInitialNavIdx,
  canGoBackInApp,
  goBackOrPush,
  installAppHistoryTracker,
  __resetAppHistoryForTest,
} from '../appHistory'

function createFakeBrowser(opts: {
  initialState?: unknown
  referrer?: string
  origin?: string
  historyLength?: number
} = {}) {
  let state: unknown = opts.initialState ?? null
  const length = opts.historyLength ?? 1
  const listeners = new Map<string, Set<(event: unknown) => void>>()

  const history: {
    readonly state: unknown
    readonly length: number
    pushState: History['pushState']
    replaceState: History['replaceState']
  } = {
    get state() {
      return state
    },
    get length() {
      return length
    },
    pushState(data) {
      state = data
    },
    replaceState(data) {
      state = data
    },
  }

  const fakeWindow = {
    history,
    location: { origin: opts.origin ?? 'https://jam.example.com', hash: '' },
    addEventListener(type: string, fn: (event: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners.get(type)?.delete(fn)
    },
    dispatchPopState(popState: unknown) {
      state = popState
      for (const fn of listeners.get('popstate') ?? []) {
        fn({ state: popState })
      }
    },
  }

  const fakeDocument = { referrer: opts.referrer ?? '' }
  vi.stubGlobal('window', fakeWindow)
  vi.stubGlobal('document', fakeDocument)
  return fakeWindow
}

describe('appHistory 순수 함수', () => {
  it('readNavIdx는 0 이상의 정수만 인정한다', () => {
    expect(readNavIdx({ [JAM_NAV_IDX_KEY]: 0 })).toBe(0)
    expect(readNavIdx({ [JAM_NAV_IDX_KEY]: 3 })).toBe(3)
    expect(readNavIdx({ [JAM_NAV_IDX_KEY]: -1 })).toBeNull()
    expect(readNavIdx({ [JAM_NAV_IDX_KEY]: 1.5 })).toBeNull()
    expect(readNavIdx({ [JAM_NAV_IDX_KEY]: '2' })).toBeNull()
    expect(readNavIdx(null)).toBeNull()
  })

  it('extractCustomHistoryState는 Next.js 내부 키를 빼고 커스텀 키만 보존한다', () => {
    expect(
      extractCustomHistoryState({
        __NA: true,
        _N: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: ['tree'],
        [JAM_NAV_IDX_KEY]: 2,
        custom: 'keep',
      }),
    ).toEqual({ [JAM_NAV_IDX_KEY]: 2, custom: 'keep' })

    expect(extractCustomHistoryState({ __NA: true })).toBeNull()
    expect(extractCustomHistoryState(null)).toBeNull()
  })

  it('attachNavIdx는 기존 키(Next.js 내부 키 포함)를 유지하며 깊이를 붙인다', () => {
    expect(attachNavIdx({ __NA: true }, 4)).toEqual({ __NA: true, [JAM_NAV_IDX_KEY]: 4 })
    expect(attachNavIdx(null, 1)).toEqual({ [JAM_NAV_IDX_KEY]: 1 })
  })

  it('computeInitialNavIdx: 새로고침·직접 진입·외부 유입·새 탭 Cmd+클릭을 구분한다', () => {
    const origin = 'https://jam.example.com'
    // F5 새로고침: 브라우저가 보존한 __jamNavIdx를 그대로 믿는다
    expect(computeInitialNavIdx({ [JAM_NAV_IDX_KEY]: 2 }, '', origin, 5)).toBe(2)
    // 새 탭 직접 진입
    expect(computeInitialNavIdx(null, '', origin, 1)).toBe(0)
    // 외부 사이트(카카오톡·구글)에서 유입된 탭(history.length > 1이어도 0)
    expect(computeInitialNavIdx(null, 'https://google.com/search', origin, 3)).toBe(0)
    // 새 탭 Cmd+클릭(같은 오리진 referrer가 붙어도 history.length === 1이라 돌아갈 곳이 없음)
    expect(computeInitialNavIdx(null, 'https://jam.example.com/admin/itembooks', origin, 1)).toBe(0)
    // 같은 탭 내 풀페이지 이동
    expect(computeInitialNavIdx(null, 'https://jam.example.com/badges', origin, 2)).toBe(1)
  })
})

describe('installAppHistoryTracker · goBackOrPush', () => {
  beforeEach(() => {
    __resetAppHistoryForTest(0)
  })

  afterEach(() => {
    __resetAppHistoryForTest(0)
    vi.unstubAllGlobals()
  })

  it('pushState는 깊이를 늘리고, replaceState는 깊이를 유지하며, popstate는 해당 깊이로 복원한다', () => {
    const win = createFakeBrowser({ initialState: { __NA: true }, historyLength: 1 })
    const cleanup = installAppHistoryTracker()

    expect(canGoBackInApp()).toBe(false)
    expect(readNavIdx(win.history.state)).toBe(0)

    // 탭 전환(replaceState): 깊이 0 유지
    win.history.replaceState(null, '', '/badges?tab=collection')
    expect(canGoBackInApp()).toBe(false)
    expect(readNavIdx(win.history.state)).toBe(0)

    // 컬렉션 상세 진입(pushState): 깊이 1
    win.history.pushState({ __NA: true }, '', '/collections/book-1')
    expect(canGoBackInApp()).toBe(true)
    expect(readNavIdx(win.history.state)).toBe(1)

    // 뒤로가기(popstate로 0 복원)
    win.dispatchPopState({ __NA: true, [JAM_NAV_IDX_KEY]: 0 })
    expect(canGoBackInApp()).toBe(false)

    cleanup()
  })

  it('해시 앵커 이동으로 state가 null인 popstate가 와도 해시가 있으면 앱 히스토리 깊이를 유지한다', () => {
    const win = createFakeBrowser({ initialState: { __NA: true }, historyLength: 1 })
    const cleanup = installAppHistoryTracker()

    win.history.pushState({ __NA: true }, '', '/admin/policy-dashboard')
    expect(canGoBackInApp()).toBe(true)

    win.location.hash = '#chapter-3'
    win.dispatchPopState(null)
    expect(canGoBackInApp()).toBe(true)

    cleanup()
  })

  it('goBackOrPush는 앱 내 히스토리가 있으면 back(), 직접 진입이면 fallbackHref로 push()한다', () => {
    const win = createFakeBrowser({ historyLength: 1 })
    const cleanup = installAppHistoryTracker()
    const router = { back: vi.fn(), push: vi.fn() }

    // 직접 진입 → 폴백
    goBackOrPush(router, '/badges?tab=collection')
    expect(router.push).toHaveBeenCalledWith('/badges?tab=collection')
    expect(router.back).not.toHaveBeenCalled()

    router.push.mockClear()
    win.history.pushState({ __NA: true }, '', '/collections/book-1')

    // 앱 내 이동 뒤 → back()
    goBackOrPush(router, '/badges?tab=collection')
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()

    cleanup()
  })
})
