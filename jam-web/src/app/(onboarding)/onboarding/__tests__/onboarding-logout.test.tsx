/**
 * 온보딩 화면의 로그아웃 길 — `page.tsx`의 `handleLogout` (티켓 20261021_1247 재작업, 채원 사전 판정 2026-10-21)
 *
 * 고정하는 것
 *  - 성공하면 `/login`으로 보내고 `loggingOut`은 풀지 않는다(화면이 넘어갈 때까지 중복 클릭을 막는다).
 *  - `signOut`이 `{ error }`를 돌려주거나 throw하면 잠금을 풀고 «네트워크 오류가 발생했어요.»를 보인다.
 *    2단계는 `step2Error`(role="alert" 자리), 1단계는 `message`(아이디 아래 안내 줄)다. 이동하지 않는다(막다른 길이 되지 않게 알린다).
 *    근거: 네트워크 오류면 세션이 남은 채 error만 돌아오고, proxy.ts가 로그인된 유저를 `/login`에서 `/`로 돌려보내 막다른 길이 된다.
 *  - 진입 가드: 로그아웃 중·1단계 저장 중·2단계 시작하는 중에는 눌러도 `signOut`을 부르지 않는다.
 *  - 1단계(아이디·이름)에도 «다음» 아래에 같은 ghost 로그아웃이 있고, 로그아웃 중에는 «다음»이 잠긴다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `TribeStep.test.tsx`와 같은 방식으로 요소 트리를 읽는다. 다만 `page.tsx`는 Hook을 쓰므로
 * `react`의 `useState`·`useRef`·`useEffect`를 호출 순서로 칸을 잡는 작은 실행기로 바꿔 끼우고(`CombineClient.test.tsx`와 같은 방식), 컴포넌트를 함수로 불러
 * 상태가 바뀔 때마다 다시 그린다. 클릭은 요소의 `onClick`을 직접 부른다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(onboarding)/onboarding/__tests__/onboarding-logout.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

const hooks = vi.hoisted(() => ({
  store: [] as unknown[],
  cursor: 0,
  ran: new Set<number>(),
  pending: [] as Array<() => void>,
  /** `useTextSwap`이 마지막 그림에서 받은 안내 줄 문구(1단계의 `message`) */
  lastMessage: '',
}))

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  signOut: vi.fn(),
  userRow: null as unknown,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
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
      const index = hooks.cursor++
      if (!(index in hooks.store)) hooks.store[index] = { current: initial }
      return hooks.store[index]
    },
    // 처음 한 번만 돌린다(page.tsx의 효과는 마운트 때 한 번만 읽는 용도다)
    useEffect: (effect: () => void) => {
      const index = hooks.cursor++
      if (hooks.ran.has(index)) return
      hooks.ran.add(index)
      hooks.pending.push(effect)
    },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/image', () => ({ default: () => null }))

vi.mock('@/lib/analytics/gtag', () => ({ trackEvent: vi.fn() }))

vi.mock('@/components/transitions-pages', () => ({
  useTextSwap: (text: string) => {
    hooks.lastMessage = text
    return { ref: { current: null }, initialText: text }
  },
  useErrorShake: () => ({ current: null }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }),
      signOut: mocks.signOut,
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () =>
          Promise.resolve({
            data: [
              { id: 't1', name: '낭만 미식가', tagline: null, image_url: null },
              { id: 't2', name: '아스팔트 레인저', tagline: null, image_url: null },
            ],
            error: null,
          }),
        single: () => Promise.resolve({ data: mocks.userRow }),
      }
      return chain
    },
  }),
}))

import OnboardingPage from '../page'
import TribeStep from '../TribeStep'
import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'

type El = ReactElement<Record<string, unknown>>

/** 페이지 기본 내보내기가 감싼 `Suspense` 안의 실제 화면 컴포넌트 */
const OnboardingContent = ((OnboardingPage() as El).props.children as El).type as () => El

// 아이디까지 정했고 트라이브만 남은 유저 → 곧장 2단계
const USER_AT_TRIBE_STEP = { username: 'runner', display_name: '러너', avatar_url: null, tribe_id: null }
// 아이디부터 정해야 하는 유저 → 1단계
const USER_AT_ACCOUNT_STEP = { username: null, display_name: null, avatar_url: null, tribe_id: null }

function walk(node: unknown, visit: (element: El) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!isValidElement(node)) return
  const element = node as El
  visit(element)
  for (const value of Object.values(element.props)) walk(value, visit)
}

