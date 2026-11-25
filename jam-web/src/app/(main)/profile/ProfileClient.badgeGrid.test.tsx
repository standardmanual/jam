/**
 * 친구 프로필 배지 그리드는 내 배지 목록과 같은 칩 표현을 쓴다 (티켓 20261125_1530)
 *
 * - 체크인 배지: 이름 아래 «×방문 횟수» 칩(1회는 없음). 썸네일 모서리 필은 없고 Common 칩도 없다.
 * - 활동 배지: Common도 등급 칩으로 알리고, 횟수(earn_count)는 그리지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/profile/ProfileClient.badgeGrid.test.tsx"
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
import type { ActivityFeedRow } from '@/types/database'

type ProfileProps = Parameters<typeof ProfileClient>[0]

function render(feedItems: ActivityFeedRow[]): string {
  const props: ProfileProps = {
    profile: { username: 'friend', display_name: '친구', avatar_url: null },
    feedItems,
    isOwnProfile: false,
    isFollowing: false,
    targetUserId: 'u2',
    followerCount: 0,
    followingCount: 0,
    username: 'friend',
    currentUserId: 'u1',
    pointBalance: null,
  }
  return renderToStaticMarkup(<ProfileClient {...props} />)
}

function earned(id: string, metadata: Record<string, unknown>): ActivityFeedRow {
  return {
    id,
    user_id: 'u2',
    event_type: 'badge_earned',
    created_at: '2026-11-01T00:00:00Z',
    metadata: { badge_id: id, badge_name: `배지 ${id}`, badge_image_url: null, rarity: 'rare', ...metadata },
  } as unknown as ActivityFeedRow
}

/** 썸네일 모서리 «×N» 필(BadgeGridCard의 `count`)이 그려졌는가 */
const hasCornerPill = (html: string) => html.includes('-bottom-1 -right-1')

describe('친구 프로필 배지 그리드의 칩 표현', () => {
  it('체크인 배지는 방문 횟수를 이름 아래 칩으로 그리고 모서리 필은 그리지 않는다', () => {
    const html = render([earned('c1', { poi_name: '한남역', visit_count: 5 })])
    expect(html).toContain('×5')
    expect(html).toContain('var(--rarity-common)')
    expect(hasCornerPill(html)).toBe(false)
  })

  it('체크인 배지가 1회 방문이면 횟수 칩이 없다', () => {
    const html = render([earned('c1', { poi_name: '한남역', visit_count: 1 })])
    expect(html).not.toContain('×1')
    expect(html).not.toContain('var(--rarity-common)')
  })

  it('체크인 배지는 Common이어도 등급 칩을 그리지 않는다', () => {
    const html = render([earned('c1', { poi_name: '한남역', visit_count: 3, rarity: 'common' })])
    expect(html).not.toContain('Common')
    expect(html).toContain('×3')
  })

  it('같은 체크인 배지가 여러 행이면 한 칸으로 접고 행 수로 횟수를 채운다', () => {
    const html = render([
      earned('c1', { poi_name: '한남역', visit_count: 1 }),
      { ...earned('c1', { poi_name: '한남역', visit_count: 1 }), id: 'row-2' } as ActivityFeedRow,
      { ...earned('c1', { poi_name: '한남역', visit_count: 1 }), id: 'row-3' } as ActivityFeedRow,
    ])
    expect(html.match(/배지 c1/g)?.length).toBe(1)
    expect(html).toContain('×3')
  })

  it('활동 배지가 같은 id로 여러 행이어도 횟수를 만들지 않는다', () => {
    const html = render([
      earned('a1', { rarity: 'rare' }),
      { ...earned('a1', { rarity: 'rare' }), id: 'row-2' } as ActivityFeedRow,
    ])
    expect(html.match(/배지 a1/g)?.length).toBe(1)
    expect(html).not.toContain('×2')
  })

  it('활동 배지는 Common도 등급 칩으로 알린다', () => {
    const html = render([earned('a1', { rarity: 'common' })])
    expect(html).toContain('Common')
  })

  it('활동 배지는 반복 획득 횟수(earn_count)를 그리지 않는다', () => {
    const html = render([earned('a1', { rarity: 'rare', earn_count: 4 })])
    expect(html).not.toContain('×4')
    expect(hasCornerPill(html)).toBe(false)
  })
})
