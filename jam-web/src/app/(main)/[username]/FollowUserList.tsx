'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FollowButton } from './FollowButton'
import ListRowCard from '@/components/ui/ListRowCard'
import { UserIcon } from '@/components/ui/icons'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { getDisplayName } from '@/lib/utils'

export interface FollowListUser {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  isFollowing: boolean
}

/** 연달아 팔로우해 발생한 리빌 1건 — 대기열의 원소 */
interface RevealQueueItem {
  badges: RevealBadge[]
  moreCount: number
}

/**
 * 팔로워·팔로잉 목록의 행 렌더링 + 배지 리빌 오버레이를 페이지 레벨에서 소유한다
 * (티켓 20260910_2133). 행마다 독립된 `FollowButton`이 각자 오버레이를 열면 두 사람을
 * 연달아 팔로우했을 때 여러 오버레이가 동시에 뜰 수 있어(`BadgeRevealCarousel`이
 * `document.body` 포털이 아니라 제자리 fixed라 DOM 순서로 승자가 갈린다), 오버레이를
 * 이 목록 레벨에 단 하나만 두고 `FollowButton`은 콜백으로만 배지를 전달한다.
 *
 * 큐잉 정책: 순차 표시(FIFO). 이벤트를 합쳐서 한 번에 보여주면 이벤트마다 다른
 * `moreCount`(서버가 각 팔로우 응답에서 상한 10장까지 잘라 내려준 잔여 개수)의 의미가
 * 뒤섞여 "몇 개를 더 봐야 하는지"가 부정확해진다. 연달아 팔로우가 흔한 동작이 아니라
 * 큐가 길게 쌓일 가능성도 낮아, 정확성을 우선해 순차 표시를 선택했다.
 */
export default function FollowUserList({
  users,
  currentUserId,
}: {
  users: FollowListUser[]
  currentUserId: string
}) {
  const [queue, setQueue] = useState<RevealQueueItem[]>([])
  const current = queue[0]

  const handleEarnBadges = (badges: RevealBadge[], moreCount: number) => {
    setQueue((prev) => [...prev, { badges, moreCount }])
  }

  const handleClose = () => {
    setQueue((prev) => prev.slice(1))
  }

  return (
    <>
      {users.map((u) => (
        <ListRowCard
          key={u.id}
          trailing={
            u.id !== currentUserId ? (
              <FollowButton
                targetUserId={u.id}
                initialFollowing={u.isFollowing}
                onEarnBadges={handleEarnBadges}
              />
            ) : undefined
          }
        >
          <Link href={`/${u.username}`} className="flex items-center gap-[var(--spacing-16)] flex-1 min-w-0 active:opacity-70 transition-opacity">
            {u.avatar_url ? (
              <Image src={u.avatar_url} alt={getDisplayName(u)} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-text/50" />
              </div>
            )}
            <span className="text-[length:var(--text-body)] leading-[var(--leading-body)] truncate">{getDisplayName(u)}</span>
          </Link>
        </ListRowCard>
      ))}

      <BadgeRevealOverlay
        open={!!current}
        items={current?.badges ?? []}
        moreCount={current?.moreCount ?? 0}
        profileHref="/profile"
        onClose={handleClose}
      />
    </>
  )
}
