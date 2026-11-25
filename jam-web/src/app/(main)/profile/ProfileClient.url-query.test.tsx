/**
 * 프로필 탭 쿼리(?tab=followers|following|points) 및 뒤로가기 동작 시험 (티켓 20261125_1136).
 *
 * - `?tab=followers|following|points`로 열면 해당 목록 뷰가 열린다(타인 프로필의 `?tab=points`는 기본뷰로 폴백).
 * - 알림함 출처(`?from=notifications`) 타인 프로필은 TopNav에 명시적 `onBack`을 넘겨 `/notifications`로 직행한다.
 * - 팔로워·팔로잉 행 클릭 시 해시를 지우던 `clearProfileHash` 꼼수가 제거되었고, StrictMode/빠른 전환에 안전한
 *   로딩 상태(`loadingTab`)와 응답 후 캐시 기록(`fetchedRef.current.add`)을 사용한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/profile/ProfileClient.url-query.test.tsx"
 */
import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const nav = vi.hoisted(() => ({ push: vi.fn(), query: '' }))
const topNavProps = vi.hoisted(() => ({
  onBack: undefined as undefined | (() => void),
  backHref: undefined as undefined | string,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/runner',
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))
vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: async () => ({}) } }),
}))
vi.mock('@/components/ui/TopNav', () => ({
  default: (props: { onBack?: () => void; backHref?: string }) => {
    topNavProps.onBack = props.onBack
    topNavProps.backHref = props.backHref
    return <header data-testid="topnav" />
  },
}))
vi.mock('@/components/points/PointHistoryList', () => ({
  PointHistorySection: () => <div data-testid="point-history" />,
}))

import ProfileClient from './ProfileClient'
import type { ActivityFeedRow } from '@/types/database'

type ProfileProps = Parameters<typeof ProfileClient>[0]

function render(over: Partial<ProfileProps> = {}): string {
  const props: ProfileProps = {
    profile: { username: 'runner', display_name: '러너', avatar_url: null },
    feedItems: [] as ActivityFeedRow[],
    isOwnProfile: true,
    isFollowing: false,
    targetUserId: 'u1',
    followerCount: 3,
    followingCount: 5,
    username: 'runner',
    currentUserId: 'u1',
    pointBalance: 100,
    ...over,
  }
  return renderToStaticMarkup(<ProfileClient {...props} />)
}

describe('ProfileClient URL 쿼리 탭 및 뒤로가기', () => {
  beforeEach(() => {
    nav.push.mockClear()
    nav.query = ''
    topNavProps.onBack = undefined
    topNavProps.backHref = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('쿼리가 없으면 기본뷰(내 프로필은 활동 피드, 타인은 배지 그리드)를 그린다', () => {
    const html = render({ isOwnProfile: true })
    expect(html).not.toContain('data-testid="point-history"')
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('내 프로필에서 ?tab=points로 열면 포인트 내역 탭뷰가 열린다', () => {
    nav.query = 'tab=points'
    const html = render({ isOwnProfile: true })
    expect(html).toContain('data-testid="point-history"')
    expect(html).toContain('aria-pressed="true"')
  })

  it('타인 프로필에서 ?tab=points는 무효라 기본뷰로 폴백한다', () => {
    nav.query = 'tab=points'
    const html = render({ isOwnProfile: false, currentUserId: 'other' })
    expect(html).not.toContain('data-testid="point-history"')
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('?tab=followers·?tab=following은 본인·타인 모두 해당 탭을 활성 상태로 연다', () => {
    nav.query = 'tab=followers'
    expect(render({ isOwnProfile: false, currentUserId: 'other' })).toContain('aria-pressed="true"')

    nav.query = 'tab=following'
    expect(render({ isOwnProfile: true })).toContain('aria-pressed="true"')
  })

  it('알림함 출처(?from=notifications) 타인 프로필은 TopNav에 명시적 onBack(/notifications 직행)을 넘긴다', () => {
    nav.query = 'from=notifications'
    render({ isOwnProfile: false, currentUserId: 'other' })
    expect(topNavProps.onBack).toBeTypeOf('function')
    expect(topNavProps.backHref).toBe('/notifications')
    topNavProps.onBack?.()
    expect(nav.push).toHaveBeenCalledWith('/notifications')
  })

  it('일반 경로 타인 프로필은 명시적 onBack 없이 폴백 backHref("/")만 넘긴다', () => {
    render({ isOwnProfile: false, currentUserId: 'other' })
    expect(topNavProps.onBack).toBeUndefined()
    expect(topNavProps.backHref).toBe('/')
  })

  it('해시 제거 꼼수(clearProfileHash)가 없고, 응답 후에만 fetchedRef에 기록한다', () => {
    const src = readFileSync(path.resolve(__dirname, './ProfileClient.tsx'), 'utf8')
    expect(src).not.toContain('clearProfileHash')
    expect(src.indexOf('fetchedRef.current.add(targetTab)')).toBeGreaterThan(src.indexOf('await res.json()'))
  })
})
