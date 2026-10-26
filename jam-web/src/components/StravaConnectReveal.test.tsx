/**
 * 처음 연동 직후 도착 화면 — 되읽기 응답의 잼 합계가 오버레이 헤더 한 줄로 간다 (티켓 20261026_1029)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 훅(`useState`·`useRef`·`useEffect`·`useCallback`)을 칸 배열로 바꿔
 * 컴포넌트 함수를 직접 부른다(`ChapterRiseWatcher.test.tsx`와 같은 방식). 효과는 모아 두었다가 손으로 돌리고, `setState`는 칸을 갱신한다.
 * 효과가 끝난 뒤 컴포넌트를 한 번 더 불러 돌려받은 `BadgeRevealOverlay` 요소의 props를 읽는다. 오버레이·토스트·라우터·분석은 가짜다.
 * 오버레이가 실제로 그리는 헤더 한 줄과 라이브 리전은 `BadgeRevealOverlay.summary.test.tsx`가, 문구 접기는
 * `lib/strava/__tests__/sync-result.test.ts`가 고정한다.
 *
 * 확인하는 것: ① 배지가 있고 잼이 있으면 `summaryMessage`가 «이번에 잼 {n}만큼 받았어요»(천 단위 쉼표)로 간다 ② 잼이 0이거나 응답에 없으면
 * 없다(헤더 없음) ③ `resultMessage`·`emptyMessage`는 넘기지 않는다 ④ 되읽기 전에는 줄이 없고 줄은 열림과 같은 갱신에 정해진다
 * ⑤ 배지 0개는 잼이 있어도 줄 없이 연동 성공 토스트만 낸다 ⑥ 되읽기 실패는 줄 없이 닫힌 채로 돌아간다.
 *
 * 실행: cd jam-web && npx vitest run src/components/StravaConnectReveal.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const hooks = vi.hoisted(() => ({
  /** 호출 순서대로 하나씩 쓰는 상태·ref 칸. 렌더가 바뀌어도 유지된다 */
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  /** 상태 갱신이 일어난 순서 — [칸 번호, 값] */
  setLog: [] as [number, unknown][],
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.cursor++
      if (!(i in hooks.slots)) hooks.slots[i] = initial
      const set = (value: unknown) => {
        hooks.slots[i] = value
        hooks.setLog.push([i, value])
      }
      return [hooks.slots[i], set]
    },
    useRef: (initial: unknown) => {
      const i = hooks.cursor++
      if (!(i in hooks.slots)) hooks.slots[i] = { current: initial }
      return hooks.slots[i]
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect)
    },
    useCallback: (fn: unknown) => fn,
  }
})

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  trackEvent: vi.fn(),
  search: 'reveal=1&strava=connected',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  usePathname: () => '/runner',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }))
vi.mock('@/hooks/useDebouncedLoading', () => ({ useDebouncedLoading: (value: boolean) => value }))
vi.mock('@/lib/analytics/gtag', () => ({ trackEvent: mocks.trackEvent }))
vi.mock('@/components/BadgeRevealOverlay', () => ({ default: () => null }))

import StravaConnectReveal from '@/components/StravaConnectReveal'
import { d } from '@/lib/i18n'

type OverlayProps = {
  open: boolean
  loading: boolean
  items: unknown[]
  moreCount: number
  summaryMessage?: string
  resultMessage?: string
  emptyMessage?: string
}

const JAM_LINE = '이번에 잼 1,240만큼 받았어요'
const BADGE = { id: 'b1', name: '들꽃', description: '길가에서 만났어요', imageUrl: null, rarity: 'common' as const }

/** 컴포넌트를 한 번 그려 `BadgeRevealOverlay` 요소의 props를 읽는다. 바깥은 Suspense 껍데기라 안쪽 컴포넌트를 꺼내 부른다 */
function render(): OverlayProps {
  hooks.cursor = 0
  hooks.effects.length = 0
  const shell = StravaConnectReveal({ username: 'runner' }) as ReactElement<{ children: ReactElement<{ username: string | null }> }>
  const inner = shell.props.children
  const element = (inner.type as (props: { username: string | null }) => ReactElement<OverlayProps>)(inner.props)
  return element.props
}

/** 첫 렌더의 효과를 돌리고(되읽기 요청이 나간다) 비동기 이음이 끝나길 기다린 뒤 다시 그린다 */
async function openAndSettle(): Promise<OverlayProps> {
  render()
  for (const effect of [...hooks.effects]) effect()
  await new Promise((resolve) => setTimeout(resolve, 0))
  return render()
}

function respond(body: Record<string, unknown>, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  )
}

