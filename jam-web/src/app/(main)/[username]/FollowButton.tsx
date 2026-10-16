'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { useTextSwap } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d } from '@/lib/i18n'
import { useToast } from '@/components/ui/Toast'

/** `POST /api/follows` 응답 중 배지 리빌 연출에 필요한 조각(sync.ts EarnedBadgePayload와 동일 계약) */
interface FollowResponse {
  earnedBadges?: RevealBadge[]
  earnedBadgesMore?: number
}

interface FollowButtonProps {
  targetUserId: string
  initialFollowing: boolean
  /**
   * 팔로우로 배지를 획득하면 호출된다 — 리빌 오버레이는 이 버튼이 아니라 상위(목록 페이지)가
   * 소유한다 (티켓 20260910_2133). 목록 페이지에 행마다 독립된 오버레이를 두면 두 사람을
   * 연달아 팔로우했을 때 여러 오버레이가 동시에 뜰 수 있어, 상태를 페이지 레벨로 끌어올렸다.
   */
  onEarnBadges: (badges: RevealBadge[], moreCount: number) => void
}

export function FollowButton({ targetUserId, initialFollowing, onEarnBadges }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing)
  const { toast } = useToast()

  // 팔로우/팔로잉 라벨 — 즉시 전환 대신 Text states swap (04)
  const label = following ? d.social.followingButton : d.social.followButton
  const { ref: labelRef, initialText } = useTextSwap<HTMLSpanElement>(label)

  const toggle = async () => {
    if (following) {
      setFollowing(false)
      try {
        const res = await fetch(`/api/follows/${targetUserId}`, { method: 'DELETE' })
        if (!res.ok) {
          // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2249)
          const data: { error?: string } = await res.json().catch(() => ({}))
          setFollowing(true)
          toast(data.error ?? d.social.unfollowError, 'error')
        }
      } catch {
        setFollowing(true)
        toast(d.common.networkError, 'error')
      }
    } else {
      setFollowing(true)
      try {
        const res = await fetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_user_id: targetUserId }),
        })
        const data: FollowResponse & { error?: string } = await res.json().catch(() => ({}))
        if (!res.ok) {
          // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2249)
          setFollowing(false)
          toast(data.error ?? d.social.followError, 'error')
          return
        }
        // JAM! 카테고리 — 팔로우로 획득한 배지가 있으면 리빌 연출 (티켓 20260910_2056).
        // SyncButton.tsx와 동일 패턴: 노출 판단은 earnedBadges.length 단일 기준.
        const badges = data.earnedBadges ?? []
        if (badges.length > 0) {
          onEarnBadges(badges, data.earnedBadgesMore ?? 0)
        }
      } catch {
        setFollowing(false)
        toast(d.common.networkError, 'error')
      }
    }
  }

  return (
    <Button
      variant={following ? 'secondary' : 'primary'}
      surface="sub"
      size="sm"
      onClick={toggle}
      className="shrink-0"
    >
      <span ref={labelRef} className="t-text-swap">{initialText}</span>
    </Button>
  )
}
