/**
 * 로그인 화면의 탈퇴 완료 안내 (티켓 20261021_1249 3회, 채원 사전 판정 2026-10-21)
 *
 * 기본(안내 없음) / ?withdrawn=1(InlineNotice) / ?error 있음(검정 반전 오류 배너만, 안내는 보이지 않는다 — 둘이 쌓이지 않는다).
 * 안내는 오류처럼 읽히지 않도록 검정 반전 배너 스타일을 재사용하지 않고 왼쪽 정렬이다.
 * `useSearchParams`는 가짜다 — 네트워크도 로그인도 없다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(auth)/login/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { d } from '@/lib/i18n'

const state = vi.hoisted(() => ({ query: '' }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.query),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import LoginPage from '../page'
import { WITHDRAWN_LOGIN_PATH } from '@/lib/account/withdraw-contract'

const render = (query: string) => {
  state.query = query
  return renderToStaticMarkup(<LoginPage />)
}

describe('로그인 화면 — 탈퇴 완료 안내', () => {
  beforeEach(() => {
    state.query = ''
  })

  it('기본에는 안내도 오류 배너도 없다', () => {
    const html = render('')
    expect(html).not.toContain(d.auth.withdrawnNotice)
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain(d.auth.errorGeneric)
  })

  it('?withdrawn=1이면 로고 아래, 구글 버튼 위에 InlineNotice 한 블록이 왼쪽 정렬로 보인다', () => {
    const html = render('withdrawn=1')
    expect(html).toContain(d.auth.withdrawnNotice)
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html).toContain('w-full max-w-sm mb-6')
    expect(html).toContain('text-left')
    expect(html).toContain('bg-background-secondary')
    // 순서: 로고 → 안내 → 구글 버튼
    const logo = html.indexOf('aria-label="JAM!"')
    const notice = html.indexOf(d.auth.withdrawnNotice)
    const google = html.indexOf(d.auth.googleLogin)
    expect(logo).toBeGreaterThanOrEqual(0)
    expect(logo).toBeLessThan(notice)
    expect(notice).toBeLessThan(google)
  })

  it('안내는 검정 반전 오류 배너 스타일을 쓰지 않는다', () => {
    const html = render('withdrawn=1')
    expect(html).not.toContain('bg-background-inverse text-snow px-4 py-4')
    expect(html).not.toContain('text-center px-4 py-4')
  })

  it('?error가 함께 있으면 오류 배너만 보이고 안내는 보이지 않는다', () => {
    const html = render('error=auth_failed&withdrawn=1')
    expect(html).toContain(d.auth.errorFailed)
    expect(html).not.toContain(d.auth.withdrawnNotice)
    expect(html).not.toContain('role="status"')
  })

  it('?error만 있으면 기존 오류 배너 그대로다', () => {
    const html = render('error=whatever')
    expect(html).toContain(d.auth.errorGeneric)
    expect(html).toContain('bg-background-inverse text-snow')
  })

  it('withdrawn 값이 1이 아니면 안내를 보이지 않는다', () => {
    expect(render('withdrawn=0')).not.toContain(d.auth.withdrawnNotice)
    expect(render('withdrawn=')).not.toContain(d.auth.withdrawnNotice)
    expect(render('withdrawn=true')).not.toContain(d.auth.withdrawnNotice)
  })

  it('탈퇴 뒤 이동 경로가 이 화면이 읽는 쿼리와 같다', () => {
    expect(WITHDRAWN_LOGIN_PATH).toBe('/login?withdrawn=1')
    const query = WITHDRAWN_LOGIN_PATH.split('?')[1]
    expect(render(query)).toContain(d.auth.withdrawnNotice)
  })
})
