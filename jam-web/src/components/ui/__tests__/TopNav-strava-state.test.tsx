/**
 * TopNav 가운데 슬롯 — Strava 동기화 상태 4종 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17)
 *
 * - connected             : 지금의 `SyncButton`
 * - disconnected_error    : primary sub xs 「다시 동기화」(누르면 `/api/strava/auth`)
 * - none                  : 지금의 「동기화」 버튼
 * - disconnected_user     : none과 같은 「동기화」 버튼(유저가 직접 끊었으니 알람 어조를 쓰지 않는다)
 *
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다. `SyncButton`은 표식으로 갈음한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/TopNav-strava-state.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/SyncButton', () => ({
  default: () => <span data-testid="sync-button">SYNC_BUTTON</span>,
}))

import TopNav from '../TopNav'
import { TopNavDataProvider } from '@/lib/topNavData'
import { d } from '@/lib/i18n'
import type { StravaUiState } from '@/lib/strava/connection-state'

function renderNav(stravaState: StravaUiState) {
  return renderToStaticMarkup(
    <TopNavDataProvider
      value={{ username: 'runner', avatarUrl: null, stravaState, hasUnreadNotifications: false }}
    >
      <TopNav logo />
    </TopNavDataProvider>
  )
}

/** 가운데 버튼(라벨이 같은 정확히 일치하는 button)을 꺼낸다 */
function buttonWithLabel(html: string, label: string): string {
  return new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}</button>`).exec(html)?.[0] ?? ''
}

describe('TopNav 가운데 슬롯 — Strava 동기화 상태', () => {
  it('connected는 SyncButton이고 다른 동기화 버튼은 없다', () => {
    const html = renderNav('connected')
    expect(html).toContain('SYNC_BUTTON')
    expect(buttonWithLabel(html, d.today.syncButton)).toBe('')
    expect(html).not.toContain(d.stravaConnection.topNavReconnect)
  })

  it('disconnected_error는 primary sub xs 「다시 동기화」다', () => {
    const html = renderNav('disconnected_error')
    const button = buttonWithLabel(html, d.stravaConnection.topNavReconnect)
    expect(button).not.toBe('')
    expect(button).toContain('bg-accent')
    expect(button).toContain('text-accent-foreground')
    expect(html).not.toContain('SYNC_BUTTON')
    // 라벨은 공백을 빼고 5자로 한정한다 — TopNav 가운데 슬롯이 로고·알림·아바타와 겹치지 않게
    expect(d.stravaConnection.topNavReconnect.replace(/\s/g, '')).toHaveLength(5)
  })

  it.each<StravaUiState>(['none', 'disconnected_user'])('%s는 지금의 「동기화」 버튼이다', (state) => {
    const html = renderNav(state)
    const button = buttonWithLabel(html, d.today.syncButton)
    expect(button).toContain('bg-accent')
    expect(html).not.toContain('SYNC_BUTTON')
    // 유저가 직접 끊은 경우에도 «다시 동기화» 같은 알람 어조를 쓰지 않는다
    expect(html).not.toContain(d.stravaConnection.topNavReconnect)
  })
})
