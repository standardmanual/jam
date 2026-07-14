'use client'

import { useState } from 'react'

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
    <button
      onClick={toggle}
      className={`shrink-0 px-3 py-1 rounded-xl text-xs font-black border-[2px] border-jam-ink active:scale-95 transition-all ${
        following ? 'bg-white/60 text-jam-ink' : 'bg-jam-ink text-white'
      }`}
    >
      {following ? '팔로잉' : '팔로우'}
    </button>
  )
}
