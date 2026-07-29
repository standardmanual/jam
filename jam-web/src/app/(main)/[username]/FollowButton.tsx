'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'

export function FollowButton({ targetUserId, initialFollowing }: { targetUserId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing)

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
      {following ? d.social.followingButton : d.social.followButton}
    </Button>
  )
}
