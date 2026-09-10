'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { useTextSwap } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d } from '@/lib/i18n'

/** `POST /api/follows` 응답 중 배지 리빌 연출에 필요한 조각(sync.ts EarnedBadgePayload와 동일 계약) */
interface FollowResponse {
  earnedBadges?: RevealBadge[]
  earnedBadgesMore?: number
}

export function FollowButton({ targetUserId, initialFollowing }: { targetUserId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing)
  const [revealOpen, setRevealOpen] = useState(false)
  const [earnedBadges, setEarnedBadges] = useState<RevealBadge[]>([])
  const [earnedBadgesMore, setEarnedBadgesMore] = useState(0)

  // 팔로우/팔로잉 라벨 — 즉시 전환 대신 Text states swap (04)
  const label = following ? d.social.followingButton : d.social.followButton
  const { ref: labelRef, initialText } = useTextSwap<HTMLSpanElement>(label)

  const toggle = async () => {
    if (following) {
      setFollowing(false)
      await fetch(`/api/follows/${targetUserId}`, { method: 'DELETE' })
    } else {
      setFollowing(true)
      const res = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId }),
      })
      // JAM! 카테고리 — 팔로우로 획득한 배지가 있으면 리빌 연출 (티켓 20260910_2056).
      // SyncButton.tsx와 동일 패턴: 노출 판단은 earnedBadges.length 단일 기준.
      const data: FollowResponse = await res.json().catch(() => ({}))
      const badges = data.earnedBadges ?? []
      if (badges.length > 0) {
        setEarnedBadges(badges)
        setEarnedBadgesMore(data.earnedBadgesMore ?? 0)
        setRevealOpen(true)
      }
    }
  }

  return (
    <>
      <Button
        variant={following ? 'outline' : 'primary'}
        surface="sub"
        size="sm"
        onClick={toggle}
        className="shrink-0"
        // ListRowCard(--color-surface-elevated) 위라 outline 기본 채움(라이트 전용 4% 블랙 틴트)이
        // 안 보임 — 다크 카드에서도 항상 구분되는 그레이 토큰으로 오버라이드 (2026-08-17)
        style={following ? { backgroundColor: 'var(--color-chip-gray)', color: 'var(--color-text)' } : undefined}
      >
        <span ref={labelRef} className="t-text-swap">{initialText}</span>
      </Button>

      <BadgeRevealOverlay
        open={revealOpen}
        items={earnedBadges}
        moreCount={earnedBadgesMore}
        profileHref="/profile"
        onClose={() => setRevealOpen(false)}
      />
    </>
  )
}