beforeEach(() => {
  hooks.slots.length = 0
  hooks.cursor = 0
  hooks.effects.length = 0
  hooks.setLog.length = 0
  mocks.toast.mockReset()
  mocks.replace.mockReset()
  mocks.refresh.mockReset()
  mocks.trackEvent.mockReset()
  mocks.search = 'reveal=1&strava=connected'
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StravaConnectReveal — 잼 합계 한 줄', () => {
  it('배지가 있고 잼이 있으면 summaryMessage에 «이번에 잼 {n}만큼 받았어요»가 천 단위 쉼표로 간다', async () => {
    respond({ earnedBadges: [BADGE], earnedBadgesMore: 0, isFirstBadgeEver: false, jamEarned: 1240 })

    const props = await openAndSettle()

    expect(props.open).toBe(true)
    expect(props.items).toEqual([BADGE])
    expect(props.summaryMessage).toBe(JAM_LINE)
  })

  it('처음 연동의 큰 합계도 쉼표로 접는다', async () => {
    respond({ earnedBadges: [BADGE], earnedBadgesMore: 0, jamEarned: 12340 })

    const props = await openAndSettle()

    expect(props.summaryMessage).toBe('이번에 잼 12,340만큼 받았어요')
  })

  it('오버레이에는 summaryMessage만 넘기고 resultMessage·emptyMessage는 넘기지 않는다', async () => {
    respond({ earnedBadges: [BADGE], earnedBadgesMore: 0, jamEarned: 1240 })

    const props = await openAndSettle()

    expect(props.resultMessage).toBeUndefined()
    expect(props.emptyMessage).toBeUndefined()
  })

  it('잼 합계가 0이면 줄이 없다', async () => {
    respond({ earnedBadges: [BADGE], earnedBadgesMore: 0, jamEarned: 0 })

    const props = await openAndSettle()

    expect(props.open).toBe(true)
    expect(props.summaryMessage).toBeUndefined()
  })

  it('응답에 jamEarned가 없으면(옛 응답) 줄이 없고 지금 화면 그대로다', async () => {
    respond({ earnedBadges: [BADGE], earnedBadgesMore: 3, isFirstBadgeEver: true })

    const props = await openAndSettle()

    expect(props.open).toBe(true)
    expect(props.moreCount).toBe(3)
    expect(props.summaryMessage).toBeUndefined()
    expect(mocks.trackEvent).toHaveBeenCalledWith('first_badge_earned')
  })

  it('되읽기 전(로딩 구간)에는 줄이 없고, 줄은 열림과 같은 갱신에 정해진다', async () => {
    respond({ earnedBadges: [BADGE], earnedBadgesMore: 0, jamEarned: 1240 })

    render()
    for (const effect of [...hooks.effects]) effect()
    const loading = render()
    expect(loading.loading).toBe(true)
    expect(loading.open).toBe(true)
    expect(loading.summaryMessage).toBeUndefined()

    await new Promise((resolve) => setTimeout(resolve, 0))

    // 열림(phase)과 줄(summaryMessage)이 한 이음 안에서 연달아 정해지고, 줄이 먼저다 — 헤더만 늦게 붙는 어긋남이 없다
    const summaryAt = hooks.setLog.findIndex(([, value]) => value === JAM_LINE)
    const openAt = hooks.setLog.findIndex(([, value]) => value === 'open')
    expect(summaryAt).toBeGreaterThanOrEqual(0)
    expect(openAt).toBeGreaterThan(summaryAt)
  })
})

describe('StravaConnectReveal — 잼 줄을 쓰지 않는 갈래', () => {
  it('배지 0개이면 잼이 있어도 줄 없이 연동 성공 토스트만 낸다', async () => {
    respond({ earnedBadges: [], earnedBadgesMore: 0, jamEarned: 1240 })

    const props = await openAndSettle()

    expect(props.open).toBe(false)
    expect(props.summaryMessage).toBeUndefined()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(d.profile.stravaConnectSuccessToast, 'success')
  })

  it('되읽기가 실패하면 줄도 토스트도 없이 닫힌 채로 돌아간다', async () => {
    respond({ error: 'boom' }, 500)

    const props = await openAndSettle()

    expect(props.open).toBe(false)
    expect(props.summaryMessage).toBeUndefined()
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('reveal 플래그가 없으면 되읽지 않는다', async () => {
    mocks.search = ''
    respond({ earnedBadges: [BADGE], earnedBadgesMore: 0, jamEarned: 1240 })

    const props = await openAndSettle()

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(props.open).toBe(false)
    expect(props.summaryMessage).toBeUndefined()
  })
})
