/**
 * 어드민 공용 뒤로가기 링크(AdminBackLink) 시험 (티켓 20261125_1136).
 *
 * - SSR 마크업은 `<a href={fallbackHref}>` 시맨틱을 유지한다(우클릭·새 탭 열기·기존 계약 유지).
 * - 일반 클릭 시 앱 내부 히스토리가 있으면 `preventDefault()` + `router.back()`으로 직전 필터·탭·쪽을 복원한다.
 * - 직접 진입(히스토리 깊이 0)이나 Cmd/Ctrl/Shift/Alt/중클릭은 기본 링크 이동을 유지한다.
 *
 * 실행: cd jam-web && npx vitest run "src/components/admin/__tests__/AdminBackLink.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MouseEvent, ReactNode } from 'react'
import { JAM_NAV_IDX_KEY, __resetAppHistoryForTest } from '@/lib/appHistory'

const nav = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }))
const linkProps = vi.hoisted(() => ({
  href: '',
  onClick: null as null | ((e: MouseEvent<HTMLAnchorElement>) => void),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: nav.back, prefetch: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: (props: { href: string; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void; className?: string; children: ReactNode }) => {
    linkProps.href = props.href
    linkProps.onClick = props.onClick ?? null
    return (
      <a href={props.href} className={props.className}>
        {props.children}
      </a>
    )
  },
}))

import { AdminBackLink } from '../AdminBackLink'

function fakeMouseEvent(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const preventDefault = vi.fn()
  return {
    event: {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault,
      ...overrides,
    } as unknown as MouseEvent<HTMLAnchorElement>,
    preventDefault,
  }
}

describe('AdminBackLink', () => {
  beforeEach(() => {
    nav.back.mockClear()
    nav.push.mockClear()
    linkProps.href = ''
    linkProps.onClick = null
    __resetAppHistoryForTest(0)
  })

  afterEach(() => {
    __resetAppHistoryForTest(0)
    vi.unstubAllGlobals()
  })

  it('SSR 마크업에 fallbackHref가 담긴 <a> 링크를 그린다', () => {
    const html = renderToStaticMarkup(<AdminBackLink fallbackHref="/admin/itembooks">← 컬렉션</AdminBackLink>)
    expect(html).toContain('href="/admin/itembooks"')
    expect(html).toContain('← 컬렉션')
  })

  it('앱 내부 히스토리가 있으면 일반 클릭 시 기본 이동을 막고 router.back()을 호출한다', () => {
    vi.stubGlobal('window', { history: { state: { [JAM_NAV_IDX_KEY]: 1 } } })
    renderToStaticMarkup(<AdminBackLink fallbackHref="/admin/itembooks">← 컬렉션</AdminBackLink>)
    const { event, preventDefault } = fakeMouseEvent()
    linkProps.onClick?.(event)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(nav.back).toHaveBeenCalledTimes(1)
  })

  it('직접 진입(깊이 0)이면 기본 링크 이동(fallbackHref)을 막지 않는다', () => {
    vi.stubGlobal('window', { history: { state: { [JAM_NAV_IDX_KEY]: 0 } } })
    renderToStaticMarkup(<AdminBackLink fallbackHref="/admin/itembooks">← 컬렉션</AdminBackLink>)
    const { event, preventDefault } = fakeMouseEvent()
    linkProps.onClick?.(event)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(nav.back).not.toHaveBeenCalled()
  })

  it('Cmd/Ctrl/Shift/Alt 클릭이나 중클릭은 새 탭 열기를 위해 router.back()을 가로채지 않는다', () => {
    vi.stubGlobal('window', { history: { state: { [JAM_NAV_IDX_KEY]: 2 } } })
    renderToStaticMarkup(<AdminBackLink fallbackHref="/admin/itembooks">← 컬렉션</AdminBackLink>)

    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const { event, preventDefault } = fakeMouseEvent(mod)
      linkProps.onClick?.(event)
      expect(preventDefault).not.toHaveBeenCalled()
      expect(nav.back).not.toHaveBeenCalled()
    }
  })
})
