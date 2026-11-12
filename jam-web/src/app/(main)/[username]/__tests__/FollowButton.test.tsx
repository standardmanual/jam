/**
 * FollowButton — 팔로워·팔로잉 목록의 팔로우 버튼은 작은 크기(xs)다 (티켓 20261112_1626).
 * xs는 인라인 style로 높이·패딩을 --scale-compact 배율에서 계산한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/[username]/__tests__/FollowButton.test.tsx"
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/BadgeRevealOverlay', () => ({ default: () => null }))

import { FollowButton } from '../FollowButton'

describe('FollowButton', () => {
  it.each([false, true])('팔로잉=%s 일 때 xs 크기(--scale-compact)로 그린다', (initialFollowing) => {
    const html = renderToStaticMarkup(
      <FollowButton targetUserId="u1" initialFollowing={initialFollowing} onEarnBadges={() => {}} />,
    )
    expect(html).toContain('min-height:calc(44px * var(--scale-compact))')
    expect(html).toContain('font-size:var(--text-xs)')
    expect(html).toContain('shrink-0')
  })
})