function findAll(tree: unknown, predicate: (element: El) => boolean): El[] {
  const found: El[] = []
  walk(tree, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

/** 비동기 연쇄(사용자 읽기 → 상태 갱신, signOut → 상태 갱신)가 끝나기를 기다린다 */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** 컴포넌트를 한 번 그리고, 새로 생긴 효과를 돌린다 */
function draw(): El {
  hooks.cursor = 0
  hooks.pending.length = 0
  const tree = OnboardingContent()
  for (const effect of hooks.pending.splice(0)) effect()
  return tree
}

async function mount(userRow: unknown): Promise<El> {
  hooks.store.length = 0
  hooks.ran.clear()
  hooks.lastMessage = ''
  mocks.userRow = userRow
  draw()
  await settle()
  return draw()
}

const press = (element: El) => (element.props.onClick as () => unknown)()

const logoutOnAccountStep = (tree: El) =>
  findAll(tree, (e) => e.type === Button && e.props.children === d.profile.logoutButton)[0]
const nextOnAccountStep = (tree: El) =>
  findAll(tree, (e) => e.type === 'button' && e.props.children === d.onboarding.step1NextButton)[0]

/** 1단계까지 «다음»이 열려 있는 상태로 간다 — 아이디가 있는 유저가 2단계에서 «뒤로»를 눌러 돌아온 모양이다 */
async function mountAccountStepReadyToProceed(): Promise<El> {
  const tribeStep = await mount(USER_AT_TRIBE_STEP)
  ;(tribeStep.props.onBack as () => void)()
  return draw()
}

beforeEach(() => {
  mocks.router.push.mockReset()
  mocks.router.replace.mockReset()
  mocks.signOut.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('2단계(트라이브 고르기)의 로그아웃', () => {
  it('트라이브 단계에서 화면이 TribeStep으로 그려지고 loggingOut·onLogout을 넘긴다', async () => {
    const tree = await mount(USER_AT_TRIBE_STEP)

    expect(tree.type).toBe(TribeStep)
    expect(tree.props.loggingOut).toBe(false)
    expect(typeof tree.props.onLogout).toBe('function')
  })

  it('성공하면 /login으로 보내고 loggingOut을 풀지 않는다 — 오류 문구도 없다', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    const tree = await mount(USER_AT_TRIBE_STEP)

    const done = (tree.props.onLogout as () => Promise<void>)()
    // 진행 중에는 잠긴다
    expect(draw().props.loggingOut).toBe(true)
    await done
    await settle()

    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).toHaveBeenCalledWith('/login')
    const after = draw()
    expect(after.props.loggingOut).toBe(true)
    expect(after.props.error).toBe('')
  })

  it('signOut이 error를 돌려주면 잠금을 풀고 «네트워크 오류가 발생했어요.»를 보이며 이동하지 않는다', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('network') })
    const tree = await mount(USER_AT_TRIBE_STEP)

    await (tree.props.onLogout as () => Promise<void>)()
    await settle()

    expect(d.onboarding.networkError).toBe('네트워크 오류가 발생했어요.')
    const after = draw()
    expect(after.props.loggingOut).toBe(false)
    expect(after.props.error).toBe(d.onboarding.networkError)
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('signOut이 throw해도 같다 — 잠금을 풀고 오류 문구를 보이며 이동하지 않는다', async () => {
    mocks.signOut.mockRejectedValue(new Error('offline'))
    const tree = await mount(USER_AT_TRIBE_STEP)

    await (tree.props.onLogout as () => Promise<void>)()
    await settle()

    const after = draw()
    expect(after.props.loggingOut).toBe(false)
    expect(after.props.error).toBe(d.onboarding.networkError)
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('실패한 뒤 다시 누를 수 있다 — 두 번째가 성공하면 /login으로 간다', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: new Error('network') }).mockResolvedValueOnce({ error: null })
    const tree = await mount(USER_AT_TRIBE_STEP)

    await (tree.props.onLogout as () => Promise<void>)()
    await settle()
    const retried = draw()
    expect(retried.props.loggingOut).toBe(false)

    await (retried.props.onLogout as () => Promise<void>)()
    await settle()

    expect(mocks.signOut).toHaveBeenCalledTimes(2)
    expect(mocks.router.push).toHaveBeenCalledWith('/login')
    expect(draw().props.loggingOut).toBe(true)
  })

  it('진입 가드: 로그아웃 중에 다시 눌러도 signOut은 한 번만 불린다', async () => {
    mocks.signOut.mockReturnValue(new Promise(() => {}))
    const tree = await mount(USER_AT_TRIBE_STEP)

    void (tree.props.onLogout as () => Promise<void>)()
    const locked = draw()
    expect(locked.props.loggingOut).toBe(true)
    await (locked.props.onLogout as () => Promise<void>)()

    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('진입 가드: 2단계 확정(시작하는 중)이 진행 중이면 눌러도 signOut을 부르지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const tree = await mount(USER_AT_TRIBE_STEP)

    ;(tree.props.onSelect as (id: string) => void)('t1')
    const selected = draw()
    void (selected.props.onFinish as () => Promise<void>)()
    const submitting = draw()
    expect(submitting.props.submitting).toBe(true)

    await (submitting.props.onLogout as () => Promise<void>)()

    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(draw().props.loggingOut).toBe(false)
  })
})

describe('1단계(아이디·이름)의 로그아웃', () => {
  it('«다음» 아래에 ghost 로그아웃이 있다 — 문구는 프로필과 같고 내용 폭이며 type="button"이다', async () => {
    const tree = await mount(USER_AT_ACCOUNT_STEP)

    const next = nextOnAccountStep(tree)
    const logout = logoutOnAccountStep(tree)
    expect(next).toBeDefined()
    expect(logout).toBeDefined()
    expect(logout.props.variant).toBe('ghost')
    expect(logout.props.fullWidth).toBeUndefined()
    expect(logout.props.type).toBe('button')
    expect(logout.props['aria-label']).toBeUndefined()
    const cls = String(logout.props.className)
    for (const name of ['whitespace-nowrap', 'break-keep', 'wrap-break-word']) expect(cls).toContain(name)

    // «다음»보다 뒤(아래)에 놓인다
    const order: unknown[] = []
    walk(tree, (e) => {
      if (e === next || e === logout) order.push(e)
    })
    expect(order).toEqual([next, logout])
  })

  it('성공하면 /login으로 보내고 loggingOut을 풀지 않으며, 그동안 «다음»이 잠긴다', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    const tree = await mountAccountStepReadyToProceed()
    expect(nextOnAccountStep(tree).props.disabled).toBe(false)

    const done = press(logoutOnAccountStep(tree)) as Promise<void>
    const locked = draw()
    expect(logoutOnAccountStep(locked).props.loading).toBe(true)
    expect(nextOnAccountStep(locked).props.disabled).toBe(true)
    await done
    await settle()

    expect(mocks.router.push).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).toHaveBeenCalledWith('/login')
    const after = draw()
    expect(logoutOnAccountStep(after).props.loading).toBe(true)
    expect(nextOnAccountStep(after).props.disabled).toBe(true)
  })

  it('signOut이 error를 돌려주면 잠금을 풀고 안내 줄에 «네트워크 오류가 발생했어요.»를 보이며 1단계에 머문다', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('network') })
    const tree = await mountAccountStepReadyToProceed()

    await (press(logoutOnAccountStep(tree)) as Promise<void>)
    await settle()

    const after = draw()
    expect(hooks.lastMessage).toBe(d.onboarding.networkError)
    expect(logoutOnAccountStep(after)).toBeDefined()
    expect(logoutOnAccountStep(after).props.loading).toBe(false)
    expect(nextOnAccountStep(after).props.disabled).toBe(false)
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('signOut이 throw해도 같다', async () => {
    mocks.signOut.mockRejectedValue(new Error('offline'))
    const tree = await mountAccountStepReadyToProceed()

    await (press(logoutOnAccountStep(tree)) as Promise<void>)
    await settle()

    const after = draw()
    expect(hooks.lastMessage).toBe(d.onboarding.networkError)
    expect(logoutOnAccountStep(after).props.loading).toBe(false)
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('진입 가드: 로그아웃 중에 다시 눌러도 signOut은 한 번만 불린다', async () => {
    mocks.signOut.mockReturnValue(new Promise(() => {}))
    const tree = await mountAccountStepReadyToProceed()

    void press(logoutOnAccountStep(tree))
    const locked = draw()
    await (press(logoutOnAccountStep(locked)) as Promise<void>)

    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('1단계 저장 중(submittingStep1)에는 로그아웃이 비활성이고 눌러도 signOut을 부르지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const tree = await mountAccountStepReadyToProceed()

    void press(nextOnAccountStep(tree))
    const saving = draw()
    expect(logoutOnAccountStep(saving).props.disabled).toBe(true)

    await (press(logoutOnAccountStep(saving)) as Promise<void>)

    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
