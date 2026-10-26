/**
 * 프로필 화면의 캡슐 위젯 노출 (티켓 20261018_0054 1회)
 *
 * 내 프로필(`isOwnProfile`이고 서버가 `capsuleInitial`을 내려준 경우)에서만 헤더와 통계 탭 사이에 캡슐 알약이 보이고,
 * 타인이 보는 프로필에는 prop 자체가 없어 DOM에 알약이 없다. 서버 페이지가 타인에게 prop을 내리지 않는 것은
 * `[username]/__tests__/page.test.tsx`가 고정하고, 여기서는 그 prop이 없을 때 화면이 위젯을 그리지 않는지 본다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/profile/ProfileClient.capsule.test.tsx"
 */
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
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

import ProfileClient from './ProfileClient'
import { d } from '@/lib/i18n'
import type { ActivityFeedRow } from '@/types/database'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'

const CAPSULE: CapsuleStatus = { required: 300, filled: 120, remaining: 180, balance: 50, openable: false, notOpenableReason: 'not_full' }

type ProfileProps = Parameters<typeof ProfileClient>[0]

function render(over: Partial<ProfileProps> = {}): string {
  const props: ProfileProps = {
    profile: { username: 'runner', display_name: '러너', avatar_url: null },
    feedItems: [] as ActivityFeedRow[],
    isOwnProfile: true,
    isFollowing: false,
    targetUserId: 'u1',
    followerCount: 0,
    followingCount: 0,
    badgeCount: 0,
    itemBookCount: 0,
    username: 'runner',
    currentUserId: 'u1',
    pointBalance: 100,
    ...over,
  }
  return renderToStaticMarkup(<ProfileClient {...props} />)
}

describe('프로필의 캡슐 위젯', () => {
  it('내 프로필 + 서버 초기값이 있으면 알약이 보인다', () => {
    const html = render({ capsuleInitial: CAPSULE })
    expect(html).toContain(`aria-label="${d.capsule.aria.filling}"`)
    expect(html).not.toContain(d.capsule.pill.filling)
  })

  it('내 프로필에서 서버 조회가 실패해 null이 오면 위젯이 로딩 알약으로 시작한다(클라이언트가 다시 가져온다)', () => {
    const html = render({ capsuleInitial: null })
    expect(html).toContain(`aria-label="${d.capsule.aria.loading}"`)
  })

  it('타인이 보는 프로필(prop 없음)에는 알약이 DOM에 없다', () => {
    const html = render({ isOwnProfile: false })
    expect(html).not.toContain(d.capsule.title + '<')
    expect(html).not.toContain(d.capsule.aria.filling)
    expect(html).not.toContain(d.capsule.aria.loading)
    expect(html).not.toContain(d.capsule.pill.filling)
  })

  it('방어: 타인 프로필에 prop이 실수로 와도 알약을 그리지 않는다', () => {
    const html = render({ isOwnProfile: false, capsuleInitial: CAPSULE })
    expect(html).not.toContain(d.capsule.aria.filling)
  })

  it('내 프로필이어도 prop이 없으면(undefined) 알약을 그리지 않는다', () => {
    const html = render({ isOwnProfile: true })
    expect(html).not.toContain(d.capsule.aria.filling)
    expect(html).not.toContain(d.capsule.aria.loading)
  })

  it('알약은 프로필 헤더와 통계 탭 사이에 있다', () => {
    const html = render({ capsuleInitial: CAPSULE })
    const capsuleAt = html.indexOf(d.capsule.aria.filling)
    const editAt = html.indexOf(d.profile.editButton)
    const tabsAt = html.indexOf('jam-stat-tabs')
    expect(editAt).toBeGreaterThan(-1)
    expect(tabsAt).toBeGreaterThan(-1)
    expect(capsuleAt).toBeGreaterThan(editAt)
    expect(capsuleAt).toBeLessThan(tabsAt)
  })
})

/** 가진 잼 한 줄 (티켓 20261026_1030) — 내 프로필의 포인트 행 아래. 값은 캡슐 위젯과 같은 서버 초기값이다. */
describe('프로필의 가진 잼 줄', () => {
  const plain = (html: string) => html.replace(/<[^>]*>/g, '')
  const label = d.capsule.sheet.balanceLabel

  it('내 프로필에서 포인트 행 바로 아래, 캡슐 알약 위에 «가진 잼 N»이 보인다', () => {
    const html = render({ capsuleInitial: { ...CAPSULE, balance: 12345 } })
    expect(plain(html)).toContain(`${label}12,345`)
    const pointsAt = html.indexOf(d.profile.pointsAriaLabel)
    const balanceAt = html.indexOf(label)
    const capsuleAt = html.indexOf(d.capsule.aria.filling)
    expect(pointsAt).toBeGreaterThan(-1)
    expect(balanceAt).toBeGreaterThan(pointsAt)
    expect(capsuleAt).toBeGreaterThan(balanceAt)
  })

  it('잔액이 0이면 «가진 잼 0»이 보인다(줄을 숨기지 않는다)', () => {
    expect(plain(render({ capsuleInitial: { ...CAPSULE, balance: 0 } }))).toContain(`${label}0`)
  })

  it('타인이 보는 프로필(prop 없음)에는 가진 잼 줄이 없다', () => {
    expect(render({ isOwnProfile: false })).not.toContain(label)
  })

  it('방어: 타인 프로필에 prop이 실수로 와도 가진 잼 줄을 그리지 않는다', () => {
    expect(render({ isOwnProfile: false, capsuleInitial: CAPSULE })).not.toContain(label)
  })

  it('서버 조회가 실패해 null이거나 prop이 없으면(undefined) 줄이 없다 — 0으로 대신 그리지 않는다', () => {
    expect(render({ capsuleInitial: null })).not.toContain(label)
    expect(render({})).not.toContain(label)
  })
})
