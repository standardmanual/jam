/**
 * 프로필 화면의 캡슐 위젯 노출 (티켓 20261018_0054 1회)
 *
 * 내 프로필(`isOwnProfile`이고 서버가 `capsuleInitial`을 내려준 경우)에서만 헤더 아래(숫자 줄 다음)에 캡슐 알약이 보이고,
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

const CAPSULE: CapsuleStatus = { required: 300, filled: 120, remaining: 180, balance: 50, openable: false, notOpenableReason: 'not_full', pendingCount: 0, jamBlocked: false, claim: { blockedReason: null, freeSlots: 40, neededSlots: 2 }, notice: 'none', pendingItemCount: 0, shortfall: 0 }

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
    username: 'runner',
    currentUserId: 'u1',
    pointBalance: 100,
    ...over,
  }
  return renderToStaticMarkup(<ProfileClient {...props} />)
}

/** 태그를 걷어낸 글자(자릿수 팝인이 숫자를 span으로 쪼개므로 이어 붙여 본다) */
function flat(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

describe('프로필의 캡슐 위젯', () => {
  it('내 프로필 + 서버 초기값이 있으면 알약이 보인다', () => {
    const html = render({ capsuleInitial: CAPSULE })
    expect(html).toContain(`aria-label="${d.capsule.aria.filling}"`)
    expect(html).not.toContain('채우기')
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
    expect(html).not.toContain('채우기')
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

  it('알약은 프로필 헤더(숫자 줄·편집 버튼) 아래에 있다', () => {
    const html = render({ capsuleInitial: CAPSULE })
    const capsuleAt = html.indexOf(d.capsule.aria.filling)
    const editAt = html.indexOf(d.profile.editButton)
    expect(editAt).toBeGreaterThan(-1)
    expect(capsuleAt).toBeGreaterThan(editAt)
  })
})

/** 숫자 줄 (티켓 20261108_1216) — 탭 카드 대신 숫자 위·라벨 아래 칸을 한 줄에 둔다. */
describe('프로필의 숫자 줄', () => {
  it('내 프로필은 팔로워·팔로잉·포인트와 편집 버튼, 타인 프로필은 팔로워·팔로잉만 보인다', () => {
    const mine = flat(render({ followerCount: 12345, followingCount: 586, pointBalance: 1200 }))
    expect(mine).toContain('12,345팔로워586팔로잉1,200포인트')
    expect(mine).toContain(d.profile.editButton)
    const others = flat(render({ isOwnProfile: false, followerCount: 7, followingCount: 3, pointBalance: null }))
    expect(others).toContain('7팔로워3팔로잉')
    expect(others).not.toContain('포인트')
  })

  it('백만부터 1.0M으로 줄이고, 잔액을 모르면 «–»다', () => {
    expect(flat(render({ followerCount: 1_000_000 }))).toContain('1.0M팔로워')
    expect(flat(render({ followingCount: 1_200_000 }))).toContain('1.2M팔로잉')
    expect(flat(render({ pointBalance: null }))).toContain('–포인트')
  })

  it('통계 탭 카드가 없고, 기본 화면에서는 선택 표시가 없다', () => {
    const html = render()
    expect(html).not.toContain('jam-stat-tabs')
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('숫자와 라벨은 새 색 없이 기존 토큰만 쓴다', () => {
    const html = render()
    expect(html).toContain('text-muted')
    expect(html).not.toContain('text-point-text')
  })
})

describe('프로필 기본 화면', () => {
  it('타인 프로필은 활동 피드 대신 배지 그리드(빈 상태 문구)가 보인다', () => {
    const html = render({ isOwnProfile: false })
    expect(html).toContain('러너님')
    expect(html).toContain('아직')
  })

  it('타인 프로필에 배지가 있으면 배지 카드를 3열 그리드로 그린다', () => {
    const feedItems = [{
      id: 'f1', user_id: 'u2', event_type: 'badge_earned', created_at: '2026-11-01T00:00:00Z',
      metadata: { badge_id: 'b1', badge_name: '한강 러너', badge_image_url: null, rarity: 'common' },
    }] as unknown as ActivityFeedRow[]
    const html = render({ isOwnProfile: false, feedItems })
    expect(html).toContain('grid-cols-3')
    expect(html).toContain('한강 러너')
  })
})

/** 가진 잼 줄 삭제 (티켓 20261028_1739 3회) — 새 게이지가 마지막 잼 양을 대신 보이므로 프로필은 잔액 숫자를 그리지 않는다. */
describe('프로필에는 가진 잼 줄이 없다', () => {
  const label = '가진 잼'

  it('내 프로필에서 잔액이 있어도 «가진 잼»과 잔액 숫자가 없다', () => {
    const html = render({ capsuleInitial: { ...CAPSULE, balance: 12345 } })
    expect(html).not.toContain(label)
    expect(html).not.toContain('12,345')
    // 캡슐 위젯은 그대로 보인다
    expect(html).toContain(d.capsule.aria.filling)
  })

  it('잔액이 0이어도 «가진 잼 0»을 그리지 않는다', () => {
    expect(render({ capsuleInitial: { ...CAPSULE, balance: 0 } })).not.toContain(label)
  })

  it('잔액이 달라도 화면 마크업이 같다 — 프로필이 capsuleInitial.balance를 읽지 않는다', () => {
    expect(render({ capsuleInitial: { ...CAPSULE, balance: 0 } })).toBe(
      render({ capsuleInitial: { ...CAPSULE, balance: 99999 } }),
    )
  })

  it('타인이 보는 프로필에는 캡슐 위젯도 가진 잼도 없다', () => {
    const html = render({ isOwnProfile: false })
    expect(html).not.toContain(label)
    expect(html).not.toContain(d.capsule.aria.filling)
    expect(html).not.toContain(d.capsule.aria.loading)
  })

  it('방어: 타인 프로필에 prop이 실수로 와도 위젯과 가진 잼을 그리지 않는다', () => {
    const html = render({ isOwnProfile: false, capsuleInitial: CAPSULE })
    expect(html).not.toContain(label)
    expect(html).not.toContain(d.capsule.aria.filling)
  })

  it('서버 조회가 실패해 null이거나 prop이 없으면(undefined) 가진 잼 줄이 없다', () => {
    expect(render({ capsuleInitial: null })).not.toContain(label)
    expect(render({})).not.toContain(label)
  })
})
