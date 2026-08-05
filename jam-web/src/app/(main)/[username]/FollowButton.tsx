'use client'

import { useState } from 'react'
import Button from '@/components/ui/button'
import { useTextSwap } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d } from '@/lib/i18n'

export function FollowButton({ targetUserId, initialFollowing }: { targetUserId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing)

  // 팔로우/팔로잉 라벨 — 즉시 전환 대신 Text states swap (04)
  const label = following ? d.social.followingButton : d.social.followButton
  const { ref: labelRef, initialText } = useTextSwap<HTMLSpanElement>(label)

  const toggle = async () => {
    if (following) {
      setFollowing(false)
      await fetch(`/api/follows/${targetUserId}`, { method: 'DELETE' })
    } else {
      setFollowing(true)
      await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId }),
      })
    }
  }

  return (
    <Button
      variant={following ? 'outline' : 'primary'}
      surface="sub"
      size="sm"
      onClick={toggle}
      className="shrink-0"
    >
      <span ref={labelRef} className="t-text-swap">{initialText}</span>
    </Button>
  )
}
