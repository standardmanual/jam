/**
 * TopNav 뒤로가기 우선순위 시험 (티켓 20261125_1136).
 *
 * - 앱 내부 히스토리가 있으면 `backHref`가 지정돼 있어도 `router.back()`으로 직전 화면(탭·필터·스크롤)을 복원한다.
 * - 직접 진입(앱 내부 히스토리 없음)이면 `backHref`(없으면 `/`)로 `router.push()` 폴백한다.
 * - 명시적 `onBack`(예: 알림함 출처 프로필)은 항상 최우선으로 실행된다.
 *
 * 실행: cd jam-web && npx vitest run "src/components/ui/__tests__/TopNav.back.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { JAM_NAV_IDX_KEY, __resetAppHistoryForTest } from '@/lib/appHistory'

const nav = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }))
const captured = vi.hoisted(() => ({ onBack: null as null | (() => void) }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: nav.back, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/collections/book-1',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@ds/components/navigation/TopNav', () => ({
  TopNav: (props: { onBack?: () => void }) => {
    captured.onBack = props.onBack ?? null
    return <header data-testid="ds-topnav" />
  },
}))

import TopNav from '../TopNav'

describe('TopNav 뒤로가기 우선순위', () => {
  beforeEach(() => {
    nav.back.mockClear()
    nav.push.mockClear()
    captured.onBack = null
    __resetAppHistoryForTest(0)
  })

  afterEach(() => {
    __resetAppHistoryForTest(0)
    vi.unstubAllGlobals()
  })

  it('앱 내부 히스토리가 있으면 backHref가 있어도 router.back()을 호출한다', () => {
    vi.stubGlobal('window', { history: { state: { [JAM_NAV_IDX_KEY]: 1 } } })
    renderToStaticMarkup(<TopNav title="컬렉션" backHref="/badges?tab=collection" />)
    captured.onBack?.()
    expect(nav.back).toHaveBeenCalledTimes(1)
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('직접 진입(히스토리 깊이 0)이면 backHref로 폴백 이동한다', () => {
    vi.stubGlobal('window', { history: { state: { [JAM_NAV_IDX_KEY]: 0 } } })
    renderToStaticMarkup(<TopNav title="컬렉션" backHref="/badges?tab=collection" />)
    captured.onBack?.()
    expect(nav.push).toHaveBeenCalledWith('/badges?tab=collection')
    expect(nav.back).not.toHaveBeenCalled()
  })

  it('직접 진입이고 backHref도 없으면 홈(/)으로 폴백한다', () => {
    vi.stubGlobal('window', { history: { state: { [JAM_NAV_IDX_KEY]: 0 } } })
    renderToStaticMarkup(<TopNav title="상세" />)
    captured.onBack?.()
    expect(nav.push).toHaveBeenCalledWith('/')
    expect(nav.back).not.toHaveBeenCalled()
  })

  it('명시적 onBack은 앱 내부 히스토리보다 우선한다(알림함 출처 프로필 등)', () => {
    vi.stubGlobal('window', { history: { state: { [JAM_NAV_IDX_KEY]: 2 } } })
    const custom = vi.fn()
    renderToStaticMarkup(<TopNav title="" onBack={custom} backHref="/notifications" />)
    captured.onBack?.()
    expect(custom).toHaveBeenCalledTimes(1)
    expect(nav.back).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
  })
})
